import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { WorkspacePauseService } from '../safety/workspace-pause.service';

@Controller('emergency-stop')
export class EmergencyStopController {
  constructor(private readonly workspacePause: WorkspacePauseService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @Roles(Role.OWNER)
  async stop(
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
}
