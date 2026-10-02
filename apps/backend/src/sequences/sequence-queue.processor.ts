import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  QUEUE_NAMES,
  SEQUENCE_JOBS,
} from '../queues/queue.constants';
import {
  SequenceQueueService,
  SendSequenceMessageJob,
} from './sequence-queue.service';
import {
  CAMPAIGN_EVENTS,
  type CampaignStopSequencePayload,
  type EventResponse,
} from '../campaigns/campaign.events';

/**
 * BullMQ worker for outbound sequence sends + domain-event stop conditions.
 * Listening here keeps stop logic at the worker/queue layer.
 */
@Processor(QUEUE_NAMES.SEQUENCE)
@Injectable()
export class SequenceQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(SequenceQueueProcessor.name);

  constructor(private readonly sequenceQueue: SequenceQueueService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SEQUENCE_JOBS.SEND_MESSAGE) {
      this.logger.warn(`Unknown sequence job: ${job.name}`);
      return;
    }

    await this.sequenceQueue.processSend(job.data as SendSequenceMessageJob);
  }

  @OnEvent(CAMPAIGN_EVENTS.REPLY_RECEIVED)
  async onReplyReceived(
    payload: CampaignStopSequencePayload,
  ): Promise<EventResponse> {
    return this.sequenceQueue.handleStopEvent(
      CAMPAIGN_EVENTS.REPLY_RECEIVED,
      payload,
    );
  }

  @OnEvent(CAMPAIGN_EVENTS.MEETING_BOOKED)
  async onMeetingBooked(
    payload: CampaignStopSequencePayload,
  ): Promise<EventResponse> {
    return this.sequenceQueue.handleStopEvent(
      CAMPAIGN_EVENTS.MEETING_BOOKED,
      payload,
    );
  }

  @OnEvent(CAMPAIGN_EVENTS.BOUNCE_OCCURRED)
  async onBounceOccurred(
    payload: CampaignStopSequencePayload,
  ): Promise<EventResponse> {
    return this.sequenceQueue.handleStopEvent(
      CAMPAIGN_EVENTS.BOUNCE_OCCURRED,
      payload,
    );
  }

  @OnEvent(CAMPAIGN_EVENTS.UNSUBSCRIBE_REQUESTED)
  async onUnsubscribeRequested(
    payload: CampaignStopSequencePayload,
  ): Promise<EventResponse> {
    return this.sequenceQueue.handleStopEvent(
      CAMPAIGN_EVENTS.UNSUBSCRIBE_REQUESTED,
      payload,
    );
  }

  @OnEvent(CAMPAIGN_EVENTS.CUSTOMER_CONVERTED)
  async onCustomerConverted(
    payload: CampaignStopSequencePayload,
  ): Promise<EventResponse> {
    return this.sequenceQueue.handleStopEvent(
      CAMPAIGN_EVENTS.CUSTOMER_CONVERTED,
      payload,
    );
  }

  @OnEvent(CAMPAIGN_EVENTS.MANUAL_REMOVE)
  async onManualRemove(
    payload: CampaignStopSequencePayload,
  ): Promise<EventResponse> {
    return this.sequenceQueue.handleStopEvent(
      CAMPAIGN_EVENTS.MANUAL_REMOVE,
      payload,
    );
  }
}
