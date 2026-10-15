import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SEND_ERRORS } from '@reachly/shared';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { hashToken } from './auth.guard';
import { EngineService } from './engine.service';
import { Auth, parse, UserId } from './http';
import { PrismaService } from './prisma.service';

const Identity = z.object({
  igAccountId: z.string(),
  /** Value of Instagram's ds_user_id cookie in the sending browser; null when logged out. */
  igUserId: z.string().regex(/^\d+$/).nullable(),
  version: z.string().max(20).default('unknown'),
});
const Result = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }),
  z.object({ ok: z.literal(false), error: z.enum(SEND_ERRORS), detail: z.string().max(300).optional() }),
]);

@Controller('extension')
@Auth('extension')
export class ExtensionController {
  constructor(
    private db: PrismaService,
    private engine: EngineService,
  ) {}

  /** Called by the web app (user session) to mint a token it hands to the extension. */
  @Post('tokens')
  @Auth('user')
  async createToken(@UserId() userId: string) {
    const token = `rx_${randomBytes(32).toString('base64url')}`;
    await this.db.extensionToken.create({ data: { userId, tokenHash: hashToken(token) } });
    return { token };
  }

  @Get('state')
  async state(@UserId() userId: string) {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } });
    return { email: user.email, accounts: await this.engine.accountStats(userId) };
  }

  @Post('heartbeat')
  async heartbeat(@UserId() userId: string, @Body() body: unknown) {
    const { igAccountId, igUserId, version } = parse(Identity, body);
    await this.engine.heartbeat(userId, igAccountId, igUserId, version);
    return { ok: true };
  }

  @Post('claim')
  async claim(@UserId() userId: string, @Body() body: unknown) {
    const { igAccountId, igUserId } = parse(Identity, body);
    return this.engine.claim(userId, igAccountId, igUserId);
  }

  @Post('jobs/:id/result')
  async result(@UserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.engine.result(userId, id, parse(Result, body));
  }
}
