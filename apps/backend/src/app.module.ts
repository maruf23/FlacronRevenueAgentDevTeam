import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { QueuesModule } from './queues/queues.module';
import { HealthModule } from './health/health.module';
import { TenantsModule } from './tenants/tenants.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AiModule } from './ai/ai.module';
import { LeadsImportModule } from './leads-import/leads-import.module';
import { LeadsModule } from './leads/leads.module';
import { DraftModule } from './drafts/draft.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { SequencesModule } from './sequences/sequences.module';
import { InboxModule } from './inbox/inbox.module';
import { AuditModule } from './audit/audit.module';
import { SafetyModule } from './safety/safety.module';
import { DeliverabilityModule } from './deliverability/deliverability.module';
import { HunterModule } from './hunter/hunter.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { TasksModule } from './tasks/tasks.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProductsModule } from './products/products.module';
import { SuppressionsModule } from './suppressions/suppressions.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AutopilotModule } from './autopilot/autopilot.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TenancyGuard } from './common/guards/tenancy.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { RlsInterceptor } from './common/interceptors/rls.interceptor';
import { AuditInterceptor } from './audit/audit.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    EventEmitterModule.forRoot({
      wildcard: false,
      ignoreErrors: false,
    }),
    PrismaModule,
    RedisModule,
    QueuesModule,
    AuditModule,
    HealthModule,
    TenantsModule,
    AuthModule,
    UsersModule,
    AiModule,
    LeadsImportModule,
    LeadsModule,
    DraftModule,
    IntegrationsModule,
    SequencesModule,
    InboxModule,
    SafetyModule,
    DeliverabilityModule,
    HunterModule,
    CampaignsModule,
    TasksModule,
    NotificationsModule,
    ProductsModule,
    SuppressionsModule,
    AnalyticsModule,
    AutopilotModule,
  ],
  providers: [
    // Order: JWT → tenancy (workspaceId) → roles → RLS session GUC → audit
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenancyGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: RlsInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
