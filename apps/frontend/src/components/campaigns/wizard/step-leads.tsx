'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  FileSpreadsheet,
  FormInput,
  Globe,
  HelpCircle,
  MapPin,
  Search,
  Share2,
  Store,
  UserPlus,
  Users,
  Link2,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import { LeadEligibilitySummary } from '@/components/campaigns/lead-eligibility-summary';
import { VerificationBadge } from '@/components/leads/verification-badge';
import {
  isLeadAssignableByDefault,
  leadAssignBlockReason,
  leadVerificationStatus,
} from '@/lib/lead-assignability';
import { LEAD_COUNT_HELP } from '@/lib/lead-count-help';
import {
  getSourceConnectionState,
  type IntegrationsStatus,
} from '@/lib/source-connections';
import { toast } from '@/store/toastStore';
import {
  LEAD_SOURCES,
  type CampaignWizardData,
  type LeadSourceId,
} from '@/types/campaigns';
import type { LeadRow } from '@/types/leads';
import { cn } from '@/lib/utils';

const SOURCE_ICONS: Record<LeadSourceId, typeof Search> = {
  hunter: Search,
  google_places: MapPin,
  csv: FileSpreadsheet,
  website_visitors: Globe,
  webforms: FormInput,
  marketplace: Store,
  crm: Link2,
  social: Share2,
  existing: Users,
  manual: UserPlus,
};

type StepLeadsProps = {
  data: CampaignWizardData;
  onChange: (patch: Partial<CampaignWizardData>) => void;
  onToggleSource: (source: LeadSourceId) => void;
};

function CountHint({
  label,
  helpKey,
  value,
}: {
  label: string;
  helpKey: keyof typeof LEAD_COUNT_HELP;
  value: number | string;
}) {
  return (
    <span className="inline-flex items-center gap-1" title={LEAD_COUNT_HELP[helpKey]}>
      <strong className="tabular-nums text-navy">{value}</strong> {label}
      <HelpCircle className="h-3 w-3 text-muted-foreground" aria-hidden />
    </span>
  );
}

function eligibilityFromLeads(leads: LeadRow[]) {
  const verified = leads.filter(
    (l) => leadVerificationStatus(l) === 'VERIFIED',
  ).length;
  const catchAll = leads.filter(
    (l) => leadVerificationStatus(l) === 'CATCH_ALL',
  ).length;
  const risky = leads.filter((l) => leadVerificationStatus(l) === 'RISKY').length;
  const invalid = leads.filter(
    (l) => leadVerificationStatus(l) === 'INVALID',
  ).length;
  const pending = leads.filter(
    (l) => leadVerificationStatus(l) === 'PENDING',
  ).length;
  const duplicates = 0;
  const suppressed = 0;
  return {
    total: leads.length,
    verified,
    catchAll,
    risky,
    invalid,
    duplicates,
    suppressed,
    excluded: risky + invalid + duplicates + suppressed + pending,
    unsubscribed: 0,
    pending,
  };
}

