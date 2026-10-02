export type InboxFilter =
  | 'all'
  | 'unread'
  | 'interested'
  | 'needs_reply'
  | 'meeting_requested'
  | 'objection'
  | 'ooo';

export const INBOX_FILTERS: Array<{ id: InboxFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'interested', label: 'Interested' },
  { id: 'needs_reply', label: 'Needs Reply' },
  { id: 'meeting_requested', label: 'Meeting Requested' },
  { id: 'objection', label: 'Objection' },
  { id: 'ooo', label: 'Out of Office' },
];

export type InboxConversationListItem = {
  id: string;
  subject: string | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  unread: boolean;
  priority: 'high' | 'medium' | 'low';
  channel: string;
  contact: {
    id: string;
    name: string;
    email: string;
    companyName: string | null;
    title: string | null;
  };
  lead: {
    id: string;
    status: string;
    leadScore: number | null;
    nextRecommendedAction: string | null;
  };
  latestMessage?: {
    intent?: string | null;
    sentiment?: string | null;
    confidence?: number | null;
    direction?: string;
  } | null;
  filterHints: {
    interested: boolean;
    needsReply: boolean;
    meetingRequested: boolean;
    objection: boolean;
    ooo: boolean;
  };
};

export type InboxMessageStatus =
  | 'DRAFT'
  | 'AI_SUGGESTED'
  | 'EDITED_BY_USER'
  | 'QUEUED'
  | 'SCHEDULED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'RECEIVED'
  | 'FAILED'
  | 'BOUNCED'
  | 'COMPLAINED'
  | 'CANCELLED';

export type InboxMessage = {
  id: string;
  subject: string;
  body: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: InboxMessageStatus | string;
  fromEmail?: string | null;
  toEmail?: string | null;
  intent?: string | null;
  sentiment?: string | null;
  confidence?: number | null;
  evidence?: string[];
  scheduledAt?: string | null;
  sentAt?: string | null;
  deliveredAt?: string | null;
  receivedAt?: string | null;
  providerMessageId?: string | null;
  externalMessageId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  attachments?: Array<{ id: string; name: string; url?: string }>;
};

export type InboxSyncHistoryEvent = {
  at: string;
  type: string;
  messageId: string;
  status: string;
  detail?: string | null;
};

export type InboxConversationDetail = {
  id: string;
  conversationId?: string;
  subject: string | null;
  lastMessageAt: string;
  contact: {
    id: string;
    name: string;
    email: string;
    companyName: string | null;
    title: string | null;
    phone: string | null;
  };
  lead: {
    id: string;
    status: string;
    leadScore: number | null;
    industry: string | null;
    location: string | null;
    nextRecommendedAction: string | null;
    lastActivityAt: string | null;
  };
  messages: InboxMessage[];
  syncHistory?: InboxSyncHistoryEvent[];
  aiInsight: {
    intent: string | null;
    intentKey?: string | null;
    sentiment: string | null;
    sentimentKey?: string | null;
    confidence: number | null;
    evidence: string[];
    recommendedResponse: string;
    nextBestAction: string;
    suggestedPipelineStage: string;
    currentPipelineStage?: string;
    pipelineMove?: string;
  };
  /** AI-proposed reply generated when the inbound message arrived (or via Regenerate) */
  proposedReply?: {
    subject: string;
    body: string;
    generatedAt?: string;
  } | null;
};
