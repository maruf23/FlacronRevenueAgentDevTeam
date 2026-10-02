import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LeadStatus, Prisma, VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  VERIFICATION_PROVIDER,
  VerificationProvider,
} from '../leads-import/verification/verification-provider.interface';
import { CAMPAIGN_EVENTS } from '../campaigns/campaign.events';

/** Maps pipeline stage labels (incl. WON alias) to LeadStatus */
const STAGE_TO_STATUS: Record<string, LeadStatus> = {
  NEW: LeadStatus.NEW,
  ENRICHED: LeadStatus.ENRICHED,
  READY: LeadStatus.READY,
  CONTACTED: LeadStatus.CONTACTED,
  ENGAGED: LeadStatus.ENGAGED,
  REPLIED: LeadStatus.REPLIED,
  QUALIFIED: LeadStatus.QUALIFIED,
  MEETING_SCHEDULED: LeadStatus.MEETING_SCHEDULED,
  WON: LeadStatus.CONVERTED,
  CONVERTED: LeadStatus.CONVERTED,
  UNQUALIFIED: LeadStatus.UNQUALIFIED,
  LOST: LeadStatus.LOST,
  BOUNCED: LeadStatus.BOUNCED,
  COMPLAINED: LeadStatus.COMPLAINED,
  PAUSED: LeadStatus.PAUSED,
};

const VERIFICATION_STATUS_MAP: Record<string, VerificationStatus> = {
  verified: VerificationStatus.VERIFIED,
  catch_all: VerificationStatus.CATCH_ALL,
  invalid: VerificationStatus.INVALID,
  risky: VerificationStatus.RISKY,
};

function toPipelineStage(status: LeadStatus): string {
  return status === LeadStatus.CONVERTED ? 'WON' : status;
}

function mapLead(lead: {
  id: string;
  status: LeadStatus;
  leadScore: number | null;
  industry: string | null;
  location: string | null;
  source: string | null;
  lastActivityAt: Date | null;
  nextRecommendedAction: string | null;
  assignedUserId: string | null;
  campaignId: string | null;
  createdAt: Date;
  updatedAt: Date;
  scoreExplanation?: unknown;
  qualification?: unknown;
  contact: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    verificationStatus: string;
    title: string | null;
  };
  assignedUser?: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
  campaign?: {
    id: string;
    name: string;
  } | null;
}) {
  return {
    id: lead.id,
    status: toPipelineStage(lead.status),
    pipelineStage: toPipelineStage(lead.status),
    leadScore: lead.leadScore,
    scoreExplanation: lead.scoreExplanation ?? null,
    qualification: lead.qualification ?? null,
    industry: lead.industry,
    location: lead.location,
    source: lead.source,
    lastActivityAt: lead.lastActivityAt,
    nextRecommendedAction: lead.nextRecommendedAction,
    assignedUserId: lead.assignedUserId,
    campaignId: lead.campaignId,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
    contact: {
      id: lead.contact.id,
      name:
        [lead.contact.firstName, lead.contact.lastName]
          .filter(Boolean)
          .join(' ')
          .trim() || lead.contact.email,
      email: lead.contact.email,
      firstName: lead.contact.firstName,
      lastName: lead.contact.lastName,
      title: lead.contact.title,
      verification_status: lead.contact.verificationStatus,
    },
    company: {
      name: lead.contact.companyName,
    },
    assignedUser: lead.assignedUser
      ? {
          id: lead.assignedUser.id,
          email: lead.assignedUser.email,
          name:
            [lead.assignedUser.firstName, lead.assignedUser.lastName]
              .filter(Boolean)
              .join(' ')
              .trim() || lead.assignedUser.email,
        }
      : null,
    campaign: lead.campaign
      ? { id: lead.campaign.id, name: lead.campaign.name }
      : null,
    verification_status: lead.contact.verificationStatus,
  };
}

const LEAD_INCLUDE = {
  contact: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      companyName: true,
      verificationStatus: true,
      title: true,
    },
  },
  assignedUser: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  },
  campaign: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

const INDUSTRY_GUESSES = [
  'Software',
  'Healthcare',
  'Finance',
  'Manufacturing',
  'Retail',
  'Professional Services',
  'Education',
  'Real Estate',
];

