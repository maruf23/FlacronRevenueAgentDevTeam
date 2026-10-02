'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CampaignStatus } from '@/types/campaigns';

const STATUS_CONFIG: Record<
  CampaignStatus,
  { label: string; className: string; pulse?: boolean }
> = {
  DRAFT: {
    label: 'Draft',
    className: 'border-transparent bg-slate-100 text-slate-700',
  },
  PREPARING: {
    label: 'Preparing',
    className: 'border-transparent bg-sky-100 text-sky-800',
  },
  NEEDS_REVIEW: {
    label: 'Needs Review',
    className: 'border-transparent bg-amber-100 text-amber-900',
  },
  SCHEDULED: {
    label: 'Scheduled',
    className: 'border-transparent bg-indigo-100 text-indigo-800',
  },
  RUNNING: {
    label: 'Running',
    className: 'border-transparent bg-emerald-100 text-emerald-800',
    pulse: true,
  },
  PAUSED: {
    label: 'Paused',
    className: 'border-transparent bg-orange-100 text-orange-900',
  },
  COMPLETED: {
    label: 'Completed',
    className: 'border-transparent bg-navy/10 text-navy',
  },
  ATTENTION_REQUIRED: {
    label: 'Attention required',
    className: 'border-transparent bg-red-100 text-red-800',
  },
  FAILED: {
    label: 'Failed',
    className: 'border-transparent bg-red-200 text-red-900',
  },
  ARCHIVED: {
    label: 'Archived',
    className: 'border-transparent bg-muted text-muted-foreground',
  },
};

/** Map legacy ACTIVE from API to RUNNING */
export function normalizeCampaignStatus(status: string): CampaignStatus {
  if (status === 'ACTIVE') return 'RUNNING';
  if (status in STATUS_CONFIG) return status as CampaignStatus;
  return 'DRAFT';
}

type CampaignStatusBadgeProps = {
  status: string;
  className?: string;
};

export function CampaignStatusBadge({
  status,
  className,
}: CampaignStatusBadgeProps) {
  const normalized = normalizeCampaignStatus(status);
  const config = STATUS_CONFIG[normalized];

  return (
    <Badge className={cn('gap-1.5', config.className, className)}>
      {config.pulse ? (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" />
        </span>
      ) : null}
      {config.label}
    </Badge>
  );
}
