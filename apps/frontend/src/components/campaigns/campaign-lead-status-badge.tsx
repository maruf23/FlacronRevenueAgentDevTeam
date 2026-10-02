'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export const CAMPAIGN_LEAD_STATUSES = [
  'QUEUED',
  'SCHEDULED',
  'SENT',
  'REPLIED',
  'FOLLOW_UP_DUE',
  'BOUNCED',
  'UNSUBSCRIBED',
  'COMPLETED',
  'PAUSED',
] as const;

export type CampaignLeadStatus = (typeof CAMPAIGN_LEAD_STATUSES)[number];

const STATUS_STYLES: Record<
  CampaignLeadStatus,
  { label: string; className: string }
> = {
  QUEUED: {
    label: 'Queued',
    className: 'border-sky-200 bg-sky-50 text-sky-900',
  },
  SCHEDULED: {
    label: 'Scheduled',
    className: 'border-indigo-200 bg-indigo-50 text-indigo-900',
  },
  SENT: {
    label: 'Sent',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  },
  REPLIED: {
    label: 'Replied',
    className: 'border-teal-200 bg-teal-50 text-teal-900',
  },
  FOLLOW_UP_DUE: {
    label: 'Follow-up Due',
    className: 'border-amber-200 bg-amber-50 text-amber-950',
  },
  BOUNCED: {
    label: 'Bounced',
    className: 'border-red-200 bg-red-50 text-red-900',
  },
  UNSUBSCRIBED: {
    label: 'Unsubscribed',
    className: 'border-rose-200 bg-rose-50 text-rose-900',
  },
  COMPLETED: {
    label: 'Completed',
    className: 'border-slate-200 bg-slate-100 text-slate-800',
  },
  PAUSED: {
    label: 'Paused',
    className: 'border-orange-200 bg-orange-50 text-orange-900',
  },
};

export function CampaignLeadStatusBadge({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const key = (CAMPAIGN_LEAD_STATUSES as readonly string[]).includes(
    status ?? '',
  )
    ? (status as CampaignLeadStatus)
    : 'QUEUED';
  const style = STATUS_STYLES[key];

  return (
    <Badge
      variant="outline"
      className={cn(
        'whitespace-nowrap font-semibold',
        style.className,
        className,
      )}
    >
      {style.label}
    </Badge>
  );
}

export function formatNextScheduledSend(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
