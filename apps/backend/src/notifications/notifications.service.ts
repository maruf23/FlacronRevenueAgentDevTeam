import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type CreateNotificationInput = {
  workspaceId: string;
  userId?: string | null;
  type: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    workspaceId: string,
    userId: string,
    opts?: { unreadOnly?: boolean; take?: number },
  ) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const take = Math.min(Math.max(opts?.take ?? 50, 1), 100);

    const where: Prisma.NotificationWhereInput = {
      workspaceId,
      OR: [{ userId }, { userId: null }],
      ...(opts?.unreadOnly ? { readAt: null } : {}),
    };

    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.notification.count({
        where: {
          workspaceId,
          readAt: null,
          OR: [{ userId }, { userId: null }],
        },
      }),
    ]);

    return {
      unreadCount,
      notifications: items.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        metadata: n.metadata,
        readAt: n.readAt,
        createdAt: n.createdAt,
      })),
    };
  }

  async markRead(workspaceId: string, userId: string, id: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const result = await this.prisma.notification.updateMany({
      where: {
        id,
        workspaceId,
        OR: [{ userId }, { userId: null }],
      },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    return { ok: true };
  }

  async markAllRead(workspaceId: string, userId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const result = await this.prisma.notification.updateMany({
      where: {
        workspaceId,
        readAt: null,
        OR: [{ userId }, { userId: null }],
      },
      data: { readAt: new Date() },
    });
    return { ok: true, updated: result.count };
  }

  async create(input: CreateNotificationInput) {
    await this.prisma.setWorkspaceContext(input.workspaceId);
    return this.prisma.notification.create({
      data: {
        id: randomUUID(),
        workspaceId: input.workspaceId,
        userId: input.userId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        metadata: (input.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      },
    });
  }

  async notifyUsers(
    workspaceId: string,
    userIds: string[],
    payload: Omit<CreateNotificationInput, 'workspaceId' | 'userId'>,
  ) {
    await this.prisma.setWorkspaceContext(workspaceId);
    if (userIds.length === 0) {
      await this.create({ workspaceId, userId: null, ...payload });
      return;
    }
    await this.prisma.notification.createMany({
      data: userIds.map((userId) => ({
        id: randomUUID(),
        workspaceId,
        userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        metadata: (payload.metadata ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
      })),
    });
  }
}
