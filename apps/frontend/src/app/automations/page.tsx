'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Cloud,
  Loader2,
  PauseCircle,
  PlayCircle,
  ShieldAlert,
  Workflow,
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type ControlCenter = {
  workspace: {
    id: string;
    name: string;
    isPaused: boolean;
    pausedAt: string | null;
    pauseReason: string | null;
  };
  settings: {
    supervisedAutomationEnabled: boolean;
    autoStartHoursDefault: number;
    requireExplicitApprovalForNewSenders: boolean;
  };
  operatingState: string;
  mailbox: {
    provider: string;
    accountEmail: string;
    healthy: boolean;
  } | null;
  campaignSummary: { total: number; byStatus: Record<string, number> };
  campaigns: Array<{
    id: string;
    name: string;
    status: string;
    leadsCount: number;
    launchMode: string | null;
    updatedAt: string;
  }>;
  queueHealth: Array<{
    name: string;
    waiting: number;
    active: number;
    delayed: number;
    failed: number;
    error?: string;
  }>;
  activity: Array<{
    id: string;
    action: string;
    targetType: string;
    createdAt: string;
  }>;
  cloudBanner: string;
};

const STATE_LABEL: Record<string, string> = {
  paused: 'Paused',
  attention_needed: 'Attention needed',
  awaiting_approval: 'Awaiting approval',
  enriching: 'Enriching / preparing',
  scheduled: 'Scheduled',
  running: 'Running',
  completed: 'Completed',
  idle: 'Idle',
};

