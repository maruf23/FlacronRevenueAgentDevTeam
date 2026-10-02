'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Eye,
  Loader2,
  Mail,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { normalizeEligibility } from '@/components/campaigns/lead-eligibility-summary';
import {
  PersonalizedEmailPreviewModal,
  type CampaignEmailPreview,
} from '@/components/campaigns/wizard/personalized-email-preview-modal';
import { MOCK_MAILBOXES } from '@/lib/campaigns-mock';
import { parseLaunchBlockersResponse } from '@/lib/safety-checks';
import { cn } from '@/lib/utils';
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_GOALS,
  DISCOVERY_WORKFLOW,
  type CampaignWizardData,
  type LeadEligibility,
} from '@/types/campaigns';

export type { CampaignEmailPreview };

export type EligibilitySummaryResponse = {
  verified: number;
  catchAll: number;
  risky: number;
  invalid: number;
  duplicate: number;
  suppressed: number;
  eligible: number;
  total?: number;
  selectionExplanation?: string;
  samples?: Array<{
    leadId: string;
    name: string;
    title: string | null;
    company: string | null;
    email: string;
    leadScore: number | null;
    verification: string;
    whyQualified: string;
  }>;
};

const ELIGIBILITY_BADGES: {
  key: Exclude<
    keyof EligibilitySummaryResponse,
    'selectionExplanation' | 'samples' | 'total'
  >;
  label: string;
  className: string;
}[] = [
  {
    key: 'eligible',
    label: 'Eligible',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  {
    key: 'verified',
    label: 'Verified',
    className: 'border-emerald-200 bg-emerald-100/80 text-emerald-900',
  },
  {
    key: 'catchAll',
    label: 'Catch-all',
    className: 'border-amber-200 bg-amber-50 text-amber-900',
  },
  {
    key: 'risky',
    label: 'Risky',
    className: 'border-orange-200 bg-orange-50 text-orange-900',
  },
  {
    key: 'invalid',
    label: 'Invalid',
    className: 'border-red-200 bg-red-50 text-red-800',
  },
  {
    key: 'duplicate',
    label: 'Duplicate',
    className: 'border-slate-200 bg-slate-100 text-slate-700',
  },
  {
    key: 'suppressed',
    label: 'Suppressed',
    className: 'border-rose-200 bg-rose-50 text-rose-800',
  },
];

type StepReviewProps = {
  data: CampaignWizardData;
  campaignId: string | null;
  onEligibilityLoaded?: (eligibility: LeadEligibility) => void;
  onBlockersChange?: (blockers: string[]) => void;
};

export function StepReview({
  data,
  campaignId,
  onEligibilityLoaded,
  onBlockersChange,
}: StepReviewProps) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<CampaignEmailPreview[]>([]);

  const summaryQuery = useQuery({
    queryKey: ['campaign-eligibility-summary', campaignId],
    queryFn: () =>
      api.get<EligibilitySummaryResponse>(
        `/campaigns/${campaignId}/eligibility-summary`,
      ),
    enabled: Boolean(campaignId),
  });

  const blockersQuery = useQuery({
    queryKey: ['campaign-launch-blockers', campaignId],
    queryFn: async () => {
      const result = await api.get<unknown>(
        `/campaigns/${campaignId}/launch-blockers`,
      );
      return parseLaunchBlockersResponse(result).blockers;
    },
    enabled: Boolean(campaignId),
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!summaryQuery.data) return;
    const s = summaryQuery.data;
    onEligibilityLoaded?.(
      normalizeEligibility({
        verified: s.verified,
        catchAll: s.catchAll,
        risky: s.risky,
        invalid: s.invalid,
        duplicates: s.duplicate,
        suppressed: s.suppressed,
        total:
          s.verified +
          s.catchAll +
          s.risky +
          s.invalid +
          s.duplicate +
          s.suppressed,
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid loop from inline parent callback
  }, [summaryQuery.data]);

  useEffect(() => {
    if (!blockersQuery.data) return;
    onBlockersChange?.(blockersQuery.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockersQuery.data]);

  const summary: EligibilitySummaryResponse = summaryQuery.data ?? {
    verified: data.eligibility.verified,
    catchAll: data.eligibility.catchAll,
    risky: data.eligibility.risky,
    invalid: data.eligibility.invalid,
    duplicate: data.eligibility.duplicates,
    suppressed: data.eligibility.suppressed,
    eligible: data.eligibility.verified,
  };

  const blockers = blockersQuery.data ?? [];
  const hasBlockers = blockers.length > 0;
  const summaryLoading = summaryQuery.isLoading && Boolean(campaignId);
  const blockersLoading = blockersQuery.isLoading && Boolean(campaignId);

  const mailbox =
    MOCK_MAILBOXES.find((m) => m.id === data.audience.mailboxId)?.label ??
    data.mailbox ??
    '—';
  const goalLabel =
    CAMPAIGN_GOALS.find((g) => g.value === data.goal)?.label ?? '—';
  const firstStep = data.sequence[0];
  const totalLeads =
    summary.total ??
    summary.verified +
      summary.catchAll +
      summary.risky +
      summary.invalid +
      summary.duplicate +
      summary.suppressed;
  const estimatedCredits = summary.verified + summary.catchAll;
  const samples = summary.samples ?? [];

  const openPreview = async () => {
    setPreviewOpen(true);
    setPreviewError(null);

    if (!campaignId) {
      setPreviewError(
        'Campaign is not saved yet. Go back and assign leads first.',
      );
      setPreviews([]);
      return;
    }

    setPreviewLoading(true);
    try {
      const result = await api.get<{ emails: CampaignEmailPreview[] }>(
        `/campaigns/${campaignId}/preview-emails`,
      );
      setPreviews(result.emails ?? []);
      if (!result.emails?.length) {
        setPreviewError(
          'No leads assigned to this campaign yet. Assign leads before previewing.',
        );
      }
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Failed to load personalized previews';
      setPreviewError(message);
      setPreviews([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-navy">
            Campaign Preview &amp; Approval
          </h3>
          <p className="text-xs text-muted-foreground">
            Review eligibility, launch safety, and AI-personalized samples
            before launch.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!campaignId || previewLoading}
          onClick={() => void openPreview()}
        >
          {previewLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          Preview Personalized Emails
        </Button>
      </div>

      {hasBlockers ? (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-950 shadow-sm"
        >
          <div className="mb-2 flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 text-red-600" />
            <p className="text-sm font-semibold">
              Launch blocked — resolve these issues first
            </p>
          </div>
          <ul className="space-y-1.5">
            {blockers.map((blocker) => (
              <li
                key={blocker}
                className="flex items-start gap-2 text-sm text-red-900"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                <span>{blocker}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!campaignId ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Campaign is not saved yet. Continue through the wizard so eligibility
          and launch blockers can be validated.
        </div>
      ) : null}

      {blockersQuery.isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          Could not load launch blockers from the server. Refresh and try again.
        </div>
      ) : null}

      {blockersLoading && !hasBlockers ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Checking launch safety…
        </div>
      ) : null}

      {!hasBlockers &&
      campaignId &&
      !blockersLoading &&
      blockersQuery.isSuccess ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-950">
          <span className="inline-flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            No launch blockers — ready for the Launch step
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4 rounded-lg border p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-navy">
                Eligibility Summary
              </p>
              <span className="text-xs tabular-nums text-muted-foreground">
                Total:{' '}
                <strong className="text-navy">
                  {summaryLoading ? '…' : totalLeads}
                </strong>
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {ELIGIBILITY_BADGES.map((badge) => (
                <Badge
                  key={badge.key}
                  variant="outline"
                  className={cn(
                    'gap-1.5 px-2.5 py-1 text-xs font-semibold tabular-nums',
                    badge.className,
                  )}
                >
                  {badge.label}
                  <span className="rounded bg-white/60 px-1.5 py-0.5 font-bold">
                    {summaryLoading ? '…' : summary[badge.key]}
                  </span>
                </Badge>
              ))}
            </div>
            {summary.selectionExplanation ? (
              <p className="text-xs leading-relaxed text-muted-foreground">
                {summary.selectionExplanation}
              </p>
            ) : null}
            {summary.catchAll > 0 ||
            summary.risky > 0 ||
            summary.invalid > 0 ||
            summary.suppressed > 0 ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Catch-all leads require manual approval. Risky, invalid,
                duplicate, and suppressed leads are excluded from sends.
              </p>
            ) : null}
            {samples.length > 0 ? (
              <div className="space-y-2 rounded-md border bg-secondary/30 px-3 py-2">
                <p className="text-xs font-semibold text-navy">
                  Representative sample
                </p>
                <p className="text-[11px] text-muted-foreground">
                  These are examples from the full pool — not the only leads
                  reviewed by the system.
                </p>
                <ul className="space-y-2">
                  {samples.map((s) => (
                    <li key={s.leadId} className="text-xs">
                      <p className="font-medium text-navy">
                        {s.name}
                        {s.title ? ` · ${s.title}` : ''}
                        {s.company ? ` @ ${s.company}` : ''}
                        {s.leadScore != null ? (
                          <span className="ml-1 tabular-nums text-muted-foreground">
                            fit {s.leadScore}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground">{s.whyQualified}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {summaryQuery.isError ? (
              <p className="text-xs text-amber-800">
                Could not refresh eligibility from the server — showing local
                counts.
              </p>
            ) : null}
          </div>

          <div className="space-y-2 border-t pt-3 text-sm">
            <p className="font-semibold text-navy">Campaign settings</p>
            <Row label="Campaign" value={data.name || '—'} />
            <Row label="Goal" value={goalLabel} />
            <Row label="Product" value={data.product || '—'} />
            <Row label="Website" value={data.website || '—'} />
            <Row label="Offer" value={data.offer || '—'} />
            <Row label="Budget" value={`$${data.budget.toLocaleString()}`} />
            <Row
              label="Channels"
              value={CAMPAIGN_CHANNELS.filter((c) => data.channels[c.id])
                .map((c) => c.label)
                .join(', ') || '—'}
            />
            <Row label="Eligible" value={String(summary.eligible)} />
            <Row
              label="Daily sending volume"
              value={`${data.audience.dailySendingLimit}/day`}
            />
            <Row
              label="Estimated credits"
              value={String(estimatedCredits)}
              icon={<CreditCard className="h-3.5 w-3.5 text-primary" />}
            />
            <Row
              label="Mailbox"
              value={mailbox}
              icon={<Mail className="h-3.5 w-3.5 text-navy" />}
            />
            <Row
              label="Deliverability"
              value={
                hasBlockers &&
                blockers.some((b) =>
                  b.toLowerCase().includes('deliverability'),
                )
                  ? 'At risk'
                  : 'Healthy'
              }
              icon={
                hasBlockers &&
                blockers.some((b) =>
                  b.toLowerCase().includes('deliverability'),
                ) ? (
                  <ShieldAlert className="h-3.5 w-3.5 text-red-600" />
                ) : (
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                )
              }
            />
            <Row
              label="Schedule"
              value={
                data.schedule.startOption === 'now'
                  ? 'Start immediately'
                  : data.schedule.startOption === 'later'
                    ? data.schedule.startAt || 'Later'
                    : `In ${data.schedule.countdownHours}h`
              }
            />
          </div>
        </div>

        <div className="rounded-lg border p-4">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <p className="text-sm font-semibold text-navy">Sequence template</p>
          </div>
          {firstStep ? (
            <div className="space-y-3 rounded-md border bg-muted/20 p-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Subject
                </p>
                <p className="text-sm font-medium text-navy">
                  {firstStep.subject}
                </p>
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-sm text-foreground">
                {firstStep.body}
              </pre>
              <p className="text-xs text-muted-foreground">
                Use &quot;Preview Personalized Emails&quot; to see real contact
                names, companies, and AI-generated copy.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No sequence steps to preview. Go back to Sequence to add emails.
            </p>
          )}
        </div>
      </div>

      <PersonalizedEmailPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        campaignId={campaignId}
        loading={previewLoading}
        error={previewError}
        emails={previews}
        onEmailsChange={setPreviews}
      />

      <div className="rounded-lg border p-4">
        <p className="mb-3 text-sm font-semibold text-navy">
          Discovery to conversion plan
        </p>
        <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {DISCOVERY_WORKFLOW.map((step) => (
            <li
              key={step.key}
              className="rounded-md border bg-muted/20 px-3 py-2"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {step.id}. {step.label}
              </p>
              <p className="mt-0.5 text-xs text-navy">{step.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-right font-medium text-navy">{value}</span>
    </div>
  );
}
