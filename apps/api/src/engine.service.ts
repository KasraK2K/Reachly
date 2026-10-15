import { Injectable, NotFoundException } from '@nestjs/common';
import { IgAccount } from '@prisma/client';
import { BLOCKING_ERRORS, LEAD_ERRORS, SendError } from '@reachly/shared';
import { PrismaService } from './prisma.service';

const DAY_MS = 24 * 60 * 60 * 1000;
/** A claimed job not reported back within this window is handed out again (browser closed mid-send). */
const STALE_CLAIM_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 2;
const FAILURES_BEFORE_PAUSE = 3;
const ONLINE_MS = 2 * 60 * 1000;

export type WaitReason = 'PAUSED' | 'NOT_LOGGED_IN' | 'WRONG_ACCOUNT' | 'BUSY' | 'PACING' | 'DAILY_LIMIT' | 'QUEUE_EMPTY' | 'QUIET_HOURS';
export type ClaimResult =
  | { job: { id: string; handle: string; text: string; leadName: string | null } }
  | { wait: WaitReason; retryAfterSec: number; message: string };

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** True when the local time in `tz` falls inside [start, end) — windows may wrap midnight ("22:00"–"07:00"). */
export function inQuietHours(now: Date, tz: string, start: string, end: string): boolean {
  const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: isValidTimeZone(tz) ? tz : 'UTC',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const m = get('hour') * 60 + get('minute');
  const s = toMin(start);
  const e = toMin(end);
  if (s === e) return false;
  return s < e ? m >= s && m < e : m >= s || m < e;
}

const randomDelayMs = (a: IgAccount) => (a.minDelaySec + Math.random() * (a.maxDelaySec - a.minDelaySec)) * 1000;

const wait = (w: WaitReason, retryAfterSec: number, message: string): ClaimResult => ({
  wait: w,
  retryAfterSec: Math.max(5, Math.ceil(retryAfterSec)),
  message,
});

/**
 * The sending engine. All limits are enforced here, per Instagram account, so two browsers or two
 * machines driving the same account share one counter and one pacing clock.
 */
@Injectable()
export class EngineService {
  constructor(private db: PrismaService) {}

  async accountStats(userId: string) {
    const [accounts, counts] = await Promise.all([
      this.db.igAccount.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
      this.db.$queryRaw<{ igAccountId: string; sent24h: bigint; queued: bigint }[]>`
        SELECT c."igAccountId",
               count(*) FILTER (WHERE j.state = 'Sent' AND j."sentAt" >= now() - interval '24 hours') AS "sent24h",
               count(*) FILTER (WHERE j.state = 'Queued' AND c.status = 'Active') AS "queued"
        FROM "SendJob" j JOIN "Campaign" c ON c.id = j."campaignId"
        WHERE c."userId" = ${userId}
        GROUP BY c."igAccountId"`,
    ]);
    const now = Date.now();
    return accounts.map((a) => {
      const c = counts.find((r) => r.igAccountId === a.id);
      return {
        ...a,
        sent24h: Number(c?.sent24h ?? 0),
        queued: Number(c?.queued ?? 0),
        online: !!a.lastHeartbeatAt && now - a.lastHeartbeatAt.getTime() < ONLINE_MS,
      };
    });
  }

  async heartbeat(userId: string, igAccountId: string, igUserId: string | null, version: string) {
    const acct = await this.db.igAccount.findFirst({ where: { id: igAccountId, userId } });
    if (!acct) throw new NotFoundException('Account not found');
    await this.db.igAccount.update({
      where: { id: acct.id },
      // First heartbeat from a logged-in browser binds the numeric Instagram id to this account.
      data: { lastHeartbeatAt: new Date(), extensionVersion: version, ...(igUserId && !acct.igUserId && { igUserId }) },
    });
  }

