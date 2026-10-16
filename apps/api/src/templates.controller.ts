import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { templateErrors } from '@reachly/shared';
import { z } from 'zod';
import { found, parse, UserId } from './http';
import { PrismaService } from './prisma.service';

const TemplateBody = z.object({ name: z.string().trim().min(1).max(100), body: z.string().max(1000) });

function validBody(body: string) {
  const errors = templateErrors(body);
  if (errors.length) throw new BadRequestException(errors);
}

@Controller('templates')
export class TemplatesController {
  constructor(private db: PrismaService) {}

  @Get()
  async list(@UserId() userId: string) {
    const templates = await this.db.template.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
    const stats = await this.db.sendJob.groupBy({ by: ['templateId'], where: { template: { userId }, state: 'Sent' }, _count: true });
    return templates.map((t) => ({ ...t, sent: stats.find((s) => s.templateId === t.id)?._count ?? 0 }));
  }

  @Post()
  create(@UserId() userId: string, @Body() body: unknown) {
    const data = parse(TemplateBody, body);
    validBody(data.body);
    return this.db.template.create({ data: { ...data, userId } });
  }

  @Patch(':id')
  async update(@UserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    const data = parse(TemplateBody.partial(), body);
    if (data.body !== undefined) validBody(data.body);
    found(await this.db.template.findFirst({ where: { id, userId } }), 'Template');
    return this.db.template.update({ where: { id }, data });
  }

  @Delete(':id')
  async remove(@UserId() userId: string, @Param('id') id: string) {
    found(await this.db.template.findFirst({ where: { id, userId } }), 'Template');
    if ((await this.db.sendJob.count({ where: { templateId: id } })) || (await this.db.campaignStep.count({ where: { templateId: id } }))) {
      throw new BadRequestException('Template is used by a campaign; delete the campaign first');
    }
    await this.db.template.delete({ where: { id } });
    return { ok: true };
  }
}
