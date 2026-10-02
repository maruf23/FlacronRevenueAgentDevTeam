import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { AutopilotService } from './autopilot.service';
import { WorkspacePauseService } from '../safety/workspace-pause.service';

class UpdateAutopilotSettingsDto {
  @IsOptional()
  @IsBoolean()
  supervisedAutomationEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  autoStartHoursDefault?: number;

  @IsOptional()
  @IsBoolean()
  requireExplicitApprovalForNewSenders?: boolean;
}

@Controller('autopilot')
export class AutopilotController {
  constructor(
    private readonly autopilot: AutopilotService,
    private readonly workspacePause: WorkspacePauseService,
  ) {}

  @Get('control-center')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  controlCenter(@CurrentUser() user: AuthenticatedUser) {
    return this.autopilot.getControlCenter(user.workspaceId);
  }

  @Patch('settings')
  @Roles(Role.OWNER, Role.ADMIN)
  updateSettings(
    @Body() dto: UpdateAutopilotSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.autopilot.updateSettings(user.workspaceId, dto);
  }

  @Post('emergency-stop')
  @Roles(Role.OWNER)
  async emergencyStop(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ||
      req.ip ||
      null;
    await this.workspacePause.pauseWorkspace({
      workspaceId: user.workspaceId,
      reason: `Emergency stop triggered by OWNER ${user.email}`,
      actorUserId: user.userId,
      ipAddress: ip,
      cancelOutbound: true,
      notificationType: 'EMERGENCY_STOP',
    });
    return { status: 'STOPPED' as const };
  }

  @Post('resume')
  @Roles(Role.OWNER, Role.ADMIN)
  resume(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)
        ?.split(',')[0]
        ?.trim() ||
      req.ip ||
      null;
    return this.autopilot.resumeWorkspace(user.workspaceId, user.userId, ip);
  }
}