  claim(userId: string, igAccountId: string, igUserId: string | null, now = new Date()): Promise<ClaimResult> {
    return this.db.$transaction(async (tx) => {
      // Row lock serialises claims per account, so the cap/pacing checks below can't race.
      const [acct] = await tx.$queryRaw<IgAccount[]>`
        SELECT * FROM "IgAccount" WHERE id = ${igAccountId} AND "userId" = ${userId} FOR UPDATE`;
      if (!acct) throw new NotFoundException('Account not found');
      if (acct.pausedReason) return wait('PAUSED', 300, acct.pausedReason);
      if (!igUserId) return wait('NOT_LOGGED_IN', 60, 'Log in to Instagram in this browser');
      if (acct.igUserId && acct.igUserId !== igUserId) {
        return wait('WRONG_ACCOUNT', 60, `This browser is logged into a different Instagram account than @${acct.handle}`);
      }
      const forAccount = { campaign: { igAccountId: acct.id } };

      await tx.sendJob.updateMany({
        where: { ...forAccount, state: 'Claimed', claimedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) } },
        data: { state: 'Queued', claimedAt: null },
      });
      if (await tx.sendJob.count({ where: { ...forAccount, state: 'Claimed' } })) {
        return wait('BUSY', 30, 'Another browser is sending from this account');
      }
      if (acct.nextSendAt && acct.nextSendAt > now) {
        return wait('PACING', (acct.nextSendAt.getTime() - now.getTime()) / 1000, 'Waiting between messages');
      }

      // Rolling 24h window rather than calendar day: no timezone-midnight burst.
      const sent = await tx.sendJob.findMany({
        where: { ...forAccount, state: 'Sent', sentAt: { gte: new Date(now.getTime() - DAY_MS) } },
        select: { sentAt: true },
        orderBy: { sentAt: 'asc' },
      });
      if (sent.length >= acct.dailyLimit) {
        const frees = sent[sent.length - acct.dailyLimit].sentAt!.getTime() + DAY_MS;
        return wait('DAILY_LIMIT', (frees - now.getTime()) / 1000, `Daily limit of ${acct.dailyLimit} reached`);
      }

      // ponytail: scans the 50 oldest queued jobs for one outside the lead's quiet hours; enough unless
      // a single campaign mixes thousands of leads across many timezones.
      const candidates = await tx.sendJob.findMany({
        where: { campaign: { igAccountId: acct.id, status: 'Active' }, state: 'Queued' },
        include: { lead: { select: { handle: true, name: true, timezone: true } } },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      if (!candidates.length) return wait('QUEUE_EMPTY', 120, 'Nothing to send');
      const job = candidates.find((j) => !inQuietHours(now, j.lead.timezone ?? acct.timezone, acct.quietStart, acct.quietEnd));
      if (!job) return wait('QUIET_HOURS', 900, 'Quiet hours for the next leads in queue');

      await tx.sendJob.update({ where: { id: job.id }, data: { state: 'Claimed', claimedAt: now, attempts: { increment: 1 } } });
      return { job: { id: job.id, handle: job.lead.handle, text: job.renderedText, leadName: job.lead.name } };
    });
  }

  async result(userId: string, jobId: string, r: { ok: true } | { ok: false; error: SendError; detail?: string }) {
    const job = await this.db.sendJob.findFirst({
      where: { id: jobId, campaign: { userId } },
      include: { campaign: { include: { igAccount: true } } },
    });
    if (!job) throw new NotFoundException('Job not found');
    if (job.state !== 'Claimed') return { ignored: true, paused: false };
    const acct = job.campaign.igAccount;
    const now = new Date();
    let pausedReason: string | null = null;

    await this.db.$transaction(async (tx) => {
      if (r.ok) {
        await tx.sendJob.update({ where: { id: job.id }, data: { state: 'Sent', sentAt: now, error: null } });
        await tx.lead.updateMany({ where: { id: job.leadId, status: 'New' }, data: { status: 'Contacted' } });
        await tx.igAccount.update({
          where: { id: acct.id },
          data: { consecutiveFailures: 0, nextSendAt: new Date(now.getTime() + randomDelayMs(acct)) },
        });
      } else if (LEAD_ERRORS.includes(r.error)) {
        // The lead can't be messaged; skip them without counting it against the account.
        await tx.sendJob.update({ where: { id: job.id }, data: { state: 'Skipped', error: r.error } });
        await tx.igAccount.update({ where: { id: acct.id }, data: { nextSendAt: new Date(now.getTime() + acct.minDelaySec * 1000) } });
      } else if (BLOCKING_ERRORS.includes(r.error)) {
        // Not the lead's fault: put the job back and stop the account until a human checks it.
        pausedReason = `${r.error}${r.detail ? `: ${r.detail}` : ''}`;
        await tx.sendJob.update({ where: { id: job.id }, data: { state: 'Queued', claimedAt: null, error: r.error } });
        await tx.igAccount.update({ where: { id: acct.id }, data: { pausedReason } });
      } else {
        const failures = acct.consecutiveFailures + 1;
        if (acct.pauseOnErrors && failures >= FAILURES_BEFORE_PAUSE) {
          pausedReason = `${failures} consecutive failed sends (last: ${r.error})`;
        }
        await tx.sendJob.update({
          where: { id: job.id },
          data: { state: job.attempts >= MAX_ATTEMPTS ? 'Failed' : 'Queued', claimedAt: null, error: r.detail ?? r.error },
        });
        await tx.igAccount.update({
          where: { id: acct.id },
          data: { consecutiveFailures: failures, pausedReason, nextSendAt: new Date(now.getTime() + acct.minDelaySec * 1000) },
        });
      }
      await tx.campaign.updateMany({
        where: { id: job.campaignId, status: 'Active', jobs: { none: { state: { in: ['Queued', 'Claimed'] } } } },
        data: { status: 'Completed' },
      });
    });
    return { ignored: false, paused: !!pausedReason, pausedReason };
  }
}
