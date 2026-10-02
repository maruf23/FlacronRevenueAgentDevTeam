import type {
  CampaignDashboard,
  CampaignListItem,
  CampaignWizardData,
  SequenceStep,
} from '@/types/campaigns';

export const DEFAULT_CHANNELS: CampaignWizardData['channels'] = {
  email: true,
  social: false,
  ads: false,
  chat: false,
  calendar: true,
  crm: true,
};

export const DEFAULT_ADS: CampaignWizardData['ads'] = {
  platforms: ['meta', 'google'],
  prompt: '',
  dailyBudget: 50,
  totalBudget: 1500,
  creatives: [],
  launchMode: 'approval',
  adAccountIds: ['ads-meta-1'],
};

export const DEFAULT_WIZARD_DATA: CampaignWizardData = {
  name: '',
  goal: '',
  product: '',
  website: '',
  offer: '',
  pricing: '',
  budget: 2500,
  brandTone: 'Professional',
  documents: [],
  aiPrompt: '',
  audience: {
    industries: [],
    locations: [],
    companySizes: [],
    jobTitles: [],
    minLeadScore: 30,
    allowedVerification: ['VERIFIED', 'CATCH_ALL'],
    dailySendingLimit: 50,
    sendingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    sendingHoursStart: '09:00',
    sendingHoursEnd: '17:00',
    mailboxId: 'mailbox-1',
    calendarLink: '',
    excludeExistingCustomers: true,
  },
  leadSources: [],
  eligibility: {
    total: 0,
    verified: 0,
    catchAll: 0,
    risky: 0,
    invalid: 0,
    duplicates: 0,
    suppressed: 0,
    excluded: 0,
    unsubscribed: 0,
  },
  sequence: [],
  schedule: {
    startOption: 'now',
    startAt: '',
    countdownHours: 24,
    timeZone: 'America/Los_Angeles',
    quietHoursStart: '20:00',
    quietHoursEnd: '08:00',
  },
  mailbox: 'outreach@flacron.ai',
  calendarLink: '',
  channels: DEFAULT_CHANNELS,
  ads: DEFAULT_ADS,
  crmConnected: true,
  launchMode: 'draft',
  approvalMode: false,
  selectedLeadIds: [],
};

export type AdAccountStatus = 'connected' | 'needs_auth' | 'disconnected';

export const MOCK_AD_ACCOUNTS: {
  id: string;
  platform: 'meta' | 'google' | 'linkedin' | 'tiktok' | 'microsoft';
  label: string;
  status: AdAccountStatus;
}[] = [
  { id: 'ads-meta-1', platform: 'meta', label: 'Meta Ads — Flacron', status: 'connected' },
  { id: 'ads-google-1', platform: 'google', label: 'Google Ads — Flacron', status: 'connected' },
  { id: 'ads-linkedin-1', platform: 'linkedin', label: 'LinkedIn Ads — Flacron', status: 'needs_auth' },
  { id: 'ads-tiktok-1', platform: 'tiktok', label: 'TikTok Ads — Flacron', status: 'disconnected' },
  { id: 'ads-microsoft-1', platform: 'microsoft', label: 'Microsoft Ads — Flacron', status: 'connected' },
];

export const MOCK_CRM_OPTIONS = [
  { id: 'flacron', label: 'Flacron CRM (Built-in)' },
  { id: 'hubspot', label: 'HubSpot' },
  { id: 'salesforce', label: 'Salesforce' },
];

export const MOCK_MAILBOXES = [
  {
    id: 'mailbox-1',
    email: 'outreach@flacron.ai',
    label: 'outreach@flacron.ai (Connected)',
  },
  {
    id: 'mailbox-2',
    email: 'sales@flacron.ai',
    label: 'sales@flacron.ai (Connected)',
  },
  {
    id: 'mailbox-3',
    email: 'hello@flacron.ai',
    label: 'hello@flacron.ai (Warming)',
  },
];

export const MOCK_INDUSTRIES = [
  'Restoration',
  'Construction',
  'Property Management',
  'Insurance',
  'SaaS',
  'Software',
  'Technology',
  'Healthcare',
];

export const MOCK_LOCATIONS = [
  'Washington',
  'Oregon',
  'California',
  'Texas',
  'New York',
  'Remote / US',
  'Remote / Global',
  'United States',
  'Europe',
  'Worldwide',
];

export const MOCK_COMPANY_SIZES = [
  '1-10',
  '11-50',
  '51-200',
  '201-500',
  '500+',
];

export const MOCK_JOB_TITLES = [
  'Owner',
  'CEO',
  'CTO',
  'Founder',
  'VP Operations',
  'VP Engineering',
  'General Manager',
  'Director of Sales',
];

