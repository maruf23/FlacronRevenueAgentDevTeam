import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type WorkspaceOnboardingPayload = {
  companyName?: string;
  website?: string;
  industry?: string;
  companySummary?: string;
  icpSummary?: string;
  targetRoles?: string[];
  geography?: string;
  product?: {
    name: string;
    description?: string;
    valueProps?: string[];
    audienceHints?: string[];
  };
  skipMailbox?: boolean;
  complete?: boolean;
};

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lists workspaces visible under the current RLS session context. */
  findAll() {
    return this.prisma.workspace.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, createdAt: true },
    });
  }

  async getCurrent(workspaceId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        settings: true,
        onboardingCompletedAt: true,
        isPaused: true,
        createdAt: true,
      },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const [productCount, mailboxCount] = await Promise.all([
      this.prisma.product.count({ where: { workspaceId } }),
      this.prisma.emailIntegration.count({ where: { workspaceId } }),
    ]);

    const settings = this.asSettings(workspace.settings);

    return {
      id: workspace.id,
      name: workspace.name,
      settings,
      onboardingCompletedAt: workspace.onboardingCompletedAt,
      needsOnboarding: workspace.onboardingCompletedAt == null,
      isPaused: workspace.isPaused,
      createdAt: workspace.createdAt,
      productCount,
      mailboxConnected: mailboxCount > 0,
      onboarding: {
        companyName: (settings.companyName as string) || workspace.name,
        website: (settings.website as string) || null,
        industry: (settings.industry as string) || null,
        companySummary: (settings.companySummary as string) || null,
        icpSummary: (settings.icpSummary as string) || null,
        targetRoles: Array.isArray(settings.targetRoles)
          ? (settings.targetRoles as string[])
          : [],
        geography: (settings.geography as string) || null,
      },
    };
  }

  async updateOnboarding(workspaceId: string, dto: WorkspaceOnboardingPayload) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, settings: true, onboardingCompletedAt: true },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const settings = this.asSettings(workspace.settings);

    if (dto.companyName?.trim()) {
      settings.companyName = dto.companyName.trim();
    }
    if (dto.website !== undefined) {
      settings.website = dto.website?.trim() || null;
    }
    if (dto.industry !== undefined) {
      settings.industry = dto.industry?.trim() || null;
    }
    if (dto.companySummary !== undefined) {
      settings.companySummary = dto.companySummary?.trim() || null;
    }
    if (dto.icpSummary !== undefined) {
      settings.icpSummary = dto.icpSummary?.trim() || null;
    }
    if (dto.targetRoles !== undefined) {
      settings.targetRoles = dto.targetRoles
        .map((r) => r.trim())
        .filter(Boolean);
    }
    if (dto.geography !== undefined) {
      settings.geography = dto.geography?.trim() || null;
    }
    if (dto.skipMailbox) {
      settings.mailboxSkippedAtOnboarding = true;
    }

    const nameUpdate = dto.companyName?.trim();

    if (dto.product?.name?.trim()) {
      const existing = await this.prisma.product.findFirst({
        where: {
          workspaceId,
          name: { equals: dto.product.name.trim(), mode: 'insensitive' },
        },
      });
      if (existing) {
        await this.prisma.product.update({
          where: { id: existing.id },
          data: {
            description: dto.product.description?.trim() || existing.description,
            valueProps: dto.product.valueProps ?? existing.valueProps,
            audienceHints: dto.product.audienceHints ?? existing.audienceHints,
          },
        });
      } else {
        await this.prisma.product.create({
          data: {
            workspaceId,
            name: dto.product.name.trim(),
            description: dto.product.description?.trim() || null,
            valueProps: dto.product.valueProps ?? [],
            audienceHints: dto.product.audienceHints ?? [],
          },
        });
      }
    }

    if (dto.complete) {
      const productCount = await this.prisma.product.count({
        where: { workspaceId },
      });
      if (productCount === 0 && !dto.product?.name?.trim()) {
        throw new BadRequestException(
          'Add at least one product before completing onboarding',
        );
      }
      if (!settings.icpSummary && !dto.icpSummary?.trim()) {
        throw new BadRequestException(
          'Provide an ICP / audience summary before completing onboarding',
        );
      }
      if (dto.icpSummary?.trim()) {
        settings.icpSummary = dto.icpSummary.trim();
      }
    }

    const updated = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        ...(nameUpdate ? { name: nameUpdate } : {}),
        settings: settings as Prisma.InputJsonValue,
        ...(dto.complete
          ? { onboardingCompletedAt: new Date() }
          : {}),
      },
      select: {
        id: true,
        name: true,
        settings: true,
        onboardingCompletedAt: true,
      },
    });

    return this.getCurrent(updated.id);
  }

  private asSettings(raw: unknown): Record<string, unknown> {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return { ...(raw as Record<string, unknown>) };
    }
    return {};
  }
}
