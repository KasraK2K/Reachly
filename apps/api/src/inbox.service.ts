import { BadRequestException, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { IgConnection } from '@prisma/client';
import { normalizeHandle } from '@reachly/shared';
import { completeIdleCampaigns } from './leads.controller';
import { decrypt, encrypt, graph, metaConfig } from './meta';
import { PrismaService } from './prisma.service';

interface WebhookEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: { mid?: string; text?: string; is_echo?: boolean; is_deleted?: boolean; attachments?: { type?: string }[] };
}
export interface WebhookBody {
  object?: string;
  entry?: { id?: string | number; messaging?: WebhookEvent[] }[];
}

const messageText = (m: NonNullable<WebhookEvent['message']>) =>
  m.text ?? (m.attachments?.length ? m.attachments.map((a) => `[${a.type ?? 'attachment'}]`).join(' ') : '[unsupported message]');

@Injectable()
export class InboxService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(private db: PrismaService) {}

  onModuleInit() {
    if (!process.env.IG_APP_SECRET) return;
    const run = () => this.refreshTokens().catch((e) => console.error('instagram token refresh', e.message));
    this.timer = setInterval(run, 6 * 3600_000);
    this.timer.unref();
    run();
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  /** OAuth code → long-lived token, bound to the Reachly account it was started from. */
  async connect(igAccountId: string, handle: string, code: string) {
    const cfg = metaConfig();
    const form = new URLSearchParams({ client_id: cfg.appId, client_secret: cfg.secret, grant_type: 'authorization_code', redirect_uri: cfg.redirectUri, code });
    const res = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form }).catch(() => null);
    const raw = await res?.json().catch(() => null);
    const short = raw?.data?.[0] ?? raw;
    if (!res?.ok || !short?.access_token) throw new BadRequestException(`Instagram login failed: ${raw?.error_message ?? raw?.error?.message ?? 'no token returned'}`);
    const granted: string[] = Array.isArray(short.permissions) ? short.permissions : String(short.permissions ?? '').split(',');
    if (!granted.includes('instagram_business_manage_messages')) throw new BadRequestException('Allow message access on the Instagram screen, otherwise the inbox cannot work.');

    const long = await graph<{ access_token: string; expires_in: number }>(
      `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(cfg.secret)}&access_token=${encodeURIComponent(short.access_token)}`,
    );
    const me = await graph<{ id: string; user_id: string; username: string }>('/me?fields=id,user_id,username', long.access_token);
    if (me.username.toLowerCase() !== handle) {
      throw new BadRequestException(`You logged into @${me.username}, but this account is @${handle}. Log into @${handle} on Instagram, or fix the handle in Settings.`);
    }
    const other = await this.db.igConnection.findUnique({ where: { graphUserId: String(me.user_id) } });
    if (other && other.igAccountId !== igAccountId) throw new BadRequestException(`@${me.username} is already connected to another Reachly account.`);

    await graph(`/me/subscribed_apps?subscribed_fields=messages`, long.access_token, {});
    const data = {
      graphUserId: String(me.user_id),
      appUserId: String(me.id ?? short.user_id),
      username: me.username,
      accessToken: encrypt(long.access_token),
      expiresAt: new Date(Date.now() + long.expires_in * 1000),
    };
    await this.db.igConnection.upsert({ where: { igAccountId }, create: { igAccountId, ...data }, update: data });
  }

  /** Long-lived tokens last 60 days and can be refreshed once they are a day old. */
  async refreshTokens() {
    const due = await this.db.igConnection.findMany({
      where: { expiresAt: { gt: new Date(), lt: new Date(Date.now() + 14 * 86400_000) }, updatedAt: { lt: new Date(Date.now() - 86400_000) } },
    });
    for (const c of due) {
      try {
        const r = await graph<{ access_token: string; expires_in: number }>(
          `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(decrypt(c.accessToken))}`,
        );
        await this.db.igConnection.update({ where: { igAccountId: c.igAccountId }, data: { accessToken: encrypt(r.access_token), expiresAt: new Date(Date.now() + r.expires_in * 1000) } });
      } catch (e) {
        console.error(`instagram token refresh for @${c.username}`, (e as Error).message);
      }
    }
  }

  /** Webhook `messages` field. Unknown accounts and malformed events are ignored, so Meta never retries forever. */
  async ingest(body: WebhookBody) {
    if (body?.object !== 'instagram') return;
    for (const entry of body.entry ?? []) {
      const conn = await this.db.igConnection.findUnique({ where: { graphUserId: String(entry.id) }, include: { igAccount: { select: { userId: true } } } });
      if (!conn) continue;
      for (const ev of entry.messaging ?? []) {
        await this.event(conn, conn.igAccount.userId, ev).catch((e) => console.error('instagram webhook event', (e as Error).message));
      }
    }
  }

  private async event(conn: IgConnection, userId: string, ev: WebhookEvent) {
    const m = ev.message;
    if (!m?.mid || m.is_deleted) return;
    const fromMe = !!m.is_echo;
    const igsid = String((fromMe ? ev.recipient?.id : ev.sender?.id) ?? '');
    if (!igsid || igsid === conn.graphUserId) return;
    if (await this.db.message.findUnique({ where: { mid: m.mid } })) return;
    const at = new Date(ev.timestamp ?? Date.now());
    const where = { igAccountId_igsid: { igAccountId: conn.igAccountId, igsid } };

    let convo = await this.db.conversation.findUnique({ where });
    if (!convo) {
      // Our own cold DMs are tracked as send jobs; a thread starts when they write back.
      if (fromMe) return;
      const token = decrypt(conn.accessToken);
      const profile = await graph<{ username?: string; name?: string }>(`/${igsid}?fields=username,name`, token).catch(() => null);
      convo = await this.db.conversation.upsert({
        where,
        create: { igAccountId: conn.igAccountId, igsid, handle: normalizeHandle(profile?.username ?? '') ?? null, name: profile?.name ?? null, lastMessageAt: at },
        update: {},
      });
      await this.backfill(convo.id, conn, igsid, token);
    }

    await this.db.message.createMany({ data: [{ conversationId: convo.id, mid: m.mid, fromMe, text: messageText(m), sentAt: at }], skipDuplicates: true });
    await this.db.conversation.update({
      where: { id: convo.id },
      data: {
        ...(at > convo.lastMessageAt && { lastMessageAt: at }),
        ...(!fromMe && { lastInboundAt: at }),
        // A reply sent from the Instagram app counts as reading the thread.
        unread: !fromMe,
      },
    });
    if (!fromMe) await this.markReplied(userId, convo.id, convo.handle, convo.leadId);
  }

  /** Earlier messages in the thread (usually the cold DM and follow-ups), so the inbox shows the whole conversation. Best effort. */
  private async backfill(conversationId: string, conn: IgConnection, igsid: string, token: string) {
    try {
      const r = await graph<{ data?: { messages?: { data?: { id: string; created_time: string; from?: { id?: string }; message?: string }[] } }[] }>(
        `/me/conversations?platform=instagram&user_id=${igsid}&fields=messages.limit(50){id,created_time,from,message}`,
        token,
      );
      const msgs = r.data?.[0]?.messages?.data ?? [];
      await this.db.message.createMany({
        data: msgs.map((x) => ({ conversationId, mid: x.id, fromMe: x.from?.id === conn.graphUserId, text: x.message || '[attachment]', sentAt: new Date(x.created_time) })),
        skipDuplicates: true,
      });
    } catch (e) {
      console.error('instagram backfill', (e as Error).message);
    }
  }

  /** Links the thread to the lead with the same handle; a lead still in the sequence becomes Replied and its follow-ups are cancelled. */
  private async markReplied(userId: string, conversationId: string, handle: string | null, leadId: string | null) {
    const lead = leadId
      ? await this.db.lead.findUnique({ where: { id: leadId } })
      : handle
        ? await this.db.lead.findUnique({ where: { userId_handle: { userId, handle } } })
        : null;
    if (!lead) return;
    if (!leadId) await this.db.conversation.update({ where: { id: conversationId }, data: { leadId: lead.id } });
    if (lead.status !== 'New' && lead.status !== 'Contacted') return;
    await this.db.lead.update({ where: { id: lead.id }, data: { status: 'Replied' } });
    await this.db.sendJob.updateMany({ where: { leadId: lead.id, state: 'Queued' }, data: { state: 'Skipped', error: 'Lead replied' } });
    await completeIdleCampaigns(this.db, userId);
  }

  /** Meta deauthorize / data-deletion callbacks: drop the token, and for deletion also every stored message. */
  async forget(metaUserId: string, deleteData: boolean) {
    const conns = await this.db.igConnection.findMany({ where: { OR: [{ appUserId: metaUserId }, { graphUserId: metaUserId }] } });
    const ids = conns.map((c) => c.igAccountId);
    if (deleteData) await this.db.conversation.deleteMany({ where: { igAccountId: { in: ids } } });
    await this.db.igConnection.deleteMany({ where: { igAccountId: { in: ids } } });
    return ids.length;
  }
}