export function parseAiCampaignPrompt(prompt: string): Partial<CampaignWizardData> {
  const lower = prompt.toLowerCase();
  const name =
    prompt.length > 8
      ? prompt
          .replace(/^create a campaign for\s*/i, '')
          .replace(/\.$/, '')
          .slice(0, 72)
      : 'AI Generated Campaign';

  return {
    name: name.charAt(0).toUpperCase() + name.slice(1),
    goal: lower.includes('reply') ? 'collect_replies' : 'book_meetings',
    product: lower.includes('ar')
      ? 'Flacron AR Platform Demo'
      : 'Flacron Lead Agent',
    audience: {
      ...DEFAULT_WIZARD_DATA.audience,
      industries: lower.includes('restoration') ? ['Restoration'] : [],
      locations: lower.includes('wa') || lower.includes('washington')
        ? ['Washington']
        : [],
      jobTitles: lower.includes('owner')
        ? ['Owner', 'CEO', 'Founder']
        : ['Owner', 'Director of Sales'],
      minLeadScore: lower.includes('verified') ? 40 : 30,
      allowedVerification: lower.includes('verified')
        ? ['VERIFIED']
        : ['VERIFIED', 'CATCH_ALL'],
    },
  };
}

export function generateAiSequence(data: CampaignWizardData): SequenceStep[] {
  const product = data.product || 'our platform';
  const calendar = data.audience.calendarLink || '{{calendar_link}}';
  return [
    {
      id: 'step-1',
      step: 1,
      type: 'Initial',
      subject: `Quick question about {{company}}`,
      body: `Hi {{first_name}},\n\nI noticed {{company}} is growing in the {{industry}} space. We help teams like yours with ${product}.\n\nWould you be open to a quick intro?\n\nBest regards`,
      delayDays: 0,
      conditions: 'Always',
      attachments: [],
      approved: false,
    },
    {
      id: 'step-2',
      step: 2,
      type: 'Follow-up',
      subject: `Re: Quick question about {{company}}`,
      body: `Hi {{first_name}},\n\nJust bumping this in case it got buried. Happy to share how peers in {{industry}} use ${product}.\n\nWorth a 15-min chat?`,
      delayDays: 2,
      conditions: 'No reply',
      attachments: [],
      approved: false,
    },
    {
      id: 'step-3',
      step: 3,
      type: 'Case study',
      subject: `How a peer cut recovery time with ${product}`,
      body: `Hi {{first_name}},\n\nSharing a short case study relevant to {{job_title}}s dealing with {{pain_point}}.\n\nIf useful, grab time here: ${calendar}`,
      delayDays: 4,
      conditions: 'No reply',
      attachments: ['case-study.pdf'],
      approved: false,
    },
    {
      id: 'step-4',
      step: 4,
      type: 'Follow-up',
      subject: `Should I close your file?`,
      body: `Hi {{first_name}},\n\nI'll close the loop unless now is a better time. Happy to reconnect later.\n\n${calendar}`,
      delayDays: 7,
      conditions: 'No reply',
      attachments: [],
      approved: false,
    },
    {
      id: 'step-5',
      step: 5,
      type: 'Final',
      subject: `Last note from me`,
      body: `Hi {{first_name}},\n\nFinal note — if ${product} becomes relevant for {{company}}, I'm here.\n\nWishing you a strong quarter.`,
      delayDays: 10,
      conditions: 'No reply',
      attachments: [],
      approved: false,
    },
  ];
}

export function mockEligibilityFromSources(sourceCount: number): CampaignWizardData['eligibility'] {
  if (sourceCount === 0) {
    return DEFAULT_WIZARD_DATA.eligibility;
  }
  return {
    total: 125,
    verified: 98,
    catchAll: 12,
    risky: 10,
    invalid: 5,
    duplicates: 7,
    suppressed: 3,
    excluded: 25,
    unsubscribed: 3,
  };
}

export const MOCK_CAMPAIGNS: CampaignListItem[] = [
  {
    id: 'camp-restoration-wa',
    name: 'Restoration Company Owners - WA',
    status: 'RUNNING',
    leadsCount: 125,
    sequencesCount: 1,
    leadsSent: 86,
    repliesReceived: 18,
    createdAt: '2026-07-20T10:00:00Z',
    updatedAt: '2026-08-05T14:00:00Z',
  },
  {
    id: 'camp-saas-founders',
    name: 'SaaS Founders - West Coast',
    status: 'SCHEDULED',
    leadsCount: 64,
    sequencesCount: 1,
    leadsSent: 0,
    repliesReceived: 0,
    createdAt: '2026-08-01T09:00:00Z',
    updatedAt: '2026-08-04T11:00:00Z',
  },
  {
    id: 'camp-insurance',
    name: 'Insurance Adjusters Nurture',
    status: 'PAUSED',
    leadsCount: 210,
    sequencesCount: 1,
    leadsSent: 140,
    repliesReceived: 22,
    createdAt: '2026-06-12T08:00:00Z',
    updatedAt: '2026-08-02T16:00:00Z',
  },
  {
    id: 'camp-draft-demo',
    name: 'Flacron AR Demo Outreach',
    status: 'DRAFT',
    leadsCount: 0,
    sequencesCount: 0,
    leadsSent: 0,
    repliesReceived: 0,
    createdAt: '2026-08-05T12:00:00Z',
    updatedAt: '2026-08-05T12:00:00Z',
  },
  {
    id: 'camp-attention',
    name: 'Property Managers Q3',
    status: 'ATTENTION_REQUIRED',
    leadsCount: 88,
    sequencesCount: 1,
    leadsSent: 45,
    repliesReceived: 4,
    createdAt: '2026-07-01T10:00:00Z',
    updatedAt: '2026-08-05T09:00:00Z',
  },
];

