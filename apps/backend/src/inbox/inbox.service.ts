import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  LeadStatus,
  MessageDirection,
  MessageStatus,
  ReplyIntent,
  EmailProvider,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from '../audit/audit.service';
import { INBOX_JOBS, QUEUE_NAMES } from '../queues/queue.constants';
import { ReplyClassificationService } from './reply-classification.service';
import { InboxEmailPayload, ProcessInboxJobData } from './inbox.types';
import {
  AI_PROVIDER,
  AiProvider,
  ReplyTransformAction,
} from '../providers/ai.provider';
import { EmailSenderService } from '../email/email-sender.service';
import { ImapInboxSyncService } from './imap-inbox-sync.service';
import { PostReplyAutomationService } from './post-reply-automation.service';

function intentLabel(intent: string | null | undefined): string {
  switch (intent) {
    case 'MEETING_REQUEST':
    case 'meeting_request':
      return 'Meeting Request';
    case 'PRICING_QUESTION':
    case 'pricing_question':
      return 'Pricing Request';
    case 'POSITIVE_INTEREST':
    case 'positive_interest':
      return 'Positive Interest';
    case 'OBJECTION':
    case 'objection':
      return 'Objection';
    case 'OUT_OF_OFFICE':
    case 'out_of_office':
      return 'Out of Office';
    case 'UNSUBSCRIBE':
    case 'unsubscribe':
      return 'Unsubscribe';
    case 'NEGATIVE':
    case 'negative':
      return 'Negative';
    case 'SPAM':
    case 'spam':
      return 'Spam';
    default:
      return intent ? intent.replaceAll('_', ' ') : 'Unknown';
  }
}

function sentimentLabel(sentiment: string | null | undefined): string {
  const s = (sentiment || 'neutral').toLowerCase();
  if (s === 'positive') return 'Positive';
  if (s === 'negative') return 'Negative';
  return 'Neutral';
}

function toPipelineStage(status: LeadStatus): string {
  return status === LeadStatus.CONVERTED ? 'WON' : status;
}

