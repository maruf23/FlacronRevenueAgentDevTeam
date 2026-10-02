'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  PipelineStageBadge,
  VerificationBadge,
} from '@/components/leads/verification-badge';
import type { LeadRow } from '@/types/leads';
import { cn } from '@/lib/utils';

type LeadDetailDrawerProps = {
  lead: LeadRow | null;
  open: boolean;
  onClose: () => void;
  onAction?: (action: string) => void;
};

type QualificationForm = {
  need: string;
  authority: string;
  budget: string;
  timing: string;
  fit: string;
  currentSolution: string;
  nextAction: string;
};

const EMPTY_QUAL: QualificationForm = {
  need: '',
  authority: '',
  budget: '',
  timing: '',
  fit: '',
  currentSolution: '',
  nextAction: '',
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium text-foreground">
        {value?.trim() ? value : '—'}
      </dd>
    </div>
  );
}

export function scoreExplanation(lead: LeadRow): string {
  const stored = lead.scoreExplanation?.summary;
  if (typeof stored === 'string' && stored.trim()) return stored;

  const score = lead.leadScore ?? 0;
  const parts: string[] = [];
  const v = lead.verification_status.toUpperCase();
  if (v === 'VERIFIED') parts.push('verified email (+30)');
  else if (v === 'RISKY' || v === 'CATCH_ALL') parts.push('risky email (+10)');
  else parts.push('unverified email');
  if (lead.industry) parts.push('industry known (+15)');
  if (lead.location) parts.push('location known (+10)');
  if (lead.company.name) parts.push('company present (+15)');
  if (lead.campaignId) parts.push('in campaign (+10)');
  if (score >= 75) return `High-fit (${score}). Driven by ${parts.join(', ')}.`;
  if (score >= 50) return `Moderate fit (${score}). ${parts.join('; ')}.`;
  return `Needs work (${score}). Improve via ${parts.join(', ')}.`;
}

export function computeLeadScore(lead: LeadRow): number {
  let score = 20;
  const v = lead.verification_status.toUpperCase();
  if (v === 'VERIFIED') score += 30;
  else if (v === 'RISKY' || v === 'CATCH_ALL') score += 10;
  if (lead.industry) score += 15;
  if (lead.location) score += 10;
  if (lead.company.name) score += 15;
  if (lead.campaignId) score += 10;
  return Math.min(100, score);
}

function qualificationFromLead(lead: LeadRow | null): QualificationForm {
  const q = lead?.qualification;
  return {
    need: q?.need ?? '',
    authority: q?.authority ?? '',
    budget: q?.budget ?? '',
    timing: q?.timing ?? '',
    fit: q?.fit ?? '',
    currentSolution: q?.currentSolution ?? '',
    nextAction: q?.nextAction ?? lead?.nextRecommendedAction ?? '',
  };
}

