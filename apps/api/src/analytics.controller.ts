import { Controller, Get, Header } from '@nestjs/common';
import { UserId } from './http';
import { PrismaService } from './prisma.service';

/** Statuses that mean the lead answered (including a "no"). */
const REPLIED = `('Replied', 'Converted', 'NotInterested')`;

type Row = { messaged: bigint; replied: bigint; converted: bigint };
const rates = <T extends Row>(r: T) => ({
  ...r,
  messaged: Number(r.messaged),
  replied: Number(r.replied),
  converted: Number(r.converted),
});

/** Spreadsheet-safe CSV cell: quoted when needed, and formula-looking values defused (CSV injection). */
export function csvCell(v: unknown): string {
  let s = v == null ? '' : Array.isArray(v) ? v.join(', ') : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * A lead is only ever messaged by one campaign (drafts exclude contacted leads), so a lead's status
 * is attributed to the campaign and to the first-message variant that reached them.
 */
@Controller()
export class AnalyticsController {
  constructor(private db: PrismaService) {}

  @Get('analytics')
  async summary(@UserId() userId: string) {
    const [campaigns, variants, daily] = await Promise.all([
      this.db.$queryRawUnsafe<(Row & { id: string; name: string; status: string; messagesSent: bigint })[]>(
        `SELECT c.id, c.name, c.status,
                count(DISTINCT j."leadId") FILTER (WHERE j.state = 'Sent') AS messaged,
                count(DISTINCT j."leadId") FILTER (WHERE j.state = 'Sent' AND l.status IN ${REPLIED}) AS replied,
                count(DISTINCT j."leadId") FILTER (WHERE j.state = 'Sent' AND l.status = 'Converted') AS converted,
                count(*) FILTER (WHERE j.state = 'Sent') AS "messagesSent"
         FROM "Campaign" c
         LEFT JOIN "SendJob" j ON j."campaignId" = c.id
         LEFT JOIN "Lead" l ON l.id = j."leadId"
         WHERE c."userId" = $1
         GROUP BY c.id ORDER BY c."createdAt" DESC`,
        userId,
      ),
      this.db.$queryRawUnsafe<(Row & { id: string; name: string })[]>(
        `SELECT t.id, t.name,
                count(DISTINCT j."leadId") AS messaged,
                count(DISTINCT j."leadId") FILTER (WHERE l.status IN ${REPLIED}) AS replied,
                count(DISTINCT j."leadId") FILTER (WHERE l.status = 'Converted') AS converted
         FROM "SendJob" j
         JOIN "Template" t ON t.id = j."templateId"
         JOIN "Lead" l ON l.id = j."leadId"
         WHERE t."userId" = $1 AND j.step = 0 AND j.state = 'Sent'
         GROUP BY t.id ORDER BY messaged DESC`,
        userId,
      ),
      // ponytail: days are UTC; bucket in the user's timezone if people read this across midnight.
      this.db.$queryRaw<{ day: Date; sent: bigint }[]>`
        SELECT date_trunc('day', j."sentAt") AS day, count(*) AS sent
        FROM "SendJob" j JOIN "Campaign" c ON c.id = j."campaignId"
        WHERE c."userId" = ${userId} AND j.state = 'Sent' AND j."sentAt" >= date_trunc('day', now()) - interval '13 days'
        GROUP BY 1 ORDER BY 1`,
    ]);
    return {
      campaigns: campaigns.map((c) => ({ ...rates(c), messagesSent: Number(c.messagesSent) })),
      variants: variants.map(rates),
      daily: daily.map((d) => ({ day: d.day.toISOString().slice(0, 10), sent: Number(d.sent) })),
    };
  }

  /** Latest sends, failures and inbound replies, newest first, for the dashboard feed. */
  @Get('activity')
  async activity(@UserId() userId: string) {
    const [jobs, replies] = await Promise.all([
      this.db.sendJob.findMany({
        where: { campaign: { userId }, state: { in: ['Sent', 'Failed', 'Skipped'] } },
        orderBy: { claimedAt: 'desc' },
        take: 20,
        select: { id: true, state: true, step: true, sentAt: true, claimedAt: true, error: true, lead: { select: { handle: true } }, campaign: { select: { id: true, name: true } } },
      }),
      this.db.message.findMany({
        where: { fromMe: false, conversation: { igAccount: { userId } } },
        orderBy: { sentAt: 'desc' },
        take: 20,
        select: { id: true, text: true, sentAt: true, conversation: { select: { handle: true, name: true } } },
      }),
    ]);
    const items = [
      ...jobs.map((j) => ({
        id: j.id,
        kind: j.state === 'Sent' ? (j.step ? 'followup' : 'sent') : 'failed',
        at: j.sentAt ?? j.claimedAt,
        who: `@${j.lead.handle}`,
        campaign: j.campaign,
        detail: j.state === 'Sent' ? null : j.error,
      })),
      ...replies.map((m) => ({ id: m.id, kind: 'reply', at: m.sentAt, who: m.conversation.handle ? `@${m.conversation.handle}` : m.conversation.name || 'Instagram user', campaign: null, detail: m.text.slice(0, 140) })),
    ];
    return items
      .filter((i) => i.at)
      .sort((a, b) => b.at!.getTime() - a.at!.getTime())
      .slice(0, 20);
  }

  @Get('leads/export')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="reachly-leads.csv"')
  async exportLeads(@UserId() userId: string) {
    const leads = await this.db.lead.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      include: { jobs: { where: { state: 'Sent' }, select: { sentAt: true, campaign: { select: { name: true } } }, orderBy: { sentAt: 'asc' } } },
    });
    const cols = ['handle', 'name', 'status', 'niche', 'industry', 'followers', 'timezone', 'tags', 'notes', 'campaign', 'messagesSent', 'lastMessagedAt', 'createdAt'];
    const rows = leads.map((l) => [
      l.handle,
      l.name,
      l.status,
      l.niche,
      l.industry,
      l.followers,
      l.timezone,
      l.tags,
      l.notes,
      l.jobs[0]?.campaign.name,
      l.jobs.length,
      l.jobs.at(-1)?.sentAt,
      l.createdAt,
    ]);
    // BOM so Excel opens UTF-8 names correctly.
    return '﻿' + [cols, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }
}
