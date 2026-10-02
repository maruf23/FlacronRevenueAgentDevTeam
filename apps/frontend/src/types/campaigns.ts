export const CAMPAIGN_STATUSES = [
  'DRAFT',
  'PREPARING',
  'NEEDS_REVIEW',
  'SCHEDULED',
  'RUNNING',
  'PAUSED',
  'COMPLETED',
  'ATTENTION_REQUIRED',
  'FAILED',
  'ARCHIVED',
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_GOALS = [
  { value: 'book_meetings', label: 'Book Meetings' },
  { value: 'collect_replies', label: 'Collect Replies' },
  { value: 'nurture', label: 'Nurture Leads' },
  { value: 'announce', label: 'Product Announcement' },
  { value: 'reengage', label: 'Re-engage Cold Leads' },
  { value: 'win_customers', label: 'Win Customers' },
] as const;

export type CampaignGoal = (typeof CAMPAIGN_GOALS)[number]['value'];

export const SEQUENCE_STEP_TYPES = [
  'Initial',
  'Follow-up',
  'Case study',
  'Final',
] as const;

export type SequenceStepType = (typeof SEQUENCE_STEP_TYPES)[number];

export const LEAD_SOURCES = [
  {
    id: 'hunter',
    label: 'Lead providers',
    description: 'Hunter, Apollo, and similar databases',
  },
  {
    id: 'google_places',
    label: 'Google Places',
    description: 'Local businesses and maps listings',
  },
  {
    id: 'csv',
    label: 'CSV import',
    description: 'Upload a spreadsheet of contacts',
  },
  {
    id: 'website_visitors',
    label: 'Website visitors',
    description: 'Identify and convert site traffic',
  },
  {
    id: 'webforms',
    label: 'Inbound forms',
    description: 'Website and landing-page submissions',
  },
  {
    id: 'marketplace',
    label: 'Marketplace / ad leads',
    description: 'Meta, Google, LinkedIn, and marketplace leads',
  },
  {
    id: 'crm',
    label: 'CRM contacts',
    description: 'Import from the connected CRM',
  },
  {
    id: 'social',
    label: 'Social engagement',
    description: 'Comments, follows, and social signals',
  },
  {
    id: 'existing',
    label: 'Existing leads',
    description: 'Pull from your Flacron lead database',
  },
  {
    id: 'manual',
    label: 'Manual entry',
    description: 'Add contacts one by one',
  },
] as const;

export type LeadSourceId = (typeof LEAD_SOURCES)[number]['id'];

export const CAMPAIGN_CHANNELS = [
  {
    id: 'email',
    label: 'Email',
    description: 'Personalized sequences from a connected mailbox',
  },
  {
    id: 'social',
    label: 'Social outreach',
    description: 'LinkedIn and social follow-ups',
  },
  {
    id: 'ads',
    label: 'Paid ads',
    description: 'Meta, Google, LinkedIn, TikTok, Microsoft',
  },
  {
    id: 'chat',
    label: 'Website chat',
    description: 'Capture inbound website conversations',
  },
  {
    id: 'calendar',
    label: 'Calendar booking',
    description: 'Meetings land on your connected calendar',
  },
  {
    id: 'crm',
    label: 'CRM pipeline',
    description: 'Move leads automatically as they progress',
  },
] as const;

export type CampaignChannelId = (typeof CAMPAIGN_CHANNELS)[number]['id'];

export const AD_PLATFORMS = [
  { id: 'meta', label: 'Meta Ads' },
  { id: 'google', label: 'Google Ads' },
  { id: 'linkedin', label: 'LinkedIn Ads' },
  { id: 'tiktok', label: 'TikTok Ads' },
  { id: 'microsoft', label: 'Microsoft Ads' },
] as const;

export type AdPlatformId = (typeof AD_PLATFORMS)[number]['id'];

export const BRAND_TONES = [
  'Professional',
  'Friendly',
  'Direct',
  'Consultative',
  'Bold',
] as const;

export type BrandTone = (typeof BRAND_TONES)[number];

export const DISCOVERY_WORKFLOW = [
  {
    id: 1,
    key: 'find_leads',
    label: 'Find Leads',
    description: 'Discover prospects from selected data sources',
  },
  {
    id: 2,
    key: 'enrich_verify',
    label: 'Enrich & Verify',
    description: 'Clean, enrich, and verify contact data',
  },
  {
    id: 3,
    key: 'score_qualify',
    label: 'Score & Qualify',
    description: 'Prioritize leads that match the ICP',
  },
  {
    id: 4,
    key: 'generate_outreach',
    label: 'Generate Personalized Outreach',
    description: 'AI writes email, social, and ad copy',
  },
  {
    id: 5,
    key: 'launch_channels',
    label: 'Launch Email + Social + Ads',
    description: 'Go live across selected channels',
  },
  {
    id: 6,
    key: 'capture_replies',
    label: 'Capture Replies & Leads',
    description: 'Inbox and ad leads flow into one place',
  },
  {
    id: 7,
    key: 'ai_proposes',
    label: 'AI Proposes Response',
    description: 'Reply copilot drafts the next message',
  },
  {
    id: 8,
    key: 'user_sends',
    label: 'User Sends / Edits / Customizes',
    description: 'Approve, edit, or send suggested replies',
  },
  {
    id: 9,
    key: 'book_meeting',
    label: 'Book Meeting / Send Proposal',
    description: 'Convert interest into a calendar slot or proposal',
  },
  {
    id: 10,
    key: 'move_pipeline',
    label: 'Move Lead in CRM Pipeline',
    description: 'Stage updates follow the conversation',
  },
  {
    id: 11,
    key: 'win_customer',
    label: 'Win Customer',
    description: 'Mark the deal won and lock revenue',
  },
  {
    id: 12,
    key: 'onboard_retain',
    label: 'Onboarding, Upsell & Retention',
    description: 'Keep customers and expand the account',
  },
] as const;

export type DiscoveryWorkflowKey = (typeof DISCOVERY_WORKFLOW)[number]['key'];

export type WorkflowStepStatus = 'done' | 'current' | 'upcoming' | 'blocked';

export type CampaignWorkflowStep = {
  id: number;
  key: DiscoveryWorkflowKey;
  label: string;
  description: string;
  status: WorkflowStepStatus;
  count?: number;
};

export type CampaignWorkflow = {
  campaignId: string;
  currentStep: number;
  completedCount: number;
  steps: CampaignWorkflowStep[];
};

export const FLA_AGENTS = [
  {
    id: 'discovery',
    label: 'Lead Discovery',
    description: 'Finds prospects from providers, Places, forms, and CRM',
  },
  {
    id: 'enrichment',
    label: 'Enrichment & Verification',
    description: 'Cleans emails and fills missing firmographic data',
  },
  {
    id: 'scoring',
    label: 'Scoring',
    description: 'Ranks ICP fit so outreach starts with the best leads',
  },
  {
    id: 'ads',
    label: 'Ads AI',
    description: 'Builds audiences, copy, creatives, and spend plans',
  },
  {
    id: 'outreach',
    label: 'Outreach Copilot',
    description: 'Personalizes email and social sequences',
  },
  {
    id: 'replies',
    label: 'Reply Copilot',
    description: 'Drafts replies for send, edit, or schedule',
  },
  {
    id: 'pipeline',
    label: 'Pipeline',
    description: 'Moves leads through CRM as conversations progress',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    description: 'Tracks ROI, meetings, and pipeline value',
  },
  {
    id: 'automation',
    label: 'Automation & Guardrails',
    description: 'Cloud autopilot, queues, retries, and emergency pause',
  },
] as const;

export type SequenceStep = {
  id: string;
  step: number;
  type: SequenceStepType;
  subject: string;
  body: string;
  delayDays: number;
  conditions: string;
  attachments: string[];
  approved: boolean;
};

export type LeadEligibility = {
  total: number;
  verified: number;
  catchAll: number;
  risky: number;
  invalid: number;
  duplicates: number;
  suppressed: number;
  excluded: number;
  /** Optional pending verification count when available */
  pending?: number;
  /** @deprecated Prefer `suppressed` */
  unsubscribed: number;
};

export type CampaignAudience = {
  industries: string[];
  locations: string[];
  companySizes: string[];
  jobTitles: string[];
  minLeadScore: number;
  allowedVerification: string[];
  dailySendingLimit: number;
  sendingDays: string[];
  sendingHoursStart: string;
  sendingHoursEnd: string;
  mailboxId: string;
  calendarLink: string;
  excludeExistingCustomers: boolean;
};

export type CampaignSchedule = {
  startOption: 'now' | 'later' | 'countdown';
  startAt: string;
  countdownHours: number;
  timeZone: string;
  quietHoursStart: string;
  quietHoursEnd: string;
};

export type CampaignChannelsConfig = Record<CampaignChannelId, boolean>;

export type AdCreative = {
  id: string;
  platform: AdPlatformId;
  headline: string;
  primaryText: string;
  description: string;
  cta: string;
  audience: string;
};

export type CampaignAdsConfig = {
  platforms: AdPlatformId[];
  prompt: string;
  dailyBudget: number;
  totalBudget: number;
  creatives: AdCreative[];
  launchMode: 'approval' | 'autopilot';
  adAccountIds: string[];
};

export type CampaignWizardData = {
  name: string;
  goal: CampaignGoal | '';
  product: string;
  website: string;
  offer: string;
  pricing: string;
  budget: number;
  brandTone: BrandTone;
  documents: string[];
  /** AI builder prompt (also sent as `ai_prompt` / `prompt` to the API) */
  aiPrompt: string;
  audience: CampaignAudience;
  leadSources: LeadSourceId[];
  eligibility: LeadEligibility;
  sequence: SequenceStep[];
  schedule: CampaignSchedule;
  channels: CampaignChannelsConfig;
  ads: CampaignAdsConfig;
  crmConnected: boolean;
  /** Top-level sender mailbox (synced from audience settings) */
  mailbox: string;
  /** Top-level calendar booking link */
  calendarLink: string;
  /** Launch step mode: Draft / Approval / Autopilot */
  launchMode: 'draft' | 'approval' | 'autopilot';
  approvalMode: boolean;
  /** Lead UUIDs selected in the Leads step for campaign assignment */
  selectedLeadIds: string[];
};

export type CampaignMetricPoint = {
  date: string;
  sent: number;
  delivered: number;
  replies: number;
};

export type CampaignDashboard = {
  id: string;
  name: string;
  status: CampaignStatus;
  goal: string;
  product: string;
  mailbox: string;
  deliverability: 'healthy' | 'warning' | 'critical';
  dailyLimit: number;
  estimatedCredits: number;
  metrics: {
    leadsAdded: number;
    readyToSend: number;
    sent: number;
    delivered: number;
    bounced: number;
    replies: number;
    positiveReplies: number;
    meetingsBooked: number;
    unsubscribes: number;
    revenueGenerated: number;
  };
  rates: {
    openRate: number;
    replyRate: number;
    bounceRate: number;
    unsubscribeRate: number;
    meetingRate: number;
    positiveReplyRate: number;
  };
  performance: CampaignMetricPoint[];
  eligibility: LeadEligibility;
  sequence: SequenceStep[];
  schedule: CampaignSchedule;
  createdAt: string;
  updatedAt: string;
};

export type CampaignListItem = {
  id: string;
  name: string;
  status: CampaignStatus;
  leadsCount: number;
  sequencesCount: number;
  leadsSent: number;
  repliesReceived: number;
  goal?: string | null;
  product?: string | null;
  budget?: number | null;
  channels?: CampaignChannelId[];
  launchMode?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export const PERSONALIZATION_VARS = [
  '{{first_name}}',
  '{{company}}',
  '{{job_title}}',
  '{{industry}}',
  '{{pain_point}}',
  '{{calendar_link}}',
] as const;

export const WIZARD_STEPS = [
  {
    id: 1,
    key: 'business',
    label: 'Business',
    description: 'Website, product, offer, goal, budget, brand',
  },
  {
    id: 2,
    key: 'audience',
    label: 'Audience',
    description: 'ICP, titles, locations, lead score',
  },
  {
    id: 3,
    key: 'sources',
    label: 'Sources',
    description: 'Data sources and eligible leads',
  },
  {
    id: 4,
    key: 'channels',
    label: 'Channels',
    description: 'Email, social, ads, chat, calendar, CRM',
  },
  {
    id: 5,
    key: 'outreach',
    label: 'Outreach',
    description: 'Personalized email sequence',
  },
  {
    id: 6,
    key: 'schedule',
    label: 'Schedule',
    description: 'Timing, quiet hours, cloud autopilot',
  },
  {
    id: 7,
    key: 'review',
    label: 'Review',
    description: 'Preview, eligibility, 12-step plan',
  },
  {
    id: 8,
    key: 'launch',
    label: 'Launch',
    description: 'Draft, approval, or autopilot',
  },
] as const;

export const WIZARD_STEP = {
  BUSINESS: 1,
  AUDIENCE: 2,
  SOURCES: 3,
  CHANNELS: 4,
  OUTREACH: 5,
  SCHEDULE: 6,
  REVIEW: 7,
  LAUNCH: 8,
} as const;
