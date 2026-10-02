import { Injectable, Logger } from '@nestjs/common';
import {
  CampaignLeadStatus,
  MessageDirection,
  MessageStatus,
  SuppressionReason,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const PENDING_OUTBOUND: MessageStatus[] = [
  MessageStatus.DRAFT,
  MessageStatus.QUEUED,
  MessageStatus.SCHEDULED,
  MessageStatus.SENDING,
];

const SENT_OUTBOUND: MessageStatus[] = [
  MessageStatus.SENT,
  MessageStatus.DELIVERED,
];

@Injectable()
export class CampaignLeadStatusService {
  private readonly logger = new Logger(CampaignLeadStatusService.name);

  constructor(private readonly prisma: PrismaService) {}

  async setStatus(
    workspaceId: string,
    leadId: string,
    leadStatus: CampaignLeadStatus,
  ): Promise<void> {
    await this.prisma.setWorkspaceContext(workspaceId);
    await this.prisma.lead.updateMany({
      where: { id: leadId, workspaceId },
      data: { leadStatus, lastActivityAt: new Date() },
    });
  }

  async setStatusForLeads(
    workspaceId: string,
    leadIds: string[],
    leadStatus: CampaignLeadStatus,
  ): Promise<void> {
    if (leadIds.length === 0) return;
    await this.prisma.setWorkspaceContext(workspaceId);
    await this.prisma.lead.updateMany({
      where: { workspaceId, id: { in: leadIds } },
      data: { leadStatus, lastActivityAt: new Date() },
    });
  }

  /**
   * Derive precise campaign progress from outbound messages + suppressions.
   * Terminal statuses (REPLIED / BOUNCED / UNSUBSCRIBED) are preserved unless
   * `force` is true.
   */
  async syncFromActivity(
    workspaceId: string,
    leadId: string,
    options: { force?: boolean; prefer?: CampaignLeadStatus } = {},
  ): Promise<CampaignLeadStatus | null> {
    await this.prisma.setWorkspaceContext(workspaceId);

    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, workspaceId },
      select: {
        id: true,
        leadStatus: true,
        campaignId: true,
        contact: { select: { email: true } },
      },
    });
    if (!lead) return null;

    const terminal: CampaignLeadStatus[] = [
      CampaignLeadStatus.REPLIED,
      CampaignLeadStatus.BOUNCED,
      CampaignLeadStatus.UNSUBSCRIBED,
      CampaignLeadStatus.COMPLETED,
    ];
    if (
      !options.force &&
      !options.prefer &&
      lead.leadStatus &&
      terminal.includes(lead.leadStatus)
    ) {
      return lead.leadStatus;
    }

    if (options.prefer) {
      await this.setStatus(workspaceId, leadId, options.prefer);
      return options.prefer;
    }

    const email = lead.contact.email.toLowerCase();
    const suppression = await this.prisma.suppressionEntry.findFirst({
      where: { workspaceId, email },
      select: { reason: true },
    });
    if (suppression?.reason === SuppressionReason.UNSUBSCRIBE) {
      await this.setStatus(workspaceId, leadId, CampaignLeadStatus.UNSUBSCRIBED);
      return CampaignLeadStatus.UNSUBSCRIBED;
    }
    if (suppression?.reason === SuppressionReason.BOUNCE) {
      await this.setStatus(workspaceId, leadId, CampaignLeadStatus.BOUNCED);
      return CampaignLeadStatus.BOUNCED;
    }

    const messages = await this.prisma.message.findMany({
      where: {
        workspaceId,
        leadId,
        direction: MessageDirection.OUTBOUND,
        ...(lead.campaignId ? { campaignId: lead.campaignId } : {}),
      },
      select: { status: true, scheduledAt: true },
      orderBy: [{ scheduledAt: 'asc' }, { sequenceStep: 'asc' }],
    });

    const inboundReply = await this.prisma.message.count({
      where: {
        workspaceId,
        leadId,
        direction: MessageDirection.INBOUND,
      },
    });
    if (inboundReply > 0) {
      await this.setStatus(workspaceId, leadId, CampaignLeadStatus.REPLIED);
      return CampaignLeadStatus.REPLIED;
    }

    const now = Date.now();
    const pending = messages.filter((m) => PENDING_OUTBOUND.includes(m.status));
    const sentCount = messages.filter((m) => SENT_OUTBOUND.includes(m.status)).length;
    const bounced = messages.some((m) => m.status === MessageStatus.BOUNCED);
    if (bounced) {
      await this.setStatus(workspaceId, leadId, CampaignLeadStatus.BOUNCED);
      return CampaignLeadStatus.BOUNCED;
    }

    if (pending.length === 0) {
      const next =
        sentCount > 0
          ? CampaignLeadStatus.COMPLETED
          : lead.leadStatus ?? CampaignLeadStatus.QUEUED;
      await this.setStatus(workspaceId, leadId, next);
      return next;
    }

    const nextPending = pending
      .filter((m) => m.scheduledAt != null)
      .sort(
        (a, b) =>
          (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0),
      )[0];

    const queuedNow = pending.some(
      (m) =>
        m.status === MessageStatus.QUEUED ||
        m.status === MessageStatus.SENDING ||
        (m.scheduledAt != null && m.scheduledAt.getTime() <= now),
    );

    let next: CampaignLeadStatus;
    if (queuedNow && sentCount > 0) {
      next = CampaignLeadStatus.FOLLOW_UP_DUE;
    } else if (queuedNow) {
      next = CampaignLeadStatus.QUEUED;
    } else if (
      nextPending?.scheduledAt &&
      nextPending.scheduledAt.getTime() > now
    ) {
      next = CampaignLeadStatus.SCHEDULED;
    } else if (sentCount > 0) {
      next = CampaignLeadStatus.SENT;
    } else {
      next = CampaignLeadStatus.QUEUED;
    }

    await this.setStatus(workspaceId, leadId, next);
    return next;
  }

  async pauseCampaignLeads(
    workspaceId: string,
    campaignId: string,
  ): Promise<number> {
    await this.prisma.setWorkspaceContext(workspaceId);
    const result = await this.prisma.lead.updateMany({
      where: {
        workspaceId,
        campaignId,
        OR: [
          { leadStatus: null },
          {
            leadStatus: {
              notIn: [
                CampaignLeadStatus.BOUNCED,
                CampaignLeadStatus.UNSUBSCRIBED,
                CampaignLeadStatus.COMPLETED,
                CampaignLeadStatus.REPLIED,
              ],
            },
          },
        ],
      },
      data: { leadStatus: CampaignLeadStatus.PAUSED },
    });
    return result.count;
  }

  async resumeCampaignLeads(
    workspaceId: string,
    campaignId: string,
  ): Promise<void> {
    await this.prisma.setWorkspaceContext(workspaceId);
    const leads = await this.prisma.lead.findMany({
      where: {
        workspaceId,
        campaignId,
        leadStatus: CampaignLeadStatus.PAUSED,
      },
      select: { id: true },
    });
    for (const lead of leads) {
      try {
        await this.syncFromActivity(workspaceId, lead.id, { force: true });
      } catch (error) {
        this.logger.warn(
          `Failed syncing leadStatus for ${lead.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }
}
