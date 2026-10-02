import { Injectable } from '@nestjs/common';
import { Role, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(workspaceId: string, userId: string, role: Role) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const isManager =
      role === Role.OWNER || role === Role.ADMIN || role === Role.MANAGER;

    const tasks = await this.prisma.task.findMany({
      where: {
        workspaceId,
        ...(isManager ? {} : { assignedUserId: userId }),
      },
      orderBy: [{ status: 'asc' }, { dueAt: 'asc' }, { createdAt: 'desc' }],
      include: {
        assignedUser: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        lead: {
          select: {
            id: true,
            status: true,
            contact: {
              select: {
                email: true,
                firstName: true,
                lastName: true,
                companyName: true,
              },
            },
          },
        },
      },
      take: 200,
    });

    return tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      dueAt: t.dueAt,
      completedAt: t.completedAt,
      conversationId: t.conversationId,
      leadId: t.leadId,
      assignedUserId: t.assignedUserId,
      assignedTo: t.assignedUser
        ? [t.assignedUser.firstName, t.assignedUser.lastName]
            .filter(Boolean)
            .join(' ')
            .trim() || t.assignedUser.email
        : 'Unassigned',
      leadEmail: t.lead?.contact.email ?? null,
      leadCompany: t.lead?.contact.companyName ?? null,
      createdAt: t.createdAt,
    }));
  }

  async complete(workspaceId: string, taskId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    return this.prisma.task.updateMany({
      where: { id: taskId, workspaceId, status: TaskStatus.PENDING },
      data: {
        status: TaskStatus.COMPLETED,
        completedAt: new Date(),
      },
    });
  }
}
