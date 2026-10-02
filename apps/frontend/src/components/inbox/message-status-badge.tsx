'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { InboxMessageStatus } from '@/types/inbox';

const STATUS_STYLES: Record<
  string,
  { label: string; className: string }
> = {
  DRAFT: {
    label: 'Draft',
    className: 'border-transparent bg-slate-100 text-slate-700',
  },
  AI_SUGGESTED: {
    label: 'AI Suggested',
    className: 'border-transparent bg-violet-100 text-violet-800',
  },
  EDITED_BY_USER: {
    label: 'Edited',
    className: 'border-transparent bg-amber-100 text-amber-900',
  },
  QUEUED: {
    label: 'Queued',
    className: 'border-transparent bg-sky-100 text-sky-800',
  },
  SCHEDULED: {
    label: 'Scheduled',
    className: 'border-transparent bg-blue-100 text-blue-800',
  },
  SENDING: {
    label: 'Sending',
    className: 'border-transparent bg-cyan-100 text-cyan-800',
  },
  SENT: {
    label: 'Sent',
    className: 'border-transparent bg-emerald-100 text-emerald-800',
  },
  DELIVERED: {
    label: 'Delivered',
    className: 'border-transparent bg-green-100 text-green-800',
  },
  RECEIVED: {
    label: 'Received',
    className: 'border-transparent bg-slate-100 text-slate-700',
  },
  FAILED: {
    label: 'Failed',
    className: 'border-transparent bg-red-100 text-red-800',
  },
  BOUNCED: {
    label: 'Bounced',
    className: 'border-transparent bg-red-100 text-red-800',
  },
  COMPLAINED: {
    label: 'Complained',
    className: 'border-transparent bg-orange-100 text-orange-900',
  },
  CANCELLED: {
    label: 'Cancelled',
    className: 'border-transparent bg-muted text-muted-foreground',
  },
};

type MessageStatusBadgeProps = {
  status: InboxMessageStatus | string | null | undefined;
  onDark?: boolean;
  className?: string;
};

export function MessageStatusBadge({
  status,
  onDark,
  className,
}: MessageStatusBadgeProps) {
  if (!status) return null;
  const key = String(status).toUpperCase();
  const style = STATUS_STYLES[key] ?? {
    label: key.replaceAll('_', ' '),
    className: 'border-transparent bg-muted text-muted-foreground',
  };

  return (
    <Badge
      className={cn(
        'font-normal capitalize',
        style.className,
        onDark &&
          (key === 'SENT' || key === 'DELIVERED'
            ? 'bg-emerald-400/25 text-white'
            : key === 'FAILED' || key === 'BOUNCED'
              ? 'bg-red-400/30 text-white'
              : key === 'SCHEDULED'
                ? 'bg-blue-400/30 text-white'
                : 'bg-white/15 text-white'),
        className,
      )}
    >
      {style.label}
    </Badge>
  );
}
