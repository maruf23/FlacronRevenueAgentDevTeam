'use client';

import {
  Archive,
  ClipboardList,
  Eye,
  MailCheck,
  Megaphone,
  MoreHorizontal,
  Sparkles,
  Target,
  Trash2,
  UserPlus,
  Wand2,
  Gauge,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import type { LeadRow } from '@/types/leads';

export type LeadAction =
  | 'view'
  | 'enrich'
  | 'verify'
  | 'score'
  | 'outreach'
  | 'campaign'
  | 'stage'
  | 'assign'
  | 'task'
  | 'archive'
  | 'delete';

type LeadActionsMenuProps = {
  lead: LeadRow;
  onAction: (action: LeadAction, lead: LeadRow) => void;
  disabled?: boolean;
};

export function LeadActionsMenu({
  lead,
  onAction,
  disabled,
}: LeadActionsMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={disabled}
          aria-label="Lead actions"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => onAction('view', lead)}>
          <Eye className="mr-2 h-4 w-4" />
          View lead
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction('enrich', lead)}>
          <Wand2 className="mr-2 h-4 w-4" />
          Enrich
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction('verify', lead)}>
          <MailCheck className="mr-2 h-4 w-4" />
          Verify email
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction('score', lead)}>
          <Gauge className="mr-2 h-4 w-4" />
          Calculate score
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction('outreach', lead)}>
          <Sparkles className="mr-2 h-4 w-4" />
          Generate outreach
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction('campaign', lead)}>
          <Megaphone className="mr-2 h-4 w-4" />
          Add to campaign
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction('stage', lead)}>
          <Target className="mr-2 h-4 w-4" />
          Move pipeline stage
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction('assign', lead)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Assign owner
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onAction('task', lead)}>
          <ClipboardList className="mr-2 h-4 w-4" />
          Create task
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => onAction('archive', lead)}>
          <Archive className="mr-2 h-4 w-4" />
          Archive
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onAction('delete', lead)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
