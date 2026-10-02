export type DraftLeadContext = {
  id: string;
  status: string;
  contact: {
    firstName: string | null;
    lastName: string | null;
    email: string;
    title: string | null;
    phone: string | null;
  };
  company: {
    name: string | null;
  };
};

export type DraftProductContext = {
  id: string;
  name: string;
  description: string | null;
  valueProps: string[];
};

export type EmailDraftResult = {
  subject: string;
  body: string;
  evidence_used: string[];
};

export type ReplyClassificationIntent =
  | 'meeting_request'
  | 'positive_interest'
  | 'pricing_question'
  | 'unsubscribe'
  | 'objection'
  | 'out_of_office'
  | 'negative'
  | 'spam';

export type ReplyClassificationResult = {
  intent: ReplyClassificationIntent;
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
  /** Short evidence snippets quoted or inferred from the reply */
  evidence: string[];
  /** Short summary of how the rep should reply */
  recommended_response: string;
  /** Concrete next best action for the sales rep */
  next_best_action: string;
  /** Suggested CRM / pipeline stage (e.g. REPLIED, MEETING_SCHEDULED) */
  suggested_pipeline_stage: string;
  /** ISO date string when OOO return date can be inferred */
  return_date?: string | null;
};

export type ReplyComposeResult = {
  subject: string;
  body: string;
};

export type ReplyTransformAction =
  | 'shorten'
  | 'expand'
  | 'translate'
  | 'change_tone'
  | 'add_pricing'
  | 'add_calendar_link'
  | 'add_proposal'
  | 'regenerate'
  | 'custom';

export type CampaignGoalAi =
  | 'book_meetings'
  | 'collect_replies'
  | 'nurture'
  | 'announce'
  | 'reengage'
  | 'win_customers';

export type CampaignDetailsAiResult = {
  name: string;
  goal: CampaignGoalAi;
  product: string;
  website?: string;
  offer?: string;
  pricing?: string;
  budget?: number;
  brandTone?: string;
  audience: {
    industries: string[];
    locations: string[];
    jobTitles: string[];
    minLeadScore: number;
    allowedVerification: string[];
  };
};

export type CampaignSequenceStepAi = {
  type: 'Initial' | 'Follow-up' | 'Case study' | 'Final';
  subject: string;
  body: string;
  delayDays: number;
  conditions: string;
};

export type CampaignSequenceAiResult = {
  steps: CampaignSequenceStepAi[];
};

export type CampaignAdCreativeAi = {
  platform: string;
  headline: string;
  primaryText: string;
  description: string;
  cta: string;
  audience: string;
};

export type CampaignAdsAiResult = {
  creatives: CampaignAdCreativeAi[];
};

export const AI_PROVIDER = Symbol('AI_PROVIDER');

export interface AiProvider {
  generateEmailDraft(
    lead: DraftLeadContext,
    product: DraftProductContext,
  ): Promise<EmailDraftResult>;

  classifyReply(input: {
    subject: string;
    body: string;
    fromEmail: string;
  }): Promise<ReplyClassificationResult>;

  composeReply(input: {
    contactName: string;
    companyName: string | null;
    subject: string;
    threadSummary: string;
    intent: string | null;
    sentiment: string | null;
    instruction?: string;
  }): Promise<ReplyComposeResult>;

  transformReply(input: {
    body: string;
    action: ReplyTransformAction;
    tone?: string;
    language?: string;
    customInstruction?: string;
  }): Promise<{ body: string }>;

  generateCampaignDetails(input: {
    prompt: string;
    productHint?: string;
  }): Promise<CampaignDetailsAiResult>;

  generateCampaignSequence(input: {
    prompt: string;
    name: string;
    goal: string;
    product: string;
    calendarLink?: string;
  }): Promise<CampaignSequenceAiResult>;

  generateCampaignAds(input: {
    prompt: string;
    name?: string;
    product?: string;
    offer?: string;
    website?: string;
    brandTone?: string;
    platforms: string[];
    dailyBudget?: number;
  }): Promise<CampaignAdsAiResult>;

  /** Lightweight connectivity probe for load-balancer health checks */
  healthCheck(): Promise<boolean>;
}

export const DRAFT_PROMPT_VERSION = 'v3';

