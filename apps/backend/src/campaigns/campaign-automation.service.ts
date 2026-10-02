import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import {
  CampaignLeadStatus,
  CampaignStatus,
  LeadStatus,
  MessageDirection,
  MessageStatus,
  SequenceStatus,
  VerificationStatus,
} from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SequenceQueueService } from '../sequences/sequence-queue.service';
import { CampaignLeadStatusService } from './campaign-lead-status.service';
import {
  CAMPAIGN_JOBS,
  QUEUE_NAMES,
} from '../queues/queue.constants';

export type CampaignJobPayload = {
  campaignId: string;
  workspaceId: string;
};

type SequenceStepTemplate = {
  step: number;
  subject: string;
  body: string;
  delayDays: number;
  approved?: boolean;
};

type CampaignScheduleConfig = {
  dailySendLimit: number;
  timezone: string;
  quietHours: { start: string; end: string } | null;
  sendingHours: { start: string; end: string } | null;
  startAt: Date | null;
};

const DEFAULT_TICK_MS = 60_000;
const QUIET_RETRY_MS = 5 * 60_000;

@Injectable()
export class CampaignAutomationService {
  private readonly logger = new Logger(CampaignAutomationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sequenceQueue: SequenceQueueService,
    private readonly leadStatus: CampaignLeadStatusService,
    @InjectQueue(QUEUE_NAMES.CAMPAIGN)
    private readonly campaignQueue: Queue,
  ) {}

