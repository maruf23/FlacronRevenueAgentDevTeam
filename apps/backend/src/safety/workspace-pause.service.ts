import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApprovalStatus,
  CampaignStatus,
  LeadStatus,
  SequenceStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceQueueService } from '../sequences/sequence-queue.service';
import { AuditService } from '../audit/audit.service';

export type WorkspacePauseInput = {
  workspaceId: string;
  reason: string;
  actorUserId?: string | null;
  ipAddress?: string | null;
  /** When true, also cancel queued sends and pause outreach leads */
  cancelOutbound?: boolean;
  notificationType?: 'DELIVERABILITY_ALERT' | 'EMERGENCY_STOP' | 'SYSTEM_ALERT';
};

@Injectable()
export class WorkspacePauseService {
  private readonly logger = new Logger(WorkspacePauseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceQueue: SequenceQueueService,
    private readonly auditService: AuditService,
  ) {}

  async pauseWorkspace(input: WorkspacePauseInput) {
    const {
      workspaceId,
      reason,
      actorUserId,
      ipAddress,
      cancelOutbound = true,
      notificationType = 'SYSTEM_ALERT',
    } = input;

    await this.prisma.setWorkspaceContext(workspaceId);

    const workspace = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        isPaused: true,
        pausedAt: new Date(),
        pauseReason: reason,
      },
    });

    await this.prisma.campaign.updateMany({
      where: { workspaceId, status: CampaignStatus.RUNNING },
      data: { status: CampaignStatus.PAUSED },
    });

    await this.prisma.sequence.updateMany({
      where: { workspaceId, status: SequenceStatus.ACTIVE },
      data: { status: SequenceStatus.PAUSED },
    });

    let cancelledJobs = 0;
    let pausedLeads = 0;

    if (cancelOutbound) {
      cancelledJobs = await this.sequenceQueue.cancelPendingJobs(workspaceId);

      // Spec: APPROVED (draft-approved) or CONTACTED → PAUSED
      const contacted = await this.prisma.lead.updateMany({
        where: { workspaceId, status: LeadStatus.CONTACTED },
        data: { status: LeadStatus.PAUSED },
      });

      const approvedLeadIds = (
        await this.prisma.draft.findMany({
          where: {
            workspaceId,
            approvalStatus: ApprovalStatus.APPROVED,
            lead: { status: LeadStatus.NEW },
          },
          select: { leadId: true },
        })
      ).map((d) => d.leadId);

      let approvedPaused = 0;
      if (approvedLeadIds.length > 0) {
        const approved = await this.prisma.lead.updateMany({
          where: {
            workspaceId,
            id: { in: approvedLeadIds },
            status: LeadStatus.NEW,
          },
          data: { status: LeadStatus.PAUSED },
        });
        approvedPaused = approved.count;
      }
      pausedLeads = contacted.count + approvedPaused;
    }

    await this.auditService.record({
      workspaceId,
      actorUserId: actorUserId ?? null,
      action: 'WORKSPACE_PAUSE',
      targetType: 'WORKSPACE',
      targetId: workspaceId,
      changes: {
        reason,
        cancelledJobs,
        pausedLeads,
        isPaused: true,
      },
      ipAddress: ipAddress ?? null,
    });

    await this.prisma.notification.create({
      data: {
        workspaceId,
        type: notificationType,
        title:
          notificationType === 'EMERGENCY_STOP'
            ? 'Emergency stop activated'
            : notificationType === 'DELIVERABILITY_ALERT'
              ? 'Deliverability alert — workspace paused'
              : 'Workspace paused',
        body: reason,
        metadata: { cancelledJobs, pausedLeads },
      },
    });

    this.logger.warn(
      `Workspace ${workspaceId} paused: ${reason} (jobs=${cancelledJobs}, leads=${pausedLeads})`,
    );

    return {
      workspaceId: workspace.id,
      isPaused: true,
      cancelledJobs,
      pausedLeads,
      reason,
    };
  }

  async assertNotPaused(workspaceId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { isPaused: true, pauseReason: true },
    });
    if (ws?.isPaused) {
      throw new ServiceUnavailableException(
        ws.pauseReason ||
          'Workspace outbound is paused. Resume after reviewing deliverability.',
      );
    }
  }

  async resumeWorkspace(input: {
    workspaceId: string;
    actorUserId?: string | null;
    ipAddress?: string | null;
  }) {
    const { workspaceId, actorUserId, ipAddress } = input;
    await this.prisma.setWorkspaceContext(workspaceId);

    const workspace = await this.prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        isPaused: false,
        pausedAt: null,
        pauseReason: null,
      },
    });

    await this.auditService.record({
      workspaceId,
      actorUserId: actorUserId ?? null,
      action: 'WORKSPACE_RESUME',
      targetType: 'WORKSPACE',
      targetId: workspaceId,
      changes: { isPaused: false },
      ipAddress: ipAddress ?? null,
    });

    await this.prisma.notification.create({
      data: {
        workspaceId,
        type: 'SYSTEM_ALERT',
        title: 'Workspace outbound resumed',
        body: 'Emergency stop / pause cleared. Campaigns can send again subject to their own status.',
        metadata: { resumedBy: actorUserId ?? null },
      },
    });

    this.logger.log(`Workspace ${workspaceId} resumed by ${actorUserId ?? 'system'}`);

    return {
      workspaceId: workspace.id,
      isPaused: false,
      status: 'RESUMED' as const,
    };
  }
}
