import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { DeliverabilityService } from './deliverability.service';

@Controller('deliverability')
export class DeliverabilityController {
  constructor(private readonly deliverability: DeliverabilityService) {}

  @Get('domain-check')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  domainCheck(
    @CurrentUser() user: AuthenticatedUser,
    @Query('domain') domain?: string,
  ) {
    return this.deliverability.checkSendingDomain(user.workspaceId, domain);
  }

  @Get('summary')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  summary(@CurrentUser() user: AuthenticatedUser) {
    return this.deliverability.getSummary(user.workspaceId);
  }
}
