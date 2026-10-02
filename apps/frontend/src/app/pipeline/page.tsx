'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from '@hello-pangea/dnd';
import {
  Building2,
  CheckCircle2,
  Loader2,
  Plus,
  User,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { LeadRow } from '@/types/leads';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STAGES = [
  'NEW',
  'CONTACTED',
  'REPLIED',
  'QUALIFIED',
  'MEETING_SCHEDULED',
  'WON',
  'LOST',
  'PAUSED',
] as const;

type Stage = (typeof STAGES)[number];

const STAGE_LABEL: Record<Stage, string> = {
  NEW: 'New',
  CONTACTED: 'Contacted',
  REPLIED: 'Replied',
  QUALIFIED: 'Qualified',
  MEETING_SCHEDULED: 'Meeting Scheduled',
  WON: 'Won',
  LOST: 'Lost',
  PAUSED: 'Paused',
};

const STAGE_ACCENT: Record<Stage, string> = {
  NEW: 'bg-slate-400',
  CONTACTED: 'bg-sky-500',
  REPLIED: 'bg-violet-500',
  QUALIFIED: 'bg-emerald-500',
  MEETING_SCHEDULED: 'bg-primary',
  WON: 'bg-navy',
  LOST: 'bg-red-400',
  PAUSED: 'bg-amber-400',
};

function normalizeStage(lead: LeadRow): Stage {
  const raw = (lead.pipelineStage || lead.status || 'NEW').toUpperCase();
  if (raw === 'CONVERTED') return 'WON';
  if (STAGES.includes(raw as Stage)) return raw as Stage;
  // Map enrichment stages into NEW for board clarity
  if (['ENRICHED', 'READY'].includes(raw)) return 'NEW';
  if (['ENGAGED'].includes(raw)) return 'REPLIED';
  return 'NEW';
}

function priorityFromScore(score: number | null): 'high' | 'medium' | 'low' {
  if ((score ?? 0) >= 75) return 'high';
  if ((score ?? 0) >= 40) return 'medium';
  return 'low';
}

const PRIORITY_DOT: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-red-500',
  medium: 'bg-primary',
  low: 'bg-emerald-500',
};

