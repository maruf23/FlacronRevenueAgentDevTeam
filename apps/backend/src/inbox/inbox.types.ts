export type InboxEmailPayload = {
  workspaceId: string;
  provider: 'gmail' | 'microsoft' | 'normalized';
  subject: string;
  from: string;
  to: string;
  body: string;
  receivedAt?: string;
  externalId?: string;
  /** Gmail threadId / Microsoft conversationId */
  threadId?: string;
};

export type ProcessInboxJobData = {
  payload: InboxEmailPayload;
};
