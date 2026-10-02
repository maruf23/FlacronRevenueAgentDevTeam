import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type CreateAuditEventInput = {
  workspaceId: string;
  actorUserId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  changes?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: CreateAuditEventInput) {
    await this.prisma.setWorkspaceContext(input.workspaceId);

    return this.prisma.auditEvent.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        changes: input.changes ?? undefined,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }
}
