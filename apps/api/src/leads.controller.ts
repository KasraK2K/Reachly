import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LEAD_STATUSES, normalizeHandle } from '@reachly/shared';
import { z } from 'zod';
import { isValidTimeZone } from './engine.service';
import { found, parse, UserId } from './http';
import { PrismaService } from './prisma.service';

const opt = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => v || null);
const LeadFields = z.object({
  name: opt,
  niche: opt,
  industry: opt,
  notes: z.string().max(5000).optional().nullable(),
  followers: z.coerce.number().int().min(0).optional().nullable(),
  timezone: z
    .string()
    .optional()
    .nullable()
    .refine((v) => !v || isValidTimeZone(v), 'Unknown timezone')
    .transform((v) => v || null),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(40)).max(30).optional(),
});
const CreateLead = LeadFields.extend({ handle: z.string() });
const UpdateLead = LeadFields.extend({ status: z.enum(LEAD_STATUSES).optional() });
const ListQuery = z.object({
  q: z.string().optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  tag: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
const ImportBody = z.object({ rows: z.array(z.record(z.string(), z.unknown())).min(1).max(10000) });

@Controller('leads')
export class LeadsController {
  constructor(private db: PrismaService) {}

  @Get()
  async list(@UserId() userId: string, @Query() query: unknown) {
    const { q, status, tag, page, pageSize } = parse(ListQuery, query);
    const where: Prisma.LeadWhereInput = {
      userId,
      ...(status && { status }),
      ...(tag && { tags: { has: tag } }),
      ...(q && {
        OR: (['handle', 'name', 'notes', 'niche'] as const).map((f) => ({ [f]: { contains: q, mode: 'insensitive' as const } })),
      }),
    };
    const [items, total] = await this.db.$transaction([
      this.db.lead.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.db.lead.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  @Get('tags')
  async tags(@UserId() userId: string) {
    const rows = await this.db.$queryRaw<{ tag: string }[]>`
      SELECT DISTINCT unnest(tags) AS tag FROM "Lead" WHERE "userId" = ${userId} ORDER BY tag`;
    return rows.map((r) => r.tag);
  }

  @Get('counts')
  async counts(@UserId() userId: string) {
    const rows = await this.db.lead.groupBy({ by: ['status'], where: { userId }, _count: true });
    return Object.fromEntries(LEAD_STATUSES.map((s) => [s, rows.find((r) => r.status === s)?._count ?? 0]));
  }

  @Post()
  async create(@UserId() userId: string, @Body() body: unknown) {
    const { handle: raw, ...data } = parse(CreateLead, body);
    const handle = normalizeHandle(raw);
    if (!handle) throw new BadRequestException('Invalid Instagram handle');
    return this.db.lead.upsert({ where: { userId_handle: { userId, handle } }, update: data, create: { ...data, userId, handle } });
  }

  /**
   * Rows arrive already column-mapped by the web app ({handle, name, niche, ...}).
   * New handles are inserted; existing ones get non-empty fields updated and tags merged.
   */
  @Post('import')
  async import(@UserId() userId: string, @Body() body: unknown) {
    const { rows } = parse(ImportBody, body);
    const skipped: { row: number; reason: string }[] = [];
    const byHandle = new Map<string, z.infer<typeof LeadFields>>();
    rows.forEach((row, i) => {
      const handle = normalizeHandle(String(row.handle ?? ''));
      if (!handle) return skipped.push({ row: i + 1, reason: `Invalid handle "${String(row.handle ?? '')}"` });
      const tags = typeof row.tags === 'string' ? row.tags.split(/[,;|]/) : row.tags;
      const r = LeadFields.safeParse({ ...row, tags: Array.isArray(tags) ? tags.filter((t) => String(t).trim()) : undefined });
      if (!r.success) return skipped.push({ row: i + 1, reason: r.error.issues[0].message });
      byHandle.set(handle, r.data);
    });

    const existing = await this.db.lead.findMany({
      where: { userId, handle: { in: [...byHandle.keys()] } },
      select: { id: true, handle: true, tags: true },
    });
    const existingMap = new Map(existing.map((l) => [l.handle, l]));
    const toCreate = [...byHandle].filter(([h]) => !existingMap.has(h)).map(([handle, d]) => ({ ...d, userId, handle }));
    await this.db.lead.createMany({ data: toCreate, skipDuplicates: true });

    // ponytail: one UPDATE per existing lead; batch into raw SQL if re-imports of 10k+ rows get slow.
    const updates = existing.map((l) => {
      const { tags, ...d } = byHandle.get(l.handle)!;
      const data = Object.fromEntries(Object.entries(d).filter(([, v]) => v != null && v !== ''));
      return this.db.lead.update({ where: { id: l.id }, data: { ...data, tags: [...new Set([...l.tags, ...(tags ?? [])])] } });
    });
    await this.db.$transaction(updates);
    return { created: toCreate.length, updated: existing.length, skipped };
  }

  @Patch(':id')
  async update(@UserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    const data = parse(UpdateLead, body);
    found(await this.db.lead.findFirst({ where: { id, userId } }), 'Lead');
    const lead = await this.db.lead.update({ where: { id }, data });
    // A lead that replied or opted out must never get another queued cold DM.
    if (data.status && data.status !== 'New' && data.status !== 'Contacted') {
      await this.db.sendJob.updateMany({ where: { leadId: id, state: 'Queued' }, data: { state: 'Skipped', error: `Lead marked ${data.status}` } });
    }
    return lead;
  }

  @Post('delete')
  async remove(@UserId() userId: string, @Body() body: unknown) {
    const { ids } = parse(z.object({ ids: z.array(z.string()).min(1).max(1000) }), body);
    return this.db.lead.deleteMany({ where: { userId, id: { in: ids } } });
  }
}
