import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  AiProvider,
  CAMPAIGN_ADS_PROMPT,
  CAMPAIGN_DETAILS_PROMPT,
  CAMPAIGN_SEQUENCE_PROMPT,
  CampaignAdsAiResult,
  CampaignDetailsAiResult,
  CampaignGoalAi,
  CampaignSequenceAiResult,
  CampaignSequenceStepAi,
  DRAFT_SYSTEM_PROMPT,
  DraftLeadContext,
  DraftProductContext,
  EmailDraftResult,
  REPLY_CLASSIFICATION_PROMPT,
  REPLY_COMPOSE_PROMPT,
  ReplyClassificationIntent,
  ReplyClassificationResult,
  ReplyComposeResult,
  ReplyTransformAction,
} from './ai.provider';

type OpenAiDraftJson = {
  subject?: string;
  body?: string;
  evidence_used?: string[];
};

type OpenAiClassificationJson = {
  intent?: string;
  sentiment?: string;
  confidence?: number;
  evidence?: string[];
  recommended_response?: string;
  next_best_action?: string;
  suggested_pipeline_stage?: string;
  return_date?: string | null;
};

const PIPELINE_STAGES = new Set([
  'NEW',
  'CONTACTED',
  'REPLIED',
  'QUALIFIED',
  'MEETING_SCHEDULED',
  'NEGOTIATION',
  'CONVERTED',
  'LOST',
  'BOUNCED',
  'NURTURE',
]);

type OpenAiReplyJson = {
  subject?: string;
  body?: string;
};

const VALID_INTENTS: ReplyClassificationIntent[] = [
  'meeting_request',
  'positive_interest',
  'pricing_question',
  'unsubscribe',
  'objection',
  'out_of_office',
  'negative',
  'spam',
];

