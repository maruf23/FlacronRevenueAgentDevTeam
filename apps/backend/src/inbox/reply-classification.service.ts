import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  LeadStatus,
  MessageStatus,
  ReplyIntent,
  ReplySentiment,
  SuppressionReason,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AI_PROVIDER,
  AiProvider,
  ReplyClassificationResult,
} from '../providers/ai.provider';
import { CAMPAIGN_EVENTS } from '../campaigns/campaign.events';
import { PostReplyAutomationService } from './post-reply-automation.service';

const INTENT_MAP: Record<string, ReplyIntent> = {
  meeting_request: ReplyIntent.MEETING_REQUEST,
  positive_interest: ReplyIntent.POSITIVE_INTEREST,
  pricing_question: ReplyIntent.PRICING_QUESTION,
  unsubscribe: ReplyIntent.UNSUBSCRIBE,
  objection: ReplyIntent.OBJECTION,
  out_of_office: ReplyIntent.OUT_OF_OFFICE,
  negative: ReplyIntent.NEGATIVE,
  spam: ReplyIntent.SPAM,
};

const SENTIMENT_MAP: Record<string, ReplySentiment> = {
  positive: ReplySentiment.POSITIVE,
  neutral: ReplySentiment.NEUTRAL,
  negative: ReplySentiment.NEGATIVE,
};

@Injectable()
export class ReplyClassificationService {
  private readonly logger = new Logger(ReplyClassificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    private readonly events: EventEmitter2,
    private readonly postReply: PostReplyAutomationService,
  ) {}

  async classifyAndAct(input: {
    workspaceId: string;
    messageId: string;
    leadId: string;
    contactEmail: string;
    subject: string;
    body: string;
    fromEmail: string;
    assignedUserId?: string | null;
    conversationId?: string | null;
  }): Promise<ReplyClassificationResult> {
    await this.prisma.setWorkspaceContext(input.workspaceId);

    const classification = await this.ai.classifyReply({
      subject: input.subject,
      body: input.body,
      fromEmail: input.fromEmail,
    });

    const intent = INTENT_MAP[classification.intent] ?? ReplyIntent.UNKNOWN;
    const sentiment =
      SENTIMENT_MAP[classification.sentiment] ?? ReplySentiment.NEUTRAL;
    const oooReturnAt = this.parseReturnDate(classification.return_date);

    const message = await this.prisma.message.update({
      where: { id: input.messageId },
      data: {
        intent,
        sentiment,
        confidence: classification.confidence,
        oooReturnAt,
        evidence: classification.evidence ?? [],
        suggestedPipelineStage: classification.suggested_pipeline_stage ?? null,
        recommendedResponse: classification.recommended_response ?? null,
      },
      select: { conversationId: true },
    });

    const priorLead = await this.prisma.lead.findFirst({
      where: { id: input.leadId },
      select: { status: true },
    });
    const fromStatus = priorLead?.status ?? LeadStatus.NEW;

    let forceStatus: LeadStatus | undefined;
    let skipStageUpdate = false;

    switch (classification.intent) {
      case 'unsubscribe':
        await this.handleUnsubscribe(input);
        forceStatus = LeadStatus.LOST;
        skipStageUpdate = true;
        this.events.emit(CAMPAIGN_EVENTS.UNSUBSCRIBE_REQUESTED, {
          workspaceId: input.workspaceId,
          leadId: input.leadId,
          email: input.contactEmail,
          reason: 'unsubscribe.requested',
        });
        break;
      case 'meeting_request':
        await this.handleMeetingRequest(input);
        forceStatus = LeadStatus.MEETING_SCHEDULED;
        skipStageUpdate = true;
        this.events.emit(CAMPAIGN_EVENTS.MEETING_BOOKED, {
          workspaceId: input.workspaceId,
          leadId: input.leadId,
          email: input.contactEmail,
          reason: 'meeting.booked',
        });
        break;
      case 'out_of_office':
        await this.handleOutOfOffice(input, oooReturnAt);
        forceStatus = LeadStatus.REPLIED;
        skipStageUpdate = true;
        break;
      default:
        this.events.emit(CAMPAIGN_EVENTS.REPLY_RECEIVED, {
          workspaceId: input.workspaceId,
          leadId: input.leadId,
          email: input.contactEmail,
          reason: 'reply.received',
        });
        break;
    }

    if (forceStatus && skipStageUpdate && fromStatus !== forceStatus) {
      await this.prisma.stageHistory.create({
        data: {
          workspaceId: input.workspaceId,
          leadId: input.leadId,
          fromStatus,
          toStatus: forceStatus,
          reason: `AI classified reply as ${classification.intent}`,
          source: 'reply-classification',
        },
      });
    }

    await this.postReply.applyInboundClassification({
      workspaceId: input.workspaceId,
      leadId: input.leadId,
      conversationId: input.conversationId ?? message.conversationId ?? null,
      assignedUserId: input.assignedUserId,
      contactEmail: input.contactEmail,
      classification,
      skipStageUpdate,
      forceStatus: undefined,
    });

    this.logger.log(
      `Classified message ${input.messageId} as ${classification.intent} (${classification.confidence})`,
    );

    return classification;
  }