  /**
   * Enqueue a durable BullMQ start job. Safe to call multiple times (jobId is stable).
   */
  async enqueueCampaignStart(
    workspaceId: string,
    campaignId: string,
    delayMs = 0,
  ): Promise<{ jobId: string }> {
    const jobId = `campaign-start-${campaignId}`;
    const existing = await this.campaignQueue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') {
        await existing.remove();
      } else {
        return { jobId };
      }
    }

    await this.campaignQueue.add(
      CAMPAIGN_JOBS.START,
      { campaignId, workspaceId } satisfies CampaignJobPayload,
      {
        jobId,
        delay: Math.max(0, delayMs),
        attempts: 3,
        backoff: { type: 'exponential', delay: 10_000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );

    this.logger.log(
      `Enqueued campaign start job ${jobId} (delay=${delayMs}ms)`,
    );
    return { jobId };
  }

  async startCampaign(payload: CampaignJobPayload): Promise<void> {
    const { campaignId, workspaceId } = payload;
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
    });
    if (!campaign) {
      throw new NotFoundException(`Campaign ${campaignId} not found`);
    }

    if (
      campaign.status !== CampaignStatus.RUNNING &&
      campaign.status !== CampaignStatus.SCHEDULED
    ) {
      this.logger.warn(
        `Skip start for ${campaignId}: status is ${campaign.status}`,
      );
      return;
    }

    // Promote SCHEDULED → RUNNING when the delayed start fires
    if (campaign.status === CampaignStatus.SCHEDULED) {
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { status: CampaignStatus.RUNNING },
      });
    }

    const materialized = await this.materializeLeadQueue(
      workspaceId,
      campaignId,
      campaign,
    );

    this.logger.log(
      `Campaign ${campaignId}: materialized ${materialized.messages} messages for ${materialized.leads} leads`,
    );

    await this.scheduleTick(workspaceId, campaignId, 0);
  }

  /**
   * Persistent drip loop — continues on the server even if the browser is closed.
   */
  async tickCampaign(payload: CampaignJobPayload): Promise<void> {
    const { campaignId, workspaceId } = payload;
    await this.prisma.setWorkspaceContext(workspaceId);

    const campaign = await this.prisma.campaign.findFirst({
      where: { id: campaignId, workspaceId },
    });
    if (!campaign) {
      this.logger.warn(`Tick skipped — campaign ${campaignId} missing`);
      return;
    }

    if (campaign.status !== CampaignStatus.RUNNING) {
      this.logger.debug(
        `Tick stopped for ${campaignId}: status=${campaign.status}`,
      );
      return;
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { isPaused: true },
    });
    if (workspace?.isPaused) {
      await this.scheduleTick(workspaceId, campaignId, QUIET_RETRY_MS);
      return;
    }

    const schedule = this.parseSchedule(campaign.schedule, campaign.audience);
    const now = new Date();

    if (schedule.startAt && schedule.startAt.getTime() > now.getTime()) {
      const delay = schedule.startAt.getTime() - now.getTime();
      await this.scheduleTick(workspaceId, campaignId, delay);
      return;
    }

    if (!this.isWithinSendingWindow(now, schedule)) {
      const delay = this.msUntilNextSendWindow(now, schedule);
      this.logger.debug(
        `Campaign ${campaignId} in quiet hours — next tick in ${delay}ms`,
      );
      await this.scheduleTick(workspaceId, campaignId, delay);
      return;
    }

    const sentToday = await this.countSentToday(
      workspaceId,
      campaignId,
      now,
      schedule.timezone,
    );
    const remaining = Math.max(0, schedule.dailySendLimit - sentToday);

    if (remaining === 0) {
      const delay = this.msUntilNextLocalMidnight(now, schedule.timezone);
      this.logger.log(
        `Campaign ${campaignId} hit dailySendLimit=${schedule.dailySendLimit}; retry in ${delay}ms`,
      );
      await this.scheduleTick(workspaceId, campaignId, delay);
      return;
    }

    const dueMessages = await this.prisma.message.findMany({
      where: {
        workspaceId,
        direction: MessageDirection.OUTBOUND,
        status: MessageStatus.DRAFT,
        scheduledAt: { lte: now },
        lead: {
          campaignId,
          status: {
            notIn: [
              LeadStatus.BOUNCED,
              LeadStatus.COMPLAINED,
              LeadStatus.LOST,
              LeadStatus.UNQUALIFIED,
              LeadStatus.PAUSED,
              LeadStatus.MEETING_SCHEDULED,
              LeadStatus.CONVERTED,
            ],
          },
        },
      },
      orderBy: [{ scheduledAt: 'asc' }, { sequenceStep: 'asc' }],
      take: remaining,
      select: { id: true, leadId: true },
    });

    let enqueued = 0;
    for (const message of dueMessages) {
      try {
        await this.sequenceQueue.enqueueMessage(message.id, workspaceId);
        enqueued += 1;
      } catch (error) {
        this.logger.warn(
          `Failed enqueue ${message.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const pendingLeft = await this.prisma.message.count({
      where: {
        workspaceId,
        direction: MessageDirection.OUTBOUND,
        status: { in: [MessageStatus.DRAFT, MessageStatus.QUEUED, MessageStatus.SCHEDULED, MessageStatus.SENDING] },
        lead: { campaignId },
      },
    });

    if (pendingLeft === 0) {
      const stillSending = await this.prisma.message.count({
        where: {
          workspaceId,
          status: MessageStatus.QUEUED,
          lead: { campaignId },
        },
      });
      if (stillSending === 0) {
        await this.prisma.campaign.update({
          where: { id: campaignId },
          data: { status: CampaignStatus.COMPLETED },
        });
        this.logger.log(`Campaign ${campaignId} completed — queue drained`);
        return;
      }
    }

    this.logger.log(
      `Campaign ${campaignId} tick: enqueued=${enqueued}, remainingToday=${remaining - enqueued}, pending=${pendingLeft}`,
    );

    await this.scheduleTick(workspaceId, campaignId, DEFAULT_TICK_MS);
  }

  /**
   * Immediately remove campaign start/tick jobs from BullMQ.
   * Optionally drain queued send jobs for this campaign's leads.
   */
  async haltCampaignJobs(
    workspaceId: string,
    campaignId: string,
    options: {
      /** When true, cancel pending outbound messages (Stop). When false, dequeue only (Pause). */
      cancelMessages: boolean;
      reason: string;
    },
  ): Promise<{ removedJobIds: string[]; cancelledMessages: number; dequeuedMessages: number }> {
    const removedJobIds: string[] = [];

    for (const jobId of [
      `campaign-start-${campaignId}`,
      `campaign-tick-${campaignId}`,
    ]) {
      try {
        const job = await this.campaignQueue.getJob(jobId);
        if (job) {
          await job.remove();
          removedJobIds.push(jobId);
        }
      } catch (error) {
        this.logger.warn(
          `Failed removing ${jobId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    let cancelledMessages = 0;
    let dequeuedMessages = 0;

    if (options.cancelMessages) {
      cancelledMessages = await this.sequenceQueue.cancelPendingForCampaign(
        workspaceId,
        campaignId,
        options.reason,
      );
    } else {
      dequeuedMessages = await this.sequenceQueue.dequeuePendingForCampaign(
        workspaceId,
        campaignId,
      );
    }

    this.logger.log(
      `Halted campaign ${campaignId}: removedJobs=${removedJobIds.length}, ` +
        `cancelled=${cancelledMessages}, dequeued=${dequeuedMessages} (${options.reason})`,
    );

    return { removedJobIds, cancelledMessages, dequeuedMessages };
  }

  private async scheduleTick(
    workspaceId: string,
    campaignId: string,
    delayMs: number,
  ) {
    const jobId = `campaign-tick-${campaignId}`;
    const existing = await this.campaignQueue.getJob(jobId);
    if (existing) {
      try {
        await existing.remove();
      } catch {
        // ignore race with active worker
      }
    }

    await this.campaignQueue.add(
      CAMPAIGN_JOBS.TICK,
      { campaignId, workspaceId } satisfies CampaignJobPayload,
      {
        jobId,
        delay: Math.max(1_000, delayMs),
        attempts: 5,
        backoff: { type: 'exponential', delay: 15_000 },
        removeOnComplete: true,
        removeOnFail: 25,
      },
    );
  }

  private async materializeLeadQueue(
    workspaceId: string,
    campaignId: string,
    campaign: {
      settings: unknown;
      calendarLink: string | null;
      schedule: unknown;
      audience: unknown;
      product: string | null;
    },
  ): Promise<{ leads: number; messages: number }> {
    const settings =
      campaign.settings &&
      typeof campaign.settings === 'object' &&
      !Array.isArray(campaign.settings)
        ? (campaign.settings as Record<string, unknown>)
        : {};
    const steps = this.parseSequenceSteps(settings.sequence);
    if (steps.length === 0) {
      this.logger.warn(`Campaign ${campaignId} has no sequence steps`);
      return { leads: 0, messages: 0 };
    }

    // Persist Sequence row for observability (idempotent by name)
    const sequenceName = `Campaign sequence`;
    let sequence = await this.prisma.sequence.findFirst({
      where: { workspaceId, campaignId, name: sequenceName },
      select: { id: true },
    });
    if (!sequence) {
      sequence = await this.prisma.sequence.create({
        data: {
          workspaceId,
          campaignId,
          name: sequenceName,
          status: SequenceStatus.ACTIVE,
          stepOrder: steps.map((s) => ({
            step: s.step,
            delayDays: s.delayDays,
          })),
        },
        select: { id: true },
      });
    } else {
      await this.prisma.sequence.update({
        where: { id: sequence.id },
        data: {
          status: SequenceStatus.ACTIVE,
          stepOrder: steps.map((s) => ({
            step: s.step,
            delayDays: s.delayDays,
          })),
        },
      });
    }

    const schedule = this.parseSchedule(campaign.schedule, campaign.audience);
    const baseStart = schedule.startAt ?? new Date();

    const leads = await this.prisma.lead.findMany({
      where: { workspaceId, campaignId },
      include: { contact: true },
      orderBy: { createdAt: 'asc' },
    });

    const emails = leads.map((l) => l.contact.email.toLowerCase());
    const suppressed =
      emails.length === 0
        ? []
        : await this.prisma.suppressionEntry.findMany({
            where: { workspaceId, email: { in: [...new Set(emails)] } },
            select: { email: true },
          });
    const suppressedSet = new Set(suppressed.map((s) => s.email.toLowerCase()));

    const terminalStatuses: LeadStatus[] = [
      LeadStatus.BOUNCED,
      LeadStatus.COMPLAINED,
      LeadStatus.LOST,
      LeadStatus.UNQUALIFIED,
    ];

    const eligible = leads.filter(
      (l) =>
        l.contact.verificationStatus === VerificationStatus.VERIFIED &&
        !suppressedSet.has(l.contact.email.toLowerCase()) &&
        !terminalStatuses.includes(l.status),
    );

    let messagesCreated = 0;
    for (const lead of eligible) {
      for (const step of steps) {
        const existing = await this.prisma.message.findFirst({
          where: {
            workspaceId,
            leadId: lead.id,
            campaignId,
            sequenceStep: step.step,
            direction: MessageDirection.OUTBOUND,
          },
          select: { id: true },
        });
        if (existing) continue;

        const scheduledAt = new Date(baseStart);
        scheduledAt.setDate(scheduledAt.getDate() + (step.delayDays || 0));

        const subject = this.applyMergeTags(step.subject, lead, campaign);
        const body = this.applyMergeTags(step.body, lead, campaign);

        await this.prisma.message.create({
          data: {
            workspaceId,
            leadId: lead.id,
            campaignId,
            sequenceStep: step.step,
            subject,
            body,
            toEmail: lead.contact.email,
            direction: MessageDirection.OUTBOUND,
            status: MessageStatus.DRAFT,
            scheduledAt,
          },
        });
        messagesCreated += 1;
      }

      await this.prisma.lead.update({
        where: { id: lead.id },
        data: {
          nextRecommendedAction: 'Await campaign send',
          lastActivityAt: new Date(),
          leadStatus: CampaignLeadStatus.SCHEDULED,
        },
      });
      await this.leadStatus.syncFromActivity(workspaceId, lead.id, {
        force: true,
      });
    }

    void sequence;
    return { leads: eligible.length, messages: messagesCreated };
  }

  private parseSequenceSteps(raw: unknown): SequenceStepTemplate[] {
    if (!Array.isArray(raw)) return [];
    const steps: SequenceStepTemplate[] = [];
    raw.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      const step = item as Record<string, unknown>;
      const subject =
        typeof step.subject === 'string' ? step.subject.trim() : '';
      const body = typeof step.body === 'string' ? step.body.trim() : '';
      if (!subject || !body) return;
      if (step.approved !== true) return;
      steps.push({
        step:
          typeof step.step === 'number' && step.step > 0
            ? step.step
            : index + 1,
        subject,
        body,
        delayDays:
          typeof step.delayDays === 'number' && step.delayDays >= 0
            ? step.delayDays
            : 0,
        approved: true,
      });
    });
    return steps.sort((a, b) => a.step - b.step);
  }

  private parseSchedule(
    scheduleRaw: unknown,
    audienceRaw: unknown,
  ): CampaignScheduleConfig {
    const schedule =
      scheduleRaw &&
      typeof scheduleRaw === 'object' &&
      !Array.isArray(scheduleRaw)
        ? (scheduleRaw as Record<string, unknown>)
        : {};
    const audience =
      audienceRaw &&
      typeof audienceRaw === 'object' &&
      !Array.isArray(audienceRaw)
        ? (audienceRaw as Record<string, unknown>)
        : {};

    const quiet =
      schedule.quietHours &&
      typeof schedule.quietHours === 'object' &&
      !Array.isArray(schedule.quietHours)
        ? (schedule.quietHours as Record<string, unknown>)
        : null;

    const dailySendLimit = this.asPositiveNumber(
      schedule.dailySendLimit ??
        schedule.dailySendingLimit ??
        audience.dailySendingLimit ??
        audience.dailySendLimit,
      50,
    );

    const timezone =
      (typeof schedule.timezone === 'string' && schedule.timezone.trim()) ||
      (typeof schedule.timeZone === 'string' && schedule.timeZone.trim()) ||
      'UTC';

    const quietStart =
      (typeof quiet?.start === 'string' && quiet.start) ||
      (typeof schedule.quietHoursStart === 'string' &&
        schedule.quietHoursStart) ||
      null;
    const quietEnd =
      (typeof quiet?.end === 'string' && quiet.end) ||
      (typeof schedule.quietHoursEnd === 'string' && schedule.quietHoursEnd) ||
      null;

    const sendStart =
      (typeof audience.sendingHoursStart === 'string' &&
        audience.sendingHoursStart) ||
      (typeof schedule.sendingHoursStart === 'string' &&
        schedule.sendingHoursStart) ||
      null;
    const sendEnd =
      (typeof audience.sendingHoursEnd === 'string' &&
        audience.sendingHoursEnd) ||
      (typeof schedule.sendingHoursEnd === 'string' &&
        schedule.sendingHoursEnd) ||
      null;

    const startRaw =
      (typeof schedule.startDate === 'string' && schedule.startDate) ||
      (typeof schedule.startAt === 'string' && schedule.startAt) ||
      null;
    const startMode =
      (typeof schedule.startMode === 'string' && schedule.startMode) ||
      (typeof schedule.startOption === 'string' && schedule.startOption) ||
      'now';

    let startAt: Date | null = null;
    if (startMode === 'later' && startRaw) {
      const parsed = new Date(startRaw);
      if (!Number.isNaN(parsed.getTime())) startAt = parsed;
    }

    return {
      dailySendLimit,
      timezone,
      quietHours:
        quietStart && quietEnd ? { start: quietStart, end: quietEnd } : null,
      sendingHours:
        sendStart && sendEnd ? { start: sendStart, end: sendEnd } : null,
      startAt,
    };
  }

  private asPositiveNumber(value: unknown, fallback: number): number {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
    if (typeof value === 'string' && value.trim()) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
    return fallback;
  }

  private applyMergeTags(
    template: string,
    lead: {
      industry: string | null;
      contact: {
        firstName: string | null;
        lastName: string | null;
        companyName: string | null;
        title: string | null;
      };
    },
    campaign: { calendarLink: string | null; product: string | null },
  ): string {
    const firstName = lead.contact.firstName || 'there';
    const company = lead.contact.companyName || 'your company';
    return template
      .replaceAll('{{first_name}}', firstName)
      .replaceAll('{{company}}', company)
      .replaceAll('{{job_title}}', lead.contact.title || 'your role')
      .replaceAll('{{industry}}', lead.industry || 'your industry')
      .replaceAll('{{pain_point}}', 'growth challenges')
      .replaceAll(
        '{{calendar_link}}',
        campaign.calendarLink || 'https://cal.com/demo',
      )
      .replaceAll('{{product}}', campaign.product || 'our product');
  }

  private getZonedMinutes(date: Date, timeZone: string): {
    minutes: number;
    ymd: string;
  } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const get = (type: string) =>
      parts.find((p) => p.type === type)?.value ?? '0';
    const hour = Number(get('hour'));
    const minute = Number(get('minute'));
    return {
      minutes: hour * 60 + minute,
      ymd: `${get('year')}-${get('month')}-${get('day')}`,
    };
  }

  private parseHmToMinutes(value: string): number | null {
    const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    const h = Number(match[1]);
    const m = Number(match[2]);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }

  private isWithinSendingWindow(
    now: Date,
    schedule: CampaignScheduleConfig,
  ): boolean {
    const { minutes } = this.getZonedMinutes(now, schedule.timezone);

    if (schedule.quietHours) {
      const start = this.parseHmToMinutes(schedule.quietHours.start);
      const end = this.parseHmToMinutes(schedule.quietHours.end);
      if (start != null && end != null) {
        const inQuiet =
          start < end
            ? minutes >= start && minutes < end
            : minutes >= start || minutes < end;
        if (inQuiet) return false;
      }
    }

    if (schedule.sendingHours) {
      const start = this.parseHmToMinutes(schedule.sendingHours.start);
      const end = this.parseHmToMinutes(schedule.sendingHours.end);
      if (start != null && end != null) {
        return start < end
          ? minutes >= start && minutes < end
          : minutes >= start || minutes < end;
      }
    }

    return true;
  }

  private msUntilNextSendWindow(
    now: Date,
    schedule: CampaignScheduleConfig,
  ): number {
    // Retry on a fixed cadence during quiet hours
    return QUIET_RETRY_MS;
  }

  private msUntilNextLocalMidnight(now: Date, timeZone: string): number {
    const { minutes } = this.getZonedMinutes(now, timeZone);
    const remainingToday = 24 * 60 - minutes;
    return Math.max(DEFAULT_TICK_MS, remainingToday * 60_000);
  }

  private async countSentToday(
    workspaceId: string,
    campaignId: string,
    now: Date,
    timeZone: string,
  ): Promise<number> {
    const { ymd } = this.getZonedMinutes(now, timeZone);
    // Use UTC window spanning ~36h then filter by zoned day — good enough without luxon
    const windowStart = new Date(now.getTime() - 36 * 60 * 60 * 1000);
    const rows = await this.prisma.message.findMany({
      where: {
        workspaceId,
        status: MessageStatus.SENT,
        sentAt: { gte: windowStart },
        lead: { campaignId },
      },
      select: { sentAt: true },
    });

    return rows.filter((row) => {
      if (!row.sentAt) return false;
      return this.getZonedMinutes(row.sentAt, timeZone).ymd === ymd;
    }).length;
  }
}