export function LeadDetailDrawer({
  lead,
  open,
  onClose,
  onAction,
}: LeadDetailDrawerProps) {
  const qc = useQueryClient();
  const [qual, setQual] = useState<QualificationForm>(EMPTY_QUAL);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    setQual(qualificationFromLead(lead));
    setSavedMsg(null);
  }, [lead?.id, lead?.qualification, lead?.nextRecommendedAction]);

  const saveQual = useMutation({
    mutationFn: async () => {
      if (!lead) throw new Error('No lead');
      return api.patch<LeadRow>(`/leads/${lead.id}/qualification`, {
        need: qual.need.trim() || undefined,
        authority: qual.authority.trim() || undefined,
        budget: qual.budget.trim() || undefined,
        timing: qual.timing.trim() || undefined,
        fit: qual.fit.trim() || undefined,
        currentSolution: qual.currentSolution.trim() || undefined,
        nextAction: qual.nextAction.trim() || undefined,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leads'] });
      setSavedMsg('Qualification saved');
    },
  });

  const factors = lead?.scoreExplanation?.factors ?? [];

  return (
    <>
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/30 transition-opacity',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={onClose}
        aria-hidden={!open}
      />
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-background shadow-xl transition-transform duration-200',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
      >
        {lead ? (
          <>
            <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-navy">
                  {lead.contact.name}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  {lead.contact.email}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <VerificationBadge status={lead.verification_status} />
                  <PipelineStageBadge status={lead.status} />
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </Button>
            </header>

            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
              <Section title="Contact details">
                <dl className="space-y-1.5">
                  <Field label="Name" value={lead.contact.name} />
                  <Field label="Email" value={lead.contact.email} />
                  <Field label="Title" value={lead.contact.title} />
                </dl>
              </Section>

              <Separator />

              <Section title="Company details">
                <dl className="space-y-1.5">
                  <Field label="Company" value={lead.company.name} />
                  <Field label="Industry" value={lead.industry} />
                  <Field label="Location" value={lead.location} />
                </dl>
              </Section>

              <Separator />

              <Section title="Fit score">
                <p className="text-2xl font-semibold tabular-nums text-navy">
                  {lead.leadScore ?? '—'}
                </p>
                <p className="text-sm leading-relaxed text-foreground">
                  {scoreExplanation(lead)}
                </p>
                {factors.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {factors.map((f) => (
                      <li key={f.key} className="flex justify-between gap-2">
                        <span>{f.label}</span>
                        <span className="tabular-nums text-navy">
                          {f.points > 0 ? `+${f.points}` : f.points}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Section>

              <Separator />

              <Section title="Qualification (BANT-lite)">
                <div className="space-y-3">
                  {(
                    [
                      ['need', 'Need'],
                      ['authority', 'Authority'],
                      ['budget', 'Budget'],
                      ['timing', 'Timing'],
                      ['fit', 'Fit'],
                      ['currentSolution', 'Current solution'],
                      ['nextAction', 'Next action'],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="space-y-1">
                      <Label htmlFor={`qual-${key}`} className="text-xs">
                        {label}
                      </Label>
                      <Input
                        id={`qual-${key}`}
                        value={qual[key]}
                        onChange={(e) =>
                          setQual((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        placeholder={label}
                      />
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={saveQual.isPending}
                      onClick={() => saveQual.mutate()}
                    >
                      {saveQual.isPending ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : null}
                      Save qualification
                    </Button>
                    {savedMsg ? (
                      <span className="text-xs text-emerald-700">{savedMsg}</span>
                    ) : null}
                  </div>
                </div>
              </Section>

              <Separator />

              <Section title="AI recommendation">
                <p className="rounded-md bg-secondary/60 px-3 py-2 text-sm font-medium text-navy">
                  {lead.nextRecommendedAction?.trim() ||
                    'No recommendation yet — enrich or verify this lead.'}
                </p>
                {onAction ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onAction('verify')}
                    >
                      Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onAction('enrich')}
                    >
                      Enrich
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onAction('score')}
                    >
                      Score
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onAction('outreach')}
                    >
                      Outreach
                    </Button>
                  </div>
                ) : null}
              </Section>

              <Separator />

              <Section title="Campaign">
                <p className="text-sm text-muted-foreground">
                  {lead.campaign
                    ? `Currently in “${lead.campaign.name}”.`
                    : 'Not enrolled in a campaign yet.'}
                </p>
              </Section>

              <Section title="Activity">
                <ul className="space-y-2 text-sm">
                  <li className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Created</span>
                    <span className="tabular-nums">
                      {new Date(lead.createdAt).toLocaleString()}
                    </span>
                  </li>
                  <li className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Last activity</span>
                    <span className="tabular-nums">
                      {lead.lastActivityAt
                        ? new Date(lead.lastActivityAt).toLocaleString()
                        : '—'}
                    </span>
                  </li>
                </ul>
              </Section>
            </div>
          </>
        ) : null}
      </aside>
    </>
  );
}
