import { Controller, Get } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  overview(@CurrentUser() user: AuthenticatedUser) {
    return this.analytics.getOverview(user.workspaceId);
  }
}
