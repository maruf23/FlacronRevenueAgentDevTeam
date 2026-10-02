import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { MessageDirection, MessageStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WorkspacePauseService } from '../safety/workspace-pause.service';
import { DomainDnsService } from './domain-dns.service';

@Injectable()
export class DeliverabilityService {
  private readonly logger = new Logger(DeliverabilityService.name);
  private readonly bounceThreshold: number;
  private readonly complaintThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly workspacePause: WorkspacePauseService,
    private readonly domainDns: DomainDnsService,
  ) {
    this.bounceThreshold = Number(
      this.config.get('DELIVERABILITY_BOUNCE_RATE_THRESHOLD', '0.05'),
    );
    this.complaintThreshold = Number(
      this.config.get('DELIVERABILITY_COMPLAINT_RATE_THRESHOLD', '0.001'),
    );
  }

  /** Safety scan every 15 minutes across all workspaces (last 24h rates). */
  @Cron('*/15 * * * *')
  async scanAllWorkspaces() {
    this.logger.log('Starting 15-minute deliverability scan');

    // Bypass RLS — cron has no tenant context
    await this.prisma.setWorkspaceContext(null);

    const workspaces = await this.prisma.workspace.findMany({
      select: { id: true, name: true, isPaused: true },
    });

    for (const workspace of workspaces) {
      try {
        await this.evaluateWorkspace(workspace.id, workspace.isPaused);
      } catch (error) {
        this.logger.error(
          `Deliverability scan failed for ${workspace.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  async getSummary(workspaceId: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const statuses: MessageStatus[] = [
      MessageStatus.SENT,
      MessageStatus.DELIVERED,
      MessageStatus.BOUNCED,
      MessageStatus.COMPLAINED,
    ];

    const rows = await this.prisma.message.groupBy({
      by: ['status'],
      where: {
        workspaceId,
        direction: MessageDirection.OUTBOUND,
        OR: [
          { sentAt: { gte: since } },
          { sentAt: null, createdAt: { gte: since }, status: { in: statuses } },
        ],
        status: { in: statuses },
      },
      _count: { _all: true },
    });

    const counts = Object.fromEntries(
      rows.map((r) => [r.status, r._count._all]),
    ) as Partial<Record<MessageStatus, number>>;

    const total_sent =
      (counts[MessageStatus.SENT] ?? 0) +
      (counts[MessageStatus.DELIVERED] ?? 0) +
      (counts[MessageStatus.BOUNCED] ?? 0) +
      (counts[MessageStatus.COMPLAINED] ?? 0);
    const bounces = counts[MessageStatus.BOUNCED] ?? 0;
    const complaints = counts[MessageStatus.COMPLAINED] ?? 0;
    const bounce_rate = total_sent > 0 ? bounces / total_sent : 0;
    const complaint_rate = total_sent > 0 ? complaints / total_sent : 0;

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        isPaused: true,
        pauseReason: true,
        pausedAt: true,
      },
    });

    let bounce_breakdown: Record<string, number> = {};
    try {
      const hardSoft = await this.prisma.$queryRaw<
        Array<{ bounce_type: string | null; count: bigint }>
      >`
        SELECT bounce_type, COUNT(*)::bigint AS count
        FROM messages
        WHERE workspace_id = ${workspaceId}::uuid
          AND status = 'BOUNCED'::"MessageStatus"
          AND (sent_at >= ${since} OR created_at >= ${since})
        GROUP BY bounce_type
      `;
      bounce_breakdown = Object.fromEntries(
        hardSoft.map((r) => [r.bounce_type ?? 'unknown', Number(r.count)]),
      );
    } catch (error) {
      this.logger.warn(
        `Bounce breakdown unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    return {
      window_days: 30,
      total_sent,
      bounces,
      complaints,
      bounce_rate,
      complaint_rate,
      bounce_breakdown,
      isPaused: workspace?.isPaused ?? false,
      pauseReason: workspace?.pauseReason ?? null,
      pausedAt: workspace?.pausedAt ?? null,
      thresholds: {
        bounce_rate: this.bounceThreshold,
        complaint_rate: this.complaintThreshold,
        window_hours: 24,
      },
    };
  }

  async checkSendingDomain(workspaceId: string, domainOverride?: string) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const domain =
      domainOverride?.trim() ||
      (await this.resolveSendingDomain(workspaceId));

    if (!domain) {
      throw new BadRequestException(
        'No sending domain found. Connect an email integration or pass ?domain=',
      );
    }

    const result = await this.domainDns.checkDomain(domain);
    // Buyer contract: spf/dkim/dmarc status fields
    return {
      spf: result.spf,
      dkim: result.dkim,
      dmarc: result.dmarc,
      domain: result.domain,
      details: result.details,
    };
  }

  private async resolveSendingDomain(
    workspaceId: string,
  ): Promise<string | null> {
    const integration = await this.prisma.emailIntegration.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      select: { accountEmail: true },
    });
    if (integration?.accountEmail?.includes('@')) {
      return integration.accountEmail.split('@')[1];
    }

    const from =
      this.config.get<string>('SMTP_FROM')?.trim() ||
      this.config.get<string>('SMTP_USER')?.trim();
    if (!from) return null;

    const angle = from.match(/<([^>]+)>/);
    const email = (angle?.[1] ?? from).trim();
    if (!email.includes('@')) return null;
    return email.split('@')[1];
  }

  async evaluateWorkspace(workspaceId: string, alreadyPaused = false) {
    await this.prisma.setWorkspaceContext(workspaceId);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const statuses: MessageStatus[] = [
      MessageStatus.SENT,
      MessageStatus.DELIVERED,
      MessageStatus.BOUNCED,
      MessageStatus.COMPLAINED,
    ];

    const rows = await this.prisma.message.groupBy({
      by: ['status'],
      where: {
        workspaceId,
        direction: MessageDirection.OUTBOUND,
        createdAt: { gte: since },
        status: { in: statuses },
      },
      _count: { _all: true },
    });

    const counts = Object.fromEntries(
      rows.map((r) => [r.status, r._count._all]),
    ) as Partial<Record<MessageStatus, number>>;

    const sent =
      (counts[MessageStatus.SENT] ?? 0) +
      (counts[MessageStatus.DELIVERED] ?? 0);
    const bounced = counts[MessageStatus.BOUNCED] ?? 0;
    const complained = counts[MessageStatus.COMPLAINED] ?? 0;
    const total = sent + bounced + complained;

    if (total < 10) {
      // Avoid noisy pauses on tiny samples
      return {
        workspaceId,
        total,
        bounceRate: 0,
        complaintRate: 0,
        paused: false,
      };
    }

    const bounceRate = bounced / total;
    const complaintRate = complained / total;

    const breached =
      bounceRate > this.bounceThreshold ||
      complaintRate > this.complaintThreshold;

    if (!breached) {
      return {
        workspaceId,
        total,
        bounceRate,
        complaintRate,
        paused: false,
      };
    }

    const reason = `Deliverability alert (24h): bounceRate=${(bounceRate * 100).toFixed(2)}% (threshold ${(this.bounceThreshold * 100).toFixed(1)}%), complaintRate=${(complaintRate * 100).toFixed(3)}% (threshold ${(this.complaintThreshold * 100).toFixed(2)}%)`;

    this.logger.warn(reason);

    if (!alreadyPaused) {
      await this.workspacePause.pauseWorkspace({
        workspaceId,
        reason,
        cancelOutbound: true,
        notificationType: 'DELIVERABILITY_ALERT',
      });
    } else {
      await this.prisma.notification.create({
        data: {
          workspaceId,
          type: 'DELIVERABILITY_ALERT',
          title: 'Deliverability threshold breached',
          body: reason,
          metadata: { bounceRate, complaintRate, total },
        },
      });
    }

    return {
      workspaceId,
      total,
      bounceRate,
      complaintRate,
      paused: true,
      reason,
    };
  }
}
