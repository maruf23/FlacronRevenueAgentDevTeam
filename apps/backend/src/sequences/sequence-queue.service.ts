import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CampaignLeadStatus,
  LeadStatus,
  MessageStatus,
  SuppressionReason,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { EmailSenderService } from '../email/email-sender.service';
import {
  QUEUE_NAMES,
  SEQUENCE_JOBS,
} from '../queues/queue.constants';
import {
  CAMPAIGN_EVENTS,
  type CampaignStopEvent,
  type CampaignStopSequencePayload,
  type EventResponse,
} from '../campaigns/campaign.events';

export type SendSequenceMessageJob = {
  messageId: string;
  workspaceId: string;
};

@Injectable()
export class SequenceQueueService {
  private readonly logger = new Logger(SequenceQueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly emailSender: EmailSenderService,
    private readonly events: EventEmitter2,
    @InjectQueue(QUEUE_NAMES.SEQUENCE)
    private readonly sequenceQueue: Queue,
  ) {}

  /**
   * Enqueue a message for sending at scheduledAt (or immediately).
   */
  async enqueueMessage(messageId: string, workspaceId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { isPaused: true, pauseReason: true },
    });
    if (workspace?.isPaused) {
      throw new ServiceUnavailableException(
        workspace.pauseReason ||
          'Workspace is paused — cannot enqueue outbound messages',
      );
    }

    const message = await this.prisma.message.findFirst({
      where: { id: messageId, workspaceId },
    });

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    const delay = message.scheduledAt
      ? Math.max(0, message.scheduledAt.getTime() - Date.now())
      : 0;

    await this.prisma.message.update({
      where: { id: messageId },
      data: { status: MessageStatus.QUEUED },
    });

    const payload: SendSequenceMessageJob = { messageId, workspaceId };

    await this.sequenceQueue.add(SEQUENCE_JOBS.SEND_MESSAGE, payload, {
      jobId: `send-message-${messageId}`,
      delay,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 100,
    });

    this.events.emit(CAMPAIGN_EVENTS.MESSAGE_QUEUED, {
      workspaceId,
      leadId: message.leadId,
      messageId,
    });

    return { messageId, status: MessageStatus.QUEUED, delayMs: delay };
  }

  /**
   * Remove BullMQ send jobs and cancel pending outbound messages for one lead.
   * Used when reply / meeting / bounce / unsubscribe stops the sequence.
   */
  async cancelPendingForLead(
    workspaceId: string,
    leadId: string,
    reason: string,
  ): Promise<number> {
    await this.prisma.setWorkspaceContext(workspaceId);

    const messages = await this.prisma.message.findMany({
      where: {
        workspaceId,
        leadId,
        status: {
          in: [
            MessageStatus.QUEUED,
            MessageStatus.SCHEDULED,
            MessageStatus.DRAFT,
            MessageStatus.SENDING,
          ],
        },
      },
      select: { id: true, status: true },
    });

    for (const message of messages) {
      if (message.status !== MessageStatus.QUEUED) continue;
      try {
        const job = await this.sequenceQueue.getJob(
          `send-message-${message.id}`,
        );
        if (job) {
          await job.remove();
        }
      } catch (error) {
        this.logger.warn(
          `Failed removing job for message ${message.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const result = await this.prisma.message.updateMany({
      where: {
        workspaceId,
        leadId,
        status: {
          in: [
            MessageStatus.QUEUED,
            MessageStatus.SCHEDULED,
            MessageStatus.DRAFT,
            MessageStatus.SENDING,
          ],
        },
      },
      data: {
        status: MessageStatus.CANCELLED,
        errorMessage: `Sequence stopped: ${reason}`,
      },
    });

    return result.count;
  }

  /**
   * Domain-event stop handler used by the sequence worker.
   * Deletes pending BullMQ jobs, cancels queued messages, updates leadStatus,
   * and returns an EventResponse describing the outcome.
   */
  async handleStopEvent(
    event: CampaignStopEvent,
    payload: CampaignStopSequencePayload,
  ): Promise<EventResponse> {
    const workspaceId = payload?.workspaceId;
    const leadId = payload?.leadId;
    const reason = payload?.reason || event;

    if (!workspaceId || !leadId) {
      this.logger.warn(`Ignore ${event}: missing workspaceId/leadId`);
      return {
        event,
        leadId: leadId ?? '',
        workspaceId: workspaceId ?? '',
        stopped: false,
        reason: 'Missing workspaceId or leadId',
        cancelledMessages: 0,
        leadStatus: null,
      };
    }

    await this.prisma.setWorkspaceContext(workspaceId);

    const cancelledMessages = await this.cancelPendingForLead(
      workspaceId,
      leadId,
      reason,
    );

    const leadStatus = this.resolveStopLeadStatus(event);
    const pipelinePatch = this.resolveStopPipelineStatus(event);

    const leadData: {
      leadStatus?: CampaignLeadStatus | null;
      status?: LeadStatus;
      lastActivityAt: Date;
      campaignId?: null;
      nextRecommendedAction?: string;
    } = {
      lastActivityAt: new Date(),
    };

    if (event === CAMPAIGN_EVENTS.MANUAL_REMOVE) {
      leadData.campaignId = null;
      leadData.leadStatus = null;
      leadData.nextRecommendedAction = 'Removed from campaign';
    } else if (leadStatus !== undefined) {
      leadData.leadStatus = leadStatus;
    }

    if (pipelinePatch !== undefined) {
      leadData.status = pipelinePatch;
    }

    switch (event) {
      case CAMPAIGN_EVENTS.MEETING_BOOKED:
        leadData.nextRecommendedAction =
          'Meeting booked — sequence stopped';
        break;
      case CAMPAIGN_EVENTS.CUSTOMER_CONVERTED:
        leadData.nextRecommendedAction =
          'Customer converted — sequence stopped';
        break;
      case CAMPAIGN_EVENTS.BOUNCE_OCCURRED:
        leadData.nextRecommendedAction = 'Email bounced — sequence stopped';
        break;
      case CAMPAIGN_EVENTS.UNSUBSCRIBE_REQUESTED:
        leadData.nextRecommendedAction = 'Unsubscribed — sequence stopped';
        break;
      case CAMPAIGN_EVENTS.REPLY_RECEIVED:
        leadData.nextRecommendedAction = 'Reply received — sequence stopped';
        break;
      default:
        break;
    }

    await this.prisma.lead.updateMany({
      where: { id: leadId, workspaceId },
      data: leadData,
    });

    const updated = await this.prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      select: { leadStatus: true },
    });

    const response: EventResponse = {
      event,
      leadId,
      workspaceId,
      stopped: true,
      reason,
      cancelledMessages,
      leadStatus: updated?.leadStatus ?? leadStatus ?? null,
    };

    this.logger.log(
      `Stop event ${event} for lead ${leadId}: cancelled=${cancelledMessages}, leadStatus=${response.leadStatus}`,
    );

    return response;
  }

  private resolveStopLeadStatus(
    event: CampaignStopEvent,
  ): CampaignLeadStatus | null | undefined {
    switch (event) {
      case CAMPAIGN_EVENTS.REPLY_RECEIVED:
        return CampaignLeadStatus.REPLIED;
      case CAMPAIGN_EVENTS.MEETING_BOOKED:
        return CampaignLeadStatus.COMPLETED;
      case CAMPAIGN_EVENTS.BOUNCE_OCCURRED:
        return CampaignLeadStatus.BOUNCED;
      case CAMPAIGN_EVENTS.UNSUBSCRIBE_REQUESTED:
        return CampaignLeadStatus.UNSUBSCRIBED;
      case CAMPAIGN_EVENTS.CUSTOMER_CONVERTED:
        return CampaignLeadStatus.COMPLETED;
      case CAMPAIGN_EVENTS.MANUAL_REMOVE:
        return null;
      default:
        return undefined;
    }
  }

  private resolveStopPipelineStatus(
    event: CampaignStopEvent,
  ): LeadStatus | undefined {
    switch (event) {
      case CAMPAIGN_EVENTS.BOUNCE_OCCURRED:
        return LeadStatus.BOUNCED;
      case CAMPAIGN_EVENTS.UNSUBSCRIBE_REQUESTED:
        return LeadStatus.LOST;
      case CAMPAIGN_EVENTS.MEETING_BOOKED:
        return LeadStatus.MEETING_SCHEDULED;
      case CAMPAIGN_EVENTS.CUSTOMER_CONVERTED:
        return LeadStatus.CONVERTED;
      case CAMPAIGN_EVENTS.REPLY_RECEIVED:
        return LeadStatus.REPLIED;
      default:
        return undefined;
    }
  }

  /**
   * Pause-friendly: remove Bull send jobs and revert QUEUED → DRAFT so resume can re-enqueue.
   */
  async dequeuePendingForCampaign(
    workspaceId: string,
    campaignId: string,
  ): Promise<number> {
    await this.prisma.setWorkspaceContext(workspaceId);

    const messages = await this.prisma.message.findMany({
      where: {
        workspaceId,
        status: {
          in: [MessageStatus.QUEUED, MessageStatus.SENDING],
        },
        lead: { campaignId },
      },
      select: { id: true },
    });

    for (const message of messages) {
      try {
        const job = await this.sequenceQueue.getJob(
          `send-message-${message.id}`,
        );
        if (job) {
          await job.remove();
        }
      } catch (error) {
        this.logger.warn(
          `Failed removing job for message ${message.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (messages.length === 0) {
      return 0;
    }

    const result = await this.prisma.message.updateMany({
      where: {
        workspaceId,
        id: { in: messages.map((m) => m.id) },
        status: { in: [MessageStatus.QUEUED, MessageStatus.SENDING] },
      },
      data: {
        status: MessageStatus.DRAFT,
        errorMessage: null,
      },
    });

    return result.count;
  }

  /**
   * Stop-friendly: remove Bull jobs and mark pending campaign messages CANCELLED.
   */
  async cancelPendingForCampaign(
    workspaceId: string,
    campaignId: string,
    reason: string,
  ): Promise<number> {
    await this.prisma.setWorkspaceContext(workspaceId);

    const messages = await this.prisma.message.findMany({
      where: {
        workspaceId,
        status: {
          in: [
            MessageStatus.QUEUED,
            MessageStatus.SCHEDULED,
            MessageStatus.DRAFT,
            MessageStatus.SENDING,
          ],
        },
        lead: { campaignId },
      },
      select: { id: true, status: true },
    });

    for (const message of messages) {
      if (
        message.status !== MessageStatus.QUEUED &&
        message.status !== MessageStatus.SENDING
      ) {
        continue;
      }
      try {
        const job = await this.sequenceQueue.getJob(
          `send-message-${message.id}`,
        );
        if (job) {
          await job.remove();
        }
      } catch (error) {
        this.logger.warn(
          `Failed removing job for message ${message.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (messages.length === 0) {
      return 0;
    }

    const result = await this.prisma.message.updateMany({
      where: {
        workspaceId,
        id: { in: messages.map((m) => m.id) },
        status: {
          in: [
            MessageStatus.QUEUED,
            MessageStatus.SCHEDULED,
            MessageStatus.DRAFT,
            MessageStatus.SENDING,
          ],
        },
      },
      data: {
        status: MessageStatus.CANCELLED,
        errorMessage: `Campaign stopped: ${reason}`,
      },
    });

    return result.count;
  }

  /**
   * Remove BullMQ jobs and mark QUEUED messages CANCELLED for a workspace.
   * Returns the number of DB messages cancelled.
   */
  async cancelPendingJobs(workspaceId: string): Promise<number> {
    await this.prisma.setWorkspaceContext(workspaceId);

    const queued = await this.prisma.message.findMany({
      where: { workspaceId, status: MessageStatus.QUEUED },
      select: { id: true },
    });

    for (const message of queued) {
      try {
        const job = await this.sequenceQueue.getJob(
          `send-message-${message.id}`,
        );
        if (job) {
          await job.remove();
        }
      } catch (error) {
        this.logger.warn(
          `Failed removing job for message ${message.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const result = await this.prisma.message.updateMany({
      where: { workspaceId, status: MessageStatus.QUEUED },
      data: {
        status: MessageStatus.CANCELLED,
        errorMessage: 'Cancelled by emergency stop / workspace pause',
      },
    });

    return result.count;
  }

  /**
   * Idempotent send — Redis lock keyed by messageId prevents double-send.
   */
  async processSend(job: SendSequenceMessageJob): Promise<void> {
    const { messageId, workspaceId } = job;
    const lockKey = `lock:message:send:${messageId}`;
    const lockTtlSeconds = 120;

    const acquired = await this.redis.client.set(
      lockKey,
      '1',
      'EX',
      lockTtlSeconds,
      'NX',
    );

    if (acquired !== 'OK') {
      this.logger.warn(
        `Skip send for ${messageId}: lock held (possible concurrent worker)`,
      );
      return;
    }

    try {
      await this.prisma.setWorkspaceContext(workspaceId);

      const message = await this.prisma.message.findFirst({
        where: { id: messageId, workspaceId },
        include: {
          lead: { include: { contact: true } },
        },
      });

      if (!message) {
        this.logger.warn(`Message ${messageId} missing — nothing to send`);
        return;
      }

      const workspace = await this.prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { isPaused: true },
      });
      if (workspace?.isPaused) {
        await this.prisma.message.update({
          where: { id: messageId },
          data: {
            status: MessageStatus.CANCELLED,
            errorMessage: 'Workspace paused — outbound halted',
          },
        });
        this.logger.warn(
          `Skip send for ${messageId}: workspace ${workspaceId} is paused`,
        );
        return;
      }

      // Already terminal — idempotent no-op
      if (
        message.status === MessageStatus.SENT ||
        message.status === MessageStatus.DELIVERED ||
        message.status === MessageStatus.BOUNCED ||
        message.status === MessageStatus.COMPLAINED ||
        message.status === MessageStatus.CANCELLED ||
        message.status === MessageStatus.FAILED
      ) {
        this.logger.debug(`Message ${messageId} already ${message.status}`);
        return;
      }

      const email = message.lead.contact.email.toLowerCase();

      const suppressed = await this.prisma.suppressionEntry.findUnique({
        where: {
          workspaceId_email: { workspaceId, email },
        },
      });

      if (suppressed) {
        await this.prisma.message.update({
          where: { id: messageId },
          data: {
            status: MessageStatus.FAILED,
            errorMessage: `Suppressed: ${suppressed.reason}`,
          },
        });
        return;
      }

      await this.prisma.message.update({
        where: { id: messageId },
        data: { status: MessageStatus.SENDING },
      });

      const sendResult = await this.emailSender.send({
        workspaceId,
        to: email,
        subject: message.subject,
        body: message.body,
        preferredProvider: message.provider ?? undefined,
      });

      await this.prisma.$transaction([
        this.prisma.message.update({
          where: { id: messageId },
          data: {
            status: MessageStatus.SENT,
            sentAt: new Date(),
            provider: sendResult.provider,
            providerMessageId: sendResult.providerMessageId ?? null,
            externalMessageId: sendResult.providerMessageId ?? null,
            errorMessage: null,
          },
        }),
        this.prisma.lead.update({
          where: { id: message.leadId },
          data: { status: LeadStatus.CONTACTED, lastActivityAt: new Date() },
        }),
      ]);

      this.events.emit(CAMPAIGN_EVENTS.MESSAGE_SENT, {
        workspaceId,
        leadId: message.leadId,
        messageId,
      });

      this.logger.log(
        `Sent message ${messageId} via ${sendResult.provider} to ${email}`,
      );
    } catch (error) {
      const errMsg =
        error instanceof Error ? error.message : 'Unknown send error';
      await this.prisma.setWorkspaceContext(workspaceId);
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          status: MessageStatus.FAILED,
          errorMessage: errMsg,
        },
      });
      throw error;
    } finally {
      await this.redis.client.del(lockKey);
    }
  }

  async handleBounceOrComplaint(input: {
    workspaceId: string;
    email: string;
    reason: SuppressionReason;
    messageId?: string;
    providerMessageId?: string;
    source?: string;
    bounceType?: 'hard' | 'soft';
    complaintReason?: string;
  }) {
    await this.prisma.setWorkspaceContext(input.workspaceId);
    const email = input.email.toLowerCase().trim();

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
        reason: input.reason,
        source: input.source ?? 'webhook',
      },
      update: {
        reason: input.reason,
        source: input.source ?? 'webhook',
      },
    });

    const leadStatus =
      input.reason === SuppressionReason.BOUNCE
        ? LeadStatus.BOUNCED
        : LeadStatus.COMPLAINED;

    const messageStatus =
      input.reason === SuppressionReason.BOUNCE
        ? MessageStatus.BOUNCED
        : MessageStatus.COMPLAINED;

    const messageData: {
      status: MessageStatus;
      bounceType?: string;
      complaintReason?: string;
    } = {
      status: messageStatus,
    };
    if (input.reason === SuppressionReason.BOUNCE && input.bounceType) {
      messageData.bounceType = input.bounceType;
    }
    if (
      input.reason === SuppressionReason.COMPLAINT &&
      input.complaintReason
    ) {
      messageData.complaintReason = input.complaintReason;
    }

    const contacts = await this.prisma.contact.findMany({
      where: { workspaceId: input.workspaceId, email },
      select: { id: true },
    });
    const contactIds = contacts.map((c) => c.id);

    if (contactIds.length > 0) {
      await this.prisma.lead.updateMany({
        where: {
          workspaceId: input.workspaceId,
          contactId: { in: contactIds },
        },
        data: { status: leadStatus, lastActivityAt: new Date() },
      });

      const leads = await this.prisma.lead.findMany({
        where: {
          workspaceId: input.workspaceId,
          contactId: { in: contactIds },
        },
        select: { id: true },
      });

      for (const lead of leads) {
        this.events.emit(CAMPAIGN_EVENTS.BOUNCE_OCCURRED, {
          workspaceId: input.workspaceId,
          leadId: lead.id,
          email,
          reason:
            input.reason === SuppressionReason.BOUNCE
              ? 'bounce.occurred'
              : 'complaint.occurred',
        });
      }
    }

    if (input.messageId) {
      await this.prisma.message.updateMany({
        where: {
          id: input.messageId,
          workspaceId: input.workspaceId,
        },
        data: messageData as never,
      });
    } else if (input.providerMessageId) {
      await this.prisma.message.updateMany({
        where: {
          workspaceId: input.workspaceId,
          providerMessageId: input.providerMessageId,
        },
        data: messageData as never,
      });
    } else {
      await this.prisma.message.updateMany({
        where: {
          workspaceId: input.workspaceId,
          lead: { contact: { email } },
          status: {
            in: [
              MessageStatus.QUEUED,
              MessageStatus.SCHEDULED,
              MessageStatus.SENDING,
              MessageStatus.SENT,
              MessageStatus.DELIVERED,
            ],
          },
        },
        data: messageData as never,
      });
    }

    return {
      suppressed: true,
      email,
      reason: input.reason,
      bounceType: input.bounceType ?? null,
      complaintReason: input.complaintReason ?? null,
    };
  }

  /**
   * Real-time delivery status from Gmail / Microsoft Graph webhooks.
   * Correlates by internal messageId or providerMessageId.
   */
  async handleDeliveryStatus(input: {
    workspaceId: string;
    status: 'SENDING' | 'SENT' | 'DELIVERED' | 'FAILED';
    messageId?: string;
    providerMessageId?: string;
    email?: string;
    provider?: 'GMAIL' | 'MICROSOFT' | 'SMTP';
    source?: string;
    errorMessage?: string;
    occurredAt?: string;
  }) {
    await this.prisma.setWorkspaceContext(input.workspaceId);

    if (!input.messageId && !input.providerMessageId) {
      throw new NotFoundException(
        'messageId or providerMessageId is required for status updates',
      );
    }

    const where = input.messageId
      ? { id: input.messageId, workspaceId: input.workspaceId }
      : {
          workspaceId: input.workspaceId,
          providerMessageId: input.providerMessageId!,
        };

    const existing = await this.prisma.message.findFirst({ where });
    if (!existing) {
      this.logger.warn(
        `Status webhook (${input.source}): message not found ` +
          `(messageId=${input.messageId ?? '-'} providerMessageId=${input.providerMessageId ?? '-'})`,
      );
      return { updated: false, reason: 'message_not_found' };
    }

    // Do not regress terminal bounce/complaint/cancel
    if (
      existing.status === MessageStatus.BOUNCED ||
      existing.status === MessageStatus.COMPLAINED ||
      existing.status === MessageStatus.CANCELLED
    ) {
      return {
        updated: false,
        reason: 'terminal_status',
        messageId: existing.id,
        status: existing.status,
      };
    }

    // Do not regress DELIVERED → SENT/SENDING
    if (
      existing.status === MessageStatus.DELIVERED &&
      (input.status === 'SENDING' || input.status === 'SENT')
    ) {
      return {
        updated: false,
        reason: 'already_delivered',
        messageId: existing.id,
        status: existing.status,
      };
    }

    const occurredAt = input.occurredAt
      ? new Date(input.occurredAt)
      : new Date();
    const statusMap: Record<typeof input.status, MessageStatus> = {
      SENDING: MessageStatus.SENDING,
      SENT: MessageStatus.SENT,
      DELIVERED: MessageStatus.DELIVERED,
      FAILED: MessageStatus.FAILED,
    };
    const nextStatus = statusMap[input.status];

    const data: {
      status: MessageStatus;
      sentAt?: Date;
      deliveredAt?: Date;
      errorMessage?: string | null;
      providerMessageId?: string;
      provider?: 'GMAIL' | 'MICROSOFT';
    } = {
      status: nextStatus,
    };

    if (input.status === 'SENT' && !existing.sentAt) {
      data.sentAt = occurredAt;
    }
    if (input.status === 'DELIVERED') {
      data.deliveredAt = occurredAt;
      if (!existing.sentAt) {
        data.sentAt = occurredAt;
      }
    }
    if (input.status === 'FAILED') {
      data.errorMessage = input.errorMessage ?? 'Delivery failed (webhook)';
    } else if (input.status === 'DELIVERED' || input.status === 'SENT') {
      data.errorMessage = null;
    }
    if (input.providerMessageId && !existing.providerMessageId) {
      data.providerMessageId = input.providerMessageId;
    }
    if (input.provider === 'GMAIL' || input.provider === 'MICROSOFT') {
      data.provider = input.provider;
    }

    await this.prisma.message.update({
      where: { id: existing.id },
      data: data as never,
    });

    this.logger.log(
      `Message ${existing.id} → ${nextStatus} via ${input.source ?? 'status-webhook'}`,
    );

    return {
      updated: true,
      messageId: existing.id,
      status: nextStatus,
      previousStatus: existing.status,
    };
  }
}
