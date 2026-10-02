'use client';

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  HelpCircle,
  MinusCircle,
  ShieldOff,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LEAD_COUNT_HELP } from '@/lib/lead-count-help';
import type { LeadEligibility } from '@/types/campaigns';

type LeadEligibilitySummaryProps = {
  eligibility: LeadEligibility;
  compact?: boolean;
  className?: string;
  loading?: boolean;
};

const ROWS: {
  key: keyof LeadEligibility;
  label: string;
  helpKey: keyof typeof LEAD_COUNT_HELP;
  icon: typeof CheckCircle2;
  tone: string;
}[] = [
  {
    key: 'verified',
    label: 'Eligible (Verified)',
    helpKey: 'verified',
    icon: CheckCircle2,
    tone: 'text-emerald-600',
  },
  {
    key: 'catchAll',
    label: 'Catch-all',
    helpKey: 'catchAll',
    icon: AlertTriangle,
    tone: 'text-amber-600',
  },
  {
    key: 'risky',
    label: 'Risky',
    helpKey: 'risky',
    icon: AlertTriangle,
    tone: 'text-orange-600',
  },
  {
    key: 'invalid',
    label: 'Invalid',
    helpKey: 'invalid',
    icon: XCircle,
    tone: 'text-red-600',
  },
  {
    key: 'duplicates',
    label: 'Duplicate',
    helpKey: 'duplicates',
    icon: MinusCircle,
    tone: 'text-slate-500',
  },
  {
    key: 'suppressed',
    label: 'Suppressed',
    helpKey: 'suppressed',
    icon: Ban,
    tone: 'text-rose-600',
  },
  {
    key: 'excluded',
    label: 'Excluded',
    helpKey: 'excluded',
    icon: ShieldOff,
    tone: 'text-slate-600',
  },
];

export function normalizeEligibility(
  partial: Partial<LeadEligibility> & { total?: number },
): LeadEligibility {
  const verified = partial.verified ?? 0;
  const catchAll = partial.catchAll ?? 0;
  const risky = partial.risky ?? 0;
  const invalid = partial.invalid ?? 0;
  const duplicates = partial.duplicates ?? 0;
  const suppressed =
    partial.suppressed ?? partial.unsubscribed ?? 0;
  const unsubscribed = partial.unsubscribed ?? suppressed;
  const pending = partial.pending ?? 0;
  const excluded =
    partial.excluded ?? risky + invalid + duplicates + suppressed + pending;
  const total =
    partial.total ??
    verified + catchAll + risky + invalid + duplicates + suppressed + pending;

  return {
    total,
    verified,
    catchAll,
    risky,
    invalid,
    duplicates,
    suppressed,
    excluded,
    unsubscribed,
    pending,
  };
}

export function LeadEligibilitySummary({
  eligibility,
  compact,
  className,
  loading,
}: LeadEligibilitySummaryProps) {
  const data = normalizeEligibility(eligibility);
  const eligibleCount = data.verified;
  const reviewCount = data.catchAll;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-navy">Lead Eligibility Summary</span>
        <span className="tabular-nums text-muted-foreground">
          Total selected:{' '}
          <strong className="text-navy">
            {loading ? '…' : data.total}
          </strong>
        </span>
      </div>
      <ul className={cn('space-y-1.5', compact && 'space-y-1')}>
        {ROWS.map((row) => {
          const Icon = row.icon;
          const value = data[row.key];
          return (
            <li
              key={row.key}
              className="flex items-center justify-between gap-2 text-sm"
              title={LEAD_COUNT_HELP[row.helpKey]}
            >
              <span className="flex items-center gap-2 text-muted-foreground">
                <Icon className={cn('h-3.5 w-3.5 shrink-0', row.tone)} />
                {row.label}
                <HelpCircle className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
              </span>
              <span className="font-medium tabular-nums text-navy">
                {loading ? '…' : value}
              </span>
            </li>
          );
        })}
      </ul>
      {(reviewCount > 0 ||
        data.risky > 0 ||
        data.invalid > 0 ||
        data.suppressed > 0) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Catch-all leads require manual approval. Risky, invalid, duplicate,
          and suppressed leads will be excluded from sends.
          {data.unsubscribed > 0
            ? ` ${data.unsubscribed} unsubscribed contact(s) detected.`
            : ''}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        <strong className="text-navy">{eligibleCount}</strong> verified leads will
        be added
        {reviewCount > 0
          ? `; ${reviewCount} catch-all need review`
          : ''}
        .
      </p>
    </div>
  );
}

export function eligibleLeadCount(eligibility: LeadEligibility) {
  return eligibility.verified;
}
