'use client';

import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  MailWarning,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

type DnsStatus = 'valid' | 'invalid' | 'missing';

type DomainCheck = {
  domain: string;
  spf: DnsStatus;
  dkim: DnsStatus;
  dmarc: DnsStatus;
  details?: {
    spfRecord?: string | null;
    dkimSelector?: string | null;
    dkimRecord?: string | null;
    dmarcRecord?: string | null;
  };
};

type DeliverabilitySummary = {
  window_days: number;
  total_sent: number;
  bounces: number;
  complaints: number;
  bounce_rate: number;
  complaint_rate: number;
  bounce_breakdown: Record<string, number>;
  isPaused: boolean;
  pauseReason: string | null;
  pausedAt: string | null;
  thresholds: {
    bounce_rate: number;
    complaint_rate: number;
    window_hours: number;
  };
};

function pct(rate: number) {
  return `${(rate * 100).toFixed(rate < 0.01 ? 3 : 2)}%`;
}

function DnsBadge({ status }: { status: DnsStatus }) {
  const styles: Record<DnsStatus, string> = {
    valid: 'border-transparent bg-emerald-100 text-emerald-800',
    invalid: 'border-transparent bg-orange-100 text-orange-800',
    missing: 'border-transparent bg-red-100 text-red-800',
  };
  const Icon =
    status === 'valid' ? CheckCircle2 : status === 'invalid' ? AlertTriangle : XCircle;
  return (
    <Badge className={cn('gap-1 capitalize', styles[status])}>
      <Icon className="h-3 w-3" />
      {status}
    </Badge>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warn' | 'danger' | 'ok';
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-red-200 bg-red-50'
      : tone === 'warn'
        ? 'border-amber-200 bg-amber-50'
        : tone === 'ok'
          ? 'border-emerald-200 bg-emerald-50'
          : '';
  return (
    <Card className={cn('shadow-none', toneClass)}>
      <CardContent className="p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-navy">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export default function DeliverabilityPage() {
  const summaryQuery = useQuery({
    queryKey: ['deliverability-summary'],
    queryFn: () => api.get<DeliverabilitySummary>('/deliverability/summary'),
    refetchInterval: 60_000,
  });

  const domainQuery = useQuery({
    queryKey: ['deliverability-domain-check'],
    queryFn: () => api.get<DomainCheck>('/deliverability/domain-check'),
    retry: false,
  });

  const summary = summaryQuery.data;
  const domain = domainQuery.data;

  const bounceTone =
    summary && summary.bounce_rate > summary.thresholds.bounce_rate
      ? 'danger'
      : summary && summary.bounce_rate > summary.thresholds.bounce_rate * 0.6
        ? 'warn'
        : 'default';

  const complaintTone =
    summary && summary.complaint_rate > summary.thresholds.complaint_rate
      ? 'danger'
      : summary && summary.complaint_rate > summary.thresholds.complaint_rate * 0.6
        ? 'warn'
        : 'default';

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-navy">
            Deliverability
          </h2>
          <p className="text-sm text-muted-foreground">
            Domain authentication health and 30-day sending safety metrics.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void summaryQuery.refetch();
            void domainQuery.refetch();
          }}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {summary?.isPaused ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium text-destructive">
              Outbound campaigns are paused
            </p>
            <p className="mt-1 text-muted-foreground">
              {summary.pauseReason ||
                'Deliverability thresholds were exceeded. Fix issues before resuming.'}
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total sent (30d)"
          value={summary ? String(summary.total_sent) : '—'}
          hint="Outbound SENT + bounce + complaint"
        />
        <StatCard
          label="Bounces"
          value={summary ? String(summary.bounces) : '—'}
          hint={
            summary
              ? Object.entries(summary.bounce_breakdown)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(' · ') || undefined
              : undefined
          }
          tone={bounceTone}
        />
        <StatCard
          label="Bounce rate"
          value={summary ? pct(summary.bounce_rate) : '—'}
          hint={
            summary
              ? `Auto-pause above ${pct(summary.thresholds.bounce_rate)} (24h)`
              : undefined
          }
          tone={bounceTone}
        />
        <StatCard
          label="Complaints"
          value={summary ? String(summary.complaints) : '—'}
          hint={
            summary
              ? `Rate ${pct(summary.complaint_rate)} · pause > ${pct(summary.thresholds.complaint_rate)}`
              : undefined
          }
          tone={complaintTone}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Domain authentication
            </CardTitle>
            <CardDescription>
              SPF, DKIM, and DMARC DNS checks for your sending domain.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {domainQuery.isLoading ? (
              <p className="text-muted-foreground">Checking DNS records…</p>
            ) : domainQuery.isError ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                <MailWarning className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {(domainQuery.error as Error)?.message ||
                    'Could not resolve a sending domain. Connect email or set SMTP_FROM.'}
                </p>
              </div>
            ) : domain ? (
              <>
                <p className="text-muted-foreground">
                  Domain:{' '}
                  <span className="font-medium text-navy">{domain.domain}</span>
                </p>
                <div className="space-y-3">
                  {(
                    [
                      ['SPF', domain.spf, domain.details?.spfRecord],
                      [
                        'DKIM',
                        domain.dkim,
                        domain.details?.dkimRecord
                          ? `${domain.details.dkimSelector ?? 'selector'}: ${domain.details.dkimRecord}`
                          : null,
                      ],
                      ['DMARC', domain.dmarc, domain.details?.dmarcRecord],
                    ] as const
                  ).map(([label, status, record]) => (
                    <div
                      key={label}
                      className="rounded-md border bg-muted/30 px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-navy">{label}</span>
                        <DnsBadge status={status} />
                      </div>
                      {record ? (
                        <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                          {record.length > 160
                            ? `${record.slice(0, 160)}…`
                            : record}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-primary" />
              Safety controls
            </CardTitle>
            <CardDescription>
              Automatic campaign pause when rates breach thresholds.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Scan runs every <strong className="text-navy">15 minutes</strong>{' '}
                across all workspaces.
              </li>
              <li>
                Uses the last <strong className="text-navy">24 hours</strong> of
                outbound messages.
              </li>
              <li>
                Pauses when bounce rate exceeds{' '}
                <strong className="text-navy">
                  {summary ? pct(summary.thresholds.bounce_rate) : '5%'}
                </strong>{' '}
                or complaint rate exceeds{' '}
                <strong className="text-navy">
                  {summary ? pct(summary.thresholds.complaint_rate) : '0.1%'}
                </strong>
                .
              </li>
              <li>
                Pause reason is logged on the workspace and surfaced in Alerts.
              </li>
            </ul>
            {summaryQuery.isLoading ? (
              <p>Loading summary…</p>
            ) : summaryQuery.isError ? (
              <p className="text-destructive">
                {(summaryQuery.error as Error)?.message ||
                  'Failed to load deliverability summary.'}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
