export type LeadContact = {
  id: string;
  name: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  verification_status: string;
};

export type LeadAssignedUser = {
  id: string;
  email: string;
  name: string;
} | null;

export type LeadCampaign = {
  id: string;
  name: string;
} | null;

export type LeadRow = {
  id: string;
  status: string;
  pipelineStage: string;
  leadScore: number | null;
  scoreExplanation?: {
    score?: number;
    tier?: string;
    summary?: string;
    factors?: Array<{ key: string; label: string; points: number }>;
  } | null;
  qualification?: {
    need?: string;
    authority?: string;
    budget?: string;
    timing?: string;
    fit?: string;
    currentSolution?: string;
    nextAction?: string;
  } | null;
  industry: string | null;
  location: string | null;
  source: string | null;
  lastActivityAt: string | null;
  nextRecommendedAction: string | null;
  assignedUserId: string | null;
  campaignId: string | null;
  createdAt: string;
  updatedAt: string;
  contact: LeadContact;
  company: {
    name: string | null;
  };
  assignedUser: LeadAssignedUser;
  campaign: LeadCampaign;
  verification_status: string;
};

export const PIPELINE_STAGES = [
  'NEW',
  'ENRICHED',
  'READY',
  'CONTACTED',
  'ENGAGED',
  'REPLIED',
  'QUALIFIED',
  'MEETING_SCHEDULED',
  'WON',
  'UNQUALIFIED',
  'LOST',
  'BOUNCED',
  'COMPLAINED',
  'PAUSED',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const VERIFICATION_STATUSES = [
  'PENDING',
  'VERIFIED',
  'RISKY',
  'CATCH_ALL',
  'INVALID',
] as const;

export type VerificationStatusValue = (typeof VERIFICATION_STATUSES)[number];
