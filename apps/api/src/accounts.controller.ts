import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { normalizeHandle } from '@reachly/shared';
import { z } from 'zod';
import { EngineService, isValidTimeZone } from './engine.service';
import { found, parse, UserId } from './http';
import { PrismaService } from './prisma.service';

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const Settings = z
  .object({
    timezone: z.string().refine(isValidTimeZone, 'Unknown timezone'),
    dailyLimit: z.number().int().min(1).max(300),
    minDelaySec: z.number().int().min(15).max(600),
    maxDelaySec: z.number().int().min(15).max(600),
    quietStart: hhmm,
    quietEnd: hhmm,
    pauseOnErrors: z.boolean(),
  })
  .partial();
const Create = Settings.extend({ handle: z.string() });
const Update = Settings.extend({ handle: z.string().optional() });

@Controller('accounts')
export class AccountsController {
  constructor(
    private db: PrismaService,
    private engine: EngineService,
  ) {}

  @Get()
  list(@UserId() userId: string) {
    return this.engine.accountStats(userId);
  }

  @Post()
  async create(@UserId() userId: string, @Body() body: unknown) {
    const { handle: raw, ...data } = parse(Create, body);
    const handle = normalizeHandle(raw);
    if (!handle) throw new BadRequestException('Invalid Instagram handle');
    if (await this.db.igAccount.findFirst({ where: { userId, handle } })) throw new BadRequestException('Account already added');
    // New accounts start conservative; the user can raise the limit later.
    return this.db.igAccount.create({ data: { dailyLimit: 20, ...data, userId, handle } });
  }

  @Patch(':id')
  async update(@UserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    const { handle: raw, ...data } = parse(Update, body);
    const acct = found(await this.db.igAccount.findFirst({ where: { id, userId } }), 'Account');
    const handle = raw === undefined ? undefined : normalizeHandle(raw);
    if (handle === null) throw new BadRequestException('Invalid Instagram handle');
    if (handle && handle !== acct.handle && (await this.db.igAccount.findFirst({ where: { userId, handle } }))) {
      throw new BadRequestException('Account already added');
    }
    if ((data.minDelaySec ?? acct.minDelaySec) > (data.maxDelaySec ?? acct.maxDelaySec)) {
      throw new BadRequestException('Min delay must be less than or equal to max delay');
    }
    return this.db.igAccount.update({ where: { id }, data: { ...data, handle } });
  }

  /** Clears an auto-pause after the user has checked their Instagram account. */
  @Post(':id/resume')
  async resume(@UserId() userId: string, @Param('id') id: string) {
    found(await this.db.igAccount.findFirst({ where: { id, userId } }), 'Account');
    return this.db.igAccount.update({ where: { id }, data: { pausedReason: null, consecutiveFailures: 0 } });
  }

  @Post(':id/pause')
  async pause(@UserId() userId: string, @Param('id') id: string) {
    found(await this.db.igAccount.findFirst({ where: { id, userId } }), 'Account');
    return this.db.igAccount.update({ where: { id }, data: { pausedReason: 'Paused by you' } });
  }

  /** Forget the bound Instagram login so the next heartbeat can bind a new one. */
  @Post(':id/unbind')
  async unbind(@UserId() userId: string, @Param('id') id: string) {
    found(await this.db.igAccount.findFirst({ where: { id, userId } }), 'Account');
    return this.db.igAccount.update({ where: { id }, data: { igUserId: null } });
  }

  @Delete(':id')
  async remove(@UserId() userId: string, @Param('id') id: string) {
    found(await this.db.igAccount.findFirst({ where: { id, userId } }), 'Account');
    await this.db.igAccount.delete({ where: { id } });
    return { ok: true };
  }
}
