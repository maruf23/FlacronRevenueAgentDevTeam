import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  CAMPAIGN_JOBS,
  QUEUE_NAMES,
} from '../queues/queue.constants';
import {
  CampaignAutomationService,
  CampaignJobPayload,
} from './campaign-automation.service';

/**
 * Persistent BullMQ worker for campaign automation.
 * Runs inside the NestJS process (server-side) — independent of the browser.
 */
@Processor(QUEUE_NAMES.CAMPAIGN)
@Injectable()
export class CampaignAutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(CampaignAutomationProcessor.name);

  constructor(private readonly automation: CampaignAutomationService) {
    super();
  }

  async process(job: Job): Promise<void> {
    const payload = job.data as CampaignJobPayload;

    if (job.name === CAMPAIGN_JOBS.START) {
      this.logger.log(
        `Processing ${CAMPAIGN_JOBS.START} for campaign ${payload.campaignId}`,
      );
      await this.automation.startCampaign(payload);
      return;
    }

    if (job.name === CAMPAIGN_JOBS.TICK) {
      await this.automation.tickCampaign(payload);
      return;
    }

    this.logger.warn(`Unknown campaign job: ${job.name}`);
  }
}