@Injectable()
export class OpenAiProvider implements AiProvider {
  private readonly logger = new Logger(OpenAiProvider.name);
  private readonly client: OpenAI;
  readonly modelName: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey || apiKey.startsWith('sk-your-')) {
      this.logger.warn(
        'OPENAI_API_KEY is missing or still a placeholder — AI calls will fail until configured',
      );
    }

    this.client = new OpenAI({
      apiKey: apiKey || 'missing-key',
    });
    this.modelName = this.config.get<string>('OPENAI_MODEL', 'gpt-4o');
  }

  async generateEmailDraft(
    lead: DraftLeadContext,
    product: DraftProductContext,
  ): Promise<EmailDraftResult> {
    const prospectName = [lead.contact.firstName, lead.contact.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    const facts = {
      prospect: {
        name: prospectName || null,
        email: lead.contact.email,
        title: lead.contact.title,
        phone: lead.contact.phone,
      },
      company: {
        name: lead.company.name,
      },
      product: {
        name: product.name,
        description: product.description,
        valueProps: product.valueProps,
      },
      leadStatus: lead.status,
    };

    try {
      const completion = await this.client.chat.completions.create({
        model: this.modelName,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: DRAFT_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Write a short personalized 1:1 outreach email (not a marketing blast) using only these facts. Return JSON with subject, body, evidence_used (array of fact keys you used).\n\n${JSON.stringify(facts, null, 2)}`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        throw new ServiceUnavailableException(
          'OpenAI returned an empty draft response',
        );
      }

      const parsed = JSON.parse(raw) as OpenAiDraftJson;
      if (!parsed.subject || !parsed.body) {
        throw new ServiceUnavailableException(
          'OpenAI draft response missing subject or body',
        );
      }

      return {
        subject: parsed.subject,
        body: parsed.body,
        evidence_used: Array.isArray(parsed.evidence_used)
          ? parsed.evidence_used.map(String)
          : [],
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'Unknown OpenAI error';
      this.logger.error(`Draft generation failed: ${message}`);
      throw new ServiceUnavailableException(
        `Failed to generate email draft: ${message}`,
      );
    }
  }

  async classifyReply(input: {
    subject: string;
    body: string;
    fromEmail: string;
  }): Promise<ReplyClassificationResult> {
    const userPrompt = [
      `From: ${input.fromEmail}`,
      `Subject: ${input.subject}`,
      '',
      input.body,
    ].join('\n');

    try {
      const completion = await this.client.chat.completions.create({
        model: this.modelName,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: REPLY_CLASSIFICATION_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        throw new ServiceUnavailableException(
          'OpenAI returned an empty classification response',
        );
      }

      const parsed = JSON.parse(raw) as OpenAiClassificationJson;
      const intent = (parsed.intent || '').toLowerCase().trim();
      const sentiment = (parsed.sentiment || 'neutral').toLowerCase().trim();
      const confidence = Number(parsed.confidence);

      if (!VALID_INTENTS.includes(intent as ReplyClassificationIntent)) {
        throw new ServiceUnavailableException(
          `Unexpected classification intent: ${parsed.intent}`,
        );
      }

      if (!['positive', 'neutral', 'negative'].includes(sentiment)) {
        throw new ServiceUnavailableException(
          `Unexpected classification sentiment: ${parsed.sentiment}`,
        );
      }

      const evidence = Array.isArray(parsed.evidence)
        ? parsed.evidence
            .filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
            .map((e) => e.trim())
            .slice(0, 5)
        : [];

      const stageRaw = (parsed.suggested_pipeline_stage || 'REPLIED')
        .toUpperCase()
        .trim()
        .replace(/\s+/g, '_');
      const suggested_pipeline_stage = PIPELINE_STAGES.has(stageRaw)
        ? stageRaw
        : 'REPLIED';

      return {
        intent: intent as ReplyClassificationIntent,
        sentiment: sentiment as ReplyClassificationResult['sentiment'],
        confidence: Number.isFinite(confidence)
          ? Math.min(1, Math.max(0, confidence))
          : 0,
        evidence,
        recommended_response:
          typeof parsed.recommended_response === 'string' &&
          parsed.recommended_response.trim()
            ? parsed.recommended_response.trim()
            : 'Reply helpfully and keep the conversation moving.',
        next_best_action:
          typeof parsed.next_best_action === 'string' &&
          parsed.next_best_action.trim()
            ? parsed.next_best_action.trim()
            : 'Review thread and reply',
        suggested_pipeline_stage,
        return_date: parsed.return_date ?? null,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      const message =
        error instanceof Error ? error.message : 'Unknown OpenAI error';
      this.logger.error(`Reply classification failed: ${message}`);
      throw new ServiceUnavailableException(
        `Failed to classify reply: ${message}`,
      );
    }
  }

  async composeReply(input: {
    contactName: string;
    companyName: string | null;
    subject: string;
    threadSummary: string;
    intent: string | null;
    sentiment: string | null;
    instruction?: string;
  }): Promise<ReplyComposeResult> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.modelName,
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: REPLY_COMPOSE_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              contactName: input.contactName,
              companyName: input.companyName,
              subject: input.subject,
              intent: input.intent,
              sentiment: input.sentiment,
              instruction: input.instruction ?? 'Write a helpful sales reply.',
              threadSummary: input.threadSummary,
            }),
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        throw new ServiceUnavailableException(
          'OpenAI returned an empty reply draft',
        );
      }
      const parsed = JSON.parse(raw) as OpenAiReplyJson;
      if (!parsed.body) {
        throw new ServiceUnavailableException(
          'OpenAI reply draft missing body',
        );
      }
      return {
        subject: parsed.subject || `Re: ${input.subject}`,
        body: parsed.body,
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const message =
        error instanceof Error ? error.message : 'Unknown OpenAI error';
      this.logger.error(`Reply compose failed: ${message}`);
      throw new ServiceUnavailableException(
        `Failed to compose reply: ${message}`,
      );
    }
  }

  async transformReply(input: {
    body: string;
    action: ReplyTransformAction;
    tone?: string;
    language?: string;
    customInstruction?: string;
  }): Promise<{ body: string }> {
    const actionPrompt: Record<ReplyTransformAction, string> = {
      shorten: 'Make this email shorter and tighter while keeping the meaning.',
      expand: 'Expand this email with slightly more detail and warmth.',
      translate: `Translate this email into ${input.language || 'Spanish'}. Keep a professional tone.`,
      change_tone: `Rewrite this email in a ${input.tone || 'professional and confident'} tone.`,
      add_pricing:
        'Rewrite and add a short note that pricing depends on scope and you can share a tailored quote on a call. Do not invent numbers.',
      add_calendar_link:
        'Rewrite and invite them to book time, including a placeholder calendar link: https://cal.flacron.example/meet.',
      add_proposal:
        'Rewrite and offer to send a short proposal outline after a discovery call.',
      regenerate:
        'Rewrite this email with a fresh angle while keeping the goal.',
      custom:
        input.customInstruction ||
        'Improve clarity and professionalism of this email.',
    };

    try {
      const completion = await this.client.chat.completions.create({
        model: this.modelName,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You rewrite sales emails. Return JSON with a single "body" string. Do not invent facts or pricing numbers.',
          },
          {
            role: 'user',
            content: `${actionPrompt[input.action]}\n\nEMAIL:\n${input.body}`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        throw new ServiceUnavailableException(
          'OpenAI returned an empty transform response',
        );
      }
      const parsed = JSON.parse(raw) as OpenAiReplyJson;
      if (!parsed.body) {
        throw new ServiceUnavailableException(
          'OpenAI transform response missing body',
        );
      }
      return { body: parsed.body };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const message =
        error instanceof Error ? error.message : 'Unknown OpenAI error';
      this.logger.error(`Reply transform failed: ${message}`);
      throw new ServiceUnavailableException(
        `Failed to transform reply: ${message}`,
      );
    }
  }

  async generateCampaignDetails(input: {
    prompt: string;
    productHint?: string;
  }): Promise<CampaignDetailsAiResult> {
    const goals: CampaignGoalAi[] = [
      'book_meetings',
      'collect_replies',
      'nurture',
      'announce',
      'reengage',
      'win_customers',
    ];
    const goalAliases: Record<string, CampaignGoalAi> = {
      book_meetings: 'book_meetings',
      'book meetings': 'book_meetings',
      meetings: 'book_meetings',
      collect_replies: 'collect_replies',
      'collect replies': 'collect_replies',
      replies: 'collect_replies',
      nurture: 'nurture',
      'nurture leads': 'nurture',
      announce: 'announce',
      'product announcement': 'announce',
      reengage: 'reengage',
      're-engage': 'reengage',
      're-engage cold leads': 'reengage',
    };
    const verificationAllowed = new Set([
      'VERIFIED',
      'CATCH_ALL',
      'RISKY',
      'PENDING',
    ]);

    try {
      const completion = await this.client.chat.completions.create({
        model: this.modelName,
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CAMPAIGN_DETAILS_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              prompt: input.prompt,
              productHint: input.productHint ?? null,
            }),
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        throw new ServiceUnavailableException(
          'OpenAI returned an empty campaign details response',
        );
      }

      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const audienceRaw =
        parsed.audience && typeof parsed.audience === 'object'
          ? (parsed.audience as Record<string, unknown>)
          : {};

      const asStringArray = (value: unknown): string[] =>
        Array.isArray(value)
          ? value
              .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
              .map((v) => v.trim())
              .slice(0, 12)
          : typeof value === 'string' && value.trim()
            ? value
                .split(/[,;|]/)
                .map((v) => v.trim())
                .filter(Boolean)
                .slice(0, 12)
            : [];

      const goalRaw = String(parsed.goal || 'book_meetings')
        .toLowerCase()
        .trim()
        .replace(/-/g, '_');
      const goal =
        goalAliases[goalRaw] ||
        goalAliases[goalRaw.replace(/_/g, ' ')] ||
        (goals.includes(goalRaw as CampaignGoalAi)
          ? (goalRaw as CampaignGoalAi)
          : 'book_meetings');

      const minLeadScore = Number(
        audienceRaw.minLeadScore ?? audienceRaw.min_lead_score,
      );
      const allowedVerification = asStringArray(
        audienceRaw.allowedVerification ?? audienceRaw.allowed_verification,
      )
        .map((v) => v.toUpperCase().replace(/\s+/g, '_'))
        .filter((v) => verificationAllowed.has(v));

      const name = String(
        parsed.name || parsed.campaignName || parsed.campaign_name || '',
      )
        .trim()
        .slice(0, 72);
      const product = String(
        parsed.product ||
          parsed.productService ||
          parsed.product_service ||
          input.productHint ||
          '',
      )
        .trim()
        .slice(0, 120);

      if (!name) {
        throw new ServiceUnavailableException(
          'OpenAI campaign details missing name',
        );
      }

      const result: CampaignDetailsAiResult = {
        name,
        goal,
        product: product || 'Flacron Lead Agent',
        website: String(parsed.website || '').trim().slice(0, 200) || undefined,
        offer: String(parsed.offer || '').trim().slice(0, 200) || undefined,
        pricing: String(parsed.pricing || '').trim().slice(0, 200) || undefined,
        budget: Number.isFinite(Number(parsed.budget))
          ? Math.max(0, Math.round(Number(parsed.budget)))
          : undefined,
        brandTone: String(parsed.brandTone || parsed.brand_tone || '').trim() || undefined,
        audience: {
          industries: asStringArray(
            audienceRaw.industries ?? audienceRaw.industry,
          ),
          locations: asStringArray(
            audienceRaw.locations ?? audienceRaw.location,
          ),
          jobTitles: asStringArray(
            audienceRaw.jobTitles ?? audienceRaw.job_titles ?? audienceRaw.titles,
          ),
          minLeadScore: Number.isFinite(minLeadScore)
            ? Math.min(100, Math.max(0, Math.round(minLeadScore)))
            : 30,
          allowedVerification:
            allowedVerification.length > 0
              ? allowedVerification
              : ['VERIFIED', 'CATCH_ALL'],
        },
      };

      this.logger.log(
        `Campaign details generated: name="${result.name}" goal=${result.goal} industries=${result.audience.industries.length} locations=${result.audience.locations.length} titles=${result.audience.jobTitles.length}`,
      );

      return result;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const message =
        error instanceof Error ? error.message : 'Unknown OpenAI error';
      this.logger.error(`Campaign details generation failed: ${message}`);
      throw new ServiceUnavailableException(
        `Failed to generate campaign details: ${message}`,
      );
    }
  }

  async generateCampaignSequence(input: {
    prompt: string;
    name: string;
    goal: string;
    product: string;
    calendarLink?: string;
  }): Promise<CampaignSequenceAiResult> {
    const stepTypes = new Set([
      'Initial',
      'Follow-up',
      'Case study',
      'Final',
    ]);

    try {
      const completion = await this.client.chat.completions.create({
        model: this.modelName,
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CAMPAIGN_SEQUENCE_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              prompt: input.prompt,
              campaignName: input.name,
              goal: input.goal,
              product: input.product,
              calendarLink: input.calendarLink || '{{calendar_link}}',
            }),
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        throw new ServiceUnavailableException(
          'OpenAI returned an empty campaign sequence response',
        );
      }

      const parsed = JSON.parse(raw) as {
        steps?: Array<{
          type?: string;
          subject?: string;
          body?: string;
          delayDays?: number;
          conditions?: string;
        }>;
      };

      const steps: CampaignSequenceStepAi[] = (parsed.steps ?? [])
        .filter((s) => s && typeof s.subject === 'string' && typeof s.body === 'string')
        .slice(0, 6)
        .map((s, index) => {
          const typeRaw = (s.type || (index === 0 ? 'Initial' : 'Follow-up')).trim();
          const type = stepTypes.has(typeRaw)
            ? (typeRaw as CampaignSequenceStepAi['type'])
            : index === 0
              ? 'Initial'
              : 'Follow-up';
          const delayDays = Number(s.delayDays);
          return {
            type,
            subject: String(s.subject).trim().slice(0, 160),
            body: String(s.body).trim().slice(0, 4000),
            delayDays:
              Number.isFinite(delayDays) && delayDays >= 0
                ? Math.min(30, Math.round(delayDays))
                : index === 0
                  ? 0
                  : index * 2,
            conditions:
              typeof s.conditions === 'string' && s.conditions.trim()
                ? s.conditions.trim().slice(0, 80)
                : index === 0
                  ? 'Always'
                  : 'No reply',
          };
        });

      if (steps.length === 0) {
        throw new ServiceUnavailableException(
          'OpenAI campaign sequence returned no steps',
        );
      }

      return { steps };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const message =
        error instanceof Error ? error.message : 'Unknown OpenAI error';
      this.logger.error(`Campaign sequence generation failed: ${message}`);
      throw new ServiceUnavailableException(
        `Failed to generate campaign sequence: ${message}`,
      );
    }
  }

  async generateCampaignAds(input: {
    prompt: string;
    name?: string;
    product?: string;
    offer?: string;
    website?: string;
    brandTone?: string;
    platforms: string[];
    dailyBudget?: number;
  }): Promise<CampaignAdsAiResult> {
    const allowed = new Set([
      'meta',
      'google',
      'linkedin',
      'tiktok',
      'microsoft',
    ]);
    const platforms = (input.platforms ?? []).map((p) =>
      String(p).toLowerCase().trim(),
    ).filter((p) => allowed.has(p));

    try {
      const completion = await this.client.chat.completions.create({
        model: this.modelName,
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: CAMPAIGN_ADS_PROMPT },
          {
            role: 'user',
            content: JSON.stringify({
              prompt: input.prompt,
              campaignName: input.name ?? null,
              product: input.product ?? null,
              offer: input.offer ?? null,
              website: input.website ?? null,
              brandTone: input.brandTone ?? 'Professional',
              platforms,
              dailyBudget: input.dailyBudget ?? 50,
            }),
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      if (!raw) {
        throw new ServiceUnavailableException(
          'OpenAI returned an empty ads response',
        );
      }
      const parsed = JSON.parse(raw) as {
        creatives?: Array<{
          platform?: string;
          headline?: string;
          primaryText?: string;
          description?: string;
          cta?: string;
          audience?: string;
        }>;
      };

      const creatives = (parsed.creatives ?? [])
        .filter((c) => c && c.headline && c.primaryText)
        .map((c) => {
          const platform = String(c.platform || 'meta').toLowerCase();
          return {
            platform: allowed.has(platform)
              ? platform
              : platforms[0] || 'meta',
            headline: String(c.headline).trim().slice(0, 80),
            primaryText: String(c.primaryText).trim().slice(0, 300),
            description: String(c.description || '').trim().slice(0, 160),
            cta: String(c.cta || 'Learn more').trim().slice(0, 32),
            audience: String(c.audience || 'Ideal customer profile').trim().slice(0, 120),
          };
        });

      if (creatives.length === 0) {
        throw new ServiceUnavailableException('OpenAI ads returned no creatives');
      }
      return { creatives };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const message =
        error instanceof Error ? error.message : 'Unknown OpenAI error';
      this.logger.error(`Campaign ads generation failed: ${message}`);
      throw new ServiceUnavailableException(
        `Failed to generate ads: ${message}`,
      );
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const models = await this.client.models.list();
      return Boolean(models?.data);
    } catch (error) {
      this.logger.warn(
        `AI healthCheck failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