export const DRAFT_SYSTEM_PROMPT = `You write short personal emails that a busy professional would open — never marketing blasts.

Rules:
- Use only the provided facts. Never invent testimonials, pricing, or claims.
- Subject: 3–6 ordinary words, like a colleague wrote it (examples: "Quick question", "Idea for {company}", "{firstName} — quick note"). Forbidden in subject: product names, Unlock, Free, Guaranteed, Limited, Act now, AI-Powered, Revolutionary, Lead Generation, Agent, exclusive, offer, promo.
- Body: 40–90 words, plain text, warm and specific. One soft ask. No HTML, bullets, links, tracking, or CTAs like "Book a demo".
- Sign with a first name only. Do not add unsubscribe/legal footers.
- Return JSON only.`;

export const REPLY_CLASSIFICATION_PROMPT =
  "Analyze the following sales email reply. Return JSON only with: " +
  "'intent' (one of: meeting_request, positive_interest, pricing_question, unsubscribe, objection, out_of_office, negative, spam), " +
  "'sentiment' (positive/neutral/negative), " +
  "'confidence' (0 to 1), " +
  "'evidence' (array of 1–5 short strings: quoted phrases or concrete facts from the email that support the classification), " +
  "'recommended_response' (1–2 sentence summary of how the sales rep should reply), " +
  "'next_best_action' (one concrete action such as Call, Send Pricing, Schedule Demo, Book a demo), " +
  "'suggested_pipeline_stage' (one of: NEW, CONTACTED, REPLIED, QUALIFIED, MEETING_SCHEDULED, NEGOTIATION, CONVERTED, LOST, BOUNCED, NURTURE), " +
  "and 'return_date' (ISO-8601 date string when intent is out_of_office and a return date is mentioned; otherwise null).";

export const REPLY_COMPOSE_PROMPT =
  'You are a professional B2B sales rep writing a concise email reply. Return JSON with subject and body. Be helpful, specific, and avoid inventing pricing or product claims unless instructed.';

export const CAMPAIGN_DETAILS_PROMPT = `You design B2B outbound email campaign settings from a user prompt.
Return JSON only with camelCase keys:
- name: short campaign name (max 60 chars), not a copy of the full prompt
- goal: one of book_meetings, collect_replies, nurture, announce, reengage, win_customers (snake_case enum only)
- product: product/service name to pitch (derive from the prompt; e.g. "software worldwide" → a concrete software offering name)
- audience: object with industries (string[]), locations (string[]), jobTitles (string[]), minLeadScore (number 0-100), allowedVerification (subset of VERIFIED, CATCH_ALL, RISKY, PENDING)
Always populate industries, locations, and jobTitles with 2–6 practical targeting tags inferred from the prompt (even for short prompts). Prefer plain labels like "SaaS", "Software", "United States", "Remote / Global", "CEO", "CTO", "Founder".
Also include when you can infer them:
- website: company website URL or empty string
- offer: short offer statement
- pricing: pricing hint
- budget: suggested monthly campaign budget as a number
- brandTone: one of Professional, Friendly, Direct, Consultative, Bold
Do not invent fake company names.`;

export const CAMPAIGN_SEQUENCE_PROMPT = `You write a 4–5 step cold email sequence for B2B outreach.
Rules:
- Plain text only. Use merge tags when useful: {{first_name}}, {{company}}, {{job_title}}, {{industry}}, {{calendar_link}}
- Subjects: short and human (3–8 words). No spammy words.
- Bodies: 40–90 words, one soft ask, no HTML.
- Step types must be one of: Initial, Follow-up, Case study, Final
- delayDays: 0 for first step, then increasing (e.g. 2, 4, 7, 10)
- conditions: Always for step 1, otherwise "No reply"
Return JSON: { "steps": [ { "type", "subject", "body", "delayDays", "conditions" } ] }`;

export const CAMPAIGN_ADS_PROMPT = `You generate paid-ad creatives for B2B campaigns.
Return JSON only: { "creatives": [ { "platform", "headline", "primaryText", "description", "cta", "audience" } ] }
Rules:
- One creative per requested platform (meta, google, linkedin, tiktok, microsoft).
- Headlines max 40 characters. primaryText 80–140 characters. description max 90 characters.
- CTA is a short button label (Book a demo, Get pricing, Learn more, Start pilot).
- audience is a concise targeting summary.
- No fake testimonials, guarantees, or invented pricing.
- Match the brand tone if provided.`;
