'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { checkAdsBudget, formatUsd } from '@/lib/ads-budget';
import { CAMPAIGN_CHANNELS, type CampaignWizardData } from '@/types/campaigns';
import { MOCK_MAILBOXES } from '@/lib/campaigns-mock';

export type LaunchSummary = {
  audience: string;
  leadsCount: number;
  mailbox: string;
  channels: string;
  dailyLimit: string;
  schedule: string;
  estimatedAdSpend: string;
};

export function buildLaunchSummaryFromWizard(
  data: CampaignWizardData,
): LaunchSummary {
  const audienceBits = [
    data.audience.industries.slice(0, 3).join(', ') || null,
    data.audience.locations.slice(0, 2).join(', ') || null,
    data.audience.jobTitles.slice(0, 3).join(', ') || null,
  ].filter(Boolean);

  const mailbox =
    MOCK_MAILBOXES.find((m) => m.id === data.audience.mailboxId)?.email ||
    data.mailbox ||
    'No mailbox selected';

  const channels =
    CAMPAIGN_CHANNELS.filter((c) => data.channels[c.id])
      .map((c) => c.label)
      .join(', ') || 'None';

  const schedule =
    data.schedule.startOption === 'now'
      ? 'Start immediately'
      : data.schedule.startOption === 'later'
        ? data.schedule.startAt
          ? `Scheduled for ${data.schedule.startAt.replace('T', ' ')}`
          : 'Scheduled for later'
        : `Starts in ${data.schedule.countdownHours} hours`;

  const adsOn = data.channels.ads;
  let estimatedAdSpend = 'No paid ads';
  if (adsOn) {
    const budget = checkAdsBudget(data.ads.dailyBudget, data.ads.totalBudget);
    estimatedAdSpend = budget.valid && budget.summary
      ? `${formatUsd(data.ads.totalBudget)} total · ${budget.summary}`
      : `${formatUsd(data.ads.totalBudget)} total (${formatUsd(data.ads.dailyBudget)}/day)`;
  }

  return {
    audience: audienceBits.length ? audienceBits.join(' · ') : 'No ICP filters',
    leadsCount: data.selectedLeadIds.length || data.eligibility.total,
    mailbox,
    channels,
    dailyLimit: `${data.audience.dailySendingLimit}/day`,
    schedule,
    estimatedAdSpend,
  };
}

export function buildLaunchSummaryFromCampaign(input: {
  audience?: Record<string, unknown> | null;
  settings?: Record<string, unknown> | null;
  mailbox?: string | null;
  schedule?: Record<string, unknown> | null;
  leadsCount?: number;
}): LaunchSummary {
  const audience = input.audience ?? {};
  const settings = input.settings ?? {};
  const ads =
    settings.ads && typeof settings.ads === 'object'
      ? (settings.ads as Record<string, unknown>)
      : {};
  const channelsRaw =
    settings.channels && typeof settings.channels === 'object'
      ? (settings.channels as Record<string, unknown>)
      : {};

  const list = (value: unknown) =>
    Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];

  const audienceBits = [
    list(audience.industries || audience.industry).slice(0, 3).join(', ') ||
      null,
    list(audience.locations || audience.location).slice(0, 2).join(', ') ||
      null,
    list(audience.jobTitles || audience.job_titles).slice(0, 3).join(', ') ||
      null,
  ].filter(Boolean);

  const channels =
    CAMPAIGN_CHANNELS.filter((c) => channelsRaw[c.id])
      .map((c) => c.label)
      .join(', ') || 'Email';

  const startOption = String(input.schedule?.startOption ?? 'now');
  const startAt = String(input.schedule?.startAt ?? '');
  const countdown = Number(input.schedule?.countdownHours ?? 0);
  const schedule =
    startOption === 'later' && startAt
      ? `Scheduled for ${startAt.replace('T', ' ')}`
      : startOption === 'countdown'
        ? `Starts in ${countdown} hours`
        : 'Start immediately';

  const dailyLimitValue =
    typeof audience.dailySendingLimit === 'number'
      ? audience.dailySendingLimit
      : typeof settings.dailySendingLimit === 'number'
        ? settings.dailySendingLimit
        : 50;

  const adsOn = Boolean(channelsRaw.ads);
  const daily = typeof ads.dailyBudget === 'number' ? ads.dailyBudget : 0;
  const total = typeof ads.totalBudget === 'number' ? ads.totalBudget : 0;
  let estimatedAdSpend = 'No paid ads';
  if (adsOn) {
    const budget = checkAdsBudget(daily, total);
    estimatedAdSpend =
      budget.valid && budget.summary
        ? `${formatUsd(total)} total · ${budget.summary}`
        : `${formatUsd(total)} total (${formatUsd(daily)}/day)`;
  }

  return {
    audience: audienceBits.length ? audienceBits.join(' · ') : 'No ICP filters',
    leadsCount: input.leadsCount ?? 0,
    mailbox: input.mailbox || 'No mailbox selected',
    channels,
    dailyLimit: `${dailyLimitValue}/day`,
    schedule,
    estimatedAdSpend,
  };
}

const ROWS: { key: keyof LaunchSummary; label: string }[] = [
  { key: 'audience', label: 'Target audience' },
  { key: 'leadsCount', label: 'Assigned leads' },
  { key: 'mailbox', label: 'Sending mailbox' },
  { key: 'channels', label: 'Channels' },
  { key: 'dailyLimit', label: 'Daily sending limit' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'estimatedAdSpend', label: 'Estimated ad spend' },
];

type LaunchConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: LaunchSummary;
  confirmLabel?: string;
  busy?: boolean;
  launchMode?: 'draft' | 'approval' | 'autopilot';
  readinessNote?: string;
  onConfirm: () => void;
};

export function LaunchConfirmDialog({
  open,
  onOpenChange,
  summary,
  confirmLabel = 'Launch campaign',
  busy,
  launchMode = 'autopilot',
  readinessNote,
  onConfirm,
}: LaunchConfirmDialogProps) {
  const title =
    launchMode === 'draft'
      ? 'Save as draft?'
      : launchMode === 'approval'
        ? 'Submit for approval?'
        : 'Confirm launch';

  const description =
    launchMode === 'draft'
      ? 'The campaign will be saved as Draft. No emails will be sent.'
      : launchMode === 'approval'
        ? 'This does not start the campaign. It will move to Needs Review for an admin to approve before sending.'
        : 'Review this summary before the campaign starts sending.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {readinessNote ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            {readinessNote}
          </p>
        ) : null}
        <dl className="space-y-2.5 rounded-lg border bg-muted/30 p-3">
          {ROWS.map((row) => (
            <div
              key={row.key}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="max-w-[60%] text-right font-medium text-navy">
                {row.key === 'leadsCount'
                  ? String(summary.leadsCount)
                  : summary[row.key]}
              </dd>
            </div>
          ))}
        </dl>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={busy}>
            {busy
              ? launchMode === 'approval'
                ? 'Submitting…'
                : launchMode === 'draft'
                  ? 'Saving…'
                  : 'Launching…'
              : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function LaunchSummaryCard({ summary }: { summary: LaunchSummary }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="mb-3 text-sm font-semibold text-navy">Launch summary</p>
      <dl className="space-y-2">
        {ROWS.map((row) => (
          <div
            key={row.key}
            className="flex items-start justify-between gap-3 text-sm"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="max-w-[60%] text-right font-medium text-navy">
              {row.key === 'leadsCount'
                ? String(summary.leadsCount)
                : summary[row.key]}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
