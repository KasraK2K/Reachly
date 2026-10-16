import { BadRequestException, Body, Controller, ForbiddenException, Get, Header, HttpCode, Param, Post, Query, Req, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { Auth, found, parse, UserId } from './http';
import { InboxService, WebhookBody } from './inbox.service';
import { decrypt, graph, metaConfig, parseSignedRequest, REPLY_WINDOW_MS, SCOPES, validWebhookSignature } from './meta';
import { PrismaService } from './prisma.service';

const stateKey = () => new TextEncoder().encode(process.env.INTERNAL_JWT_SECRET);
const windowEndsAt = (lastInboundAt: Date | null) => (lastInboundAt ? new Date(lastInboundAt.getTime() + REPLY_WINDOW_MS) : null);

@Controller()
export class InboxController {
  constructor(
    private db: PrismaService,
    private inbox: InboxService,
  ) {}

  // --- Connecting an account (Instagram Login for Business) ---

  @Get('meta/connect-url')
  async connectUrl(@UserId() userId: string, @Query('accountId') accountId: string) {
    const cfg = metaConfig();
    found(await this.db.igAccount.findFirst({ where: { id: accountId, userId } }), 'Account');
    // Signed state ties the callback to this user and account, which also blocks login CSRF.
    const state = await new SignJWT({ uid: userId, acct: accountId }).setProtectedHeader({ alg: 'HS256' }).setAudience('reachly-ig-state').setExpirationTime('10m').sign(stateKey());
    const q = new URLSearchParams({ client_id: cfg.appId, redirect_uri: cfg.redirectUri, response_type: 'code', scope: SCOPES.join(','), state, enable_fb_login: '0', force_reauth: 'true' });
    return { url: `https://www.instagram.com/oauth/authorize?${q}` };
  }

  @Post('meta/callback')
  async callback(@UserId() userId: string, @Body() body: unknown) {
    const { code, state } = parse(z.object({ code: z.string().min(1), state: z.string().min(1) }), body);
    const { payload } = await jwtVerify(state, stateKey(), { audience: 'reachly-ig-state' }).catch(() => {
      throw new BadRequestException('This Instagram login link expired. Start again from Settings.');
    });
    if (payload.uid !== userId) throw new ForbiddenException('This Instagram login was started by a different Reachly user.');
    const acct = found(await this.db.igAccount.findFirst({ where: { id: String(payload.acct), userId } }), 'Account');
    await this.inbox.connect(acct.id, acct.handle, code.replace(/#_$/, ''));
    return { ok: true, handle: acct.handle };
  }

  /** Stops the inbox for this account. Already-received messages stay. */
  @Post('accounts/:id/meta/disconnect')
  async disconnect(@UserId() userId: string, @Param('id') id: string) {
    found(await this.db.igAccount.findFirst({ where: { id, userId } }), 'Account');
    await this.db.igConnection.deleteMany({ where: { igAccountId: id } });
    return { ok: true };
  }

  // --- Meta callbacks (public; authenticated by the app secret) ---

  @Get('webhooks/instagram')
  @Auth('public')
  @Header('content-type', 'text/plain')
  verify(@Query('hub.mode') mode: string, @Query('hub.verify_token') token: string, @Query('hub.challenge') challenge: string) {
    const expected = process.env.IG_WEBHOOK_VERIFY_TOKEN;
    if (mode !== 'subscribe' || !expected || token !== expected) throw new ForbiddenException();
    return challenge;
  }

  @Post('webhooks/instagram')
  @Auth('public')
  @HttpCode(200)
  async webhook(@Req() req: { rawBody?: Buffer; headers: Record<string, unknown> }, @Body() body: WebhookBody) {
    if (!validWebhookSignature(req.rawBody, String(req.headers['x-hub-signature-256'] ?? ''), metaConfig().secret)) throw new UnauthorizedException('Bad signature');
    await this.inbox.ingest(body);
    return { ok: true };
  }

  @Post('meta/deauthorize')
  @Auth('public')
  @HttpCode(200)
  async deauthorize(@Body() body: { signed_request?: string }) {
    const data = parseSignedRequest(body?.signed_request, metaConfig().secret);
    if (!data?.user_id) throw new BadRequestException('Invalid signed_request');
    await this.inbox.forget(String(data.user_id), false);
    return { ok: true };
  }

  @Post('meta/data-deletion')
  @Auth('public')
  @HttpCode(200)
  async dataDeletion(@Body() body: { signed_request?: string }) {
    const cfg = metaConfig();
    const data = parseSignedRequest(body?.signed_request, cfg.secret);
    if (!data?.user_id) throw new BadRequestException('Invalid signed_request');
    await this.inbox.forget(String(data.user_id), true);
    // Deletion is immediate, so the status page only has to confirm it.
    const code = randomBytes(8).toString('hex');
    return { url: `${cfg.appUrl}/data-deletion?code=${code}`, confirmation_code: code };
  }

  // --- Inbox ---

  @Get('conversations')
  async list(@UserId() userId: string) {
    const rows = await this.db.conversation.findMany({
      where: { igAccount: { userId } },
      orderBy: { lastMessageAt: 'desc' },
      take: 200, // ponytail: newest 200 threads, add paging when someone has more
      include: {
        igAccount: { select: { handle: true } },
        lead: { select: { id: true, status: true } },
        messages: { orderBy: { sentAt: 'desc' }, take: 1, select: { text: true, fromMe: true } },
      },
    });
    return rows.map(({ messages, lastInboundAt, igsid: _, ...c }) => ({ ...c, last: messages[0] ?? null, windowEndsAt: windowEndsAt(lastInboundAt) }));
  }

  @Get('conversations/:id')
  async get(@UserId() userId: string, @Param('id') id: string) {
    const c = found(
      await this.db.conversation.findFirst({
        where: { id, igAccount: { userId } },
        include: {
          igAccount: { select: { handle: true, connection: { select: { username: true } } } },
          lead: { select: { id: true, status: true, name: true } },
          messages: { orderBy: { sentAt: 'desc' }, take: 300, select: { id: true, fromMe: true, text: true, sentAt: true } },
        },
      }),
      'Conversation',
    );
    if (c.unread) await this.db.conversation.update({ where: { id }, data: { unread: false } });
    const { messages, lastInboundAt, igsid: _, igAccount, ...rest } = c;
    return { ...rest, unread: false, account: { handle: igAccount.handle, connected: !!igAccount.connection }, messages: messages.reverse(), windowEndsAt: windowEndsAt(lastInboundAt) };
  }

  @Post('conversations/:id/reply')
  async reply(@UserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    // Instagram caps a text message at 1000 bytes.
    const { text } = parse(z.object({ text: z.string().trim().min(1).refine((t) => Buffer.byteLength(t) <= 1000, 'Message is too long for Instagram') }), body);
    const c = found(await this.db.conversation.findFirst({ where: { id, igAccount: { userId } }, include: { igAccount: { include: { connection: true } } } }), 'Conversation');
    const conn = c.igAccount.connection;
    if (!conn) throw new BadRequestException(`@${c.igAccount.handle} is not connected to the Instagram API. Connect it in Settings.`);
    const ends = windowEndsAt(c.lastInboundAt);
    if (!ends || ends.getTime() < Date.now()) {
      throw new BadRequestException('Instagram only allows replies within 24 hours of their last message. Reply from the Instagram app instead.');
    }
    const r = await graph<{ message_id: string }>('/me/messages', decrypt(conn.accessToken), { recipient: { id: c.igsid }, message: { text } });
    const now = new Date();
    // Instagram also echoes this message to the webhook; the shared mid keeps it from being stored twice.
    const msg = await this.db.message.upsert({ where: { mid: r.message_id }, create: { conversationId: id, mid: r.message_id, fromMe: true, text, sentAt: now }, update: {}, select: { id: true, fromMe: true, text: true, sentAt: true } });
    await this.db.conversation.update({ where: { id }, data: { lastMessageAt: now, unread: false } });
    return msg;
  }
}
