import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CampaignLeadStatusService } from './campaign-lead-status.service';
import {
  CAMPAIGN_EVENTS,
  CampaignMessageLifecyclePayload,
} from './campaign.events';

/**
 * Keeps CampaignLeadStatus in sync with outbound send lifecycle.
 * Sequence stop conditions are owned by SequenceQueueProcessor.
 */
@Injectable()
export class CampaignEventListener {
  private readonly logger = new Logger(CampaignEventListener.name);

  constructor(private readonly leadStatus: CampaignLeadStatusService) {}

  @OnEvent(CAMPAIGN_EVENTS.MESSAGE_QUEUED)
  async onMessageQueued(payload: CampaignMessageLifecyclePayload) {
    if (!payload?.workspaceId || !payload?.leadId) return;
    try {
      await this.leadStatus.syncFromActivity(
        payload.workspaceId,
        payload.leadId,
      );
    } catch (error) {
      this.logger.warn(
        `Failed syncing leadStatus after queue for ${payload.leadId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  @OnEvent(CAMPAIGN_EVENTS.MESSAGE_SENT)
  async onMessageSent(payload: CampaignMessageLifecyclePayload) {
    if (!payload?.workspaceId || !payload?.leadId) return;
    try {
      await this.leadStatus.syncFromActivity(
        payload.workspaceId,
        payload.leadId,
        { force: true },
      );
    } catch (error) {
      this.logger.warn(
        `Failed syncing leadStatus after send for ${payload.leadId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
