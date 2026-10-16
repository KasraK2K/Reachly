import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { normalizeHandle } from '@reachly/shared';
import { randomBytes } from 'node:crypto';
import { Auth, UserId } from './http';
import { completeIdleCampaigns } from './leads.controller';
import { PrismaService } from './prisma.service';

/** Instagram handles a Calendly booking points at: utm_content (put `?utm_content={{handle}}` on your link) and any form answer. */
export function handlesFromBooking(payload: unknown): string[] {
  const p = (payload ?? {}) as { tracking?: Record<string, unknown>; questions_and_answers?: { answer?: unknown }[] };
  const raw = [p.tracking?.utm_content, p.tracking?.utm_term, ...(p.questions_and_answers ?? []).map((q) => q.answer)];
  return [...new Set(raw.filter((v): v is string => typeof v === 'string').map((v) => normalizeHandle(v)).filter((h): h is string => !!h))];
}

@Controller()
export class IntegrationsController {
  constructor(private db: PrismaService) {}

  @Get('integrations')
  async get(@UserId() userId: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { webhookToken: true } });
    return { webhookToken: user.webhookToken };
  }

  /** Creates (or rotates) the secret in the webhook URL. The old URL stops working. */
  @Post('integrations/webhook-token')
  async rotate(@UserId() userId: string) {
    const webhookToken = randomBytes(24).toString('base64url');
    await this.db.user.update({ where: { id: userId }, data: { webhookToken } });
    return { webhookToken };
  }

  /**
   * Calendly `invitee.created`: marks the matching lead Converted and stops anything still queued for them.
   * Auth is the unguessable token in the path; answers 200 for unknown tokens so it can't be probed.
   */
  @Post('webhooks/calendly/:token')
  @Auth('public')
  @HttpCode(200)
  async calendly(@Param('token') token: string, @Body() body: { event?: string; payload?: unknown }) {
    const user = token.length >= 20 ? await this.db.user.findUnique({ where: { webhookToken: token }, select: { id: true } }) : null;
    if (!user || body?.event !== 'invitee.created') return { ok: true, matched: 0 };
    const handles = handlesFromBooking(body.payload);
    if (!handles.length) return { ok: true, matched: 0 };

    const leads = await this.db.lead.findMany({ where: { userId: user.id, handle: { in: handles } } });
    const when = new Date().toISOString().slice(0, 16).replace('T', ' ');
    for (const lead of leads) {
      await this.db.lead.update({
        where: { id: lead.id },
        data: { status: 'Converted', notes: [lead.notes, `Booked a call via Calendly (${when} UTC)`].filter(Boolean).join('\n') },
      });
    }
    await this.db.sendJob.updateMany({ where: { leadId: { in: leads.map((l) => l.id) }, state: 'Queued' }, data: { state: 'Skipped', error: 'Lead booked a call' } });
    await completeIdleCampaigns(this.db, user.id);
    return { ok: true, matched: leads.length };
  }
}