function contactName(contact: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  return (
    [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim() ||
    contact.email
  );
}

function derivePriority(intent: string | null | undefined): 'high' | 'medium' | 'low' {
  switch (intent) {
    case 'MEETING_REQUEST':
    case 'POSITIVE_INTEREST':
      return 'high';
    case 'PRICING_QUESTION':
    case 'OBJECTION':
      return 'medium';
    default:
      return 'low';
  }
}

function recommendedResponse(intent: string | null | undefined): string {
  switch (intent) {
    case 'MEETING_REQUEST':
      return 'Confirm availability and send a calendar link.';
    case 'POSITIVE_INTEREST':
      return 'Acknowledge interest and propose a short discovery call.';
    case 'PRICING_QUESTION':
      return 'Share that pricing is scoped, then offer a quote call.';
    case 'OBJECTION':
      return 'Address the objection briefly and ask a clarifying question.';
    case 'OUT_OF_OFFICE':
      return 'Pause sequence and follow up after return date.';
    case 'UNSUBSCRIBE':
    case 'NEGATIVE':
      return 'Respect the request and suppress further outreach.';
    default:
      return 'Reply helpfully and keep the conversation moving.';
  }
}

function nextAction(intent: string | null | undefined, stage: string): string {
  switch (intent) {
    case 'MEETING_REQUEST':
      return 'Book meeting';
    case 'POSITIVE_INTEREST':
      return 'Send discovery invite';
    case 'PRICING_QUESTION':
      return 'Prepare pricing discussion';
    case 'OBJECTION':
      return 'Handle objection';
    case 'OUT_OF_OFFICE':
      return 'Schedule follow-up';
    default:
      return stage === 'REPLIED' ? 'Needs reply' : 'Review thread';
  }
}

function buildSyncHistory(
  messages: Array<{
    id: string;
    status: MessageStatus;
    createdAt: Date;
    scheduledAt: Date | null;
    sentAt: Date | null;
    deliveredAt: Date | null;
    receivedAt: Date | null;
    errorMessage: string | null;
  }>,
) {
  const events: Array<{
    at: Date;
    type: string;
    messageId: string;
    status: MessageStatus;
    detail?: string | null;
  }> = [];

  for (const m of messages) {
    events.push({
      at: m.createdAt,
      type: 'created',
      messageId: m.id,
      status: m.status,
    });
    if (m.scheduledAt) {
      events.push({
        at: m.scheduledAt,
        type: 'scheduled',
        messageId: m.id,
        status: MessageStatus.SCHEDULED,
      });
    }
    if (m.sentAt) {
      events.push({
        at: m.sentAt,
        type: 'sent',
        messageId: m.id,
        status: MessageStatus.SENT,
      });
    }
    if (m.deliveredAt) {
      events.push({
        at: m.deliveredAt,
        type: 'delivered',
        messageId: m.id,
        status: MessageStatus.DELIVERED,
      });
    }
    if (m.receivedAt) {
      events.push({
        at: m.receivedAt,
        type: 'received',
        messageId: m.id,
        status: MessageStatus.RECEIVED,
      });
    }
    if (m.status === MessageStatus.FAILED || m.status === MessageStatus.BOUNCED) {
      events.push({
        at: m.sentAt ?? m.createdAt,
        type: m.status === MessageStatus.BOUNCED ? 'bounced' : 'failed',
        messageId: m.id,
        status: m.status,
        detail: m.errorMessage,
      });
    }
  }

  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly classifier: ReplyClassificationService,
    private readonly emailSender: EmailSenderService,
    private readonly imapSync: ImapInboxSyncService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly postReply: PostReplyAutomationService,
    @Inject(AI_PROVIDER) private readonly ai: AiProvider,
    @InjectQueue(QUEUE_NAMES.INBOX)
    private readonly inboxQueue: Queue,
  ) {}

  async enqueueInbound(payload: InboxEmailPayload) {
    this.validatePayload(payload);

    await this.inboxQueue.add(
      INBOX_JOBS.PROCESS_INBOUND,
      { payload } satisfies ProcessInboxJobData,
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 200,
        removeOnFail: 100,
      },
    );

    return { accepted: true, status: 'QUEUED' as const };
  }

  async processInbound(payload: InboxEmailPayload) {
    const workspaceId = payload.workspaceId;
    await this.prisma.setWorkspaceContext(workspaceId);

    const fromEmail = this.normalizeEmail(payload.from);
    const toEmail = this.normalizeEmail(payload.to);
    const receivedAt = payload.receivedAt
      ? new Date(payload.receivedAt)
      : new Date();
    const provider =
      payload.provider === 'gmail'
        ? EmailProvider.GMAIL
        : payload.provider === 'microsoft'
          ? EmailProvider.MICROSOFT
          : null;
    const externalMessageId = payload.externalId?.trim() || null;
    const providerThreadId = payload.threadId?.trim() || null;

    // Deduplicate by unique externalMessageId
    if (externalMessageId) {
      const byExternal = await this.prisma.message.findFirst({
        where: {
          workspaceId,
          externalMessageId,
        },
        select: { id: true, conversationId: true },
      });
      if (byExternal) {
        return {
          conversationId: byExternal.conversationId,
          messageId: byExternal.id,
          duplicate: true,
        };
      }
    }

    const duplicateBody = await this.prisma.message.findFirst({
      where: {
        workspaceId,
        direction: MessageDirection.INBOUND,
        fromEmail,
        subject: payload.subject,
        body: payload.body,
      },
      select: { id: true, conversationId: true },
    });
    if (duplicateBody) {
      return {
        conversationId: duplicateBody.conversationId,
        messageId: duplicateBody.id,
        duplicate: true,
      };
    }

    let contact = await this.prisma.contact.findUnique({
      where: {
        workspaceId_email: { workspaceId, email: fromEmail },
      },
    });

    if (!contact) {
      contact = await this.prisma.contact.create({
        data: {
          workspaceId,
          email: fromEmail,
          firstName: this.guessFirstName(payload.from),
        },
      });
    }

    let lead = await this.prisma.lead.findFirst({
      where: { workspaceId, contactId: contact.id },
      orderBy: { updatedAt: 'desc' },
    });

    if (!lead) {
      lead = await this.prisma.lead.create({
        data: {
          workspaceId,
          contactId: contact.id,
          status: LeadStatus.NEW,
          source: 'inbound',
          lastActivityAt: receivedAt,
        },
      });
    }

    // Prefer mapping by provider thread id (Gmail threadId / Outlook conversationId)
    let conversation =
      providerThreadId
        ? await this.prisma.conversation.findFirst({
            where: { workspaceId, providerThreadId },
          })
        : null;

    if (!conversation) {
      conversation = await this.prisma.conversation.findUnique({
        where: {
          workspaceId_contactId_leadId: {
            workspaceId,
            contactId: contact.id,
            leadId: lead.id,
          },
        },
      });
    }

    const preview = payload.body.slice(0, 180);

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          workspaceId,
          contactId: contact.id,
          leadId: lead.id,
          subject: payload.subject,
          lastMessageAt: receivedAt,
          lastMessagePreview: preview,
          providerThreadId: providerThreadId ?? undefined,
          provider: provider ?? undefined,
        },
      });
    } else {
      conversation = await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          subject: payload.subject || conversation.subject,
          lastMessageAt: receivedAt,
          lastMessagePreview: preview,
          ...(providerThreadId && !conversation.providerThreadId
            ? { providerThreadId, provider: provider ?? undefined }
            : {}),
        },
      });
    }

    const campaignIdForReply = await this.resolveCampaignIdForInbound(
      workspaceId,
      lead.id,
      lead.campaignId,
    );

    const message = await this.prisma.message.create({
      data: {
        workspaceId,
        leadId: lead.id,
        conversationId: conversation.id,
        campaignId: campaignIdForReply,
        subject: payload.subject,
        body: payload.body,
        fromEmail,
        toEmail,
        direction: MessageDirection.INBOUND,
        status: MessageStatus.RECEIVED,
        receivedAt,
        sequenceStep: 0,
        provider: provider ?? undefined,
        providerMessageId: externalMessageId ?? undefined,
        externalMessageId: externalMessageId ?? undefined,
      },
    });

    await this.classifier.classifyAndAct({
      workspaceId,
      messageId: message.id,
      leadId: lead.id,
      contactEmail: fromEmail,
      subject: payload.subject,
      body: payload.body,
      fromEmail,
      assignedUserId: lead.assignedUserId,
      conversationId: conversation.id,
    });

    // Auto-generate a proposed reply for the Inbox editor
    void this.generateAndCacheProposedReply({
      workspaceId,
      conversationId: conversation.id,
      leadId: lead.id,
      contactName: contactName(contact),
      companyName: contact.companyName,
      subject: payload.subject,
      inboundBody: payload.body,
    }).catch((error) => {
      this.logger.warn(
        `Proposed reply generation failed for ${conversation.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    this.logger.log(
      `Processed inbound message ${message.id} for contact ${fromEmail}`,
    );

    return {
      conversationId: conversation.id,
      messageId: message.id,
      leadId: lead.id,
      contactId: contact.id,
    };
  }

  /**
   * Sync Gmail/IMAP mailbox → Inbox conversations for known workspace contacts.
   * Also backfills Conversation rows for outbound SENT messages that never opened a thread.
   */
  async syncMailbox(workspaceId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const backfilled = await this.backfillConversationsFromOutbound(workspaceId);

    if (!this.imapSync.isConfigured()) {
      return {
        ok: true,
        backfilledConversations: backfilled,
        imported: 0,
        skipped: 0,
        scanned: 0,
        hint: 'Set SMTP_USER + SMTP_PASS to enable IMAP reply sync from Gmail.',
      };
    }

    const mails = await this.imapSync.fetchRecentInbound({
      sinceDays: 21,
      limit: 80,
    });

    const contacts = await this.prisma.contact.findMany({
      where: { workspaceId },
      select: { email: true },
    });
    const known = new Set(contacts.map((c) => c.email.toLowerCase()));

    let imported = 0;
    let skipped = 0;

    for (const mail of mails) {
      const from = this.normalizeEmail(mail.from);
      if (!known.has(from)) {
        skipped += 1;
        continue;
      }

      const result = await this.processInbound({
        workspaceId,
        from: mail.from,
        to: mail.to,
        subject: mail.subject,
        body: mail.body,
        receivedAt: mail.receivedAt,
        provider: 'normalized',
        externalId: mail.messageId ?? undefined,
      });

      if ((result as { duplicate?: boolean }).duplicate) {
        skipped += 1;
      } else {
        imported += 1;
      }
    }

    return {
      ok: true,
      backfilledConversations: backfilled,
      imported,
      skipped,
      scanned: mails.length,
    };
  }

  /** Ensure outbound outreach creates an Inbox thread immediately. */
  async ensureOutboundConversation(input: {
    workspaceId: string;
    leadId: string;
    contactId: string;
    messageId: string;
    subject: string;
    body: string;
    fromEmail?: string | null;
    toEmail: string;
  }) {
    await this.prisma.setWorkspaceContext(input.workspaceId);
    const now = new Date();
    const preview = input.body.slice(0, 180);

    let conversation = await this.prisma.conversation.findUnique({
      where: {
        workspaceId_contactId_leadId: {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          leadId: input.leadId,
        },
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          leadId: input.leadId,
          subject: input.subject,
          lastMessageAt: now,
          lastMessagePreview: preview,
        },
      });
    } else {
      conversation = await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          subject: input.subject || conversation.subject,
          lastMessageAt: now,
          lastMessagePreview: preview,
        },
      });
    }

    await this.prisma.message.update({
      where: { id: input.messageId },
      data: {
        conversationId: conversation.id,
        fromEmail: input.fromEmail ?? undefined,
        toEmail: input.toEmail,
      },
    });

    return conversation;
  }

  private async backfillConversationsFromOutbound(workspaceId: string) {
    const orphans = await this.prisma.message.findMany({
      where: {
        workspaceId,
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.SENT,
        conversationId: null,
      },
      include: {
        lead: { select: { id: true, contactId: true } },
      },
      orderBy: { sentAt: 'asc' },
      take: 200,
    });

    let count = 0;
    for (const msg of orphans) {
      await this.ensureOutboundConversation({
        workspaceId,
        leadId: msg.leadId,
        contactId: msg.lead.contactId,
        messageId: msg.id,
        subject: msg.subject,
        body: msg.body,
        fromEmail: msg.fromEmail,
        toEmail: msg.toEmail || '',
      });
      count += 1;
    }
    return count;
  }

  async listConversations(workspaceId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const conversations = await this.prisma.conversation.findMany({
      where: { workspaceId },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        contact: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            companyName: true,
            title: true,
          },
        },
        lead: {
          select: {
            id: true,
            status: true,
            leadScore: true,
            assignedUserId: true,
            nextRecommendedAction: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true,
            subject: true,
            body: true,
            direction: true,
            status: true,
            intent: true,
            sentiment: true,
            confidence: true,
            provider: true,
            receivedAt: true,
            sentAt: true,
            createdAt: true,
          },
        },
      },
    });

    return conversations.map((c) => {
      const latest = c.messages[0] ?? null;
      const latestInbound = c.messages.find(
        (m) => m.direction === MessageDirection.INBOUND,
      );
      const unread = latest?.direction === MessageDirection.INBOUND;
      const intent = latestInbound?.intent ?? latest?.intent ?? null;
      const priority = derivePriority(intent);

      return {
        id: c.id,
        subject: c.subject,
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        unread,
        priority,
        channel: latest?.provider ?? 'EMAIL',
        contact: {
          id: c.contact.id,
          email: c.contact.email,
          name: contactName(c.contact),
          companyName: c.contact.companyName,
          title: c.contact.title,
        },
        lead: {
          id: c.lead.id,
          status: toPipelineStage(c.lead.status),
          leadScore: c.lead.leadScore,
          nextRecommendedAction: c.lead.nextRecommendedAction,
        },
        latestMessage: latest,
        filterHints: {
          interested:
            intent === ReplyIntent.POSITIVE_INTEREST ||
            intent === ReplyIntent.MEETING_REQUEST ||
            intent === ReplyIntent.PRICING_QUESTION,
          needsReply: unread,
          meetingRequested: intent === ReplyIntent.MEETING_REQUEST,
          objection: intent === ReplyIntent.OBJECTION,
          ooo: intent === ReplyIntent.OUT_OF_OFFICE,
        },
      };
    });
  }

  async getConversationMessages(workspaceId: string, conversationId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      include: {
        contact: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            companyName: true,
            title: true,
            phone: true,
          },
        },
        lead: {
          select: {
            id: true,
            status: true,
            leadScore: true,
            industry: true,
            location: true,
            nextRecommendedAction: true,
            lastActivityAt: true,
            assignedUserId: true,
          },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            subject: true,
            body: true,
            direction: true,
            status: true,
            fromEmail: true,
            toEmail: true,
            intent: true,
            sentiment: true,
            confidence: true,
            evidence: true,
            suggestedPipelineStage: true,
            recommendedResponse: true,
            oooReturnAt: true,
            provider: true,
            providerMessageId: true,
            externalMessageId: true,
            errorMessage: true,
            scheduledAt: true,
            receivedAt: true,
            sentAt: true,
            deliveredAt: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }

    const latestInbound = [...conversation.messages]
      .reverse()
      .find((m) => m.direction === MessageDirection.INBOUND);

    const intent = latestInbound?.intent ?? null;
    const sentiment = latestInbound?.sentiment ?? null;
    const stage = toPipelineStage(conversation.lead.status);
    const suggested =
      latestInbound?.suggestedPipelineStage || stage;
    const nextBestAction =
      conversation.lead.nextRecommendedAction ||
      nextAction(intent, stage);
    const recommended =
      latestInbound?.recommendedResponse ||
      recommendedResponse(intent);

    return {
      id: conversation.id,
      conversationId: conversation.id,
      subject: conversation.subject,
      lastMessageAt: conversation.lastMessageAt,
      contact: {
        ...conversation.contact,
        name: contactName(conversation.contact),
      },
      lead: {
        id: conversation.lead.id,
        status: stage,
        leadScore: conversation.lead.leadScore,
        industry: conversation.lead.industry,
        location: conversation.lead.location,
        nextRecommendedAction: conversation.lead.nextRecommendedAction,
        lastActivityAt: conversation.lead.lastActivityAt,
      },
      messages: conversation.messages.map((m) => ({
        ...m,
        attachments: [] as Array<{ id: string; name: string; url?: string }>,
      })),
      syncHistory: buildSyncHistory(conversation.messages),
      aiInsight: {
        intent: intentLabel(intent),
        intentKey: intent,
        sentiment: sentimentLabel(sentiment),
        sentimentKey: sentiment,
        confidence: latestInbound?.confidence ?? null,
        evidence: latestInbound?.evidence ?? [],
        recommendedResponse: recommended,
        nextBestAction,
        suggestedPipelineStage: suggested,
        currentPipelineStage: stage,
        pipelineMove:
          suggested && suggested !== stage
            ? `Move from ${stage.replaceAll('_', ' ')} to ${String(suggested).replaceAll('_', ' ')}`
            : `Stay on ${stage.replaceAll('_', ' ')}`,
      },
      proposedReply: await this.readCachedProposedReply(conversationId),
    };
  }

  /**
   * Unified thread endpoint: full message list + delivery sync history + AI insight.
   * GET /api/inbox/messages?conversationId=
   */
  async listMessages(
    workspaceId: string,
    query: { conversationId: string },
  ) {
    return this.getConversationMessages(workspaceId, query.conversationId);
  }

  async suggestReply(
    workspaceId: string,
    conversationId: string,
    actorUserId?: string,
  ) {
    const detail = await this.getConversationMessages(
      workspaceId,
      conversationId,
    );
    const threadSummary = detail.messages
      .slice(-6)
      .map(
        (m) =>
          `${m.direction}: ${m.body.slice(0, 400)}`,
      )
      .join('\n---\n');

    const composed = await this.ai.composeReply({
      contactName: detail.contact.name,
      companyName: detail.contact.companyName,
      subject: detail.subject || 'Follow-up',
      threadSummary,
      intent: detail.aiInsight.intent,
      sentiment: detail.aiInsight.sentiment,
      instruction:
        detail.aiInsight.recommendedResponse ||
        detail.aiInsight.nextBestAction,
    });

    await this.cacheProposedReply(conversationId, composed.subject, composed.body);
    await this.upsertSuggestedReplyMessage(
      workspaceId,
      conversationId,
      detail.lead.id,
      composed.subject,
      composed.body,
      MessageStatus.AI_SUGGESTED,
    );

    await this.audit.record({
      workspaceId,
      actorUserId,
      action: 'INBOX_REPLY_REGENERATE',
      targetType: 'CONVERSATION',
      targetId: conversationId,
      changes: {
        kind: 'suggest',
        subject: composed.subject,
        bodyPreview: composed.body.slice(0, 240),
      },
    });

    return {
      subject: composed.subject,
      body: composed.body,
      suggestedFrom: 'ai',
    };
  }

  async transformReply(
    workspaceId: string,
    conversationId: string,
    input: {
      body: string;
      action: ReplyTransformAction;
      tone?: string;
      language?: string;
      customInstruction?: string;
    },
    actorUserId?: string,
  ) {
    await this.requireConversation(workspaceId, conversationId);
    if (!input.body?.trim()) {
      throw new BadRequestException('body is required');
    }
    const result = await this.ai.transformReply(input);

    await this.audit.record({
      workspaceId,
      actorUserId,
      action:
        input.action === 'regenerate'
          ? 'INBOX_REPLY_REGENERATE'
          : 'INBOX_REPLY_EDIT',
      targetType: 'CONVERSATION',
      targetId: conversationId,
      changes: {
        transform: input.action,
        tone: input.tone ?? null,
        language: input.language ?? null,
        customInstruction: input.customInstruction ?? null,
        bodyPreview: result.body.slice(0, 240),
      },
    });

    // Keep cache in sync for the UI
    const cached = await this.readCachedProposedReply(conversationId);
    await this.cacheProposedReply(
      conversationId,
      cached?.subject ?? 'Re: Follow-up',
      result.body,
    );

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      select: { leadId: true },
    });
    if (conversation) {
      await this.upsertSuggestedReplyMessage(
        workspaceId,
        conversationId,
        conversation.leadId,
        cached?.subject ?? 'Re: Follow-up',
        result.body,
        MessageStatus.EDITED_BY_USER,
      );
    }

    return { body: result.body };
  }

  async logReplyAction(
    workspaceId: string,
    conversationId: string,
    actorUserId: string | undefined,
    input: { action: string; detail?: string },
  ) {
    await this.requireConversation(workspaceId, conversationId);

    if (input.action === 'edit' || input.action === 'write_custom') {
      await this.prisma.message.updateMany({
        where: {
          workspaceId,
          conversationId,
          direction: MessageDirection.OUTBOUND,
          status: {
            in: [MessageStatus.AI_SUGGESTED, MessageStatus.DRAFT],
          },
        },
        data: { status: MessageStatus.EDITED_BY_USER },
      });
    }

    await this.audit.record({
      workspaceId,
      actorUserId,
      action:
        input.action === 'edit' || input.action === 'write_custom'
          ? 'INBOX_REPLY_EDIT'
          : 'INBOX_REPLY_ACTION',
      targetType: 'CONVERSATION',
      targetId: conversationId,
      changes: {
        uiAction: input.action,
        detail: input.detail ?? null,
      },
    });

    return { ok: true };
  }

  async sendReply(
    workspaceId: string,
    conversationId: string,
    input: { subject?: string; body: string; scheduleAt?: string },
    actorUserId?: string,
  ) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      include: {
        contact: true,
        lead: true,
      },
    });
    if (!conversation) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }
    if (!input.body?.trim()) {
      throw new BadRequestException('body is required');
    }

    const subject =
      input.subject?.trim() ||
      (conversation.subject
        ? conversation.subject.startsWith('Re:')
          ? conversation.subject
          : `Re: ${conversation.subject}`
        : 'Follow-up');

    const scheduleAt = input.scheduleAt ? new Date(input.scheduleAt) : null;
    const shouldSchedule = scheduleAt && scheduleAt.getTime() > Date.now();

    // Reuse AI/edited draft message when present
    const existingDraft = await this.prisma.message.findFirst({
      where: {
        workspaceId,
        conversationId: conversation.id,
        direction: MessageDirection.OUTBOUND,
        status: {
          in: [
            MessageStatus.AI_SUGGESTED,
            MessageStatus.EDITED_BY_USER,
            MessageStatus.DRAFT,
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const message = existingDraft
      ? await this.prisma.message.update({
          where: { id: existingDraft.id },
          data: {
            subject,
            body: input.body,
            toEmail: conversation.contact.email,
            status: shouldSchedule
              ? MessageStatus.SCHEDULED
              : MessageStatus.DRAFT,
            scheduledAt: shouldSchedule ? scheduleAt : null,
          },
        })
      : await this.prisma.message.create({
          data: {
            workspaceId,
            leadId: conversation.leadId,
            conversationId: conversation.id,
            subject,
            body: input.body,
            toEmail: conversation.contact.email,
            direction: MessageDirection.OUTBOUND,
            status: shouldSchedule
              ? MessageStatus.SCHEDULED
              : MessageStatus.DRAFT,
            scheduledAt: shouldSchedule ? scheduleAt : null,
            sequenceStep: 0,
          },
        });

    if (shouldSchedule) {
      await this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: input.body.slice(0, 180),
        },
      });
      await this.audit.record({
        workspaceId,
        actorUserId,
        action: 'INBOX_REPLY_SCHEDULE',
        targetType: 'CONVERSATION',
        targetId: conversationId,
        changes: {
          messageId: message.id,
          scheduleAt: scheduleAt?.toISOString() ?? null,
        },
      });
      await this.redis.client.del(this.proposedReplyKey(conversationId));
      return {
        messageId: message.id,
        status: MessageStatus.SCHEDULED,
        scheduledAt: scheduleAt,
      };
    }

    await this.prisma.message.update({
      where: { id: message.id },
      data: { status: MessageStatus.SENDING },
    });

    let sendResult: Awaited<ReturnType<EmailSenderService['send']>>;
    try {
      sendResult = await this.emailSender.send({
        workspaceId,
        to: conversation.contact.email,
        subject,
        body: input.body,
      });
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : 'Unknown send error';
      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.FAILED,
          errorMessage: errMsg,
        },
      });
      throw error;
    }

    await this.prisma.$transaction([
      this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: MessageStatus.SENT,
          sentAt: new Date(),
          provider: sendResult.provider,
          providerMessageId: sendResult.providerMessageId ?? null,
          externalMessageId: sendResult.providerMessageId ?? null,
          errorMessage: null,
        },
      }),
      this.prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: input.body.slice(0, 180),
          ...(sendResult.providerThreadId && !conversation.providerThreadId
            ? {
                providerThreadId: sendResult.providerThreadId,
                provider: sendResult.provider,
              }
            : {}),
        },
      }),
    ]);

    await this.postReply.applyOutboundReply({
      workspaceId,
      leadId: conversation.leadId,
      conversationId: conversation.id,
      assignedUserId: conversation.lead.assignedUserId,
      contactEmail: conversation.contact.email,
      actorUserId: actorUserId ?? null,
    });

    await this.audit.record({
      workspaceId,
      actorUserId,
      action: 'INBOX_REPLY_SEND',
      targetType: 'CONVERSATION',
      targetId: conversationId,
      changes: {
        messageId: message.id,
        provider: sendResult.provider,
        providerMessageId: sendResult.providerMessageId ?? null,
      },
    });
    await this.redis.client.del(this.proposedReplyKey(conversationId));

    return {
      messageId: message.id,
      status: MessageStatus.SENT,
      provider: sendResult.provider,
      providerMessageId: sendResult.providerMessageId ?? null,
    };
  }

  private proposedReplyKey(conversationId: string) {
    return `inbox:proposed-reply:${conversationId}`;
  }

  private async cacheProposedReply(
    conversationId: string,
    subject: string,
    body: string,
  ) {
    await this.redis.client.set(
      this.proposedReplyKey(conversationId),
      JSON.stringify({ subject, body, generatedAt: new Date().toISOString() }),
      'EX',
      60 * 60 * 24 * 7,
    );
  }

  private async upsertSuggestedReplyMessage(
    workspaceId: string,
    conversationId: string,
    leadId: string,
    subject: string,
    body: string,
    status: typeof MessageStatus.AI_SUGGESTED | typeof MessageStatus.EDITED_BY_USER,
  ) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const existing = await this.prisma.message.findFirst({
      where: {
        workspaceId,
        conversationId,
        direction: MessageDirection.OUTBOUND,
        status: {
          in: [
            MessageStatus.AI_SUGGESTED,
            MessageStatus.EDITED_BY_USER,
            MessageStatus.DRAFT,
          ],
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      await this.prisma.message.update({
        where: { id: existing.id },
        data: { subject, body, status },
      });
      return existing.id;
    }

    const created = await this.prisma.message.create({
      data: {
        workspaceId,
        leadId,
        conversationId,
        subject,
        body,
        direction: MessageDirection.OUTBOUND,
        status,
        sequenceStep: 0,
      },
    });
    return created.id;
  }

  private async readCachedProposedReply(conversationId: string): Promise<{
    subject: string;
    body: string;
    generatedAt?: string;
  } | null> {
    const raw = await this.redis.client.get(
      this.proposedReplyKey(conversationId),
    );
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as {
        subject?: string;
        body?: string;
        generatedAt?: string;
      };
      if (!parsed.body?.trim()) return null;
      return {
        subject: parsed.subject || 'Re: Follow-up',
        body: parsed.body,
        generatedAt: parsed.generatedAt,
      };
    } catch {
      return null;
    }
  }

  private async generateAndCacheProposedReply(input: {
    workspaceId: string;
    conversationId: string;
    leadId: string;
    contactName: string;
    companyName: string | null;
    subject: string;
    inboundBody: string;
  }) {
    await this.prisma.setWorkspaceContext(input.workspaceId);
    const lead = await this.prisma.lead.findFirst({
      where: { id: input.leadId, workspaceId: input.workspaceId },
      select: { nextRecommendedAction: true, status: true },
    });
    const message = await this.prisma.message.findFirst({
      where: {
        conversationId: input.conversationId,
        workspaceId: input.workspaceId,
        direction: MessageDirection.INBOUND,
      },
      orderBy: { createdAt: 'desc' },
      select: { intent: true, sentiment: true },
    });

    const composed = await this.ai.composeReply({
      contactName: input.contactName,
      companyName: input.companyName,
      subject: input.subject || 'Follow-up',
      threadSummary: `INBOUND: ${input.inboundBody.slice(0, 1200)}`,
      intent: message?.intent ?? null,
      sentiment: message?.sentiment ?? null,
      instruction:
        lead?.nextRecommendedAction ||
        recommendedResponse(message?.intent ?? null),
    });

    await this.cacheProposedReply(
      input.conversationId,
      composed.subject,
      composed.body,
    );
    await this.upsertSuggestedReplyMessage(
      input.workspaceId,
      input.conversationId,
      input.leadId,
      composed.subject,
      composed.body,
      MessageStatus.AI_SUGGESTED,
    );
  }

  private async requireConversation(workspaceId: string, conversationId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const existing = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Conversation ${conversationId} not found`);
    }
  }

  /**
   * Attribute inbound replies to a campaign only when this lead has campaign
   * outbound for that campaign (avoids counting unrelated inbox history).
   */
  private async resolveCampaignIdForInbound(
    workspaceId: string,
    leadId: string,
    leadCampaignId: string | null,
  ): Promise<string | null> {
    if (!leadCampaignId) return null;
    const campaignOutbound = await this.prisma.message.findFirst({
      where: {
        workspaceId,
        leadId,
        campaignId: leadCampaignId,
        direction: MessageDirection.OUTBOUND,
      },
      select: { id: true },
    });
    return campaignOutbound ? leadCampaignId : null;
  }

  private validatePayload(payload: InboxEmailPayload) {
    if (!payload.workspaceId) {
      throw new BadRequestException('workspaceId is required');
    }
    if (!payload.from || !payload.to) {
      throw new BadRequestException('from and to are required');
    }
    if (!payload.subject && !payload.body) {
      throw new BadRequestException('subject or body is required');
    }
  }

  private normalizeEmail(raw: string): string {
    const match = raw.match(/<([^>]+)>/);
    const email = (match?.[1] ?? raw).trim().toLowerCase();
    if (!email.includes('@')) {
      throw new BadRequestException(`Invalid email address: ${raw}`);
    }
    return email;
  }

  private guessFirstName(from: string): string | undefined {
    const namePart = from.includes('<')
      ? from.split('<')[0]?.trim()
      : undefined;
    if (!namePart) return undefined;
    return namePart.replace(/"/g, '').split(/\s+/)[0] || undefined;
  }
}