export default function AutopilotPage() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['autopilot-control-center'],
    queryFn: () => api.get<ControlCenter>('/autopilot/control-center'),
    refetchInterval: 15_000,
  });

  const updateSettings = useMutation({
    mutationFn: (body: Partial<ControlCenter['settings']>) =>
      api.patch('/autopilot/settings', body),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['autopilot-control-center'] }),
  });

  const emergencyStop = useMutation({
    mutationFn: () => api.post('/autopilot/emergency-stop'),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['autopilot-control-center'] }),
  });

  const resume = useMutation({
    mutationFn: () => api.post('/autopilot/resume'),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ['autopilot-control-center'] }),
  });

  const data = query.data;
  const settings = data?.settings;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-navy">
            Autopilot Control Center
          </h2>
          <p className="text-sm text-muted-foreground">
            See what the agent is doing now, what runs next, and how to stop it.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data?.workspace.isPaused ? (
            <Button
              onClick={() => resume.mutate()}
              disabled={resume.isPending}
            >
              {resume.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
              )}
              Resume workspace
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={() => {
                if (
                  confirm(
                    'Emergency stop will pause all outbound sends. Inbound replies continue. Continue?',
                  )
                ) {
                  emergencyStop.mutate();
                }
              }}
              disabled={emergencyStop.isPending}
            >
              {emergencyStop.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
              )}
              Emergency stop
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-navy/20 bg-secondary/60 px-3 py-2.5 text-sm text-navy">
        <Cloud className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          {data?.cloudBanner ??
            'Campaigns run in the cloud. Closing your browser will not stop them.'}
        </p>
      </div>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading control center…
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Operating state</CardDescription>
                <CardTitle className="text-lg text-navy">
                  {STATE_LABEL[data?.operatingState ?? 'idle'] ??
                    data?.operatingState}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Workspace</CardDescription>
                <CardTitle className="flex items-center gap-2 text-lg text-navy">
                  {data?.workspace.isPaused ? (
                    <>
                      <PauseCircle className="h-4 w-4 text-destructive" />
                      Paused
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4 text-emerald-600" />
                      Live
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              {data?.workspace.pauseReason ? (
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  {data.workspace.pauseReason}
                </CardContent>
              ) : null}
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Mailbox</CardDescription>
                <CardTitle className="text-lg text-navy">
                  {data?.mailbox
                    ? data.mailbox.healthy
                      ? 'Healthy'
                      : 'Unhealthy'
                    : 'Not connected'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                {data?.mailbox?.accountEmail ?? 'Connect in Integrations'}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Campaigns</CardDescription>
                <CardTitle className="text-lg text-navy">
                  {data?.campaignSummary.byStatus.RUNNING ?? 0} running
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-muted-foreground">
                {data?.campaignSummary.byStatus.NEEDS_REVIEW ?? 0} need review ·{' '}
                {data?.campaignSummary.byStatus.SCHEDULED ?? 0} scheduled
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-navy">
                  <Workflow className="h-4 w-4" />
                  Automation policy
                </CardTitle>
                <CardDescription>
                  Safe auto-start is off by default for new workspaces.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor="supervised">Supervised automation</Label>
                    <p className="text-xs text-muted-foreground">
                      Required for countdown auto-start after review-ready.
                    </p>
                  </div>
                  <Switch
                    id="supervised"
                    checked={Boolean(settings?.supervisedAutomationEnabled)}
                    onCheckedChange={(v) =>
                      updateSettings.mutate({
                        supervisedAutomationEnabled: v,
                      })
                    }
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor="first-explicit">
                      Explicit approval for first campaign
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Blocks auto-start until a prior campaign has run.
                    </p>
                  </div>
                  <Switch
                    id="first-explicit"
                    checked={Boolean(
                      settings?.requireExplicitApprovalForNewSenders,
                    )}
                    onCheckedChange={(v) =>
                      updateSettings.mutate({
                        requireExplicitApprovalForNewSenders: v,
                      })
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Default approval window:{' '}
                  <strong className="text-navy">
                    {settings?.autoStartHoursDefault ?? 2}h
                  </strong>
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-navy">
                  <Activity className="h-4 w-4" />
                  Queue health
                </CardTitle>
                <CardDescription>
                  Cloud workers and delayed jobs (off-device).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {(data?.queueHealth ?? []).map((q) => (
                    <li
                      key={q.name}
                      className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-navy">{q.name}</span>
                      <span className="text-xs text-muted-foreground">
                        wait {q.waiting} · active {q.active} · delayed{' '}
                        {q.delayed}
                        {q.failed > 0 ? (
                          <span className="text-destructive">
                            {' '}
                            · failed {q.failed}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-navy">Campaign automation</CardTitle>
              <CardDescription>
                Per-campaign status — open a campaign to pause, approve, or
                adjust limits.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {(data?.campaigns ?? []).slice(0, 12).map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                  >
                    <div>
                      <Link
                        href={`/campaigns/${c.id}`}
                        className="font-medium text-navy hover:underline"
                      >
                        {c.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {c.leadsCount} leads
                        {c.launchMode ? ` · ${c.launchMode}` : ''}
                      </p>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        c.status === 'RUNNING' && 'bg-emerald-100 text-emerald-900',
                        c.status === 'NEEDS_REVIEW' &&
                          'bg-amber-100 text-amber-900',
                        c.status === 'ATTENTION_REQUIRED' &&
                          'bg-orange-100 text-orange-900',
                        c.status === 'PAUSED' && 'bg-secondary text-navy',
                      )}
                    >
                      {c.status}
                    </Badge>
                  </li>
                ))}
                {(data?.campaigns ?? []).length === 0 ? (
                  <li className="py-4 text-sm text-muted-foreground">
                    No campaigns yet.{' '}
                    <Link href="/campaigns/new" className="text-primary underline">
                      Create one
                    </Link>
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-navy">
                <AlertTriangle className="h-4 w-4" />
                Recent automation activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {(data?.activity ?? []).slice(0, 10).map((a) => (
                  <li
                    key={a.id}
                    className="flex justify-between gap-3 border-b border-border/60 pb-2 last:border-0"
                  >
                    <span className="text-navy">
                      {a.action}{' '}
                      <span className="text-muted-foreground">
                        · {a.targetType}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
                {(data?.activity ?? []).length === 0 ? (
                  <li className="text-muted-foreground">No recent events.</li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
