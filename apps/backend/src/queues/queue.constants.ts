export const QUEUE_NAMES = {
  AI_JOBS: 'ai-jobs',
  EMAIL: 'email',
  TENANT_TASKS: 'tenant-tasks',
  LEAD_IMPORT: 'lead-import',
  SEQUENCE: 'sequence',
  INBOX: 'inbox',
  CAMPAIGN: 'campaign',
} as const;

export const LEAD_IMPORT_JOBS = {
  PROCESS_CSV: 'process-csv',
  VERIFY_EMAILS: 'verify-emails',
} as const;

export const SEQUENCE_JOBS = {
  SEND_MESSAGE: 'send-message',
} as const;

export const INBOX_JOBS = {
  PROCESS_INBOUND: 'process-inbound',
} as const;

export const CAMPAIGN_JOBS = {
  /** Materialize lead/message queue and kick off the first tick */
  START: 'campaign-start',
  /** Durable drip tick — respects dailySendLimit / timezone / quietHours */
  TICK: 'campaign-tick',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
