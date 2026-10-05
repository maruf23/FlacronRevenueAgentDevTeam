import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountStatus, PlanStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';

const PLAN_NAMES = ['Starter', 'Growth', 'Scale'] as const;

const directorySelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  accountStatus: true,
  planStatus: true,
  planName: true,
  workspaceId: true,
  createdAt: true,
  workspace: { select: { name: true } },
} satisfies Prisma.UserSelect;

type DirectoryRow = Prisma.UserGetPayload<{ select: typeof directorySelect }>;

function toDirectoryUser(user: DirectoryRow) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    accountStatus: user.accountStatus,
    planStatus: user.planStatus,
    planName: user.planName,
    workspaceId: user.workspaceId,
    workspaceName: user.workspace.name,
    createdAt: user.createdAt,
  };
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lists users in the current workspace (RLS-scoped). */
  findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        workspaceId: true,
        createdAt: true,
      },
    });
  }

  /**
   * Every account in the product. Owner and admin only.
   * Clears the tenant GUC for this transaction so RLS does not hide other workspaces.
   */
  async listDirectory() {
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('app.current_workspace_id', '', true)
      `;
      return tx.user.findMany({
        orderBy: { createdAt: 'desc' },
        select: directorySelect,
      });
    });
    return rows.map(toDirectoryUser);
  }

  async updateStatus(
    actorUserId: string,
    targetUserId: string,
    dto: UpdateUserStatusDto,
  ) {
    if (!dto.accountStatus && !dto.planStatus && dto.planName === undefined) {
      throw new BadRequestException('Choose an account status or a plan');
    }

    if (dto.accountStatus === AccountStatus.SUSPENDED && targetUserId === actorUserId) {
      throw new BadRequestException('You cannot suspend your own account');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT set_config('app.current_workspace_id', '', true)
      `;

      const existing = await tx.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, planStatus: true },
      });
      if (!existing) {
        throw new NotFoundException('User not found');
      }

      const data: Prisma.UserUpdateInput = {};

      if (dto.accountStatus) {
        data.accountStatus = dto.accountStatus;
      }

      if (dto.planStatus === PlanStatus.NOT_PURCHASED) {
        data.planStatus = PlanStatus.NOT_PURCHASED;
        data.planName = null;
      } else if (dto.planStatus === PlanStatus.PURCHASED || dto.planName) {
        const name = (dto.planName ?? '').trim();
        if (name && !PLAN_NAMES.includes(name as (typeof PLAN_NAMES)[number])) {
          throw new BadRequestException(
            `Plan must be one of: ${PLAN_NAMES.join(', ')}`,
          );
        }
        data.planStatus = PlanStatus.PURCHASED;
        data.planName = name || 'Growth';
      }

      return tx.user.update({
        where: { id: targetUserId },
        data,
        select: directorySelect,
      });
    });

    return toDirectoryUser(updated);
  }
}
