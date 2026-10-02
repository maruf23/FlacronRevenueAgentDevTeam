import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { CampaignStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacePauseService } from '../safety/workspace-pause.service';
import { QUEUE_NAMES } from '../queues/queue.constants';

export type WorkspaceAutopilotSettings = {
  supervisedAutomationEnabled: boolean;
  autoStartHoursDefault: number;
  requireExplicitApprovalForNewSenders: boolean;
};

const DEFAULT_SETTINGS: WorkspaceAutopilotSettings = {
  supervisedAutomationEnabled: false,
  autoStartHoursDefault: 2,
  requireExplicitApprovalForNewSenders: true,
};

@Injectable()
export class AutopilotService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacePause: WorkspacePauseService,
    @InjectQueue(QUEUE_NAMES.CAMPAIGN) private readonly campaignQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SEQUENCE) private readonly sequenceQueue: Queue,
    @InjectQueue(QUEUE_NAMES.INBOX) private readonly inboxQueue: Queue,
    @InjectQueue(QUEUE_NAMES.LEAD_IMPORT) private readonly importQueue: Queue,
  ) {}

  async getControlCenter(workspaceId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        isPaused: true,
        pausedAt: true,
        pauseReason: true,
        settings: true,
        onboardingCompletedAt: true,
      },
    });

    const settings = this.readSettings(workspace?.settings);

    const campaigns = await this.prisma.campaign.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      take: 40,
      select: {
        id: true,
        name: true,
        status: true,
        schedule: true,
        settings: true,
        updatedAt: true,
        _count: { select: { leads: true } },
      },
    });

    const byStatus: Record<string, number> = {};
    for (const c of campaigns) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    }

    const [mailbox, recentAudit, queueHealth] = await Promise.all([
      this.prisma.emailIntegration.findFirst({
        where: { workspaceId },
        select: {
          provider: true,
          accountEmail: true,
          tokenExpiresAt: true,
        },
      }),
      this.prisma.auditEvent.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: {
          id: true,
          action: true,
          targetType: true,
          targetId: true,
          changes: true,
          createdAt: true,
        },
      }),
      this.getQueueHealth(),
    ]);

    const mailboxHealthy =
      mailbox != null &&
      (mailbox.tokenExpiresAt == null ||
        mailbox.tokenExpiresAt.getTime() > Date.now());

    const operatingState = this.resolveOperatingState({
      isPaused: workspace?.isPaused ?? false,
      byStatus,
      mailboxHealthy,
    });

    return {
      workspace: {
        id: workspace?.id,
        name: workspace?.name,
        isPaused: workspace?.isPaused ?? false,
        pausedAt: workspace?.pausedAt ?? null,
        pauseReason: workspace?.pauseReason ?? null,
        onboardingCompletedAt: workspace?.onboardingCompletedAt ?? null,
      },
      settings,
      operatingState,
      mailbox: mailbox
        ? {
            provider: mailbox.provider,
            accountEmail: mailbox.accountEmail,
            healthy: mailboxHealthy,
            tokenExpiresAt: mailbox.tokenExpiresAt,
          }
        : null,
      campaignSummary: {
        total: campaigns.length,
        byStatus,
      },
      campaigns: campaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        leadsCount: c._count.leads,
        schedule: c.schedule,
        launchMode:
          c.settings &&
          typeof c.settings === 'object' &&
          !Array.isArray(c.settings)
            ? (c.settings as Record<string, unknown>).launchMode ?? null
            : null,
        updatedAt: c.updatedAt,
      })),
      queueHealth,
      activity: recentAudit.map((e) => ({
        id: e.id,
        action: e.action,
        targetType: e.targetType,
        targetId: e.targetId,
        changes: e.changes,
        createdAt: e.createdAt,
      })),
      cloudBanner:
        'Campaigns run automatically in the cloud. Closing your browser or turning off your computer will not stop them.',
    };
  }

  async updateSettings(
    workspaceId: string,
    patch: Partial<WorkspaceAutopilotSettings>,
  ) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { settings: true },
    });
    const current = this.readSettings(workspace?.settings);
    const next: WorkspaceAutopilotSettings = {
      ...current,
      ...patch,
    };
    if (
      patch.autoStartHoursDefault != null &&
      (patch.autoStartHoursDefault < 0 || patch.autoStartHoursDefault > 168)
    ) {
      throw new BadRequestException('autoStartHoursDefault must be 0–168');
    }
    await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: { settings: next as unknown as Prisma.InputJsonValue },
    });
    return next;
  }

  async resumeWorkspace(
    workspaceId: string,
    actorUserId: string,
    ipAddress?: string | null,
  ) {
    return this.workspacePause.resumeWorkspace({
      workspaceId,
      actorUserId,
      ipAddress,
    });
  }

  async evaluateAutoStartGates(
    workspaceId: string,
    campaignId: string,
  ): Promise<{
    allowed: boolean;
    blockers: string[];
    supervisedAutomationEnabled: boolean;
  }> {
    await this.prisma.setWorkspaceContext(workspaceId);
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { isPaused: true, settings: true },
    });
    const settings = this.readSettings(workspace?.settings);
    const blockers: string[] = [];

    if (workspace?.isPaused) {
      blockers.push('Workspace is paused (emergency stop or deliverability)');
    }
    if (!settings.supervisedAutomationEnabled) {
      blockers.push(
        'Supervised automation is disabled — enable it in Autopilot settings or approve manually',
      );
    }

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: { status: true, mailbox: true, settings: true },
    });
    if (!campaign) {
      blockers.push('Campaign not found');
      return {
        allowed: false,
        blockers,
        supervisedAutomationEnabled: settings.supervisedAutomationEnabled,
      };
    }

    const mailbox = await this.prisma.emailIntegration.findFirst({
      where: { workspaceId },
      select: { tokenExpiresAt: true },
    });
    const mailboxOk =
      mailbox != null &&
      (mailbox.tokenExpiresAt == null ||
        mailbox.tokenExpiresAt.getTime() > Date.now());
    if (!mailboxOk && !process.env.SMTP_HOST) {
      blockers.push('Mailbox authentication is unhealthy');
    }

    const campaignCount = await this.prisma.campaign.count({
      where: {
        workspaceId,
        status: {
          in: [
            CampaignStatus.RUNNING,
            CampaignStatus.COMPLETED,
            CampaignStatus.SCHEDULED,
          ],
        },
      },
    });
    if (campaignCount === 0 && settings.requireExplicitApprovalForNewSenders) {
      blockers.push('First campaign requires explicit approval');
    }

    return {
      allowed: blockers.length === 0,
      blockers,
      supervisedAutomationEnabled: settings.supervisedAutomationEnabled,
    };
  }

  private readSettings(raw: unknown): WorkspaceAutopilotSettings {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const s = raw as Record<string, unknown>;
      return {
        supervisedAutomationEnabled: Boolean(s.supervisedAutomationEnabled),
        autoStartHoursDefault:
          typeof s.autoStartHoursDefault === 'number'
            ? s.autoStartHoursDefault
            : DEFAULT_SETTINGS.autoStartHoursDefault,
        requireExplicitApprovalForNewSenders:
          s.requireExplicitApprovalForNewSenders !== false,
      };
    }
    return { ...DEFAULT_SETTINGS };
  }

  private resolveOperatingState(input: {
    isPaused: boolean;
    byStatus: Record<string, number>;
    mailboxHealthy: boolean;
  }): string {
    if (input.isPaused) return 'paused';
    if (!input.mailboxHealthy && (input.byStatus.RUNNING ?? 0) > 0) {
      return 'attention_needed';
    }
    if ((input.byStatus.ATTENTION_REQUIRED ?? 0) > 0) return 'attention_needed';
    if ((input.byStatus.NEEDS_REVIEW ?? 0) > 0) return 'awaiting_approval';
    if ((input.byStatus.PREPARING ?? 0) > 0) return 'enriching';
    if ((input.byStatus.SCHEDULED ?? 0) > 0) return 'scheduled';
    if ((input.byStatus.RUNNING ?? 0) > 0) return 'running';
    if ((input.byStatus.COMPLETED ?? 0) > 0) return 'completed';
    return 'idle';
  }

  private async getQueueHealth() {
    const queues = [
      { name: 'campaign', queue: this.campaignQueue },
      { name: 'sequence', queue: this.sequenceQueue },
      { name: 'inbox', queue: this.inboxQueue },
      { name: 'lead-import', queue: this.importQueue },
    ];
    const results = await Promise.all(
      queues.map(async ({ name, queue }) => {
        try {
          const [waiting, active, delayed, failed] = await Promise.all([
            queue.getWaitingCount(),
            queue.getActiveCount(),
            queue.getDelayedCount(),
            queue.getFailedCount(),
          ]);
          return { name, waiting, active, delayed, failed };
        } catch {
          return {
            name,
            waiting: 0,
            active: 0,
            delayed: 0,
            failed: 0,
            error: 'unavailable',
          };
        }
      }),
    );
    return results;
  }
}