export function StepLeads({ data, onChange, onToggleSource }: StepLeadsProps) {
  const [blockWarning, setBlockWarning] = useState<string | null>(null);
  const leadsQuery = useQuery({
    queryKey: ['wizard-leads'],
    queryFn: () => api.get<LeadRow[]>('/leads'),
  });
  const integrationsQuery = useQuery({
    queryKey: ['integrations-status'],
    queryFn: () => api.get<IntegrationsStatus>('/integrations/status'),
    retry: false,
  });

  const leads = leadsQuery.data ?? [];
  const selectedSet = new Set(data.selectedLeadIds);
  const assignableLeads = leads.filter((lead) => isLeadAssignableByDefault(lead));
  const integrationStatus = integrationsQuery.data;

  const applySelection = (nextIds: string[]) => {
    const selectedLeads = leads.filter((l) => nextIds.includes(l.id));
    onChange({
      selectedLeadIds: nextIds,
      eligibility: eligibilityFromLeads(selectedLeads),
      leadSources: data.leadSources.includes('existing')
        ? data.leadSources
        : [...data.leadSources, 'existing'],
    });
  };

  const toggleLead = (lead: LeadRow) => {
    if (selectedSet.has(lead.id)) {
      setBlockWarning(null);
      applySelection(data.selectedLeadIds.filter((id) => id !== lead.id));
      return;
    }
    const reason = leadAssignBlockReason(lead);
    if (reason) {
      setBlockWarning(reason);
      return;
    }
    setBlockWarning(null);
    applySelection([...data.selectedLeadIds, lead.id]);
  };

  const toggleAllVisible = () => {
    if (assignableLeads.length === 0) return;
    const allAssignableSelected = assignableLeads.every((l) =>
      selectedSet.has(l.id),
    );
    setBlockWarning(
      allAssignableSelected
        ? null
        : leads.length > assignableLeads.length
          ? 'Invalid and unverified leads were skipped. Only verified and catch-all contacts can be assigned.'
          : null,
    );
    applySelection(allAssignableSelected ? [] : assignableLeads.map((l) => l.id));
  };

  const handleSourceClick = (sourceId: LeadSourceId) => {
    const active = data.leadSources.includes(sourceId);
    const connection = getSourceConnectionState(sourceId, integrationStatus, {
      crmConnected: data.crmConnected,
      isActive: active,
    });

    if (!active && !connection.available) {
      toast(
        connection.reason ||
          `${connection.statusLabel} this source under Integrations first.`,
        'error',
      );
      return;
    }
    onToggleSource(sourceId);
  };

  const allAssignableSelected =
    assignableLeads.length > 0 &&
    assignableLeads.every((l) => selectedSet.has(l.id));
  const someSelected = leads.some((l) => selectedSet.has(l.id));
  const blockedCount = leads.length - assignableLeads.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-navy">Data sources & inputs</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Fuel the campaign from providers, Places, CSV, website visitors,
            forms, ads, CRM, and social — then pick which leads to assign.
            Sources that need an API show Connect / Configure until linked.
          </p>
        </div>
        <p className="rounded-full border bg-muted/40 px-2.5 py-1 text-sm font-medium text-navy">
          {data.leadSources.length} of {LEAD_SOURCES.length} sources selected
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {LEAD_SOURCES.map((source) => {
          const Icon = SOURCE_ICONS[source.id];
          const active = data.leadSources.includes(source.id);
          const connection = getSourceConnectionState(
            source.id,
            integrationStatus,
            { crmConnected: data.crmConnected, isActive: active },
          );
          const needsSetup = !connection.available;
          return (
            <div
              key={source.id}
              className={cn(
                'relative flex flex-col items-start gap-2 rounded-lg border-2 p-3 text-left transition-colors',
                active
                  ? 'border-primary bg-accent shadow-sm ring-1 ring-primary/30'
                  : needsSetup
                    ? 'border-amber-300 bg-amber-50/40'
                    : 'border-border bg-background hover:border-navy/30',
              )}
            >
              {active ? (
                <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                  <Check className="h-3 w-3" />
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => handleSourceClick(source.id)}
                className="flex w-full flex-col items-start gap-2 text-left"
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-md',
                    active
                      ? 'bg-primary text-white'
                      : needsSetup
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-secondary text-navy',
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-navy">
                  {source.label}
                </span>
                <span className="text-sm text-muted-foreground">
                  {source.description}
                </span>
                <span
                  className={cn(
                    'text-xs font-semibold uppercase tracking-wide',
                    active
                      ? 'text-primary'
                      : needsSetup
                        ? 'text-amber-800'
                        : 'text-muted-foreground',
                  )}
                >
                  {needsSetup && !active
                    ? connection.statusLabel
                    : connection.statusLabel}
                </span>
              </button>
              {needsSetup && !active ? (
                <Link
                  href={connection.href || '/integrations'}
                  className="text-xs font-medium text-amber-900 underline-offset-2 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {connection.statusLabel} in Integrations
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/20 px-4 py-3">
          <div>
            <h4 className="text-sm font-semibold text-navy">Assign leads</h4>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              <CountHint
                label="assigned"
                helpKey="assigned"
                value={data.selectedLeadIds.length}
              />
              <span>·</span>
              <CountHint
                label="eligible"
                helpKey="eligible"
                value={assignableLeads.length}
              />
              {blockedCount > 0 ? (
                <>
                  <span>·</span>
                  <CountHint
                    label="blocked"
                    helpKey="blocked"
                    value={blockedCount}
                  />
                </>
              ) : null}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox
              checked={allAssignableSelected}
              indeterminate={someSelected && !allAssignableSelected}
              onChange={toggleAllVisible}
              disabled={leadsQuery.isLoading || assignableLeads.length === 0}
            />
            Select eligible
          </label>
        </div>

        {blockWarning ? (
          <div
            role="status"
            className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-950"
          >
            {blockWarning}
          </div>
        ) : null}

        {leadsQuery.isLoading ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading leads…
          </div>
        ) : null}

        {leadsQuery.isError ? (
          <p className="px-4 py-6 text-sm text-red-700">
            Failed to load leads. Check that you are signed in and the API is
            running.
          </p>
        ) : null}

        {!leadsQuery.isLoading && !leadsQuery.isError && leads.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No leads in this workspace yet. Import or create leads first, then
            return to this step.
          </p>
        ) : null}

        {!leadsQuery.isLoading && leads.length > 0 ? (
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-card text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 font-medium">Contact</th>
                  <th className="px-3 py-2 font-medium">Company</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Verification</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => {
                  const checked = selectedSet.has(lead.id);
                  const assignable = isLeadAssignableByDefault(lead);
                  return (
                    <tr
                      key={lead.id}
                      className={cn(
                        'border-b border-border/70 last:border-0',
                        checked && 'bg-accent/40',
                        !assignable && 'opacity-70',
                      )}
                    >
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={checked}
                          onChange={() => toggleLead(lead)}
                          aria-label={`Select ${lead.contact.email}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-navy">
                          {lead.contact.name || lead.contact.email}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {lead.contact.email}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {lead.company.name || '—'}
                      </td>
                      <td className="px-3 py-2 text-sm">{lead.status}</td>
                      <td className="px-3 py-2">
                        <VerificationBadge
                          status={leadVerificationStatus(lead)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border p-4">
          <LeadEligibilitySummary eligibility={data.eligibility} />
        </div>
        <div className="rounded-lg border p-4">
          <h4 className="mb-3 text-sm font-semibold text-navy">
            Status breakdown
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                label: 'Verified',
                helpKey: 'verified' as const,
                value: data.eligibility.verified,
                tone: 'text-emerald-700',
              },
              {
                label: 'Catch-all',
                helpKey: 'catchAll' as const,
                value: data.eligibility.catchAll,
                tone: 'text-amber-700',
              },
              {
                label: 'Risky',
                helpKey: 'risky' as const,
                value: data.eligibility.risky,
                tone: 'text-orange-700',
              },
              {
                label: 'Pending',
                helpKey: 'pending' as const,
                value: data.eligibility.pending ?? 0,
                tone: 'text-sky-700',
              },
              {
                label: 'Invalid',
                helpKey: 'invalid' as const,
                value: data.eligibility.invalid,
                tone: 'text-red-700',
              },
              {
                label: 'Duplicate',
                helpKey: 'duplicates' as const,
                value: data.eligibility.duplicates,
                tone: 'text-slate-600',
              },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-md border border-border bg-muted/20 px-3 py-2"
                title={LEAD_COUNT_HELP[item.helpKey]}
              >
                <p className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
                  {item.label}
                  <HelpCircle className="h-3 w-3" aria-hidden />
                </p>
                <p
                  className={cn('text-lg font-semibold tabular-nums', item.tone)}
                >
                  {item.value}
                </p>
              </div>
            ))}
          </div>
          {data.selectedLeadIds.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Assign at least one eligible lead to continue.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
