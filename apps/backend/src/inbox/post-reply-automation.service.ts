import { Injectable, Logger } from '@nestjs/common';
import {
  LeadStatus,
  TaskPriority,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReplyClassificationResult } from '../providers/ai.provider';

const STAGE_ALIASES: Record<string, LeadStatus> = {
  NEW: LeadStatus.NEW,
  ENRICHED: LeadStatus.ENRICHED,
  READY: LeadStatus.READY,
  CONTACTED: LeadStatus.CONTACTED,
  ENGAGED: LeadStatus.ENGAGED,
  REPLIED: LeadStatus.REPLIED,
  QUALIFIED: LeadStatus.QUALIFIED,
  MEETING_SCHEDULED: LeadStatus.MEETING_SCHEDULED,
  CONVERTED: LeadStatus.CONVERTED,
  UNQUALIFIED: LeadStatus.UNQUALIFIED,
  LOST: LeadStatus.LOST,
  BOUNCED: LeadStatus.BOUNCED,
  COMPLAINED: LeadStatus.COMPLAINED,
  PAUSED: LeadStatus.PAUSED,
  // AI aliases not in LeadStatus enum
  NEGOTIATION: LeadStatus.QUALIFIED,
  NURTURE: LeadStatus.ENGAGED,
};

@Injectable()
export class PostReplyAutomationService {
  private readonly logger = new Logger(PostReplyAutomationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs after AI classifies an inbound reply.
   * Updates lead activity/score/action/stage, logs StageHistory, creates a follow-up Task.
   */
  async applyInboundClassification(input: {
    workspaceId: string;
    leadId: string;
    conversationId?: string | null;
    assignedUserId?: string | null;
    contactEmail: string;
    classification: ReplyClassificationResult;
    /** When true, skip stage update (caller already set LOST / MEETING_SCHEDULED etc.) */
    skipStageUpdate?: boolean;
    forceStatus?: LeadStatus;
  }) {
    await this.prisma.setWorkspaceContext(input.workspaceId);

    const lead = await this.prisma.lead.findFirst({
      where: { id: input.leadId, workspaceId: input.workspaceId },
      select: {
        id: true,
        status: true,
        leadScore: true,
        assignedUserId: true,
      },
    });
    if (!lead) return;

    const nextAction =
      input.classification.next_best_action ||
      this.defaultNextAction(input.classification.intent);
    const leadScore = this.computeLeadScore(
      lead.leadScore,
      input.classification,
    );

    let nextStatus: LeadStatus | undefined = input.forceStatus;
    if (!nextStatus && !input.skipStageUpdate) {
      nextStatus = this.mapSuggestedStage(
        input.classification.suggested_pipeline_stage,
      );
    }

    const data: {
      lastActivityAt: Date;
      leadScore: number;
      nextRecommendedAction: string;
      status?: LeadStatus;
    } = {
      lastActivityAt: new Date(),
      leadScore,
      nextRecommendedAction: nextAction,
    };

    if (nextStatus && nextStatus !== lead.status) {
      data.status = nextStatus;
      await this.recordStageChange({
        workspaceId: input.workspaceId,
        leadId: lead.id,
        fromStatus: lead.status,
        toStatus: nextStatus,
        reason: `AI classified reply as ${input.classification.intent}`,
        source: 'reply-classification',
      });
    }

    await this.prisma.lead.update({
      where: { id: lead.id },
      data,
    });

    await this.createFollowUpTask({
      workspaceId: input.workspaceId,
      leadId: lead.id,
      conversationId: input.conversationId ?? null,
      assignedUserId: input.assignedUserId ?? lead.assignedUserId,
      title: `Follow up: ${nextAction}`,
      description: `Inbound reply from ${input.contactEmail} classified as ${input.classification.intent} (${input.classification.sentiment}). Confidence ${Math.round(input.classification.confidence * 100)}%.`,
      priority: this.priorityForIntent(input.classification.intent),
    });

    this.logger.log(
      `Post-reply automation for lead ${lead.id}: score=${leadScore}, action="${nextAction}", status=${data.status ?? lead.status}`,
    );
  }

  /**
   * Runs when a user sends an outbound inbox reply.
   */
  async applyOutboundReply(input: {
    workspaceId: string;
    leadId: string;
    conversationId: string;
    assignedUserId?: string | null;
    contactEmail: string;
    actorUserId?: string | null;
  }) {
    await this.prisma.setWorkspaceContext(input.workspaceId);

    const lead = await this.prisma.lead.findFirst({
      where: { id: input.leadId, workspaceId: input.workspaceId },
      select: {
        id: true,
        status: true,
        leadScore: true,
        assignedUserId: true,
      },
    });
    if (!lead) return;

    const bump = Math.min(100, (lead.leadScore ?? 40) + 3);
    const nextAction = 'Await reply';
    const promoteToContacted =
      lead.status === LeadStatus.NEW ||
      lead.status === LeadStatus.ENRICHED ||
      lead.status === LeadStatus.READY;

    const data: {
      lastActivityAt: Date;
      leadScore: number;
      nextRecommendedAction: string;
      status?: LeadStatus;
    } = {
      lastActivityAt: new Date(),
      leadScore: bump,
      nextRecommendedAction: nextAction,
    };

    if (promoteToContacted) {
      data.status = LeadStatus.CONTACTED;
      await this.recordStageChange({
        workspaceId: input.workspaceId,
        leadId: lead.id,
        fromStatus: lead.status,
        toStatus: LeadStatus.CONTACTED,
        reason: 'Outbound reply sent from Inbox',
        source: 'inbox-send',
        actorUserId: input.actorUserId ?? null,
      });
    }

    await this.prisma.lead.update({
      where: { id: lead.id },
      data,
    });

    await this.createFollowUpTask({
      workspaceId: input.workspaceId,
      leadId: lead.id,
      conversationId: input.conversationId,
      assignedUserId: input.assignedUserId ?? lead.assignedUserId,
      title: 'Follow up after sent reply',
      description: `You replied to ${input.contactEmail}. Follow up if no response within 2 business days.`,
      priority: TaskPriority.MEDIUM,
      dueInDays: 2,
    });
  }

  computeLeadScore(
    current: number | null | undefined,
    classification: ReplyClassificationResult,
  ): number {
    let score = current ?? 45;

    switch (classification.intent) {
      case 'meeting_request':
        score += 25;
        break;
      case 'positive_interest':
        score += 20;
        break;
      case 'pricing_question':
        score += 18;
        break;
      case 'objection':
        score += 5;
        break;
      case 'out_of_office':
        score += 0;
        break;
      case 'unsubscribe':
        score -= 30;
        break;
      case 'negative':
        score -= 20;
        break;
      case 'spam':
        score -= 40;
        break;
      default:
        score += 8;
    }

    if (classification.sentiment === 'positive') score += 10;
    if (classification.sentiment === 'negative') score -= 10;

    // Soft confidence weighting on the delta from baseline
    const confidence = Math.min(1, Math.max(0, classification.confidence));
    const baseline = current ?? 45;
    score = baseline + (score - baseline) * (0.6 + 0.4 * confidence);

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  mapSuggestedStage(raw?: string | null): LeadStatus | undefined {
    if (!raw) return undefined;
    const key = raw.toUpperCase().trim().replace(/\s+/g, '_');
    return STAGE_ALIASES[key];
  }

  private async recordStageChange(input: {
    workspaceId: string;
    leadId: string;
    fromStatus: LeadStatus;
    toStatus: LeadStatus;
    reason: string;
    source: string;
    actorUserId?: string | null;
  }) {
    await this.prisma.stageHistory.create({
      data: {
        workspaceId: input.workspaceId,
        leadId: input.leadId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        reason: input.reason,
        source: input.source,
        actorUserId: input.actorUserId ?? null,
      },
    });
  }

  private async createFollowUpTask(input: {
    workspaceId: string;
    leadId: string;
    conversationId?: string | null;
    assignedUserId?: string | null;
    title: string;
    description: string;
    priority: TaskPriority;
    dueInDays?: number;
  }) {
    let userId = input.assignedUserId ?? null;
    if (!userId) {
      const owner = await this.prisma.user.findFirst({
        where: {
          workspaceId: input.workspaceId,
          role: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      userId = owner?.id ?? null;
    }

    // Avoid stacking duplicate open follow-ups for the same lead
    const existing = await this.prisma.task.findFirst({
      where: {
        workspaceId: input.workspaceId,
        leadId: input.leadId,
        status: TaskStatus.PENDING,
        title: input.title,
      },
      select: { id: true },
    });
    if (existing) {
      return existing.id;
    }

    const dueAt = new Date();
    dueAt.setDate(dueAt.getDate() + (input.dueInDays ?? 1));

    const task = await this.prisma.task.create({
      data: {
        workspaceId: input.workspaceId,
        leadId: input.leadId,
        conversationId: input.conversationId ?? null,
        assignedUserId: userId,
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: TaskStatus.PENDING,
        dueAt,
      },
    });
    return task.id;
  }

  private defaultNextAction(intent: string): string {
    switch (intent) {
      case 'meeting_request':
        return 'Book a demo';
      case 'pricing_question':
        return 'Send Pricing';
      case 'positive_interest':
        return 'Schedule Demo';
      case 'objection':
        return 'Call';
      case 'out_of_office':
        return 'Schedule follow-up';
      case 'unsubscribe':
      case 'negative':
        return 'Suppress and close';
      default:
        return 'Reply to thread';
    }
  }

  private priorityForIntent(intent: string): TaskPriority {
    switch (intent) {
      case 'meeting_request':
      case 'pricing_question':
      case 'positive_interest':
        return TaskPriority.HIGH;
      case 'objection':
        return TaskPriority.MEDIUM;
      default:
        return TaskPriority.LOW;
    }
  }
}
