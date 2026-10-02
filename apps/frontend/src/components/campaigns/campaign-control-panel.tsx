'use client';

import { useState } from 'react';
import {
  Archive,
  Copy,
  Download,
  ListOrdered,
  Loader2,
  Pause,
  Play,
  Square,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { CampaignStatus } from '@/types/campaigns';

type CampaignControlPanelProps = {
  status: CampaignStatus;
  busyAction?: string | null;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onAddLeads: () => void;
  onRemoveUnsent: () => void;
  onEditFutureSteps: () => void;
  onDuplicate: () => void;
  onExport: (format: 'csv' | 'pdf') => void;
  onArchive: () => void;
  className?: string;
};

export function CampaignControlPanel({
  status,
  busyAction,
  onPause,
  onResume,
  onStop,
  onAddLeads,
  onRemoveUnsent,
  onEditFutureSteps,
  onDuplicate,
  onExport,
  onArchive,
  className,
}: CampaignControlPanelProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);

  const canPause = status === 'RUNNING' || status === 'SCHEDULED';
  const canResume =
    status === 'PAUSED' ||
    status === 'ATTENTION_REQUIRED' ||
    status === 'NEEDS_REVIEW';
  const canStop = !['COMPLETED', 'ARCHIVED', 'FAILED', 'DRAFT'].includes(
    status,
  );
  const canArchive = status !== 'ARCHIVED';
  const terminal = ['COMPLETED', 'ARCHIVED', 'FAILED'].includes(status);
  const resumeLabel =
    status === 'NEEDS_REVIEW' ? 'Approve & launch' : 'Resume';

  const isBusy = (action: string) => busyAction === action;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2.5',
        className,
      )}
    >
      <p className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        Controls
      </p>

      {canPause ? (
        <Button
          size="sm"
          variant="outline"
          className="border-orange-300 text-orange-700"
          disabled={Boolean(busyAction)}
          onClick={onPause}
        >
          {isBusy('pause') ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Pause className="h-3.5 w-3.5" />
          )}
          Pause
        </Button>
      ) : null}

      {canResume ? (
        <Button
          size="sm"
          disabled={Boolean(busyAction)}
          onClick={onResume}
        >
          {isBusy('resume') ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {resumeLabel}
        </Button>
      ) : null}

      {canStop ? (
        <Button
          size="sm"
          variant="destructive"
          disabled={Boolean(busyAction)}
          onClick={onStop}
        >
          {isBusy('stop') ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Square className="h-3.5 w-3.5" />
          )}
          Stop
        </Button>
      ) : null}

      <Button
        size="sm"
        variant="outline"
        disabled={Boolean(busyAction) || terminal}
        onClick={onAddLeads}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Add Leads
      </Button>

      {!confirmRemove ? (
        <Button
          size="sm"
          variant="outline"
          disabled={Boolean(busyAction) || terminal}
          onClick={() => setConfirmRemove(true)}
        >
          <UserMinus className="h-3.5 w-3.5" />
          Remove Unsent Leads
        </Button>
      ) : (
        <Button
          size="sm"
          variant="destructive"
          disabled={Boolean(busyAction)}
          onClick={() => {
            setConfirmRemove(false);
            onRemoveUnsent();
          }}
          onBlur={() => setConfirmRemove(false)}
        >
          {isBusy('remove-unsent') ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <UserMinus className="h-3.5 w-3.5" />
          )}
          Confirm remove unsent
        </Button>
      )}

      <Button
        size="sm"
        variant="outline"
        disabled={Boolean(busyAction)}
        onClick={onEditFutureSteps}
      >
        <ListOrdered className="h-3.5 w-3.5" />
        Edit Future Steps
      </Button>

      <Button
        size="sm"
        variant="outline"
        disabled={Boolean(busyAction)}
        onClick={onDuplicate}
      >
        {isBusy('duplicate') ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
        Duplicate
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={Boolean(busyAction)}
          >
            {isBusy('export') ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => onExport('csv')}>
            Export CSV
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onExport('pdf')}>
            Export PDF
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {canArchive ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={Boolean(busyAction)}
          onClick={onArchive}
        >
          {isBusy('archive') ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Archive className="h-3.5 w-3.5" />
          )}
          Archive
        </Button>
      ) : null}
    </div>
  );
}
