'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const LABEL: Record<string, string> = {
  PENDING: 'Pending',
  VERIFIED: 'Verified',
  RISKY: 'Risky',
  CATCH_ALL: 'Catch-all',
  INVALID: 'Invalid',
  VALID: 'Verified',
};

const STYLES: Record<string, string> = {
  PENDING: 'border-transparent bg-violet-100 text-violet-800',
  VERIFIED: 'border-transparent bg-emerald-100 text-emerald-800',
  VALID: 'border-transparent bg-emerald-100 text-emerald-800',
  RISKY: 'border-transparent bg-orange-100 text-orange-800',
  CATCH_ALL: 'border-transparent bg-amber-100 text-amber-900',
  INVALID: 'border-transparent bg-red-100 text-red-800',
};

export function VerificationBadge({ status }: { status: string }) {
  const key = status?.toUpperCase() ?? 'PENDING';
  return (
    <Badge
      variant="secondary"
      className={cn('font-medium', STYLES[key] ?? STYLES.PENDING)}
    >
      {LABEL[key] ?? status}
    </Badge>
  );
}

const STAGE_STYLES: Record<string, string> = {
  NEW: 'border-transparent bg-slate-100 text-slate-700',
  ENRICHED: 'border-transparent bg-sky-100 text-sky-800',
  READY: 'border-transparent bg-cyan-100 text-cyan-800',
  CONTACTED: 'border-transparent bg-navy text-navy-foreground',
  ENGAGED: 'border-transparent bg-indigo-100 text-indigo-800',
  REPLIED: 'border-transparent bg-blue-100 text-blue-800',
  QUALIFIED: 'border-transparent bg-emerald-100 text-emerald-800',
  MEETING_SCHEDULED: 'border-transparent bg-teal-100 text-teal-800',
  WON: 'border-transparent bg-emerald-800 text-white',
  CONVERTED: 'border-transparent bg-emerald-800 text-white',
  UNQUALIFIED: 'border-transparent bg-stone-100 text-stone-700',
  LOST: 'border-transparent bg-rose-100 text-rose-800',
  BOUNCED: 'border-transparent bg-red-100 text-red-800',
  COMPLAINED: 'border-transparent bg-red-200 text-red-900',
  PAUSED: 'border-transparent bg-amber-100 text-amber-900',
};

export function PipelineStageBadge({ status }: { status: string }) {
  const key = status?.toUpperCase() ?? 'NEW';
  return (
    <Badge
      variant="secondary"
      className={cn(
        'whitespace-nowrap font-medium',
        STAGE_STYLES[key] ?? STAGE_STYLES.NEW,
      )}
    >
      {key.replaceAll('_', ' ')}
    </Badge>
  );
}