  private async handleUnsubscribe(input: {
    workspaceId: string;
    leadId: string;
    contactEmail: string;
  }) {
    const email = input.contactEmail.toLowerCase();

    await this.prisma.suppressionEntry.upsert({
      where: {
        workspaceId_email: {
          workspaceId: input.workspaceId,
          email,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        email,
        reason: SuppressionReason.UNSUBSCRIBE,
        source: 'inbox-classification',
      },
      update: {
        reason: SuppressionReason.UNSUBSCRIBE,
        source: 'inbox-classification',
      },
    });

    await this.prisma.lead.update({
      where: { id: input.leadId },
      data: { status: LeadStatus.LOST, lastActivityAt: new Date() },
    });
  }

  private async handleMeetingRequest(input: {
    workspaceId: string;
    leadId: string;
    contactEmail: string;
    subject: string;
    assignedUserId?: string | null;
  }) {
    await this.prisma.lead.update({
      where: { id: input.leadId },
      data: { status: LeadStatus.MEETING_SCHEDULED, lastActivityAt: new Date() },
    });

    let userId = input.assignedUserId ?? null;
    if (!userId) {
      const owner = await this.prisma.user.findFirst({
        where: {
          workspaceId: input.workspaceId,
          role: { in: ['OWNER', 'ADMIN'] },
        },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      userId = owner?.id ?? null;
    }

    await this.prisma.notification.create({
      data: {
        workspaceId: input.workspaceId,
        userId,
        type: 'meeting_request',
        title: 'Meeting request from lead',
        body: `${input.contactEmail} replied requesting a meeting (${input.subject})`,
        metadata: {
          leadId: input.leadId,
          email: input.contactEmail,
        },
      },
    });
  }

  private async handleOutOfOffice(
    input: { workspaceId: string; leadId: string },
    returnAt: Date | null,
  ) {
    await this.prisma.lead.update({
      where: { id: input.leadId },
      data: { status: LeadStatus.REPLIED, lastActivityAt: new Date() },
    });

    if (!returnAt) {
      return;
    }

    const nextQueued = await this.prisma.message.findFirst({
      where: {
        leadId: input.leadId,
        workspaceId: input.workspaceId,
        status: { in: [MessageStatus.QUEUED, MessageStatus.SCHEDULED] },
      },
      orderBy: [{ scheduledAt: 'asc' }, { createdAt: 'asc' }],
    });

    if (!nextQueued) {
      return;
    }

    const rescheduleAt = new Date(returnAt.getTime() + 60 * 60 * 1000);
    await this.prisma.message.update({
      where: { id: nextQueued.id },
      data: { scheduledAt: rescheduleAt, status: MessageStatus.SCHEDULED },
    });

    this.logger.log(
      `Rescheduled message ${nextQueued.id} to ${rescheduleAt.toISOString()} after OOO`,
    );
  }

  private parseReturnDate(value?: string | null): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
}
