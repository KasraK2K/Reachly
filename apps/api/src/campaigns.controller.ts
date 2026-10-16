import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { JOB_STATES, LEAD_STATUSES, renderTemplate, templateErrors } from '@reachly/shared';
import { z } from 'zod';
import { found, parse, UserId } from './http';
import { PrismaService } from './prisma.service';

const Create = z.object({
  name: z.string().trim().min(1).max(100),
  igAccountId: z.string(),
  templateIds: z.array(z.string()).min(1).max(10),
  filter: z.object({
    status: z.enum(LEAD_STATUSES).default('New'),
    tag: z.string().optional(),
    leadIds: z.array(z.string()).max(10000).optional(),
  }),
  followUps: z.array(z.object({ templateId: z.string(), delayDays: z.number().int().min(1).max(30) })).max(5).default([]),
});
const JobsQuery = z.object({
  state: z.enum(JOB_STATES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

@Controller('campaigns')
export class CampaignsController {
  constructor(private db: PrismaService) {}

  @Get()
  async list(@UserId() userId: string) {
    const campaigns = await this.db.campaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { igAccount: { select: { handle: true } }, templates: { include: { template: { select: { id: true, name: true } } } } },
    });
    const counts = await this.db.sendJob.groupBy({ by: ['campaignId', 'state'], where: { campaign: { userId } }, _count: true });
    return campaigns.map((c) => ({
      ...c,
      templates: c.templates.map((t) => t.template),
      counts: Object.fromEntries(JOB_STATES.map((s) => [s, counts.find((r) => r.campaignId === c.id && r.state === s)?._count ?? 0])),
    }));
  }

  @Get(':id')
  async get(@UserId() userId: string, @Param('id') id: string, @Query() query: unknown) {
    const { state, page, pageSize } = parse(JobsQuery, query);
    const campaign = found(
      await this.db.campaign.findFirst({
        where: { id, userId },
        include: {
          igAccount: { select: { id: true, handle: true } },
          templates: { include: { template: true } },
          steps: { include: { template: { select: { id: true, name: true } } }, orderBy: { position: 'asc' } },
        },
      }),
      'Campaign',
    );
    const where = { campaignId: id, ...(state && { state }) };
    const [jobs, total, counts] = await this.db.$transaction([
      this.db.sendJob.findMany({
        where,
        include: { lead: { select: { id: true, handle: true, name: true, status: true } }, template: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.sendJob.count({ where }),
      this.db.sendJob.groupBy({ by: ['state'], where: { campaignId: id }, _count: true, orderBy: { state: 'asc' } }),
    ]);
    return {
      ...campaign,
      templates: campaign.templates.map((t) => t.template),
      counts: Object.fromEntries(JOB_STATES.map((s) => [s, counts.find((r) => r.state === s)?._count ?? 0])),
      jobs,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Creates a Draft with one rendered first message per lead (follow-ups are rendered when the previous step is sent) (variants rotated round-robin) so the user
   * can review exactly what will be sent. Leads already contacted or queued anywhere are excluded.
   */
  @Post()
  async create(@UserId() userId: string, @Body() body: unknown) {
    const { name, igAccountId, templateIds, filter, followUps } = parse(Create, body);
    found(await this.db.igAccount.findFirst({ where: { id: igAccountId, userId } }), 'Instagram account');
    const allIds = [...new Set([...templateIds, ...followUps.map((f) => f.templateId)])];
    const all = await this.db.template.findMany({ where: { userId, id: { in: allIds } } });
    if (all.length !== allIds.length) throw new BadRequestException('Unknown template');
    const templates = all.filter((t) => templateIds.includes(t.id));
    for (const t of all) {
      if (templateErrors(t.body).length) throw new BadRequestException(`Template "${t.name}" has errors`);
    }

    const leads = await this.db.lead.findMany({
      where: {
        userId,
        ...(filter.leadIds ? { id: { in: filter.leadIds } } : { status: filter.status }),
        ...(filter.tag && { tags: { has: filter.tag } }),
        jobs: { none: { state: { in: ['Queued', 'Claimed', 'Sent'] } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!leads.length) throw new BadRequestException('No leads match this filter (already contacted or queued leads are excluded)');

    const jobs = leads
      .map((lead, i) => {
        const t = templates[i % templates.length];
        return { leadId: lead.id, templateId: t.id, renderedText: renderTemplate(t.body, lead) };
      })
      .filter((j) => j.renderedText);

    return this.db.campaign.create({
      data: {
        userId,
        igAccountId,
        name,
        templates: { create: templates.map((t) => ({ templateId: t.id })) },
        steps: { create: followUps.map((f, i) => ({ position: i + 1, delayDays: f.delayDays, templateId: f.templateId })) },
        jobs: { createMany: { data: jobs } },
      },
    });
  }

  @Post(':id/activate')
  async activate(@UserId() userId: string, @Param('id') id: string) {
    const c = found(await this.db.campaign.findFirst({ where: { id, userId } }), 'Campaign');
    if (c.status === 'Completed') throw new BadRequestException('Campaign is completed');
    return this.db.campaign.update({ where: { id }, data: { status: 'Active' } });
  }

  @Post(':id/pause')
  async pause(@UserId() userId: string, @Param('id') id: string) {
    found(await this.db.campaign.findFirst({ where: { id, userId, status: 'Active' } }), 'Active campaign');
    return this.db.campaign.update({ where: { id }, data: { status: 'Paused' } });
  }

  /** Edit one queued message before it goes out. */
  @Patch(':id/jobs/:jobId')
  async editJob(@UserId() userId: string, @Param('id') id: string, @Param('jobId') jobId: string, @Body() body: unknown) {
    const { renderedText } = parse(z.object({ renderedText: z.string().trim().min(1).max(1000) }), body);
    found(await this.db.sendJob.findFirst({ where: { id: jobId, campaignId: id, campaign: { userId }, state: 'Queued' } }), 'Queued message');
    return this.db.sendJob.update({ where: { id: jobId }, data: { renderedText } });
  }

  @Delete(':id')
  async remove(@UserId() userId: string, @Param('id') id: string) {
    const c = found(await this.db.campaign.findFirst({ where: { id, userId } }), 'Campaign');
    if (c.status === 'Active') throw new BadRequestException('Pause the campaign before deleting it');
    await this.db.campaign.delete({ where: { id } });
    return { ok: true };
  }
}
