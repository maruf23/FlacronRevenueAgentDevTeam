import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';

@Controller('alerts')
export class AlertsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  async list(@CurrentUser() user: AuthenticatedUser) {
    await this.prisma.setWorkspaceContext(user.workspaceId);

    const alertTypes = [
      'DELIVERABILITY_ALERT',
      'EMERGENCY_STOP',
      'SYSTEM_ALERT',
      'CAMPAIGN_APPROVAL_REQUIRED',
      'LEADS_READY',
    ];

    const [workspace, notifications] = await Promise.all([
      this.prisma.workspace.findUnique({
        where: { id: user.workspaceId },
        select: {
          isPaused: true,
          pauseReason: true,
          pausedAt: true,
        },
      }),
      this.prisma.notification.findMany({
        where: {
          workspaceId: user.workspaceId,
          type: { in: alertTypes },
          readAt: null,
          // User-targeted alerts (e.g. campaign approval) + workspace-wide
          OR: [{ userId: user.userId }, { userId: null }],
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    return {
      workspacePaused: workspace?.isPaused ?? false,
      pauseReason: workspace?.pauseReason ?? null,
      pausedAt: workspace?.pausedAt ?? null,
      unreadCount: notifications.length,
      alerts: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        metadata: n.metadata,
        createdAt: n.createdAt,
      })),
    };
  }

  @Patch(':id/read')
  @Roles(Role.OWNER, Role.ADMIN, Role.MANAGER, Role.SALES_REP)
  async markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.prisma.setWorkspaceContext(user.workspaceId);
    await this.prisma.notification.updateMany({
      where: { id, workspaceId: user.workspaceId },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
