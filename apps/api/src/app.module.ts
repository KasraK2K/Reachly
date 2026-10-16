import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AccountsController } from './accounts.controller';
import { AnalyticsController } from './analytics.controller';
import { AssistantController } from './assistant.controller';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { CampaignsController } from './campaigns.controller';
import { EngineService } from './engine.service';
import { ExtensionController } from './extension.controller';
import { Auth } from './http';
import { InboxController } from './inbox.controller';
import { InboxService } from './inbox.service';
import { IntegrationsController } from './integrations.controller';
import { LeadsController } from './leads.controller';
import { PrismaService } from './prisma.service';
import { TemplatesController } from './templates.controller';
import { UsersController } from './users.controller';

@Controller()
class HealthController {
  @Get('health')
  @Auth('public')
  health() {
    return { ok: true };
  }
}

@Module({
  controllers: [HealthController, AuthController, UsersController, LeadsController, TemplatesController, AccountsController, CampaignsController, ExtensionController, AnalyticsController, AssistantController, IntegrationsController, InboxController],
  providers: [PrismaService, EngineService, InboxService, { provide: APP_GUARD, useClass: AuthGuard }],
})
export class AppModule {}