const LOCATION_GUESSES = [
  'United States',
  'Canada',
  'United Kingdom',
  'Germany',
  'Australia',
  'Remote',
];

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(VERIFICATION_PROVIDER)
    private readonly verificationProvider: VerificationProvider,
    private readonly events: EventEmitter2,
  ) {}

  async findAll(workspaceId: string, status?: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const where: { workspaceId: string; status?: LeadStatus } = { workspaceId };
    if (status) {
      const mapped = STAGE_TO_STATUS[status.toUpperCase()];
      if (!mapped) {
        throw new BadRequestException(`Invalid status filter: ${status}`);
      }
      where.status = mapped;
    }

    const leads = await this.prisma.lead.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: LEAD_INCLUDE,
    });

    return leads.map(mapLead);
  }

  async findOne(workspaceId: string, leadId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      include: LEAD_INCLUDE,
    });
    if (!lead) throw new NotFoundException(`Lead ${leadId} not found`);
    return mapLead(lead);
  }

  async create(
    workspaceId: string,
    input: {
      email: string;
      firstName?: string;
      lastName?: string;
      companyName?: string;
      phone?: string;
      title?: string;
      industry?: string;
      location?: string;
      source?: string;
      campaignId?: string;
      assignedUserId?: string;
    },
  ) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const email = input.email.toLowerCase().trim();
    if (!email.includes('@')) {
      throw new BadRequestException('Valid email is required');
    }

    const existing = await this.prisma.contact.findUnique({
      where: { workspaceId_email: { workspaceId, email } },
      include: { leads: { take: 1, orderBy: { createdAt: 'desc' } } },
    });

    if (existing?.leads[0]) {
      throw new ConflictException('A lead with this email already exists');
    }

    const contact =
      existing ??
      (await this.prisma.contact.create({
        data: {
          workspaceId,
          email,
          firstName: input.firstName?.trim() || null,
          lastName: input.lastName?.trim() || null,
          companyName: input.companyName?.trim() || null,
          phone: input.phone?.trim() || null,
          title: input.title?.trim() || null,
        },
      }));

    const lead = await this.prisma.lead.create({
      data: {
        workspaceId,
        contactId: contact.id,
        status: LeadStatus.NEW,
        industry: input.industry?.trim() || null,
        location: input.location?.trim() || null,
        source: input.source?.trim() || null,
        campaignId: input.campaignId || null,
        assignedUserId: input.assignedUserId || null,
        lastActivityAt: new Date(),
      },
      include: LEAD_INCLUDE,
    });

    return mapLead(lead);
  }

  async updateStage(workspaceId: string, leadId: string, stage: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const mapped = STAGE_TO_STATUS[stage.toUpperCase()];
    if (!mapped) {
      throw new BadRequestException(`Invalid stage: ${stage}`);
    }

    await this.requireLead(workspaceId, leadId);

    const lead = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        status: mapped,
        lastActivityAt: new Date(),
      },
      include: LEAD_INCLUDE,
    });

    if (mapped === LeadStatus.CONVERTED) {
      await this.events.emitAsync(CAMPAIGN_EVENTS.CUSTOMER_CONVERTED, {
        workspaceId,
        leadId,
        reason: 'customer.converted',
        email: lead.contact.email,
      });
    }

    return mapLead(lead);
  }

  async update(
    workspaceId: string,
    leadId: string,
    input: {
      campaignId?: string | null;
      assignedUserId?: string | null;
      industry?: string | null;
      location?: string | null;
      leadScore?: number | null;
      nextRecommendedAction?: string | null;
    },
  ) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const existing = await this.requireLead(workspaceId, leadId);

    if (input.campaignId) {
      const campaign = await this.prisma.campaign.findFirst({
        where: { id: input.campaignId, workspaceId },
        select: { id: true },
      });
      if (!campaign) {
        throw new BadRequestException('Campaign not found in workspace');
      }
    }

    if (input.assignedUserId) {
      const user = await this.prisma.user.findFirst({
        where: { id: input.assignedUserId, workspaceId },
        select: { id: true },
      });
      if (!user) {
        throw new BadRequestException('User not found in workspace');
      }
    }

    const removingFromCampaign =
      input.campaignId === null && existing.campaignId != null;

    const lead = await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        ...(input.campaignId !== undefined
          ? { campaignId: input.campaignId }
          : {}),
        ...(input.assignedUserId !== undefined
          ? { assignedUserId: input.assignedUserId }
          : {}),
        ...(input.industry !== undefined ? { industry: input.industry } : {}),
        ...(input.location !== undefined ? { location: input.location } : {}),
        ...(input.leadScore !== undefined
          ? { leadScore: input.leadScore }
          : {}),
        ...(input.nextRecommendedAction !== undefined
          ? { nextRecommendedAction: input.nextRecommendedAction }
          : {}),
        lastActivityAt: new Date(),
      },
      include: LEAD_INCLUDE,
    });

    if (removingFromCampaign) {
      await this.events.emitAsync(CAMPAIGN_EVENTS.MANUAL_REMOVE, {
        workspaceId,
        leadId,
        reason: 'manual.remove',
        email: lead.contact.email,
      });
    }

    return mapLead(lead);
  }

  async delete(workspaceId: string, leadId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    await this.requireLead(workspaceId, leadId);
    await this.prisma.lead.delete({ where: { id: leadId } });
    return { deleted: true, id: leadId };
  }

  async deleteMany(workspaceId: string, leadIds: string[]) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const result = await this.prisma.lead.deleteMany({
      where: { workspaceId, id: { in: leadIds } },
    });
    return { deleted: result.count };
  }

  async verifyEmail(workspaceId: string, leadId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      include: { contact: true },
    });
    if (!lead) throw new NotFoundException(`Lead ${leadId} not found`);

    const result = await this.verificationProvider.verify(lead.contact.email);
    const status =
      VERIFICATION_STATUS_MAP[result.status] ?? VerificationStatus.PENDING;

    await this.prisma.contact.update({
      where: { id: lead.contactId },
      data: { verificationStatus: status },
    });

    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        lastActivityAt: new Date(),
        nextRecommendedAction:
          status === VerificationStatus.VERIFIED
            ? 'Generate outreach'
            : status === VerificationStatus.INVALID
              ? 'Review or remove invalid email'
              : 'Review verification result',
      },
    });

    return this.findOne(workspaceId, leadId);
  }

  async enrich(workspaceId: string, leadId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      include: { contact: true },
    });
    if (!lead) throw new NotFoundException(`Lead ${leadId} not found`);

    const domain = lead.contact.email.split('@')[1] ?? 'company.com';
    const hash = [...domain].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const industry = INDUSTRY_GUESSES[hash % INDUSTRY_GUESSES.length]!;
    const location = LOCATION_GUESSES[hash % LOCATION_GUESSES.length]!;
    const leadScore = 40 + (hash % 55);

    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        industry: lead.industry ?? industry,
        location: lead.location ?? location,
        leadScore: lead.leadScore ?? leadScore,
        status:
          lead.status === LeadStatus.NEW ? LeadStatus.ENRICHED : lead.status,
        nextRecommendedAction: 'Verify email',
        lastActivityAt: new Date(),
      },
    });

    if (!lead.contact.companyName) {
      const companyGuess = domain
        .split('.')[0]
        ?.replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      if (companyGuess) {
        await this.prisma.contact.update({
          where: { id: lead.contactId },
          data: { companyName: companyGuess },
        });
      }
    }

    return this.findOne(workspaceId, leadId);
  }

  /**
   * Configurable fit score with plain-language explanation (FR-010).
   * Factors: verification, firmographics, campaign assignment, title presence.
   */
  async scoreLead(workspaceId: string, leadId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      include: { contact: true },
    });
    if (!lead) throw new NotFoundException(`Lead ${leadId} not found`);

    const factors: { key: string; label: string; points: number }[] = [];
    let score = 20;
    factors.push({ key: 'base', label: 'Baseline fit', points: 20 });

    const v = lead.contact.verificationStatus;
    if (v === VerificationStatus.VERIFIED) {
      score += 30;
      factors.push({
        key: 'verified',
        label: 'Verified business email',
        points: 30,
      });
    } else if (
      v === VerificationStatus.RISKY ||
      v === VerificationStatus.CATCH_ALL
    ) {
      score += 10;
      factors.push({
        key: 'risky_email',
        label: 'Risky / catch-all email',
        points: 10,
      });
    } else {
      factors.push({
        key: 'unverified',
        label: 'Email not verified yet',
        points: 0,
      });
    }

    if (lead.industry) {
      score += 15;
      factors.push({
        key: 'industry',
        label: `Industry known (${lead.industry})`,
        points: 15,
      });
    }
    if (lead.location) {
      score += 10;
      factors.push({
        key: 'location',
        label: `Location known (${lead.location})`,
        points: 10,
      });
    }
    if (lead.contact.companyName) {
      score += 15;
      factors.push({
        key: 'company',
        label: 'Company present',
        points: 15,
      });
    }
    if (lead.contact.title) {
      score += 5;
      factors.push({
        key: 'title',
        label: `Title present (${lead.contact.title})`,
        points: 5,
      });
    }
    if (lead.campaignId) {
      score += 10;
      factors.push({
        key: 'campaign',
        label: 'Assigned to a campaign',
        points: 10,
      });
    }

    score = Math.min(100, score);
    const tier =
      score >= 75 ? 'high' : score >= 50 ? 'moderate' : 'needs_work';
    const summary =
      tier === 'high'
        ? `High-fit (${score}). Driven by ${factors
            .filter((f) => f.points > 0)
            .map((f) => f.label)
            .join(', ')}.`
        : tier === 'moderate'
          ? `Moderate fit (${score}). ${factors
              .filter((f) => f.points > 0)
              .map((f) => f.label)
              .join('; ')}.`
          : `Needs work (${score}). Improve via enrichment and verification.`;

    const explanation = {
      score,
      tier,
      summary,
      factors,
      scoredAt: new Date().toISOString(),
    };

    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        leadScore: score,
        scoreExplanation: explanation as unknown as Prisma.InputJsonValue,
        lastActivityAt: new Date(),
        nextRecommendedAction:
          score >= 75
            ? 'Approve for outreach'
            : score >= 50
              ? 'Review and enrich'
              : 'Verify email and complete firmographics',
        status:
          lead.status === LeadStatus.NEW || lead.status === LeadStatus.ENRICHED
            ? LeadStatus.READY
            : lead.status,
      },
    });

    const mapped = await this.findOne(workspaceId, leadId);
    return { ...mapped, scoreExplanation: explanation };
  }

  async scoreLeadsBulk(workspaceId: string, leadIds: string[]) {
    const results = [];
    for (const id of leadIds) {
      results.push(await this.scoreLead(workspaceId, id));
    }
    return { scored: results.length, leads: results };
  }

  async updateQualification(
    workspaceId: string,
    leadId: string,
    qualification: Record<string, unknown>,
  ) {
    await this.prisma.setWorkspaceContext(workspaceId);
    await this.requireLead(workspaceId, leadId);
    await this.prisma.lead.update({
      where: { id: leadId },
      data: {
        qualification: qualification as unknown as Prisma.InputJsonValue,
        lastActivityAt: new Date(),
      },
    });
    return this.findOne(workspaceId, leadId);
  }

  async listCampaigns(workspaceId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);
    const campaigns = await this.prisma.campaign.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { leads: true, sequences: true } },
        leads: {
          select: { status: true },
        },
      },
    });

    return campaigns.map((campaign) => {
      const replied = campaign.leads.filter((l) =>
        ['REPLIED', 'ENGAGED', 'QUALIFIED', 'MEETING_SCHEDULED', 'CONVERTED'].includes(
          l.status,
        ),
      ).length;
      const contacted = campaign.leads.filter((l) =>
        [
          'CONTACTED',
          'ENGAGED',
          'REPLIED',
          'QUALIFIED',
          'MEETING_SCHEDULED',
          'CONVERTED',
          'BOUNCED',
          'COMPLAINED',
        ].includes(l.status),
      ).length;

      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        createdAt: campaign.createdAt,
        updatedAt: campaign.updatedAt,
        leadsCount: campaign._count.leads,
        sequencesCount: campaign._count.sequences,
        leadsSent: contacted,
        repliesReceived: replied,
      };
    });
  }

  private async requireLead(workspaceId: string, leadId: string) {
    const existing = await this.prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      select: { id: true, campaignId: true },
    });
    if (!existing) {
      throw new NotFoundException(`Lead ${leadId} not found`);
    }
    return existing;
  }
}
