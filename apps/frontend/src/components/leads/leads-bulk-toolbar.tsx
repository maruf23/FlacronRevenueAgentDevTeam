'use client';

import {
  Gauge,
  MailCheck,
  Megaphone,
  Trash2,
  UserPlus,
  Wand2,
  Download,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export type BulkAction =
  | 'enrich'
  | 'verify'
  | 'score'
  | 'campaign'
  | 'assign'
  | 'export'
  | 'delete';

type LeadsBulkToolbarProps = {
  selectedCount: number;
  onClear: () => void;
  onAction: (action: BulkAction) => void;
  busy?: boolean;
};

export function LeadsBulkToolbar({
  selectedCount,
  onClear,
  onAction,
  busy,
}: LeadsBulkToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-lg border border-navy/20 bg-navy px-3 py-2 text-navy-foreground shadow-sm">
      <span className="mr-1 text-sm font-medium tabular-nums">
        {selectedCount} selected
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => onAction('enrich')}
      >
        <Wand2 className="h-3.5 w-3.5" />
        Enrich
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => onAction('verify')}
      >
        <MailCheck className="h-3.5 w-3.5" />
        Verify
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => onAction('score')}
      >
        <Gauge className="h-3.5 w-3.5" />
        Score
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => onAction('campaign')}
      >
        <Megaphone className="h-3.5 w-3.5" />
        Add to Campaign
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => onAction('assign')}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Assign
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => onAction('export')}
      >
        <Download className="h-3.5 w-3.5" />
        Export
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={busy}
        onClick={() => onAction('delete')}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="ml-auto text-navy-foreground hover:bg-white/10 hover:text-navy-foreground"
        onClick={onClear}
      >
        <X className="h-3.5 w-3.5" />
        Clear
      </Button>
    </div>
  );
}