function initials(name: string | null | undefined, email?: string | null) {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function VerificationChip({ status }: { status: string }) {
  const upper = status.toUpperCase();
  const verified = upper === 'VERIFIED';
  const pending = upper === 'PENDING';
  return (
    <Badge
      className={cn(
        'gap-1 px-1.5 py-0 text-[10px] font-medium',
        verified && 'border-transparent bg-emerald-100 text-emerald-800',
        pending && 'border-transparent bg-muted text-muted-foreground',
        !verified &&
          !pending &&
          'border-transparent bg-amber-100 text-amber-900',
      )}
    >
      {verified ? <CheckCircle2 className="h-3 w-3" /> : null}
      {verified ? 'Verified' : pending ? 'Pending' : status}
    </Badge>
  );
}

function LeadCard({ lead, isDragging }: { lead: LeadRow; isDragging: boolean }) {
  const priority = priorityFromScore(lead.leadScore);
  const assigneeName = lead.assignedUser?.name || lead.assignedUser?.email;

  return (
    <div
      className={cn(
        'rounded-md border border-border bg-white p-2.5 transition-shadow',
        isDragging ? 'shadow-md ring-1 ring-primary/30' : 'hover:shadow-sm',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-navy">
          {lead.contact.name || lead.contact.email}
        </p>
        <span
          className={cn(
            'mt-1 h-2 w-2 shrink-0 rounded-full',
            PRIORITY_DOT[priority],
          )}
          title={`Priority: ${priority}`}
          aria-label={`${priority} priority`}
        />
      </div>

      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <Building2 className="h-3 w-3 shrink-0" />
        <span className="truncate">{lead.company.name || 'No company'}</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <VerificationChip status={lead.verification_status} />
        <div
          className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-navy"
          title={assigneeName || 'Unassigned'}
        >
          {assigneeName ? (
            initials(lead.assignedUser?.name, lead.assignedUser?.email)
          ) : (
            <User className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      </div>
    </div>
  );
}

export default function PipelinePage() {
  const queryClient = useQueryClient();

  const leadsQuery = useQuery({
    queryKey: ['leads'],
    queryFn: () => api.get<LeadRow[]>('/leads'),
  });

  const updateStage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.patch(`/leads/${id}/stage`, { stage }),
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: ['leads'] });
      const previous = queryClient.getQueryData<LeadRow[]>(['leads']);
      queryClient.setQueryData<LeadRow[]>(['leads'], (old) =>
        (old ?? []).map((lead) =>
          lead.id === id
            ? {
                ...lead,
                status: stage,
                pipelineStage: stage,
              }
            : lead,
        ),
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['leads'], ctx.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
    },
  });

  const columns = useMemo(() => {
    const map = Object.fromEntries(
      STAGES.map((s) => [s, [] as LeadRow[]]),
    ) as Record<Stage, LeadRow[]>;

    for (const lead of leadsQuery.data ?? []) {
      map[normalizeStage(lead)].push(lead);
    }
    return map;
  }, [leadsQuery.data]);

  function onDragEnd(result: DropResult) {
    if (!result.destination) return;
    const leadId = result.draggableId;
    const stage = result.destination.droppableId;
    if (result.source.droppableId === stage) return;
    updateStage.mutate({ id: leadId, stage });
  }

  return (
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] min-h-0 flex-col sm:-m-6">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b bg-card px-4 py-3 sm:px-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-navy">
            Pipeline
          </h2>
          <p className="text-sm text-muted-foreground">
            Drag and drop between stages to update lead status.
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/leads">
            <Plus className="h-4 w-4" />
            Add lead
          </Link>
        </Button>
      </div>

      {leadsQuery.isLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading pipeline…
        </div>
      ) : leadsQuery.isError ? (
        <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Could not load pipeline. Check that the API is running.
        </div>
      ) : (
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex h-full min-h-0 flex-1 gap-4 overflow-x-auto p-4">
            {STAGES.map((stage) => (
              <Droppable droppableId={stage} key={stage}>
                {(provided, snapshot) => (
                  <div
                    className={cn(
                      'flex min-h-0 w-[280px] min-w-[280px] shrink-0 flex-col rounded-lg border border-border bg-white shadow-sm',
                      snapshot.isDraggingOver && 'border-primary/40 bg-accent/20',
                    )}
                  >
                    <div className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-lg border-b border-border bg-white px-3 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className={cn(
                            'h-2 w-2 shrink-0 rounded-full',
                            STAGE_ACCENT[stage],
                          )}
                        />
                        <h3 className="truncate text-xs font-semibold uppercase tracking-wide text-navy">
                          {STAGE_LABEL[stage]}
                        </h3>
                        <Badge
                          variant="secondary"
                          className="tabular-nums px-1.5 py-0 text-[10px]"
                        >
                          {columns[stage].length}
                        </Badge>
                      </div>
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-navy"
                        title={`Add lead to ${STAGE_LABEL[stage]}`}
                      >
                        <Link href="/leads">
                          <Plus className="h-4 w-4" />
                        </Link>
                      </Button>
                    </div>

                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2"
                    >
                      {columns[stage].map((lead, index) => (
                        <Draggable
                          key={lead.id}
                          draggableId={lead.id}
                          index={index}
                        >
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              {...dragProvided.dragHandleProps}
                            >
                              <LeadCard
                                lead={lead}
                                isDragging={dragSnapshot.isDragging}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {columns[stage].length === 0 ? (
                        <p className="px-1 py-6 text-center text-[11px] text-muted-foreground">
                          Drop leads here
                        </p>
                      ) : null}
                    </div>
                  </div>
                )}
              </Droppable>
            ))}
          </div>
        </DragDropContext>
      )}
    </div>
  );
}
