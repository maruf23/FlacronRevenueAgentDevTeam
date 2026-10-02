import { Injectable } from '@nestjs/common';
import {
  LeadStatus,
  MessageDirection,
  MessageStatus,
  ReplySentiment,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(workspaceId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalLeads,
      qualifiedLeads,
      meetingsBooked,
      converted,
      newThisWeek,
      sentOutbound,
      replies,
      positiveReplies,
      bounced,
      suppressed,
      campaignsRunning,
      campaignsTotal,
      leadsByStatus,
      leadsBySource,
      dailyVolume,
    ] = await Promise.all([
      this.prisma.lead.count({ where: { workspaceId } }),
      this.prisma.lead.count({
        where: { workspaceId, status: LeadStatus.QUALIFIED },
      }),
      this.prisma.lead.count({
        where: { workspaceId, status: LeadStatus.MEETING_SCHEDULED },
      }),
      this.prisma.lead.count({
        where: { workspaceId, status: LeadStatus.CONVERTED },
      }),
      this.prisma.lead.count({
        where: { workspaceId, createdAt: { gte: since7d } },
      }),
      this.prisma.message.count({
        where: {
          workspaceId,
          direction: MessageDirection.OUTBOUND,
          status: {
            in: [
              MessageStatus.SENT,
              MessageStatus.DELIVERED,
              MessageStatus.BOUNCED,
            ],
          },
          sentAt: { gte: since30d },
        },
      }),
      this.prisma.message.count({
        where: {
          workspaceId,
          direction: MessageDirection.INBOUND,
          receivedAt: { gte: since30d },
        },
      }),
      this.prisma.message.count({
        where: {
          workspaceId,
          direction: MessageDirection.INBOUND,
          sentiment: ReplySentiment.POSITIVE,
          receivedAt: { gte: since30d },
        },
      }),
      this.prisma.message.count({
        where: {
          workspaceId,
          status: MessageStatus.BOUNCED,
          updatedAt: { gte: since30d },
        },
      }),
      this.prisma.suppressionEntry.count({ where: { workspaceId } }),
      this.prisma.campaign.count({
        where: { workspaceId, status: 'RUNNING' },
      }),
      this.prisma.campaign.count({ where: { workspaceId } }),
      this.prisma.lead.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.prisma.lead.groupBy({
        by: ['source'],
        where: { workspaceId },
        _count: { _all: true },
      }),
      this.dailyLeadVolume(workspaceId, 30),
    ]);

    const replyRate =
      sentOutbound > 0 ? Math.round((replies / sentOutbound) * 1000) / 10 : 0;
    const bounceRate =
      sentOutbound > 0 ? Math.round((bounced / sentOutbound) * 1000) / 10 : 0;
    const conversionRate =
      totalLeads > 0
        ? Math.round((converted / totalLeads) * 1000) / 10
        : 0;

    const pipelineOpen = await this.prisma.lead.findMany({
      where: {
        workspaceId,
        status: {
          notIn: [
            LeadStatus.LOST,
            LeadStatus.UNQUALIFIED,
            LeadStatus.BOUNCED,
            LeadStatus.COMPLAINED,
            LeadStatus.CONVERTED,
          ],
        },
      },
      select: { leadScore: true },
    });
    const pipelineValue = pipelineOpen.reduce(
      (sum, l) => sum + (l.leadScore ?? 40) * 250,
      0,
    );

    const sourceBreakdown = leadsBySource.map((row) => ({
      name: row.source || 'Unknown',
      value: row._count._all,
    }));

    const funnel = leadsByStatus.map((row) => ({
      stage: row.status,
      count: row._count._all,
    }));

    return {
      metrics: {
        revenuePipeline: pipelineValue,
        qualifiedLeads,
        meetingsBooked,
        conversionRate,
        newLeadsThisWeek: newThisWeek,
        totalLeads,
        campaignsRunning,
        campaignsTotal,
        sentOutbound30d: sentOutbound,
        replies30d: replies,
        positiveReplies30d: positiveReplies,
        bounceRate,
        replyRate,
        suppressedContacts: suppressed,
      },
      funnel,
      sources: sourceBreakdown,
      dailyVolume,
    };
  }

  private async dailyLeadVolume(workspaceId: string, days: number) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const leads = await this.prisma.lead.findMany({
      where: { workspaceId, createdAt: { gte: since } },
      select: { createdAt: true },
    });
    const buckets = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, 0);
    }
    for (const lead of leads) {
      const key = lead.createdAt.toISOString().slice(0, 10);
      if (buckets.has(key)) {
        buckets.set(key, (buckets.get(key) ?? 0) + 1);
      }
    }
    return [...buckets.entries()].map(([day, leadsCount]) => ({
      day,
      leads: leadsCount,
    }));
  }
}
