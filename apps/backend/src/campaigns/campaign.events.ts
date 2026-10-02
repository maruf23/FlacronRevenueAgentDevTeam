import type { CampaignLeadStatus } from '@prisma/client';

export const CAMPAIGN_EVENTS = {
  REPLY_RECEIVED: 'reply.received',
  MEETING_BOOKED: 'meeting.booked',
  BOUNCE_OCCURRED: 'bounce.occurred',
  UNSUBSCRIBE_REQUESTED: 'unsubscribe.requested',
  CUSTOMER_CONVERTED: 'customer.converted',
  MANUAL_REMOVE: 'manual.remove',
  MESSAGE_QUEUED: 'campaign.message.queued',
  MESSAGE_SENT: 'campaign.message.sent',
} as const;

export type CampaignStopEvent =
  | typeof CAMPAIGN_EVENTS.REPLY_RECEIVED
  | typeof CAMPAIGN_EVENTS.MEETING_BOOKED
  | typeof CAMPAIGN_EVENTS.BOUNCE_OCCURRED
  | typeof CAMPAIGN_EVENTS.UNSUBSCRIBE_REQUESTED
  | typeof CAMPAIGN_EVENTS.CUSTOMER_CONVERTED
  | typeof CAMPAIGN_EVENTS.MANUAL_REMOVE;

export type CampaignStopSequencePayload = {
  workspaceId: string;
  leadId: string;
  reason: string;
  email?: string;
};

export type CampaignMessageLifecyclePayload = {
  workspaceId: string;
  leadId: string;
  messageId: string;
};

/** Returned by sequence stop handlers for each domain trigger */
export type EventResponse = {
  event: CampaignStopEvent | string;
  leadId: string;
  workspaceId: string;
  stopped: boolean;
  reason: string;
  cancelledMessages: number;
  leadStatus: CampaignLeadStatus | null;
};
