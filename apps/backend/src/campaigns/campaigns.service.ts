import { Inject, Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  ApprovalStatus,
  CampaignLeadStatus,
  CampaignStatus,
  LeadStatus,
  MessageDirection,
  MessageStatus,
  Prisma,
  Role,
  SuppressionReason,
  VerificationStatus,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import {
  GenerateCampaignAdsDto,
  GenerateCampaignDetailsDto,
  GenerateCampaignSequenceDto,
} from './dto/generate-campaign-ai.dto';
import {
  AI_PROVIDER,
  AiProvider,
  DRAFT_PROMPT_VERSION,
  DraftLeadContext,
  DraftProductContext,
} from '../providers/ai.provider';
import { OpenAiProvider } from '../providers/openai.provider';
import { DomainDnsService } from '../deliverability/domain-dns.service';
import { CampaignAutomationService } from './campaign-automation.service';
import { CampaignLeadStatusService } from './campaign-lead-status.service';
import { SequenceQueueService } from '../sequences/sequence-queue.service';
import { SmtpMailService } from '../email/smtp-mail.service';
import { CAMPAIGN_EVENTS } from './campaign.events';

export type CampaignEligibility = {
  total: number;
  verified: number;
  catchAll: number;
  risky: number;
  invalid: number;
  duplicates: number;
  suppressed: number;
  excluded: number;
  /** @deprecated Prefer `suppressed`; kept for older clients */
  unsubscribed: number;
};

/** Buyer safety shape for Review step */
export type CampaignEligibilitySummary = {
  verified: number;
  catchAll: number;
  risky: number;
  invalid: number;
  duplicate: number;
  suppressed: number;
  eligible: number;
};

export type CampaignEmailPreview = {
  leadId: string;
  draftId: string | null;
  contactName: string;
  company: string | null;
  email: string;
  step: number;
  subject: string;
  body: string;
  source: 'ai' | 'template' | 'edited';
  locked: boolean;
  evidence: Array<{ label: string; value: string }>;
};

export type CampaignLaunchReadiness = {
  ready: boolean;
  blockers: string[];
};

export type CampaignLaunchBlockerChecks = {
  mailboxConnected: boolean;
  mailboxAuthValid: boolean;
  verificationComplete: boolean;
  eligibleLeadsExist: boolean;
  contentApproved: boolean;
  creditsSufficient: boolean;
  deliverabilitySafe: boolean;
  bounceRateHealthy: boolean;
};

export type CampaignLaunchBlockersResult = {
  blockers: string[];
  checks: CampaignLaunchBlockerChecks;
};

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_PROVIDER) private readonly aiProvider: AiProvider,
    private readonly config: ConfigService,
    private readonly domainDns: DomainDnsService,
    private readonly automation: CampaignAutomationService,
    private readonly sequenceQueue: SequenceQueueService,
    private readonly leadStatus: CampaignLeadStatusService,
    private readonly events: EventEmitter2,
    private readonly smtp: SmtpMailService,
  ) {}

  async create(workspaceId: string, dto: CreateCampaignDto) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const mapped = this.mapWizardPayload(dto);

    const campaign = await this.prisma.campaign.create({
      data: {
        workspaceId,
        name: mapped.name,
        status: CampaignStatus.DRAFT,
        goal: mapped.goal,
        product: mapped.product,
        prompt: mapped.prompt,
        audience: mapped.audience,
        schedule: mapped.schedule,
        mailbox: mapped.mailbox,
        calendarLink: mapped.calendarLink,
        settings: mapped.settings,
      },
    });

    return {
      campaignId: campaign.id,
      id: campaign.id,
      status: campaign.status,
    };
  }

  async generateDetailsWithAi(dto: GenerateCampaignDetailsDto) {
    return this.aiProvider.generateCampaignDetails({
      prompt: dto.prompt,
      productHint: dto.productHint,
    });
  }

  async generateSequenceWithAi(dto: GenerateCampaignSequenceDto) {
    return this.aiProvider.generateCampaignSequence({
      prompt: dto.prompt,
      name: dto.name?.trim() || 'Outbound campaign',
      goal: dto.goal?.trim() || 'book_meetings',
      product: dto.product?.trim() || 'Flacron Lead Agent',
      calendarLink: dto.calendarLink,
    });
  }

  async generateAdsWithAi(dto: GenerateCampaignAdsDto) {
    const platforms = (dto.platforms ?? ['meta', 'google']).map((p) =>
      String(p).toLowerCase().trim(),
    );
    try {
      const generated = await this.aiProvider.generateCampaignAds({
        prompt: dto.prompt,
        name: dto.name,
        product: dto.product,
        offer: dto.offer,
        website: dto.website,
        brandTone: dto.brandTone,
        platforms,
        dailyBudget: dto.dailyBudget,
      });
      return {
        creatives: generated.creatives.map((c, index) => ({
          id: `ad-${Date.now()}-${index + 1}`,
          ...c,
        })),
      };
    } catch (error) {
      this.logger.warn(
        `Ads AI falling back to templates: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { creatives: this.fallbackAdCreatives(dto, platforms) };
    }
  }

  async run(workspaceId: string, id: string) {
    const { blockers } = await this.getLaunchBlockers(workspaceId, id);
    if (blockers.length > 0) {
      throw new BadRequestException({
        message: blockers[0],
        blockers,
      });
    }
    const campaign = await this.prisma.campaign.findFirst({
      where: { id, workspaceId },
      select: { schedule: true },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }
    const delayMs = this.resolveScheduleDelayMs(campaign.schedule);
    const status =
      delayMs > 0 ? CampaignStatus.SCHEDULED : CampaignStatus.RUNNING;
    return this.update(workspaceId, id, {
      status,
      launchMode: 'autopilot',
      approvalMode: false,
    });
  }

  async list(workspaceId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaigns = await this.prisma.campaign.findMany({
      where: { workspaceId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        status: true,
        goal: true,
        product: true,
        mailbox: true,
        calendarLink: true,
        audience: true,
        schedule: true,
        settings: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { leads: true, sequences: true } },
      },
    });

    const campaignIds = campaigns.map((c) => c.id);
    const outboundSent =
      campaignIds.length === 0
        ? ([] as Array<{ campaignId: string | null; _count: { _all: number } }>)
        : await this.prisma.message.groupBy({
            by: ['campaignId'],
            where: {
              workspaceId,
              campaignId: { in: campaignIds },
              direction: MessageDirection.OUTBOUND,
              status: {
                in: [
                  MessageStatus.SENT,
                  MessageStatus.DELIVERED,
                  MessageStatus.BOUNCED,
                  MessageStatus.COMPLAINED,
                ],
              },
            },
            _count: { _all: true },
          });
    const inboundReplies =
      campaignIds.length === 0
        ? ([] as Array<{ campaignId: string | null; _count: { _all: number } }>)
        : await this.prisma.message.groupBy({
            by: ['campaignId'],
            where: {
              workspaceId,
              campaignId: { in: campaignIds },
              direction: MessageDirection.INBOUND,
            },
            _count: { _all: true },
          });

    const sentByCampaign = new Map(
      outboundSent
        .filter(
          (r): r is { campaignId: string; _count: { _all: number } } =>
            typeof r.campaignId === 'string',
        )
        .map((r) => [r.campaignId, r._count._all]),
    );
    const repliesByCampaign = new Map(
      inboundReplies
        .filter(
          (r): r is { campaignId: string; _count: { _all: number } } =>
            typeof r.campaignId === 'string',
        )
        .map((r) => [r.campaignId, r._count._all]),
    );

    return campaigns.map((campaign) => {
      // Wizard stores email steps in settings.sequence; Sequence rows are
      // only created on launch for observability (often 0 or 1).
      const settings =
        campaign.settings &&
        typeof campaign.settings === 'object' &&
        !Array.isArray(campaign.settings)
          ? (campaign.settings as Record<string, unknown>)
          : {};
      const settingsSteps = Array.isArray(settings.sequence)
        ? settings.sequence.length
        : 0;

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        goal: campaign.goal,
        product: campaign.product,
        mailbox: campaign.mailbox,
        calendarLink: campaign.calendarLink,
        audience: campaign.audience,
        schedule: campaign.schedule,
        leadsCount: campaign._count.leads,
        sequencesCount: settingsSteps || campaign._count.sequences,
        leadsSent: sentByCampaign.get(campaign.id) ?? 0,
        repliesReceived: repliesByCampaign.get(campaign.id) ?? 0,
        settings,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
      };
    });
  }

  async findOne(workspaceId: string, id: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id, workspaceId },
      include: {
        _count: { select: { leads: true, sequences: true } },
        sequences: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            name: true,
            status: true,
            stepOrder: true,
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    return campaign;
  }

  async update(workspaceId: string, id: string, dto: UpdateCampaignDto) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const existing = await this.prisma.campaign.findFirst({
      where: { id, workspaceId },
      select: { id: true, settings: true, status: true, schedule: true },
    });
    if (!existing) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    const mapped = this.mapWizardPayload(dto, existing.settings);
    const data: Prisma.CampaignUpdateInput = {};

    if (dto.name !== undefined) data.name = mapped.name;
    if (dto.goal !== undefined) data.goal = mapped.goal;
    if (dto.product !== undefined) data.product = mapped.product;
    if (dto.prompt !== undefined || dto.aiPrompt !== undefined || dto.ai_prompt !== undefined) {
      data.prompt = mapped.prompt;
    }
    if (dto.audience !== undefined) data.audience = mapped.audience;
    if (dto.schedule !== undefined) data.schedule = mapped.schedule;
    if (dto.mailbox !== undefined || this.hasAudienceMailbox(dto.audience)) {
      data.mailbox = mapped.mailbox;
    }
    if (
      dto.calendarLink !== undefined ||
      this.hasAudienceCalendar(dto.audience)
    ) {
      data.calendarLink = mapped.calendarLink;
    }
    if (
      dto.settings !== undefined ||
      dto.leadSources !== undefined ||
      dto.eligibility !== undefined ||
      dto.sequence !== undefined ||
      dto.approvalMode !== undefined ||
      dto.launchMode !== undefined ||
      dto.website !== undefined ||
      dto.offer !== undefined ||
      dto.pricing !== undefined ||
      dto.budget !== undefined ||
      dto.brandTone !== undefined ||
      dto.documents !== undefined ||
      dto.channels !== undefined ||
      dto.ads !== undefined ||
      dto.crmConnected !== undefined
    ) {
      data.settings = mapped.settings;
    }
    if (dto.status !== undefined) data.status = dto.status;

    const updated = await this.prisma.campaign.update({
      where: { id },
      data,
    });

    // Pause / stop / archive: cancel BullMQ workers immediately
    if (
      dto.status === CampaignStatus.PAUSED ||
      dto.status === CampaignStatus.COMPLETED ||
      dto.status === CampaignStatus.ARCHIVED ||
      dto.status === CampaignStatus.FAILED
    ) {
      const cancelMessages = dto.status !== CampaignStatus.PAUSED;
      try {
        await this.automation.haltCampaignJobs(workspaceId, id, {
          cancelMessages,
          reason: `status→${dto.status}`,
        });
      } catch (error) {
        this.logger.error(
          `Failed to halt campaign jobs for ${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
      if (dto.status === CampaignStatus.PAUSED) {
        try {
          await this.leadStatus.pauseCampaignLeads(workspaceId, id);
        } catch (error) {
          this.logger.error(
            `Failed to pause lead statuses for ${id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    // Approval / review-ready: notify owners with sample leads (Appendix D.4 / D.6)
    if (dto.status === CampaignStatus.NEEDS_REVIEW) {
      try {
        await this.notifyReviewReady(workspaceId, updated.id, updated.name);
      } catch (error) {
        this.logger.error(
          `Failed to notify review-ready for campaign ${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // Kick durable automation when moving into RUNNING / SCHEDULED
    if (
      dto.status === CampaignStatus.RUNNING ||
      dto.status === CampaignStatus.SCHEDULED
    ) {
      if (
        dto.status === CampaignStatus.RUNNING &&
        existing.status === CampaignStatus.PAUSED
      ) {
        try {
          await this.leadStatus.resumeCampaignLeads(workspaceId, id);
        } catch (error) {
          this.logger.error(
            `Failed to resume lead statuses for ${id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }

      // Safe auto-start gates (Appendix D.4)
      // Countdown/SCHEDULED requires supervisedAutomationEnabled.
      // Explicit Approve from NEEDS_REVIEW bypasses that flag but still checks mailbox/pause.
      const settingsRec = this.asSettingsRecord(updated.settings);
      const isAutopilotLaunch =
        settingsRec.launchMode === 'autopilot' ||
        dto.status === CampaignStatus.SCHEDULED;
      const isExplicitApprove =
        existing.status === CampaignStatus.NEEDS_REVIEW ||
        existing.status === CampaignStatus.PAUSED;
      if (isAutopilotLaunch && !isExplicitApprove) {
        const gates = await this.evaluateSafeAutoStartGates(workspaceId, id);
        if (!gates.allowed) {
          const held = await this.prisma.campaign.update({
            where: { id },
            data: { status: CampaignStatus.NEEDS_REVIEW },
          });
          try {
            await this.notifyReviewReady(
              workspaceId,
              id,
              updated.name,
              gates.blockers,
            );
          } catch (error) {
            this.logger.error(
              `Failed to notify after auto-start block for ${id}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
          this.logger.warn(
            `Auto-start blocked for campaign ${id}: ${gates.blockers.join('; ')}`,
          );
          return held;
        }
      }

      const delayMs =
        dto.status === CampaignStatus.SCHEDULED
          ? this.resolveScheduleDelayMs(updated.schedule)
          : 0;
      try {
        await this.automation.enqueueCampaignStart(workspaceId, id, delayMs);
      } catch (error) {
        this.logger.error(
          `Failed to enqueue campaign automation for ${id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return updated;
  }

  async pause(workspaceId: string, id: string) {
    return this.update(workspaceId, id, { status: CampaignStatus.PAUSED });
  }

  async resume(workspaceId: string, id: string) {
    return this.update(workspaceId, id, { status: CampaignStatus.RUNNING });
  }

  async stop(workspaceId: string, id: string) {
    return this.update(workspaceId, id, { status: CampaignStatus.COMPLETED });
  }

  async archive(workspaceId: string, id: string) {
    return this.update(workspaceId, id, { status: CampaignStatus.ARCHIVED });
  }

  async duplicate(workspaceId: string, id: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const source = await this.prisma.campaign.findFirst({
      where: { id, workspaceId },
    });
    if (!source) {
      throw new NotFoundException(`Campaign ${id} not found`);
    }

    const copy = await this.prisma.campaign.create({
      data: {
        workspaceId,
        name: `${source.name} (Copy)`,
        status: CampaignStatus.DRAFT,
        goal: source.goal,
        product: source.product,
        prompt: source.prompt,
        audience: source.audience ?? undefined,
        schedule: source.schedule ?? undefined,
        mailbox: source.mailbox,
        calendarLink: source.calendarLink,
        settings: source.settings ?? undefined,
      },
    });

    return {
      campaignId: copy.id,
      id: copy.id,
      status: copy.status,
      name: copy.name,
    };
  }

  /**
   * Detach leads that have not been contacted yet and cancel their pending messages.
   */
  async removeUnsentLeads(workspaceId: string, campaignId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: { id: true },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const leads = await this.prisma.lead.findMany({
      where: { workspaceId, campaignId },
      select: { id: true },
    });
    if (leads.length === 0) {
      return { removed: 0, cancelledMessages: 0 };
    }

    const leadIds = leads.map((l) => l.id);
    const contacted = await this.prisma.message.findMany({
      where: {
        workspaceId,
        leadId: { in: leadIds },
        direction: MessageDirection.OUTBOUND,
        status: {
          in: [
            MessageStatus.SENT,
            MessageStatus.DELIVERED,
            MessageStatus.BOUNCED,
            MessageStatus.COMPLAINED,
            MessageStatus.FAILED,
          ],
        },
      },
      select: { leadId: true },
      distinct: ['leadId'],
    });
    const contactedSet = new Set(contacted.map((m) => m.leadId));
    const unsentIds = leadIds.filter((id) => !contactedSet.has(id));

    if (unsentIds.length === 0) {
      return { removed: 0, cancelledMessages: 0 };
    }

    let cancelledMessages = 0;
    for (const leadId of unsentIds) {
      const responses = await this.events.emitAsync(
        CAMPAIGN_EVENTS.MANUAL_REMOVE,
        {
          workspaceId,
          leadId,
          reason: 'manual.remove',
        },
      );
      const first = Array.isArray(responses)
        ? (responses.find(
            (r) => r && typeof r === 'object' && 'cancelledMessages' in r,
          ) as { cancelledMessages?: number } | undefined)
        : undefined;
      cancelledMessages += first?.cancelledMessages ?? 0;
    }

    // Detach any remaining unsent leads (handler may already clear campaignId)
    await this.prisma.lead.updateMany({
      where: { workspaceId, id: { in: unsentIds } },
      data: {
        campaignId: null,
        nextRecommendedAction: 'Unassigned from campaign',
        lastActivityAt: new Date(),
        leadStatus: null,
      },
    });

    return { removed: unsentIds.length, cancelledMessages };
  }

  /**
   * Update sequence templates for steps that have not been sent yet.
   * Rewrites DRAFT/SCHEDULED/QUEUED message subject/body for matching sequence steps.
   */
  async updateFutureSteps(
    workspaceId: string,
    campaignId: string,
    sequence: unknown[],
  ) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const existing = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: { id: true, settings: true },
    });
    if (!existing) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const prevSettings =
      existing.settings &&
      typeof existing.settings === 'object' &&
      !Array.isArray(existing.settings)
        ? (existing.settings as Record<string, unknown>)
        : {};

    const settings = {
      ...prevSettings,
      sequence,
    } as Prisma.InputJsonValue;

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: { settings },
    });

    const steps = sequence.filter(
      (s): s is Record<string, unknown> =>
        !!s && typeof s === 'object' && !Array.isArray(s),
    );

    let updatedMessages = 0;
    for (const step of steps) {
      const stepNum = Number(step.step);
      if (!Number.isFinite(stepNum) || stepNum < 1) continue;
      const subject =
        typeof step.subject === 'string' ? step.subject : undefined;
      const body = typeof step.body === 'string' ? step.body : undefined;
      if (!subject && !body) continue;

      const result = await this.prisma.message.updateMany({
        where: {
          workspaceId,
          sequenceStep: stepNum,
          status: {
            in: [
              MessageStatus.DRAFT,
              MessageStatus.SCHEDULED,
              MessageStatus.QUEUED,
            ],
          },
          lead: { campaignId },
        },
        data: {
          ...(subject ? { subject } : {}),
          ...(body ? { body } : {}),
        },
      });
      updatedMessages += result.count;
    }

    await this.prisma.sequence.updateMany({
      where: { workspaceId, campaignId },
      data: {
        stepOrder: steps.map((s) => ({
          step: Number(s.step) || 0,
          delayDays: Number(s.delayDays) || 0,
          subject: typeof s.subject === 'string' ? s.subject : '',
        })) as Prisma.InputJsonValue,
      },
    });

    return {
      campaignId,
      steps: steps.length,
      updatedMessages,
      sequence,
    };
  }

  async exportCampaign(
    workspaceId: string,
    campaignId: string,
    format: 'csv' | 'pdf' = 'csv',
  ): Promise<{ filename: string; contentType: string; body: Buffer }> {
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const leads = await this.prisma.lead.findMany({
      where: { workspaceId, campaignId },
      include: {
        contact: {
          select: {
            email: true,
            firstName: true,
            lastName: true,
            companyName: true,
            title: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const stats = await this.getStats(workspaceId, campaignId);
    const safeName = campaign.name.replace(/[^\w\-]+/g, '_').slice(0, 40);

    if (format === 'pdf') {
      const lines = [
        `Campaign: ${campaign.name}`,
        `Status: ${campaign.status}`,
        `Goal: ${campaign.goal ?? '-'}`,
        `Product: ${campaign.product ?? '-'}`,
        `Mailbox: ${campaign.mailbox ?? '-'}`,
        '',
        `Leads: ${stats.leadsAdded}`,
        `Sent: ${stats.sent}`,
        `Delivered: ${stats.delivered}`,
        `Replies: ${stats.replies}`,
        `Meetings: ${stats.meetingsBooked}`,
        `Bounced: ${stats.bounced}`,
        `Pipeline: $${stats.pipelineValue}`,
        '',
        'Leads',
        ...leads.map((l) => {
          const name = [l.contact.firstName, l.contact.lastName]
            .filter(Boolean)
            .join(' ')
            .trim();
          return `${l.contact.email} | ${name || '-'} | ${l.contact.companyName ?? '-'} | ${l.status}`;
        }),
      ];
      return {
        filename: `${safeName}-export.pdf`,
        contentType: 'application/pdf',
        body: this.buildSimplePdf(lines),
      };
    }

    const header = [
      'email',
      'first_name',
      'last_name',
      'company',
      'title',
      'lead_status',
      'lead_score',
      'campaign',
      'campaign_status',
    ];
    const rows = leads.map((l) =>
      [
        l.contact.email,
        l.contact.firstName ?? '',
        l.contact.lastName ?? '',
        l.contact.companyName ?? '',
        l.contact.title ?? '',
        l.status,
        l.leadScore ?? '',
        campaign.name,
        campaign.status,
      ]
        .map((v) => this.csvEscape(String(v)))
        .join(','),
    );
    const summary = [
      `# campaign,${this.csvEscape(campaign.name)}`,
      `# status,${campaign.status}`,
      `# leads,${stats.leadsAdded}`,
      `# sent,${stats.sent}`,
      `# delivered,${stats.delivered}`,
      `# replies,${stats.replies}`,
      `# meetings,${stats.meetingsBooked}`,
      '',
    ];
    const csv = [...summary, header.join(','), ...rows].join('\n');
    return {
      filename: `${safeName}-export.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: Buffer.from(csv, 'utf8'),
    };
  }

  private csvEscape(value: string): string {
    if (/[",\n\r]/.test(value)) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private buildSimplePdf(lines: string[]): Buffer {
    const escapePdf = (s: string) =>
      s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    const contentLines = lines.slice(0, 60).map((line, i) => {
      const y = 780 - i * 14;
      return `BT /F1 10 Tf 40 ${y} Td (${escapePdf(line.slice(0, 110))}) Tj ET`;
    });
    const stream = contentLines.join('\n');
    const objects: string[] = [];
    objects.push('1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj');
    objects.push('2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj');
    objects.push(
      '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj',
    );
    objects.push(
      `4 0 obj<< /Length ${Buffer.byteLength(stream, 'utf8')} >>stream\n${stream}\nendstream\nendobj`,
    );
    objects.push(
      '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
    );

    let pdf = '%PDF-1.4\n';
    const offsets: number[] = [0];
    for (const obj of objects) {
      offsets.push(Buffer.byteLength(pdf, 'utf8'));
      pdf += `${obj}\n`;
    }
    const xrefStart = Buffer.byteLength(pdf, 'utf8');
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    for (let i = 1; i < offsets.length; i++) {
      pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
    pdf += `startxref\n${xrefStart}\n%%EOF`;
    return Buffer.from(pdf, 'utf8');
  }

  async assignLeads(
    workspaceId: string,
    campaignId: string,
    leadIds: string[],
  ): Promise<{ updated: number; skipped: number }> {
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: { id: true },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const uniqueIds = [...new Set(leadIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      return { updated: 0, skipped: 0 };
    }

    const existingLeads = await this.prisma.lead.findMany({
      where: {
        workspaceId,
        id: { in: uniqueIds },
      },
      select: {
        id: true,
        contact: { select: { verificationStatus: true } },
      },
    });

    const allowedStatuses = new Set<VerificationStatus>([
      VerificationStatus.VERIFIED,
      VerificationStatus.CATCH_ALL,
    ]);
    const assignableIds = existingLeads
      .filter((lead) => allowedStatuses.has(lead.contact.verificationStatus))
      .map((lead) => lead.id);
    const skipped = uniqueIds.length - assignableIds.length;

    if (assignableIds.length === 0) {
      return { updated: 0, skipped };
    }

    const result = await this.prisma.lead.updateMany({
      where: {
        workspaceId,
        id: { in: assignableIds },
      },
      data: {
        campaignId,
        lastActivityAt: new Date(),
        nextRecommendedAction: 'Await campaign send',
        leadStatus: CampaignLeadStatus.QUEUED,
      },
    });

    if (result.count > 0) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { updatedAt: new Date() },
      });
    }

    return {
      updated: result.count,
      skipped,
    };
  }

  async listCampaignLeads(workspaceId: string, campaignId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: { id: true },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const leads = await this.prisma.lead.findMany({
      where: { workspaceId, campaignId },
      include: {
        contact: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            companyName: true,
            title: true,
          },
        },
        messages: {
          where: {
            direction: MessageDirection.OUTBOUND,
            campaignId,
            status: {
              in: [
                MessageStatus.DRAFT,
                MessageStatus.QUEUED,
                MessageStatus.SCHEDULED,
                MessageStatus.SENDING,
              ],
            },
          },
          select: { scheduledAt: true, status: true, sequenceStep: true },
          orderBy: [{ scheduledAt: 'asc' }, { sequenceStep: 'asc' }],
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      campaignId,
      leads: leads.map((lead) => {
        const contactName =
          [lead.contact.firstName, lead.contact.lastName]
            .filter(Boolean)
            .join(' ')
            .trim() || lead.contact.email;
        const nextMessage = lead.messages[0] ?? null;
        const showNextSend =
          lead.leadStatus === CampaignLeadStatus.SCHEDULED ||
          lead.leadStatus === CampaignLeadStatus.QUEUED ||
          lead.leadStatus === CampaignLeadStatus.FOLLOW_UP_DUE;

        return {
          id: lead.id,
          contactName,
          email: lead.contact.email,
          company: lead.contact.companyName,
          title: lead.contact.title,
          pipelineStatus: lead.status,
          leadStatus: lead.leadStatus ?? CampaignLeadStatus.QUEUED,
          nextScheduledSend:
            showNextSend && nextMessage?.scheduledAt
              ? nextMessage.scheduledAt.toISOString()
              : null,
          nextSequenceStep: nextMessage?.sequenceStep ?? null,
          lastActivityAt: lead.lastActivityAt?.toISOString() ?? null,
          createdAt: lead.createdAt.toISOString(),
        };
      }),
    };
  }

  async getEligibility(
    workspaceId: string,
    campaignId: string,
  ): Promise<CampaignEligibility> {
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: { id: true, settings: true },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const leads = await this.prisma.lead.findMany({
      where: { workspaceId, campaignId },
      select: {
        id: true,
        contact: {
          select: {
            email: true,
            verificationStatus: true,
          },
        },
      },
    });

    const emails = leads.map((l) => l.contact.email.toLowerCase());
    const suppressedRows =
      emails.length === 0
        ? []
        : await this.prisma.suppressionEntry.findMany({
            where: {
              workspaceId,
              email: { in: [...new Set(emails)] },
            },
            select: { email: true, reason: true },
          });

    const suppressedEmails = new Set(
      suppressedRows.map((r) => r.email.toLowerCase()),
    );
    const unsubscribedEmails = new Set(
      suppressedRows
        .filter((r) => r.reason === SuppressionReason.UNSUBSCRIBE)
        .map((r) => r.email.toLowerCase()),
    );

    const emailCounts = new Map<string, number>();
    for (const email of emails) {
      emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    }
    const duplicateEmails = new Set(
      [...emailCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([email]) => email),
    );

    const counts: CampaignEligibility = {
      total: leads.length,
      verified: 0,
      catchAll: 0,
      risky: 0,
      invalid: 0,
      duplicates: 0,
      suppressed: 0,
      excluded: 0,
      unsubscribed: 0,
    };

    const seenEmails = new Set<string>();
    for (const lead of leads) {
      const email = lead.contact.email.toLowerCase();
      const isDuplicate =
        duplicateEmails.has(email) && seenEmails.has(email);
      seenEmails.add(email);

      if (suppressedEmails.has(email)) {
        counts.suppressed += 1;
        if (unsubscribedEmails.has(email)) counts.unsubscribed += 1;
        continue;
      }
      if (isDuplicate) {
        counts.duplicates += 1;
        continue;
      }

      switch (lead.contact.verificationStatus) {
        case VerificationStatus.VERIFIED:
          counts.verified += 1;
          break;
        case VerificationStatus.CATCH_ALL:
          counts.catchAll += 1;
          break;
        case VerificationStatus.RISKY:
          counts.risky += 1;
          break;
        case VerificationStatus.INVALID:
          counts.invalid += 1;
          break;
        default:
          // PENDING and unknown → treat as risky for send safety
          counts.risky += 1;
          break;
      }
    }

    counts.excluded =
      counts.risky + counts.invalid + counts.duplicates + counts.suppressed;

    const prevSettings =
      campaign.settings &&
      typeof campaign.settings === 'object' &&
      !Array.isArray(campaign.settings)
        ? (campaign.settings as Record<string, unknown>)
        : {};

    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        settings: {
          ...prevSettings,
          eligibility: counts,
        } as Prisma.InputJsonValue,
      },
    });

    return counts;
  }

  /**
   * Buyer-facing eligibility summary for the Campaign Review step.
   * Includes representative samples with why-qualified rationales (Appendix D.3).
   */
  async getEligibilitySummary(
    workspaceId: string,
    campaignId: string,
  ): Promise<
    CampaignEligibilitySummary & {
      total: number;
      samples: Array<{
        leadId: string;
        name: string;
        title: string | null;
        company: string | null;
        email: string;
        leadScore: number | null;
        verification: string;
        whyQualified: string;
      }>;
      selectionExplanation: string;
    }
  > {
    const counts = await this.getEligibility(workspaceId, campaignId);

    await this.prisma.setWorkspaceContext(workspaceId);
    const sampleLeads = await this.prisma.lead.findMany({
      where: { workspaceId, campaignId },
      take: 5,
      orderBy: [{ leadScore: 'desc' }, { createdAt: 'desc' }],
      include: {
        contact: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            companyName: true,
            title: true,
            verificationStatus: true,
          },
        },
      },
    });

    const samples = sampleLeads.map((l) => {
      const name =
        [l.contact.firstName, l.contact.lastName].filter(Boolean).join(' ') ||
        l.contact.email;
      const storedSummary =
        l.scoreExplanation &&
        typeof l.scoreExplanation === 'object' &&
        !Array.isArray(l.scoreExplanation)
          ? (l.scoreExplanation as Record<string, unknown>).summary
          : null;
      const whyQualified =
        typeof storedSummary === 'string' && storedSummary.trim()
          ? storedSummary
          : this.buildWhyQualified({
              verification: l.contact.verificationStatus,
              industry: l.industry,
              location: l.location,
              company: l.contact.companyName,
              title: l.contact.title,
              leadScore: l.leadScore,
            });
      return {
        leadId: l.id,
        name,
        title: l.contact.title,
        company: l.contact.companyName,
        email: l.contact.email,
        leadScore: l.leadScore,
        verification: l.contact.verificationStatus,
        whyQualified,
      };
    });

    const selectionExplanation = [
      `Pool: ${counts.total} assigned leads.`,
      `${counts.verified} verified and outreach-ready`,
      counts.suppressed ? `${counts.suppressed} suppressed` : null,
      counts.duplicates ? `${counts.duplicates} duplicates excluded` : null,
      counts.risky + counts.catchAll
        ? `${counts.risky + counts.catchAll} risky/catch-all held back`
        : null,
      counts.invalid ? `${counts.invalid} invalid` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    return {
      verified: counts.verified,
      catchAll: counts.catchAll,
      risky: counts.risky,
      invalid: counts.invalid,
      duplicate: counts.duplicates,
      suppressed: counts.suppressed,
      eligible: counts.verified,
      total: counts.total,
      samples,
      selectionExplanation,
    };
  }

  private buildWhyQualified(input: {
    verification: string;
    industry: string | null;
    location: string | null;
    company: string | null;
    title: string | null;
    leadScore: number | null;
  }): string {
    const parts: string[] = [];
    if (input.verification === VerificationStatus.VERIFIED) {
      parts.push('verified business email');
    } else {
      parts.push(`email ${input.verification.toLowerCase()}`);
    }
    if (input.title) parts.push(`role: ${input.title}`);
    if (input.company) parts.push(`company: ${input.company}`);
    if (input.industry) parts.push(`industry: ${input.industry}`);
    if (input.location) parts.push(`location: ${input.location}`);
    if (input.leadScore != null) parts.push(`fit ${input.leadScore}`);
    return parts.join(' · ');
  }

  async previewPersonalizedEmails(
    workspaceId: string,
    campaignId: string,
    options: { force?: boolean } = {},
  ): Promise<{ emails: CampaignEmailPreview[] }> {
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: {
        id: true,
        product: true,
        settings: true,
        calendarLink: true,
      },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const settings = this.asSettingsRecord(campaign.settings);
    const stored = this.readStoredPreviews(settings);
    const sample = await this.pickPreviewLeads(workspaceId, campaignId);

    if (sample.length === 0) {
      return { emails: [] };
    }

    const emails: CampaignEmailPreview[] = [];
    for (const lead of sample) {
      const existing = stored.find((p) => p.leadId === lead.id);
      if (existing && !options.force) {
        emails.push(existing);
        continue;
      }
      emails.push(
        await this.generatePreviewForLead(
          workspaceId,
          campaign,
          lead,
          settings,
        ),
      );
    }

    await this.persistPreviewEmails(campaignId, settings, emails);
    return { emails };
  }

  async regeneratePreviewEmail(
    workspaceId: string,
    campaignId: string,
    leadId: string,
  ): Promise<CampaignEmailPreview> {
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: {
        id: true,
        product: true,
        settings: true,
        calendarLink: true,
      },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const settings = this.asSettingsRecord(campaign.settings);
    const stored = this.readStoredPreviews(settings);
    const existing = stored.find((p) => p.leadId === leadId);
    if (existing?.locked) {
      throw new BadRequestException(
        'This draft is locked. Unlock it before regenerating.',
      );
    }

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, workspaceId, campaignId },
      include: { contact: true },
    });
    if (!lead) {
      throw new NotFoundException(`Lead ${leadId} not found on this campaign`);
    }

    const regenerated = await this.generatePreviewForLead(
      workspaceId,
      campaign,
      lead,
      settings,
    );
    const next = stored.filter((p) => p.leadId !== leadId);
    next.push(regenerated);
    await this.persistPreviewEmails(campaignId, settings, next);
    return regenerated;
  }

  async regenerateAllPreviewEmails(
    workspaceId: string,
    campaignId: string,
  ): Promise<{ emails: CampaignEmailPreview[] }> {
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: {
        id: true,
        product: true,
        settings: true,
        calendarLink: true,
      },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const settings = this.asSettingsRecord(campaign.settings);
    const stored = this.readStoredPreviews(settings);
    const sample = await this.pickPreviewLeads(workspaceId, campaignId);

    if (sample.length === 0) {
      return { emails: [] };
    }

    const emails: CampaignEmailPreview[] = [];
    for (const lead of sample) {
      const existing = stored.find((p) => p.leadId === lead.id);
      if (existing?.locked) {
        emails.push(existing);
        continue;
      }
      emails.push(
        await this.generatePreviewForLead(
          workspaceId,
          campaign,
          lead,
          settings,
        ),
      );
    }

    await this.persistPreviewEmails(campaignId, settings, emails);
    return { emails };
  }

  async updatePreviewEmail(
    workspaceId: string,
    campaignId: string,
    leadId: string,
    patch: { subject?: string; body?: string },
  ): Promise<CampaignEmailPreview> {
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: { id: true, settings: true },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const settings = this.asSettingsRecord(campaign.settings);
    const stored = this.readStoredPreviews(settings);
    const index = stored.findIndex((p) => p.leadId === leadId);
    if (index < 0) {
      throw new NotFoundException(`Preview draft for lead ${leadId} not found`);
    }

    const current = stored[index]!;
    if (current.locked) {
      throw new BadRequestException(
        'This draft is locked. Unlock it before editing.',
      );
    }

    const updated: CampaignEmailPreview = {
      ...current,
      subject:
        typeof patch.subject === 'string' ? patch.subject : current.subject,
      body: typeof patch.body === 'string' ? patch.body : current.body,
      source: 'edited',
    };

    if (updated.draftId) {
      await this.prisma.draft.updateMany({
        where: { id: updated.draftId, workspaceId },
        data: {
          generatedSubject: updated.subject,
          generatedBody: updated.body,
          userEdits: {
            subject: updated.subject,
            body: updated.body,
            editedAt: new Date().toISOString(),
          },
        },
      });
    }

    stored[index] = updated;
    await this.persistPreviewEmails(campaignId, settings, stored);
    return updated;
  }

  async lockPreviewEmail(
    workspaceId: string,
    campaignId: string,
    leadId: string,
    locked = true,
  ): Promise<CampaignEmailPreview> {
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: { id: true, settings: true },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const settings = this.asSettingsRecord(campaign.settings);
    const stored = this.readStoredPreviews(settings);
    const index = stored.findIndex((p) => p.leadId === leadId);
    if (index < 0) {
      throw new NotFoundException(`Preview draft for lead ${leadId} not found`);
    }

    const updated: CampaignEmailPreview = {
      ...stored[index]!,
      locked,
    };

    if (updated.draftId) {
      await this.prisma.draft.updateMany({
        where: { id: updated.draftId, workspaceId },
        data: {
          approvalStatus: locked
            ? ApprovalStatus.APPROVED
            : ApprovalStatus.PENDING,
        },
      });
    }

    stored[index] = updated;
    await this.persistPreviewEmails(campaignId, settings, stored);
    return updated;
  }

  async getLaunchReadiness(
    workspaceId: string,
    campaignId: string,
  ): Promise<CampaignLaunchReadiness> {
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: {
        id: true,
        mailbox: true,
        schedule: true,
        audience: true,
        settings: true,
      },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const blockers: string[] = [];
    const settings =
      campaign.settings &&
      typeof campaign.settings === 'object' &&
      !Array.isArray(campaign.settings)
        ? (campaign.settings as Record<string, unknown>)
        : {};
    const audience =
      campaign.audience &&
      typeof campaign.audience === 'object' &&
      !Array.isArray(campaign.audience)
        ? (campaign.audience as Record<string, unknown>)
        : {};
    const schedule =
      campaign.schedule &&
      typeof campaign.schedule === 'object' &&
      !Array.isArray(campaign.schedule)
        ? (campaign.schedule as Record<string, unknown>)
        : {};

    // 1. Connected mailbox
    const hasMailbox = await this.hasConnectedMailbox(workspaceId, campaign.mailbox);
    if (!hasMailbox) {
      blockers.push('No connected mailbox. Connect Gmail/Microsoft or configure SMTP.');
    }

    // 2. Sequence steps approved
    const sequence = Array.isArray(settings.sequence)
      ? (settings.sequence as Array<Record<string, unknown>>)
      : [];
    if (sequence.length === 0) {
      blockers.push('Sequence has no email steps. Add and approve at least one email.');
    } else {
      const unapproved = sequence.filter((step) => step.approved !== true);
      const emptyContent = sequence.filter((step) => {
        const subject = typeof step.subject === 'string' ? step.subject.trim() : '';
        const body = typeof step.body === 'string' ? step.body.trim() : '';
        return !subject || !body;
      });
      if (unapproved.length > 0) {
        blockers.push(
          `${unapproved.length} sequence email(s) are not approved. Approve all steps before launch.`,
        );
      }
      if (emptyContent.length > 0) {
        blockers.push(
          `${emptyContent.length} sequence email(s) are missing subject or body.`,
        );
      }
    }

    // Leads + suppression (checks 3 & 6)
    const leads = await this.prisma.lead.findMany({
      where: { workspaceId, campaignId },
      select: {
        id: true,
        contact: {
          select: {
            email: true,
            verificationStatus: true,
          },
        },
      },
    });

    if (leads.length === 0) {
      blockers.push('Campaign has no leads assigned.');
    } else {
      const emails = leads.map((l) => l.contact.email.toLowerCase());
      const suppressedRows = await this.prisma.suppressionEntry.findMany({
        where: {
          workspaceId,
          email: { in: [...new Set(emails)] },
        },
        select: { email: true },
      });
      const suppressed = new Set(
        suppressedRows.map((r) => r.email.toLowerCase()),
      );

      const eligibleCount = leads.filter(
        (l) =>
          l.contact.verificationStatus === VerificationStatus.VERIFIED &&
          !suppressed.has(l.contact.email.toLowerCase()),
      ).length;

      // 3. At least 1 eligible non-suppressed lead
      if (eligibleCount < 1) {
        blockers.push(
          'No eligible (verified), non-suppressed leads in this campaign.',
        );
      }

      // 6. No pending verification
      const pendingCount = leads.filter(
        (l) => l.contact.verificationStatus === VerificationStatus.PENDING,
      ).length;
      if (pendingCount > 0) {
        blockers.push(
          `${pendingCount} lead(s) still have Pending verification. Finish verification before launch.`,
        );
      }

      // 7. Sufficient credits
      const hasCredits = await this.hasSufficientCredits(
        workspaceId,
        eligibleCount,
      );
      if (!hasCredits) {
        blockers.push(
          `Insufficient credits/budget for ${eligibleCount} eligible lead(s).`,
        );
      }
    }

    // 4. Daily sending limit > 0
    const dailyLimit = this.resolveDailyLimit(schedule, audience);
    if (!(dailyLimit > 0)) {
      blockers.push('Daily sending limit must be greater than 0.');
    }

    // 5. Valid schedule (timezone & business hours)
    const scheduleIssues = this.validateSchedule(schedule, audience);
    blockers.push(...scheduleIssues);

    // 8. SPF/DKIM healthy
    const dnsOk = await this.isSenderDomainHealthy(workspaceId, campaign.mailbox);
    if (!dnsOk) {
      blockers.push(
        'Sender domain deliverability is not healthy (SPF/DKIM). Fix DNS before launch.',
      );
    }

    return {
      ready: blockers.length === 0,
      blockers,
    };
  }

  /**
   * Buyer safety launch blockers for the Campaign Review / Launch steps.
   * Returns human-readable blockers plus structured check flags for the UI.
   */
  async getLaunchBlockers(
    workspaceId: string,
    campaignId: string,
  ): Promise<CampaignLaunchBlockersResult> {
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: {
        id: true,
        mailbox: true,
        settings: true,
      },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const settings =
      campaign.settings &&
      typeof campaign.settings === 'object' &&
      !Array.isArray(campaign.settings)
        ? (campaign.settings as Record<string, unknown>)
        : {};

    const leads = await this.prisma.lead.findMany({
      where: { workspaceId, campaignId },
      select: {
        id: true,
        contact: {
          select: {
            email: true,
            verificationStatus: true,
          },
        },
      },
    });

    const emails = leads.map((l) => l.contact.email.toLowerCase());
    const suppressedRows =
      emails.length === 0
        ? []
        : await this.prisma.suppressionEntry.findMany({
            where: {
              workspaceId,
              email: { in: [...new Set(emails)] },
            },
            select: { email: true },
          });
    const suppressed = new Set(
      suppressedRows.map((r) => r.email.toLowerCase()),
    );

    const pendingCount = leads.filter(
      (l) => l.contact.verificationStatus === VerificationStatus.PENDING,
    ).length;

    const eligibleCount = leads.filter(
      (l) =>
        l.contact.verificationStatus === VerificationStatus.VERIFIED &&
        !suppressed.has(l.contact.email.toLowerCase()),
    ).length;

    const sequence = Array.isArray(settings.sequence)
      ? (settings.sequence as Array<Record<string, unknown>>)
      : [];
    const channels =
      settings.channels && typeof settings.channels === 'object'
        ? (settings.channels as Record<string, unknown>)
        : { email: true };
    const emailEnabled = channels.email !== false;
    const adsEnabled = Boolean(channels.ads);
    const approvalMode = Boolean(settings.approvalMode);
    const sequenceReady =
      sequence.length > 0 &&
      sequence.every((step) => {
        const subject =
          typeof step.subject === 'string' ? step.subject.trim() : '';
        const body = typeof step.body === 'string' ? step.body.trim() : '';
        if (!subject || !body) return false;
        if (approvalMode) return step.approved === true;
        return true;
      });
    const contentApproved = emailEnabled
      ? sequenceReady
      : adsEnabled || sequenceReady;

    const mailboxConnected = await this.hasConnectedMailbox(
      workspaceId,
      campaign.mailbox,
    );
    const mailboxAuthValid = await this.isMailboxAuthValid(workspaceId);
    const verificationComplete = pendingCount === 0;
    const eligibleLeadsExist = eligibleCount >= 1;
    const creditsSufficient = await this.hasSufficientCredits(
      workspaceId,
      eligibleCount,
    );
    const deliverabilitySafe = await this.isSenderDomainHealthy(
      workspaceId,
      campaign.mailbox,
    );
    const bounceRateHealthy = await this.isBounceRateHealthy(workspaceId);

    const checks: CampaignLaunchBlockerChecks = {
      mailboxConnected,
      mailboxAuthValid,
      verificationComplete,
      eligibleLeadsExist,
      contentApproved,
      creditsSufficient,
      deliverabilitySafe,
      bounceRateHealthy,
    };

    const blockers: string[] = [];
    if (!checks.mailboxConnected) {
      blockers.push('No mailbox connected');
    }
    if (!checks.mailboxAuthValid) {
      blockers.push('Mailbox auth expired');
    }
    if (!checks.verificationComplete) {
      blockers.push(
        `Lead verification is incomplete (${pendingCount} pending)`,
      );
    }
    if (!checks.eligibleLeadsExist) {
      blockers.push('No eligible leads exist');
    }
    if (!checks.contentApproved) {
      blockers.push('Campaign content is not approved');
    }
    if (!checks.creditsSufficient) {
      blockers.push('Insufficient credits');
    }
    if (!checks.deliverabilitySafe) {
      blockers.push('SPF/DKIM/DMARC issues');
    }
    if (!checks.bounceRateHealthy) {
      blockers.push('Bounce rate is high');
    }

    return { blockers, checks };
  }

  async getStats(workspaceId: string, campaignId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: { id: true, schedule: true },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    const leadWhere = { workspaceId, campaignId };
    // Only count messages owned by this campaign — not historical mail on
    // reassigned leads from other campaigns / inbox activity.
    const campaignMessageWhere = { workspaceId, campaignId };

    const campaignContacts = await this.prisma.lead.findMany({
      where: leadWhere,
      select: { contact: { select: { email: true } } },
    });
    const campaignEmails = campaignContacts.map((l) => l.contact.email);

    const SENT_LIKE: MessageStatus[] = [
      MessageStatus.SENT,
      MessageStatus.DELIVERED,
      MessageStatus.BOUNCED,
      MessageStatus.COMPLAINED,
    ];

    const [
      leadsAdded,
      readyToSend,
      meetingsBooked,
      positiveLeads,
      unsubscribedLeads,
      outboundByStatus,
      inboundReplies,
      bounced,
      qualifiedLeads,
      customersWon,
      pipelineMoved,
    ] = await Promise.all([
      this.prisma.lead.count({ where: leadWhere }),
      this.prisma.lead.count({
        where: {
          ...leadWhere,
          status: {
            notIn: [
              LeadStatus.BOUNCED,
              LeadStatus.COMPLAINED,
              LeadStatus.LOST,
              LeadStatus.CONVERTED,
            ],
          },
          NOT: {
            messages: {
              some: {
                campaignId,
                direction: MessageDirection.OUTBOUND,
                status: { in: SENT_LIKE },
              },
            },
          },
        },
      }),
      this.prisma.lead.count({
        where: {
          ...leadWhere,
          status: LeadStatus.MEETING_SCHEDULED,
          messages: {
            some: {
              campaignId,
              direction: MessageDirection.OUTBOUND,
            },
          },
        },
      }),
      this.prisma.lead.count({
        where: {
          ...leadWhere,
          status: {
            in: [
              LeadStatus.REPLIED,
              LeadStatus.ENGAGED,
              LeadStatus.QUALIFIED,
              LeadStatus.MEETING_SCHEDULED,
              LeadStatus.CONVERTED,
            ],
          },
          messages: {
            some: {
              campaignId,
              direction: MessageDirection.INBOUND,
            },
          },
        },
      }),
      campaignEmails.length === 0
        ? Promise.resolve(0)
        : this.prisma.suppressionEntry.count({
            where: {
              workspaceId,
              reason: SuppressionReason.UNSUBSCRIBE,
              email: { in: campaignEmails },
            },
          }),
      this.prisma.message.groupBy({
        by: ['status'],
        where: {
          ...campaignMessageWhere,
          direction: MessageDirection.OUTBOUND,
        },
        _count: { _all: true },
      }),
      this.prisma.message.count({
        where: {
          ...campaignMessageWhere,
          direction: MessageDirection.INBOUND,
        },
      }),
      this.prisma.message.count({
        where: {
          ...campaignMessageWhere,
          direction: MessageDirection.OUTBOUND,
          status: MessageStatus.BOUNCED,
        },
      }),
      this.prisma.lead.count({
        where: {
          ...leadWhere,
          status: {
            in: [
              LeadStatus.QUALIFIED,
              LeadStatus.MEETING_SCHEDULED,
              LeadStatus.CONVERTED,
            ],
          },
        },
      }),
      this.prisma.lead.count({
        where: { ...leadWhere, status: LeadStatus.CONVERTED },
      }),
      this.prisma.lead.count({
        where: {
          ...leadWhere,
          status: {
            in: [
              LeadStatus.CONTACTED,
              LeadStatus.ENGAGED,
              LeadStatus.REPLIED,
              LeadStatus.QUALIFIED,
              LeadStatus.MEETING_SCHEDULED,
              LeadStatus.CONVERTED,
            ],
          },
        },
      }),
    ]);

    let performanceRows: Array<{
      day: Date;
      sent: bigint;
      delivered: bigint;
      replies: bigint;
    }> = [];
    try {
      performanceRows = await this.prisma.$queryRaw`
        SELECT
          date_trunc('day', COALESCE(m.sent_at, m.received_at, m.created_at)) AS day,
          COUNT(*) FILTER (
            WHERE m.direction = 'OUTBOUND'
              AND m.status IN ('SENT', 'DELIVERED', 'BOUNCED', 'COMPLAINED')
          )::bigint AS sent,
          COUNT(*) FILTER (
            WHERE m.direction = 'OUTBOUND'
              AND m.status IN ('SENT', 'DELIVERED')
          )::bigint AS delivered,
          COUNT(*) FILTER (
            WHERE m.direction = 'INBOUND'
          )::bigint AS replies
        FROM messages m
        WHERE m.workspace_id = ${workspaceId}::uuid
          AND m.campaign_id = ${campaignId}::uuid
          AND COALESCE(m.sent_at, m.received_at, m.created_at) >= NOW() - INTERVAL '14 days'
        GROUP BY 1
        ORDER BY 1 ASC
      `;
    } catch {
      performanceRows = [];
    }

    const statusCounts = Object.fromEntries(
      outboundByStatus.map((row) => [row.status, row._count._all]),
    ) as Partial<Record<string, number>>;

    const sentStillOk =
      (statusCounts['SENT'] ?? 0) + (statusCounts['DELIVERED'] ?? 0);
    const bouncedAll = statusCounts['BOUNCED'] ?? 0;
    const complained = statusCounts['COMPLAINED'] ?? 0;
    const sent = sentStillOk + bouncedAll + complained;
    const delivered = sentStillOk;
    const replies = inboundReplies;

    // No CRM opportunity model yet — revenue stays 0 until connected
    const revenueGenerated = 0;
    const pipelineValue = 0;

    const replyRate = sent > 0 ? Math.round((replies / sent) * 1000) / 10 : 0;
    const bounceRate = sent > 0 ? Math.round((bounced / sent) * 1000) / 10 : 0;
    const meetingRate =
      sent > 0 ? Math.round((meetingsBooked / sent) * 1000) / 10 : 0;
    const positiveReplyRate =
      sent > 0 ? Math.round((positiveLeads / sent) * 1000) / 10 : 0;
    const unsubscribeRate =
      sent > 0 ? Math.round((unsubscribedLeads / sent) * 1000) / 10 : 0;

    const performance = performanceRows.map((row) => ({
      date: new Date(row.day).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      sent: Number(row.sent),
      delivered: Number(row.delivered),
      replies: Number(row.replies),
    }));

    const schedule = (campaign.schedule ?? {}) as Record<string, unknown>;
    const dailyLimit =
      typeof schedule.dailySendLimit === 'number'
        ? schedule.dailySendLimit
        : typeof schedule.dailySendingLimit === 'number'
          ? schedule.dailySendingLimit
          : 50;

    return {
      campaignId,
      leadsAdded,
      sent,
      delivered,
      replies,
      bounced,
      revenueGenerated,
      pipelineValue,
      readyToSend,
      positiveReplies: positiveLeads,
      meetingsBooked,
      unsubscribes: unsubscribedLeads,
      qualifiedLeads,
      proposalsSent: qualifiedLeads,
      customersWon,
      pipelineMoved,
      dailyLimit,
      rates: {
        openRate: 0,
        replyRate,
        bounceRate,
        unsubscribeRate,
        meetingRate,
        positiveReplyRate,
      },
      performance,
    };
  }

  async getWorkflow(workspaceId: string, campaignId: string) {
    const stats = await this.getStats(workspaceId, campaignId);
    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: { status: true, settings: true },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }
    const settings = this.asSettingsRecord(campaign.settings);
    const sequence = Array.isArray(settings.sequence) ? settings.sequence : [];
    const channels =
      settings.channels && typeof settings.channels === 'object'
        ? (settings.channels as Record<string, unknown>)
        : { email: true };

    const defs = [
      {
        id: 1,
        key: 'find_leads',
        label: 'Find Leads',
        description: 'Discover prospects from selected data sources',
        done: stats.leadsAdded > 0,
        count: stats.leadsAdded,
      },
      {
        id: 2,
        key: 'enrich_verify',
        label: 'Enrich & Verify',
        description: 'Clean, enrich, and verify contact data',
        done: stats.leadsAdded > 0,
        count: stats.leadsAdded,
      },
      {
        id: 3,
        key: 'score_qualify',
        label: 'Score & Qualify',
        description: 'Prioritize leads that match the ICP',
        done: stats.qualifiedLeads > 0 || stats.readyToSend > 0,
        count: stats.qualifiedLeads,
      },
      {
        id: 4,
        key: 'generate_outreach',
        label: 'Generate Personalized Outreach',
        description: 'AI writes email, social, and ad copy',
        done: sequence.length > 0,
        count: sequence.length,
      },
      {
        id: 5,
        key: 'launch_channels',
        label: 'Launch Email + Social + Ads',
        description: 'Go live across selected channels',
        done:
          stats.sent > 0 ||
          campaign.status === CampaignStatus.RUNNING ||
          campaign.status === CampaignStatus.SCHEDULED,
        count: Object.values(channels).filter(Boolean).length,
      },
      {
        id: 6,
        key: 'capture_replies',
        label: 'Capture Replies & Leads',
        description: 'Inbox and ad leads flow into one place',
        done: stats.replies > 0,
        count: stats.replies,
      },
      {
        id: 7,
        key: 'ai_proposes',
        label: 'AI Proposes Response',
        description: 'Reply copilot drafts the next message',
        done: stats.replies > 0,
        count: stats.replies,
      },
      {
        id: 8,
        key: 'user_sends',
        label: 'User Sends / Edits / Customizes',
        description: 'Approve, edit, or send suggested replies',
        done: stats.sent > 0,
        count: stats.sent,
      },
      {
        id: 9,
        key: 'book_meeting',
        label: 'Book Meeting / Send Proposal',
        description: 'Convert interest into a calendar slot or proposal',
        done: stats.meetingsBooked > 0 || stats.proposalsSent > 0,
        count: stats.meetingsBooked,
      },
      {
        id: 10,
        key: 'move_pipeline',
        label: 'Move Lead in CRM Pipeline',
        description: 'Stage updates follow the conversation',
        done: stats.pipelineMoved > 0,
        count: stats.pipelineMoved,
      },
      {
        id: 11,
        key: 'win_customer',
        label: 'Win Customer',
        description: 'Mark the deal won and lock revenue',
        done: stats.customersWon > 0,
        count: stats.customersWon,
      },
      {
        id: 12,
        key: 'onboard_retain',
        label: 'Onboarding, Upsell & Retention',
        description: 'Keep customers and expand the account',
        done:
          stats.customersWon > 0 &&
          campaign.status === CampaignStatus.COMPLETED,
        count: stats.customersWon,
      },
    ];

    let currentStep = 12;
    for (const step of defs) {
      if (!step.done) {
        currentStep = step.id;
        break;
      }
    }
    if (defs.every((s) => s.done)) currentStep = 12;

    const steps = defs.map((step) => ({
      id: step.id,
      key: step.key,
      label: step.label,
      description: step.description,
      count: step.count,
      status:
        step.done && step.id < currentStep
          ? 'done'
          : step.id === currentStep
            ? campaign.status === CampaignStatus.ATTENTION_REQUIRED
              ? 'blocked'
              : 'current'
            : step.done
              ? 'done'
              : 'upcoming',
    }));

    return {
      campaignId,
      currentStep,
      completedCount: defs.filter((s) => s.done).length,
      steps,
    };
  }

  private fallbackAdCreatives(
    dto: GenerateCampaignAdsDto,
    platforms: string[],
  ) {
    const product = dto.product?.trim() || 'Flacron Lead Agent';
    const offer = dto.offer?.trim() || 'a short intro';
    const audienceTitles = Array.isArray(
      (dto.audience as { jobTitles?: string[] } | undefined)?.jobTitles,
    )
      ? ((dto.audience as { jobTitles?: string[] }).jobTitles ?? [])
      : [];
    const audience =
      audienceTitles.slice(0, 3).join(', ') || 'decision makers at target accounts';
    const list = platforms.length ? platforms : ['meta', 'google'];
    return list.map((platform, index) => ({
      id: `ad-fallback-${index + 1}`,
      platform,
      headline: `See ${product} in action`,
      primaryText: `Teams use ${product} to find, qualify, and close more pipeline. Worth ${offer}?`,
      description: `Built for ${audience}.`,
      cta: 'Book a demo',
      audience,
    }));
  }

  private resolveScheduleDelayMs(scheduleRaw: unknown): number {
    if (!scheduleRaw || typeof scheduleRaw !== 'object' || Array.isArray(scheduleRaw)) {
      return 0;
    }
    const schedule = scheduleRaw as Record<string, unknown>;
    const startMode =
      (typeof schedule.startMode === 'string' && schedule.startMode) ||
      (typeof schedule.startOption === 'string' && schedule.startOption) ||
      'now';
    if (startMode === 'countdown') {
      const hours = Number(schedule.countdownHours ?? 24);
      if (Number.isFinite(hours) && hours > 0) {
        return Math.floor(hours * 60 * 60 * 1000);
      }
      return 0;
    }
    if (startMode !== 'later') {
      return 0;
    }
    const startRaw =
      (typeof schedule.startDate === 'string' && schedule.startDate) ||
      (typeof schedule.startAt === 'string' && schedule.startAt) ||
      null;
    if (!startRaw) return 0;
    const startAt = new Date(startRaw);
    if (Number.isNaN(startAt.getTime())) return 0;
    return Math.max(0, startAt.getTime() - Date.now());
  }

  private hasAudienceMailbox(audience?: Record<string, unknown>): boolean {
    return Boolean(
      audience &&
        (audience.mailboxId != null ||
          audience.mailbox != null ||
          audience.fromMailbox != null),
    );
  }

  private hasAudienceCalendar(audience?: Record<string, unknown>): boolean {
    return Boolean(audience && audience.calendarLink != null);
  }

  private mapWizardPayload(
    dto: CreateCampaignDto | UpdateCampaignDto,
    existingSettings?: Prisma.JsonValue | null,
  ) {
    const audience = (dto.audience ?? undefined) as
      | Record<string, unknown>
      | undefined;
    const scheduleIn = (dto.schedule ?? undefined) as
      | Record<string, unknown>
      | undefined;

    const mailbox =
      dto.mailbox ??
      (typeof audience?.mailboxId === 'string'
        ? audience.mailboxId
        : undefined) ??
      (typeof audience?.mailbox === 'string' ? audience.mailbox : undefined) ??
      (typeof audience?.fromMailbox === 'string'
        ? audience.fromMailbox
        : undefined) ??
      null;

    const calendarLink =
      dto.calendarLink ??
      (typeof audience?.calendarLink === 'string'
        ? audience.calendarLink
        : undefined) ??
      null;

    // Normalize schedule JSON toward the documented shape while keeping extras
    const schedule = scheduleIn
      ? ({
          dailySendLimit:
            scheduleIn.dailySendLimit ??
            audience?.dailySendingLimit ??
            scheduleIn.dailySendingLimit,
          timezone: scheduleIn.timezone ?? scheduleIn.timeZone,
          quietHours:
            scheduleIn.quietHours ??
            (scheduleIn.quietHoursStart || scheduleIn.quietHoursEnd
              ? {
                  start: scheduleIn.quietHoursStart,
                  end: scheduleIn.quietHoursEnd,
                }
              : undefined),
          startDate: scheduleIn.startDate ?? scheduleIn.startAt,
          startMode:
            scheduleIn.startMode ?? scheduleIn.startOption ?? scheduleIn.mode,
          ...scheduleIn,
        } as Prisma.InputJsonValue)
      : undefined;

    const prevSettings =
      existingSettings &&
      typeof existingSettings === 'object' &&
      !Array.isArray(existingSettings)
        ? (existingSettings as Record<string, unknown>)
        : {};

    const settingsExtras: Record<string, unknown> = { ...prevSettings };
    if (dto.settings) Object.assign(settingsExtras, dto.settings);
    if (dto.leadSources !== undefined) settingsExtras.leadSources = dto.leadSources;
    if (dto.eligibility !== undefined) settingsExtras.eligibility = dto.eligibility;
    if (dto.sequence !== undefined) settingsExtras.sequence = dto.sequence;
    if (dto.approvalMode !== undefined) {
      settingsExtras.approvalMode = dto.approvalMode;
    }
    if (dto.launchMode !== undefined) {
      settingsExtras.launchMode = dto.launchMode;
    }
    if (dto.website !== undefined) settingsExtras.website = dto.website;
    if (dto.offer !== undefined) settingsExtras.offer = dto.offer;
    if (dto.pricing !== undefined) settingsExtras.pricing = dto.pricing;
    if (dto.budget !== undefined) settingsExtras.budget = dto.budget;
    if (dto.brandTone !== undefined) settingsExtras.brandTone = dto.brandTone;
    if (dto.documents !== undefined) settingsExtras.documents = dto.documents;
    if (dto.channels !== undefined) settingsExtras.channels = dto.channels;
    if (dto.ads !== undefined) settingsExtras.ads = dto.ads;
    if (dto.crmConnected !== undefined) {
      settingsExtras.crmConnected = dto.crmConnected;
    }

    const hasSettings = Object.keys(settingsExtras).length > 0;

    return {
      name: dto.name?.trim() || 'Untitled campaign',
      goal: dto.goal ?? null,
      product: dto.product ?? null,
      prompt: dto.prompt ?? dto.aiPrompt ?? dto.ai_prompt ?? null,
      audience: audience
        ? (audience as Prisma.InputJsonValue)
        : undefined,
      schedule,
      mailbox,
      calendarLink,
      settings: hasSettings
        ? (settingsExtras as Prisma.InputJsonValue)
        : undefined,
    };
  }

  private asSettingsRecord(raw: Prisma.JsonValue | null | undefined) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return {};
  }

  private readStoredPreviews(
    settings: Record<string, unknown>,
  ): CampaignEmailPreview[] {
    const raw = settings.previewEmails;
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item) => this.normalizeStoredPreview(item))
      .filter((item): item is CampaignEmailPreview => item != null);
  }

  private normalizeStoredPreview(raw: unknown): CampaignEmailPreview | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const item = raw as Record<string, unknown>;
    if (typeof item.leadId !== 'string') return null;
    const evidenceRaw = Array.isArray(item.evidence) ? item.evidence : [];
    const evidence = evidenceRaw
      .map((row) => {
        if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
        const e = row as Record<string, unknown>;
        if (typeof e.label !== 'string' || typeof e.value !== 'string') {
          return null;
        }
        return { label: e.label, value: e.value };
      })
      .filter((row): row is { label: string; value: string } => row != null);

    return {
      leadId: item.leadId,
      draftId: typeof item.draftId === 'string' ? item.draftId : null,
      contactName:
        typeof item.contactName === 'string' ? item.contactName : 'Unknown',
      company: typeof item.company === 'string' ? item.company : null,
      email: typeof item.email === 'string' ? item.email : '',
      step: typeof item.step === 'number' ? item.step : 1,
      subject: typeof item.subject === 'string' ? item.subject : '',
      body: typeof item.body === 'string' ? item.body : '',
      source:
        item.source === 'ai' || item.source === 'template' || item.source === 'edited'
          ? item.source
          : 'template',
      locked: item.locked === true,
      evidence,
    };
  }

  private async persistPreviewEmails(
    campaignId: string,
    prevSettings: Record<string, unknown>,
    emails: CampaignEmailPreview[],
  ) {
    await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        settings: {
          ...prevSettings,
          previewEmails: emails,
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async pickPreviewLeads(workspaceId: string, campaignId: string) {
    const leads = await this.prisma.lead.findMany({
      where: { workspaceId, campaignId },
      include: { contact: true },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });

    const ranked = [...leads].sort((a, b) => {
      const rank = (status: VerificationStatus) =>
        status === VerificationStatus.VERIFIED
          ? 0
          : status === VerificationStatus.CATCH_ALL
            ? 1
            : 2;
      return (
        rank(a.contact.verificationStatus) -
        rank(b.contact.verificationStatus)
      );
    });
    return ranked.slice(0, 3);
  }

  private buildPersonalizationEvidence(lead: {
    industry: string | null;
    contact: {
      firstName: string | null;
      lastName: string | null;
      email: string;
      title: string | null;
      companyName: string | null;
      phone: string | null;
    };
  }): Array<{ label: string; value: string }> {
    const contactName = [lead.contact.firstName, lead.contact.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    const rows: Array<{ label: string; value: string }> = [];
    if (contactName) rows.push({ label: 'Contact Name', value: contactName });
    if (lead.contact.email) {
      rows.push({ label: 'Email', value: lead.contact.email });
    }
    if (lead.contact.companyName) {
      rows.push({ label: 'Company', value: lead.contact.companyName });
    }
    if (lead.contact.title) {
      rows.push({ label: 'Job Title', value: lead.contact.title });
    }
    if (lead.industry) {
      rows.push({ label: 'Industry', value: lead.industry });
    }
    if (lead.contact.phone) {
      rows.push({ label: 'Phone', value: lead.contact.phone });
    }
    return rows;
  }

  private async generatePreviewForLead(
    workspaceId: string,
    campaign: {
      id: string;
      product: string | null;
      calendarLink: string | null;
    },
    lead: {
      id: string;
      status: LeadStatus;
      industry: string | null;
      contact: {
        firstName: string | null;
        lastName: string | null;
        email: string;
        title: string | null;
        companyName: string | null;
        phone: string | null;
      };
    },
    settings: Record<string, unknown>,
  ): Promise<CampaignEmailPreview> {
    const sequence = Array.isArray(settings.sequence)
      ? (settings.sequence as Array<Record<string, unknown>>)
      : [];
    const firstStep = sequence[0] ?? null;
    const templateSubject =
      typeof firstStep?.subject === 'string' ? firstStep.subject : '';
    const templateBody =
      typeof firstStep?.body === 'string' ? firstStep.body : '';
    const stepNumber =
      typeof firstStep?.step === 'number' ? firstStep.step : 1;

    const product = await this.resolveProductForPreview(
      workspaceId,
      campaign.product,
    );
    const productContext: DraftProductContext = {
      id: product.id,
      name: product.name,
      description: product.description,
      valueProps: product.valueProps,
    };

    const contactName =
      [lead.contact.firstName, lead.contact.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || lead.contact.email;
    const company = lead.contact.companyName;
    const calendarLink = campaign.calendarLink ?? '';
    const evidence = this.buildPersonalizationEvidence(lead);

    const leadContext: DraftLeadContext = {
      id: lead.id,
      status: lead.status,
      contact: {
        firstName: lead.contact.firstName,
        lastName: lead.contact.lastName,
        email: lead.contact.email,
        title: lead.contact.title,
        phone: lead.contact.phone,
      },
      company: { name: company },
    };

    let subject = '';
    let body = '';
    let source: CampaignEmailPreview['source'] = 'template';
    let draftId: string | null = null;

    try {
      const generated = await this.aiProvider.generateEmailDraft(
        leadContext,
        productContext,
      );
      subject = generated.subject;
      body = generated.body;
      source = 'ai';

      const modelName =
        this.aiProvider instanceof OpenAiProvider
          ? this.aiProvider.modelName
          : 'unknown';
      const draft = await this.prisma.draft.create({
        data: {
          leadId: lead.id,
          workspaceId,
          promptVersion: DRAFT_PROMPT_VERSION,
          modelName,
          generatedSubject: subject,
          generatedBody: body,
          evidenceUsed: generated.evidence_used,
        },
      });
      draftId = draft.id;

      for (const snippet of generated.evidence_used ?? []) {
        if (!snippet?.trim()) continue;
        evidence.push({ label: 'AI Evidence', value: snippet.trim() });
      }
    } catch {
      subject = this.applyMergeTags(
        templateSubject || `Quick note for ${company || contactName}`,
        {
          firstName: lead.contact.firstName,
          company,
          jobTitle: lead.contact.title,
          industry: lead.industry,
          calendarLink,
        },
      );
      body = this.applyMergeTags(
        templateBody ||
          `Hi {{first_name}},\n\nI wanted to reach out about ${product.name} for {{company}}.\n\nWould love to hear your thoughts.`,
        {
          firstName: lead.contact.firstName,
          company,
          jobTitle: lead.contact.title,
          industry: lead.industry,
          calendarLink,
        },
      );
      source = 'template';
    }

    return {
      leadId: lead.id,
      draftId,
      contactName,
      company,
      email: lead.contact.email,
      step: stepNumber,
      subject,
      body,
      source,
      locked: false,
      evidence,
    };
  }

  private applyMergeTags(
    template: string,
    vars: {
      firstName: string | null;
      company: string | null;
      jobTitle: string | null;
      industry: string | null;
      calendarLink: string;
    },
  ): string {
    return template
      .replaceAll('{{first_name}}', vars.firstName || 'there')
      .replaceAll('{{company}}', vars.company || 'your company')
      .replaceAll('{{job_title}}', vars.jobTitle || 'your role')
      .replaceAll('{{industry}}', vars.industry || 'your industry')
      .replaceAll('{{pain_point}}', 'growth challenges')
      .replaceAll(
        '{{calendar_link}}',
        vars.calendarLink || 'https://cal.com/demo',
      );
  }

  private async resolveProductForPreview(
    workspaceId: string,
    campaignProductName: string | null,
  ) {
    if (campaignProductName?.trim()) {
      const byName = await this.prisma.product.findFirst({
        where: {
          workspaceId,
          name: { equals: campaignProductName.trim(), mode: 'insensitive' },
        },
      });
      if (byName) return byName;
    }

    const existing = await this.prisma.product.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;

    return this.prisma.product.create({
      data: {
        workspaceId,
        name: campaignProductName?.trim() || 'Flacron Lead Agent',
        description:
          'AI-assisted outbound platform that finds, qualifies, and converts B2B leads.',
        valueProps: [
          'Multi-tenant lead import and verification',
          'AI email drafting with human approval',
          'Deliverability guardrails and emergency stop',
        ],
      },
    });
  }

  private isSmtpConfigured(): boolean {
    const user = this.config.get<string>('SMTP_USER')?.trim() || '';
    const pass = this.config.get<string>('SMTP_PASS')?.trim() || '';
    return (
      Boolean(user) &&
      Boolean(pass) &&
      !pass.startsWith('your-') &&
      !user.startsWith('your-')
    );
  }

  private async hasConnectedMailbox(
    workspaceId: string,
    _campaignMailbox: string | null,
  ): Promise<boolean> {
    const integration = await this.prisma.emailIntegration.findFirst({
      where: { workspaceId },
      select: { id: true },
    });
    if (integration) return true;
    return this.isSmtpConfigured();
  }

  private async isMailboxAuthValid(workspaceId: string): Promise<boolean> {
    const integration = await this.prisma.emailIntegration.findFirst({
      where: { workspaceId },
      select: { tokenExpiresAt: true },
    });
    if (integration) {
      return (
        integration.tokenExpiresAt == null ||
        integration.tokenExpiresAt.getTime() > Date.now()
      );
    }
    // SMTP-only workspaces have no OAuth token to expire.
    return this.isSmtpConfigured();
  }

  private async isBounceRateHealthy(workspaceId: string): Promise<boolean> {
    const thresholdPct = Number(
      this.config.get('WORKSPACE_MAX_BOUNCE_RATE_PCT', '5'),
    );
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 30);

    const [sentLike, bounced] = await Promise.all([
      this.prisma.message.count({
        where: {
          workspaceId,
          direction: MessageDirection.OUTBOUND,
          createdAt: { gte: since },
          status: {
            in: [
              MessageStatus.SENT,
              MessageStatus.DELIVERED,
              MessageStatus.BOUNCED,
              MessageStatus.COMPLAINED,
            ],
          },
        },
      }),
      this.prisma.message.count({
        where: {
          workspaceId,
          direction: MessageDirection.OUTBOUND,
          createdAt: { gte: since },
          status: MessageStatus.BOUNCED,
        },
      }),
    ]);

    if (sentLike < 20) return true;
    const rate = (bounced / sentLike) * 100;
    return rate <= thresholdPct;
  }

  private async evaluateSafeAutoStartGates(
    workspaceId: string,
    campaignId: string,
  ): Promise<{ allowed: boolean; blockers: string[] }> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { isPaused: true, settings: true },
    });
    const blockers: string[] = [];
    const settings =
      workspace?.settings &&
      typeof workspace.settings === 'object' &&
      !Array.isArray(workspace.settings)
        ? (workspace.settings as Record<string, unknown>)
        : {};

    if (workspace?.isPaused) {
      blockers.push('Workspace is paused');
    }
    if (!settings.supervisedAutomationEnabled) {
      blockers.push(
        'Supervised automation disabled — enable in Autopilot Control Center or approve manually',
      );
    }

    const mailbox = await this.prisma.emailIntegration.findFirst({
      where: { workspaceId },
      select: { tokenExpiresAt: true },
    });
    const mailboxOk =
      mailbox != null &&
      (mailbox.tokenExpiresAt == null ||
        mailbox.tokenExpiresAt.getTime() > Date.now());
    if (!mailboxOk && !this.isSmtpConfigured()) {
      blockers.push('Mailbox authentication is unhealthy');
    }

    const priorCampaigns = await this.prisma.campaign.count({
      where: {
        workspaceId,
        id: { not: campaignId },
        status: {
          in: [
            CampaignStatus.RUNNING,
            CampaignStatus.COMPLETED,
            CampaignStatus.SCHEDULED,
          ],
        },
      },
    });
    if (
      priorCampaigns === 0 &&
      settings.requireExplicitApprovalForNewSenders !== false
    ) {
      blockers.push('First campaign requires explicit approval');
    }

    return { allowed: blockers.length === 0, blockers };
  }

  private async notifyReviewReady(
    workspaceId: string,
    campaignId: string,
    campaignName: string,
    extraBlockers?: string[],
  ): Promise<void> {
    const approvers = await this.prisma.user.findMany({
      where: {
        workspaceId,
        role: { in: [Role.OWNER, Role.ADMIN] },
      },
      select: { id: true, email: true, role: true },
    });

    const leads = await this.prisma.lead.findMany({
      where: { workspaceId, campaignId },
      take: 5,
      orderBy: [{ leadScore: 'desc' }, { createdAt: 'desc' }],
      include: {
        contact: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
            companyName: true,
            title: true,
            verificationStatus: true,
          },
        },
      },
    });

    const eligibleCount = await this.prisma.lead.count({
      where: {
        workspaceId,
        campaignId,
        contact: { verificationStatus: VerificationStatus.VERIFIED },
      },
    });

    const sampleLeads = leads.map((l) => ({
      leadId: l.id,
      name:
        [l.contact.firstName, l.contact.lastName].filter(Boolean).join(' ') ||
        l.contact.email,
      title: l.contact.title,
      company: l.contact.companyName,
      email: l.contact.email,
      leadScore: l.leadScore,
      verification: l.contact.verificationStatus,
      fitRationale:
        l.scoreExplanation &&
        typeof l.scoreExplanation === 'object' &&
        !Array.isArray(l.scoreExplanation)
          ? (l.scoreExplanation as Record<string, unknown>).summary ?? null
          : null,
    }));

    const schedule = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
      select: { schedule: true, settings: true },
    });
    const scheduleObj =
      schedule?.schedule &&
      typeof schedule.schedule === 'object' &&
      !Array.isArray(schedule.schedule)
        ? (schedule.schedule as Record<string, unknown>)
        : {};
    const countdownHours = Number(scheduleObj.countdownHours ?? 2);
    const startMode =
      (typeof scheduleObj.startMode === 'string' && scheduleObj.startMode) ||
      (typeof scheduleObj.startOption === 'string' && scheduleObj.startOption) ||
      null;

    const title = `${eligibleCount} outreach-ready leads for “${campaignName}”`;
    const bodyParts = [
      `Qualified/verified contacts: ${eligibleCount}.`,
      `Audience sample and eligibility are ready for review.`,
    ];
    if (startMode === 'countdown' && countdownHours > 0) {
      bodyParts.push(
        `Outreach will begin automatically in ${countdownHours} hour(s) using the approved sequence and daily limits — unless you postpone, reject, or disable auto-start.`,
      );
    } else {
      bodyParts.push(
        'Approve to launch, or keep in Needs Review until you are ready.',
      );
    }
    if (extraBlockers?.length) {
      bodyParts.push(`Auto-start blocked: ${extraBlockers.join('; ')}.`);
    }

    const metadata = {
      campaignId,
      type: 'LEADS_READY',
      href: `/campaigns/${campaignId}`,
      eligibleCount,
      sampleLeads,
      countdownHours: startMode === 'countdown' ? countdownHours : null,
      blockers: extraBlockers ?? [],
    };

    const payload = {
      type: 'LEADS_READY',
      title,
      body: bodyParts.join(' '),
      metadata,
    };

    if (approvers.length === 0) {
      await this.prisma.notification.create({
        data: {
          id: randomUUID(),
          workspaceId,
          type: payload.type,
          title: payload.title,
          body: payload.body,
          metadata,
        },
      });
      return;
    }

    await this.prisma.notification.createMany({
      data: approvers.map((user) => ({
        id: randomUUID(),
        workspaceId,
        userId: user.id,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        metadata,
      })),
    });

    // Keep legacy approval type for Alerts banner compatibility
    await this.prisma.notification.createMany({
      data: approvers.map((user) => ({
        id: randomUUID(),
        workspaceId,
        userId: user.id,
        type: 'CAMPAIGN_APPROVAL_REQUIRED',
        title: 'Campaign awaiting approval',
        body: `"${campaignName}" needs review before outreach starts.`,
        metadata: {
          campaignId,
          href: `/campaigns/${campaignId}`,
          launchMode: 'approval',
        },
      })),
    });

    this.logger.log(
      `Review-ready notified for campaign ${campaignId} (${eligibleCount} verified, ${sampleLeads.length} samples)`,
    );

    await this.sendLeadsReadyEmailsIdempotent({
      workspaceId,
      campaignId,
      campaignName,
      eligibleCount,
      sampleLeads,
      countdownHours: startMode === 'countdown' ? countdownHours : null,
      body: bodyParts.join(' '),
      title,
      approvers,
      settingsRaw: schedule?.settings,
    });
  }

  /**
   * Branded transactional email for review-ready audiences (Appendix D.6 / D.11).
   * Idempotent per campaign + eligibleCount fingerprint stored on campaign.settings.
   */
  private async sendLeadsReadyEmailsIdempotent(input: {
    workspaceId: string;
    campaignId: string;
    campaignName: string;
    eligibleCount: number;
    sampleLeads: Array<{
      name: string;
      title: string | null;
      company: string | null;
      leadScore: number | null;
      fitRationale: unknown;
    }>;
    countdownHours: number | null;
    body: string;
    title: string;
    approvers: Array<{ id: string; email: string }>;
    settingsRaw: Prisma.JsonValue | null | undefined;
  }): Promise<void> {
    if (input.approvers.length === 0) return;

    const fingerprint = `leads-ready:${input.campaignId}:${input.eligibleCount}`;
    const settings = this.asSettingsRecord(input.settingsRaw);
    if (settings.reviewReadyEmailFingerprint === fingerprint) {
      this.logger.log(
        `Skipping LEADS_READY email for ${input.campaignId} (already sent for fingerprint)`,
      );
      return;
    }

    if (!this.smtp.isConfigured()) {
      this.logger.warn(
        `LEADS_READY email skipped — SMTP not configured (campaign ${input.campaignId})`,
      );
      // Still mark fingerprint so we don't spam logs / retry forever on every update
      await this.prisma.campaign.update({
        where: { id: input.campaignId },
        data: {
          settings: {
            ...settings,
            reviewReadyEmailFingerprint: fingerprint,
            reviewReadyEmailSkippedReason: 'smtp_not_configured',
            reviewReadyEmailAttemptedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      return;
    }

    const frontendUrl =
      this.config.get<string>('FRONTEND_URL')?.replace(/\/$/, '') ||
      'http://localhost:3000';
    const reviewUrl = `${frontendUrl}/campaigns/${input.campaignId}`;

    const sampleLines = input.sampleLeads
      .slice(0, 5)
      .map((s, i) => {
        const fit =
          typeof s.fitRationale === 'string' && s.fitRationale.trim()
            ? s.fitRationale
            : s.leadScore != null
              ? `Fit score ${s.leadScore}`
              : 'Fit pending';
        return `${i + 1}. ${s.name}${s.title ? ` — ${s.title}` : ''}${
          s.company ? ` @ ${s.company}` : ''
        }\n   ${fit}`;
      })
      .join('\n');

    const countdownLine =
      input.countdownHours != null && input.countdownHours > 0
        ? `\nAuto-start window: ${input.countdownHours} hour(s) (if supervised automation is enabled).\n`
        : '\n';

    const emailBody = [
      input.title,
      '',
      input.body,
      countdownLine,
      'Representative sample (not the full audience):',
      sampleLines || '  (no sample leads yet)',
      '',
      `Review and approve: ${reviewUrl}`,
      '',
      '— Flacron Lead Agent',
      'You received this because you are an owner/admin of this workspace.',
    ].join('\n');

    let sent = 0;
    for (const user of input.approvers) {
      try {
        await this.smtp.send({
          to: user.email,
          subject: input.title,
          body: emailBody,
        });
        sent += 1;
      } catch (error) {
        this.logger.error(
          `LEADS_READY email failed for ${user.email}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await this.prisma.campaign.update({
      where: { id: input.campaignId },
      data: {
        settings: {
          ...settings,
          reviewReadyEmailFingerprint: fingerprint,
          reviewReadyEmailSentAt: new Date().toISOString(),
          reviewReadyEmailRecipients: sent,
        } as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `LEADS_READY email sent to ${sent}/${input.approvers.length} for campaign ${input.campaignId}`,
    );
  }

  private async notifyApproversForCampaign(
    workspaceId: string,
    campaignId: string,
    campaignName: string,
  ): Promise<void> {
    await this.notifyReviewReady(workspaceId, campaignId, campaignName);
  }

  private resolveDailyLimit(
    schedule: Record<string, unknown>,
    audience: Record<string, unknown>,
  ): number {
    const candidates = [
      schedule.dailySendLimit,
      schedule.dailySendingLimit,
      audience.dailySendingLimit,
      audience.dailySendLimit,
    ];
    for (const value of candidates) {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
        return Number(value);
      }
    }
    return 0;
  }

  private looksLikeTime(value: unknown): boolean {
    return typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value.trim());
  }

  private validateSchedule(
    schedule: Record<string, unknown>,
    audience: Record<string, unknown>,
  ): string[] {
    const issues: string[] = [];
    const timezone =
      (typeof schedule.timezone === 'string' && schedule.timezone.trim()) ||
      (typeof schedule.timeZone === 'string' && schedule.timeZone.trim()) ||
      '';

    if (!timezone) {
      issues.push('Schedule is missing a timezone.');
    }

    const quiet =
      schedule.quietHours &&
      typeof schedule.quietHours === 'object' &&
      !Array.isArray(schedule.quietHours)
        ? (schedule.quietHours as Record<string, unknown>)
        : null;

    const hoursStart =
      audience.sendingHoursStart ??
      schedule.sendingHoursStart ??
      quiet?.start ??
      schedule.quietHoursStart;
    const hoursEnd =
      audience.sendingHoursEnd ??
      schedule.sendingHoursEnd ??
      quiet?.end ??
      schedule.quietHoursEnd;

    if (!this.looksLikeTime(hoursStart) || !this.looksLikeTime(hoursEnd)) {
      issues.push(
        'Schedule is missing valid business hours (start/end time as HH:MM).',
      );
    }

    return issues;
  }

  private async hasSufficientCredits(
    workspaceId: string,
    needed: number,
  ): Promise<boolean> {
    if (needed <= 0) return true;

    const override = this.config.get<string>('WORKSPACE_CREDITS_REMAINING');
    if (override != null && String(override).trim() !== '') {
      return Number(override) >= needed;
    }

    const limit = Number(
      this.config.get('WORKSPACE_MONTHLY_CREDIT_LIMIT', '2500'),
    );
    const startOfMonth = new Date();
    startOfMonth.setUTCDate(1);
    startOfMonth.setUTCHours(0, 0, 0, 0);

    const used = await this.prisma.message.count({
      where: {
        workspaceId,
        direction: MessageDirection.OUTBOUND,
        createdAt: { gte: startOfMonth },
        status: {
          in: [
            MessageStatus.SENT,
            MessageStatus.QUEUED,
            MessageStatus.BOUNCED,
            MessageStatus.COMPLAINED,
          ],
        },
      },
    });

    return limit - used >= needed;
  }

  private extractEmailDomain(value: string | null | undefined): string | null {
    if (!value?.trim()) return null;
    const angle = value.match(/<([^>]+)>/);
    // Strip UI suffixes like " (Connected)" / " (Warming)"
    const raw = (angle?.[1] ?? value).trim().split(/\s+/)[0] ?? '';
    const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    const email = (emailMatch?.[0] ?? raw).toLowerCase();
    if (!email.includes('@')) return null;
    const domain = email.split('@').pop()?.replace(/\.+$/, '') ?? '';
    // Reject junk like "flacron.ai(connected)" after bad parsing
    if (!domain || /[^a-z0-9.-]/i.test(domain) || !domain.includes('.')) {
      return null;
    }
    return domain;
  }

  private async isSenderDomainHealthy(
    workspaceId: string,
    campaignMailbox: string | null,
  ): Promise<boolean> {
    // System SMTP (app password) is enough to send; DNS auth is advisory.
    if (this.isSmtpConfigured()) {
      return true;
    }

    let domain =
      this.extractEmailDomain(campaignMailbox) ||
      this.extractEmailDomain(this.config.get<string>('SMTP_FROM')) ||
      this.extractEmailDomain(this.config.get<string>('SMTP_USER'));

    if (!domain) {
      const integration = await this.prisma.emailIntegration.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
        select: { accountEmail: true },
      });
      domain = this.extractEmailDomain(integration?.accountEmail);
    }

    if (!domain) return false;

    try {
      const result = await this.domainDns.checkDomain(domain);
      return result.spf === 'valid' && result.dkim === 'valid';
    } catch {
      return false;
    }
  }
}