const MOCK_SEQUENCE: SequenceStep[] = generateAiSequence({
  ...DEFAULT_WIZARD_DATA,
  name: 'Restoration Company Owners - WA',
  product: 'Flacron AR Platform Demo',
  audience: {
    ...DEFAULT_WIZARD_DATA.audience,
    calendarLink: 'https://cal.com/flacron/demo',
  },
});

export const MOCK_CAMPAIGN_DASHBOARD: CampaignDashboard = {
  id: 'camp-restoration-wa',
  name: 'Restoration Company Owners - WA',
  status: 'RUNNING',
  goal: 'Book Meetings',
  product: 'Flacron AR Platform Demo',
  mailbox: 'outreach@flacron.ai',
  deliverability: 'healthy',
  dailyLimit: 50,
  estimatedCredits: 125,
  metrics: {
    leadsAdded: 125,
    readyToSend: 39,
    sent: 86,
    delivered: 78,
    bounced: 2,
    replies: 18,
    positiveReplies: 11,
    meetingsBooked: 7,
    unsubscribes: 1,
    revenueGenerated: 18600,
  },
  rates: {
    openRate: 48.6,
    replyRate: 20.9,
    bounceRate: 2.3,
    unsubscribeRate: 0.6,
    meetingRate: 8.1,
    positiveReplyRate: 12.8,
  },
  performance: [
    { date: 'Jul 28', sent: 8, delivered: 7, replies: 1 },
    { date: 'Jul 29', sent: 12, delivered: 11, replies: 2 },
    { date: 'Jul 30', sent: 10, delivered: 9, replies: 1 },
    { date: 'Jul 31', sent: 14, delivered: 13, replies: 3 },
    { date: 'Aug 1', sent: 11, delivered: 10, replies: 2 },
    { date: 'Aug 2', sent: 9, delivered: 8, replies: 3 },
    { date: 'Aug 3', sent: 13, delivered: 12, replies: 4 },
    { date: 'Aug 4', sent: 9, delivered: 8, replies: 2 },
  ],
  eligibility: {
    total: 125,
    verified: 98,
    catchAll: 12,
    risky: 10,
    invalid: 5,
    duplicates: 7,
    suppressed: 3,
    excluded: 25,
    unsubscribed: 3,
  },
  sequence: MOCK_SEQUENCE,
  schedule: {
    startOption: 'now',
    startAt: '2026-07-28T09:00:00Z',
    countdownHours: 0,
    timeZone: 'America/Los_Angeles',
    quietHoursStart: '20:00',
    quietHoursEnd: '08:00',
  },
  createdAt: '2026-07-20T10:00:00Z',
  updatedAt: '2026-08-05T14:00:00Z',
};

export function getMockCampaignById(id: string): CampaignDashboard {
  const listItem = MOCK_CAMPAIGNS.find((c) => c.id === id);
  if (!listItem) {
    return { ...MOCK_CAMPAIGN_DASHBOARD, id, name: 'Campaign', status: 'DRAFT' };
  }
  return {
    ...MOCK_CAMPAIGN_DASHBOARD,
    id: listItem.id,
    name: listItem.name,
    status: listItem.status,
    metrics: {
      ...MOCK_CAMPAIGN_DASHBOARD.metrics,
      leadsAdded: listItem.leadsCount,
      sent: listItem.leadsSent,
      replies: listItem.repliesReceived,
      delivered: Math.round(listItem.leadsSent * 0.9),
      readyToSend: Math.max(0, listItem.leadsCount - listItem.leadsSent),
    },
  };
}

/** @deprecated Prefer SAFETY_CHECK_DEFS / resolveSafetyChecks from @/lib/safety-checks */
export const SAFETY_CHECKS = [
  {
    id: 'mailbox',
    label: 'No mailbox connected',
    passLabel: 'Mailbox connected',
    severity: 'critical' as const,
    active: false,
  },
  {
    id: 'dns',
    label: 'SPF/DKIM/DMARC issues',
    passLabel: 'SPF/DKIM/DMARC healthy',
    severity: 'warning' as const,
    active: false,
  },
  {
    id: 'bounce',
    label: 'Bounce rate is high',
    passLabel: 'Bounce rate healthy',
    severity: 'warning' as const,
    active: false,
  },
  {
    id: 'credits',
    label: 'Insufficient credits',
    passLabel: 'Credits available',
    severity: 'critical' as const,
    active: false,
  },
  {
    id: 'auth',
    label: 'Mailbox auth expired',
    passLabel: 'Mailbox auth valid',
    severity: 'critical' as const,
    active: false,
  },
];

export const AUTOMATIC_PROTECTIONS = [
  'Auto-pause on high bounce',
  'Stop on mailbox/auth issues',
  'Respect time zones & quiet hours',
  'Handle bounces, unsubscribes, spam',
  'Retry temporary failures',
  'Exclude suppressed contacts',
];
