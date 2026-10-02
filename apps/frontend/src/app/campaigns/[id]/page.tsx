'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Cloud,
  Loader2,
  Play,
  Sparkles,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/store/toastStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CampaignStatusBadge, normalizeCampaignStatus } from '@/components/campaigns/campaign-status-badge';
import { CampaignControls } from '@/components/campaigns/campaign-controls';
import { CampaignControlPanel } from '@/components/campaigns/campaign-control-panel';
import { CampaignAddLeadsDialog } from '@/components/campaigns/campaign-add-leads-dialog';
import { CampaignEditFutureStepsDialog } from '@/components/campaigns/campaign-edit-future-steps-dialog';
import { LeadEligibilitySummary } from '@/components/campaigns/lead-eligibility-summary';
import { DiscoveryWorkflow } from '@/components/campaigns/discovery-workflow';
import { AiAgentCore } from '@/components/campaigns/ai-agent-core';
import {
  CampaignLeadStatusBadge,
  formatNextScheduledSend,
  type CampaignLeadStatus,
} from '@/components/campaigns/campaign-lead-status-badge';
import {
  LaunchConfirmDialog,
  buildLaunchSummaryFromCampaign,
} from '@/components/campaigns/launch-confirm-dialog';
import { resolveSafetyChecks } from '@/lib/safety-checks';
import {
  AD_PLATFORMS,
  CAMPAIGN_CHANNELS,
  type CampaignAdsConfig,
  type CampaignStatus,
  type CampaignWorkflow,
  type LeadEligibility,
  type SequenceStep,
} from '@/types/campaigns';
import { cn } from '@/lib/utils';

type CampaignDetail = {
  id: string;
  name: string;
  status: string;
  goal: string | null;
  product: string | null;
  mailbox: string | null;
  calendarLink: string | null;
  schedule: Record<string, unknown> | null;
  settings: Record<string, unknown> | null;
  audience: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  sequences?: Array<{
    id: string;
    name: string;
    status: string;
    stepOrder: unknown;
  }>;
  _count?: { leads: number; sequences: number };
};

type CampaignStats = {
  campaignId: string;
  leadsAdded: number;
  sent: number;
  delivered: number;
  replies: number;
  bounced: number;
  revenueGenerated: number;
  pipelineValue: number;
  readyToSend: number;
  positiveReplies: number;
  meetingsBooked: number;
  unsubscribes: number;
  qualifiedLeads?: number;
  proposalsSent?: number;
  customersWon?: number;
  pipelineMoved?: number;
  dailyLimit: number;
  rates: {
    openRate: number;
    replyRate: number;
    bounceRate: number;
    unsubscribeRate: number;
    meetingRate: number;
    positiveReplyRate: number;
  };
  performance: Array<{
    date: string;
    sent: number;
    delivered: number;
    replies: number;
  }>;
};

type CampaignLeadRow = {
  id: string;
  contactName: string;
  email: string;
  company: string | null;
  title: string | null;
  pipelineStatus: string;
  leadStatus: CampaignLeadStatus;
  nextScheduledSend: string | null;
  nextSequenceStep: number | null;
  lastActivityAt: string | null;
  createdAt: string;
};

function goalLabel(goal: string | null | undefined) {
  if (!goal) return 'No goal set';
  return goal
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function channelsFromCampaign(campaign: CampaignDetail): string[] {
  const raw = campaign.settings?.channels;
  if (!raw || typeof raw !== 'object') return ['email'];
  const record = raw as Record<string, unknown>;
  const ids = CAMPAIGN_CHANNELS.map((c) => c.id).filter((id) => record[id]);
  return ids.length ? ids : ['email'];
}

function adsFromCampaign(campaign: CampaignDetail): CampaignAdsConfig | null {
  const raw = campaign.settings?.ads;
  if (!raw || typeof raw !== 'object') return null;
  return raw as CampaignAdsConfig;
}

function sequenceFromCampaign(campaign: CampaignDetail): SequenceStep[] {
  const fromSettings = campaign.settings?.sequence;
  if (Array.isArray(fromSettings) && fromSettings.length > 0) {
    return fromSettings as SequenceStep[];
  }
  const first = campaign.sequences?.[0]?.stepOrder;
  if (Array.isArray(first)) {
    return first as SequenceStep[];
  }
  return [];
}

function eligibilityFromSettings(
  campaign: CampaignDetail,
  leadsAdded: number,
): LeadEligibility {
  const fromSettings = campaign.settings?.eligibility;
  if (fromSettings && typeof fromSettings === 'object') {
    const raw = fromSettings as Partial<LeadEligibility>;
    const risky = raw.risky ?? 0;
    const invalid = raw.invalid ?? 0;
    const duplicates = raw.duplicates ?? 0;
    const suppressed = raw.suppressed ?? raw.unsubscribed ?? 0;
    return {
      total: raw.total ?? leadsAdded,
      verified: raw.verified ?? 0,
      catchAll: raw.catchAll ?? 0,
      risky,
      invalid,
      duplicates,
      suppressed,
      excluded: raw.excluded ?? risky + invalid + duplicates + suppressed,
      unsubscribed: raw.unsubscribed ?? suppressed,
    };
  }
  return {
    total: leadsAdded,
    verified: 0,
    catchAll: 0,
    risky: 0,
    invalid: 0,
    duplicates: 0,
    suppressed: 0,
    excluded: 0,
    unsubscribed: 0,
  };
}

function extractError(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body;
    if (body && typeof body === 'object') {
      const msg = (body as { message?: string | string[] }).message;
      if (Array.isArray(msg) && msg.length) return msg.join(', ');
      if (typeof msg === 'string' && msg.trim()) return msg;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id;

  const campaignQuery = useQuery({
    queryKey: ['campaign', id],
    queryFn: () => api.get<CampaignDetail>(`/campaigns/${id}`),
    enabled: Boolean(id),
  });

  const statsQuery = useQuery({
    queryKey: ['campaign-stats', id],
    queryFn: () => api.get<CampaignStats>(`/campaigns/${id}/stats`),
    enabled: Boolean(id),
  });

  const workflowQuery = useQuery({
    queryKey: ['campaign-workflow', id],
    queryFn: () => api.get<CampaignWorkflow>(`/campaigns/${id}/workflow`),
    enabled: Boolean(id),
  });

  const [statusOverride, setStatusOverride] = useState<CampaignStatus | null>(
    null,
  );
  const [dailyLimit, setDailyLimit] = useState(50);
  const [activeTab, setActiveTab] = useState('overview');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [addLeadsOpen, setAddLeadsOpen] = useState(false);
  const [editStepsOpen, setEditStepsOpen] = useState(false);
  const [launchConfirmOpen, setLaunchConfirmOpen] = useState(false);

  const leadsQuery = useQuery({
    queryKey: ['campaign-leads', id],
    queryFn: () =>
      api.get<{ campaignId: string; leads: CampaignLeadRow[] }>(
        `/campaigns/${id}/leads`,
      ),
    enabled: Boolean(id) && activeTab === 'leads',
    refetchOnWindowFocus: true,
  });

  const campaign = campaignQuery.data;
  const stats = statsQuery.data;
  const campaignLeads = leadsQuery.data?.leads ?? [];

  useEffect(() => {
    if (statsQuery.isError) {
      toast(
        `Failed to load campaign stats: ${extractError(statsQuery.error)}`,
        'error',
      );
    }
  }, [statsQuery.isError, statsQuery.error]);

  useEffect(() => {
    if (campaignQuery.isError) {
      toast(
        `Failed to load campaign: ${extractError(campaignQuery.error)}`,
        'error',
      );
    }
  }, [campaignQuery.isError, campaignQuery.error]);

  useEffect(() => {
    if (stats?.dailyLimit != null) {
      setDailyLimit(stats.dailyLimit);
    }
  }, [stats?.dailyLimit]);

  const status = useMemo<CampaignStatus>(() => {
    if (statusOverride) return statusOverride;
    return normalizeCampaignStatus(campaign?.status ?? 'DRAFT');
  }, [statusOverride, campaign?.status]);

  const runControl = async (
    action: string,
    fn: () => Promise<void>,
    successMessage: string,
  ) => {
    setBusyAction(action);
    try {
      await fn();
      await Promise.all([
        campaignQuery.refetch(),
        statsQuery.refetch(),
        workflowQuery.refetch(),
      ]);
      toast(successMessage, 'success');
    } catch (error) {
      toast(`${successMessage.replace(/\.$/, '')} failed: ${extractError(error)}`, 'error');
      setStatusOverride(null);
    } finally {
      setBusyAction(null);
    }
  };

  const pauseCampaign = () =>
    runControl(
      'pause',
      async () => {
        setStatusOverride('PAUSED');
        await api.post(`/campaigns/${id}/pause`);
      },
      'Campaign paused — pending jobs cancelled',
    );

  const resumeCampaign = () =>
    runControl(
      'resume',
      async () => {
        setStatusOverride('RUNNING');
        await api.post(`/campaigns/${id}/resume`);
      },
      'Campaign resumed',
    );

  const stopCampaign = () =>
    runControl(
      'stop',
      async () => {
        setStatusOverride('COMPLETED');
        await api.post(`/campaigns/${id}/stop`);
      },
      'Campaign stopped — pending jobs cancelled',
    );

  const archiveCampaign = () =>
    runControl(
      'archive',
      async () => {
        setStatusOverride('ARCHIVED');
        await api.post(`/campaigns/${id}/archive`);
      },
      'Campaign archived',
    );

  const runCampaign = () =>
    runControl(
      'run',
      async () => {
        setStatusOverride('RUNNING');
        await api.post(`/campaigns/${id}/run`);
      },
      'Campaign launched successfully — status: Running.',
    );

  const duplicateCampaign = () =>
    runControl(
      'duplicate',
      async () => {
        const copy = await api.post<{ id: string }>(`/campaigns/${id}/duplicate`);
        router.push(`/campaigns/${copy.id}`);
      },
      'Campaign duplicated',
    );

  const removeUnsentLeads = () =>
    runControl(
      'remove-unsent',
      async () => {
        const result = await api.post<{ removed: number }>(
          `/campaigns/${id}/remove-unsent-leads`,
        );
        if (result.removed === 0) {
          throw new Error('No unsent leads to remove');
        }
      },
      'Unsent leads removed',
    );

  const exportCampaign = (format: 'csv' | 'pdf') =>
    runControl(
      'export',
      async () => {
        const { blob, filename } = await api.download(
          `/campaigns/${id}/export?format=${format}`,
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `campaign-export.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      },
      `Exported ${format.toUpperCase()}`,
    );

  const saveFutureSteps = async (steps: SequenceStep[]) => {
    setBusyAction('future-steps');
    try {
      await api.patch(`/campaigns/${id}/future-steps`, { sequence: steps });
      await campaignQuery.refetch();
      setEditStepsOpen(false);
      setActiveTab('sequence');
      toast('Future sequence steps updated', 'success');
    } catch (error) {
      toast(`Failed to update steps: ${extractError(error)}`, 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const isLoading = campaignQuery.isLoading || statsQuery.isLoading;
  const isError = campaignQuery.isError && !campaign;

  const m = {
    leadsAdded: stats?.leadsAdded ?? 0,
    readyToSend: stats?.readyToSend ?? 0,
    sent: stats?.sent ?? 0,
    delivered: stats?.delivered ?? 0,
    bounced: stats?.bounced ?? 0,
    replies: stats?.replies ?? 0,
    positiveReplies: stats?.positiveReplies ?? 0,
    meetingsBooked: stats?.meetingsBooked ?? 0,
    unsubscribes: stats?.unsubscribes ?? 0,
    revenueGenerated: stats?.revenueGenerated ?? 0,
    pipelineValue: stats?.pipelineValue ?? stats?.revenueGenerated ?? 0,
    qualifiedLeads: stats?.qualifiedLeads ?? 0,
    proposalsSent: stats?.proposalsSent ?? 0,
    customersWon: stats?.customersWon ?? 0,
  };

  const rates = stats?.rates ?? {
    openRate: 0,
    replyRate: 0,
    bounceRate: 0,
    unsubscribeRate: 0,
    meetingRate: 0,
    positiveReplyRate: 0,
  };

  const performance = stats?.performance ?? [];
  const sequence = campaign ? sequenceFromCampaign(campaign) : [];
  const channelIds = campaign ? channelsFromCampaign(campaign) : [];
  const ads = campaign ? adsFromCampaign(campaign) : null;
  const budget =
    typeof campaign?.settings?.budget === 'number'
      ? campaign.settings.budget
      : null;
  const offer =
    typeof campaign?.settings?.offer === 'string' ? campaign.settings.offer : '';
  const website =
    typeof campaign?.settings?.website === 'string'
      ? campaign.settings.website
      : '';
  const eligibility = campaign
    ? eligibilityFromSettings(campaign, m.leadsAdded)
    : {
        total: 0,
        verified: 0,
        catchAll: 0,
        risky: 0,
        invalid: 0,
        duplicates: 0,
        suppressed: 0,
        excluded: 0,
        unsubscribed: 0,
      };

  const deliveredPct =
    m.sent > 0 ? ((m.delivered / m.sent) * 100).toFixed(1) : '0';
  const replyPct = m.sent > 0 ? ((m.replies / m.sent) * 100).toFixed(1) : '0';
  const meetingPct =
    m.sent > 0 ? ((m.meetingsBooked / m.sent) * 100).toFixed(1) : '0';

  const metricCards = [
    { label: 'Status', value: null as string | null, status: true },
    { label: 'Assigned Leads', value: m.leadsAdded.toLocaleString() },
    { label: 'Ready to Send', value: m.readyToSend.toLocaleString() },
    { label: 'Contacted Leads', value: m.sent.toLocaleString() },
    {
      label: 'Delivered',
      value: m.delivered.toLocaleString(),
      sub: `${deliveredPct}%`,
    },
    { label: 'Bounced', value: m.bounced.toLocaleString() },
    {
      label: 'Replied Leads',
      value: m.replies.toLocaleString(),
      sub: `${replyPct}%`,
    },
    { label: 'Positive Replies', value: m.positiveReplies.toLocaleString() },
    {
      label: 'Meetings Booked',
      value: m.meetingsBooked.toLocaleString(),
      sub: `${meetingPct}%`,
    },
    { label: 'Unsubscribes', value: m.unsubscribes.toLocaleString() },
    {
      label: 'Qualified leads',
      value: m.qualifiedLeads.toLocaleString(),
    },
    {
      label: 'Proposals sent',
      value: m.proposalsSent.toLocaleString(),
    },
    {
      label: 'Customers won',
      value: m.customersWon.toLocaleString(),
    },
    {
      label: 'Revenue Generated',
      value: `$${m.revenueGenerated.toLocaleString()}`,
      highlight: true,
    },
    {
      label: 'Pipeline Value',
      value: `$${m.pipelineValue.toLocaleString()}`,
    },
  ];

  const topMetrics = [
    { label: 'Open Rate', value: `${rates.openRate}%` },
    { label: 'Reply Rate', value: `${rates.replyRate}%` },
    {
      label: 'Positive Reply Rate',
      value: `${rates.positiveReplyRate}%`,
    },
    { label: 'Meeting Rate', value: `${rates.meetingRate}%` },
    { label: 'Bounce Rate', value: `${rates.bounceRate}%` },
    {
      label: 'Unsubscribe Rate',
      value: `${rates.unsubscribeRate}%`,
    },
  ];

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-navy" />
        Loading campaign dashboard…
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="space-y-4 rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-900">
        <p className="font-medium">Could not load this campaign.</p>
        <p className="text-red-800/80">
          {extractError(campaignQuery.error ?? new Error('Campaign not found'))}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/campaigns">Back to Campaigns</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-navy">
              {campaign.name}
            </h1>
            <CampaignStatusBadge status={status} />
            {statsQuery.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {goalLabel(campaign.goal)} · {campaign.product || 'No product'} ·{' '}
            {campaign.mailbox || 'No mailbox'}
            {budget ? ` · $${budget.toLocaleString()} budget` : ''}
          </p>
          {channelIds.length ? (
            <div className="flex flex-wrap gap-1 pt-1">
              {channelIds.map((id) => (
                <Badge key={id} variant="secondary" className="capitalize">
                  {CAMPAIGN_CHANNELS.find((c) => c.id === id)?.label ?? id}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {['DRAFT', 'SCHEDULED', 'NEEDS_REVIEW'].includes(status) ? (
            <Button
              size="sm"
              disabled={Boolean(busyAction)}
              onClick={() => setLaunchConfirmOpen(true)}
            >
              {busyAction === 'run' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {status === 'NEEDS_REVIEW' ? 'Approve & launch' : 'Launch campaign'}
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link href={`/leads?campaign=${campaign.id}`}>View Leads</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/campaigns">All Campaigns</Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-navy px-4 py-2.5 text-navy-foreground">
        <CampaignStatusBadge
          status={status}
          className="bg-white/15 text-white"
        />
        <StatPill label="Assigned" value={m.leadsAdded} />
        <StatPill label="Contacted" value={m.sent} />
        <StatPill
          label="Delivered"
          value={m.delivered}
          sub={`${deliveredPct}%`}
        />
        <StatPill label="Replied" value={m.replies} sub={`${replyPct}%`} />
        <StatPill
          label="Meetings"
          value={m.meetingsBooked}
          sub={`${meetingPct}%`}
        />
        <StatPill
          label="Pipeline Value"
          value={`$${m.pipelineValue.toLocaleString()}`}
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start rounded-lg bg-navy p-1 text-navy-foreground">
          {[
            ['overview', 'Overview'],
            ['workflow', 'Workflow'],
            ['leads', 'Assigned Leads'],
            ['sequence', 'Sequence'],
            ['ads', 'Ads'],
            ['inbox', 'Inbox'],
            ['analytics', 'Analytics'],
            ['settings', 'Settings'],
          ].map(([tab, label]) => (
            <TabsTrigger
              key={tab}
              value={tab}
              className="text-white/70 data-[state=active]:bg-white data-[state=active]:text-navy"
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <CampaignControlPanel
          className="mt-3"
          status={status}
          busyAction={busyAction}
          onPause={pauseCampaign}
          onResume={resumeCampaign}
          onStop={stopCampaign}
          onAddLeads={() => setAddLeadsOpen(true)}
          onRemoveUnsent={removeUnsentLeads}
          onEditFutureSteps={() => {
            setActiveTab('sequence');
            setEditStepsOpen(true);
          }}
          onDuplicate={duplicateCampaign}
          onExport={exportCampaign}
          onArchive={archiveCampaign}
        />

        <TabsContent value="overview" className="space-y-4">
          {status === 'RUNNING' || status === 'SCHEDULED' ? (
            <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
              <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
              Cloud Autopilot is running this campaign even if you close the
              browser. Pause, stop, or emergency-stop from Autopilot any time.
            </div>
          ) : null}

          <DiscoveryWorkflow workflow={workflowQuery.data} />

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            {metricCards.map((card) => (
              <Card key={card.label} className="shadow-none">
                <CardContent className="p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {card.label}
                  </p>
                  {card.status ? (
                    <div className="mt-1.5">
                      <CampaignStatusBadge status={status} />
                    </div>
                  ) : (
                    <p
                      className={cn(
                        'mt-1 text-lg font-semibold tabular-nums text-navy',
                        card.highlight && 'text-primary',
                      )}
                    >
                      {card.value}
                      {card.sub ? (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {card.sub}
                        </span>
                      ) : null}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_0.6fr]">
            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Performance Overview</CardTitle>
                <CardDescription>
                  Sent, delivered, and replies over the last 14 days
                </CardDescription>
              </CardHeader>
              <CardContent className="h-72 pt-2">
                {performance.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No send activity yet for this campaign.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={performance}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Line
                        type="monotone"
                        dataKey="sent"
                        name="Sent"
                        stroke="#0284c7"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="delivered"
                        name="Delivered"
                        stroke="#059669"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="replies"
                        name="Replies"
                        stroke="#7c3aed"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableBody>
                    {topMetrics.map((row) => (
                      <TableRow key={row.label}>
                        <TableCell className="text-muted-foreground">
                          {row.label}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums text-navy">
                          {row.value}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <AiAgentCore />

          {(website || offer) ? (
            <Card className="shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Business inputs</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Website: </span>
                  {website || '—'}
                </p>
                <p>
                  <span className="text-muted-foreground">Offer: </span>
                  {offer || '—'}
                </p>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/20 p-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAddLeadsOpen(true)}
            >
              Add Leads
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setActiveTab('sequence');
                setEditStepsOpen(true);
              }}
            >
              Edit Sequence
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/leads?campaign=${campaign.id}`}>View Leads</Link>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="workflow" className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">
                Discovery to conversion workflow
              </CardTitle>
              <CardDescription>
                The 12-step path from finding a lead to onboarding a customer.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {workflowQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading workflow…
                </div>
              ) : (
                <DiscoveryWorkflow workflow={workflowQuery.data} />
              )}
            </CardContent>
          </Card>
          <AiAgentCore />
        </TabsContent>

        <TabsContent value="leads" className="space-y-4">
          <Card className="shadow-none">
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-sm">Assigned Leads</CardTitle>
                <CardDescription>
                  Precise send status for every lead in this campaign.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={leadsQuery.isFetching}
                  onClick={() => void leadsQuery.refetch()}
                >
                  {leadsQuery.isFetching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Refresh
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/leads?campaign=${campaign.id}`}>
                    Open in Leads
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <LeadEligibilitySummary eligibility={eligibility} />

              {leadsQuery.isLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading assigned leads…
                </div>
              ) : null}

              {leadsQuery.isError ? (
                <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                  Failed to load leads: {extractError(leadsQuery.error)}
                </p>
              ) : null}

              {!leadsQuery.isLoading && !leadsQuery.isError ? (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Next Scheduled Send</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {campaignLeads.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="py-8 text-center text-sm text-muted-foreground"
                          >
                            No leads assigned to this campaign yet.
                          </TableCell>
                        </TableRow>
                      ) : (
                        campaignLeads.map((lead) => (
                          <TableRow key={lead.id}>
                            <TableCell>
                              <div className="space-y-0.5">
                                <p className="font-medium text-navy">
                                  {lead.contactName}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {lead.email}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell>
                              {lead.company || (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <CampaignLeadStatusBadge
                                status={lead.leadStatus}
                              />
                            </TableCell>
                            <TableCell className="tabular-nums text-sm">
                              {lead.leadStatus === 'SCHEDULED' ||
                              lead.leadStatus === 'FOLLOW_UP_DUE' ||
                              lead.leadStatus === 'QUEUED'
                                ? formatNextScheduledSend(
                                    lead.nextScheduledSend,
                                  )
                                : '—'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sequence" className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Sequence steps</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {sequence.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sequence steps saved for this campaign yet.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Step</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Delay</TableHead>
                      <TableHead>Conditions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sequence.map((step) => (
                      <TableRow key={step.id}>
                        <TableCell>{step.step}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{step.type}</Badge>
                        </TableCell>
                        <TableCell>{step.subject}</TableCell>
                        <TableCell>{step.delayDays} days</TableCell>
                        <TableCell>{step.conditions}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ads" className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Sparkles className="h-4 w-4 text-primary" />
                Ads AI
              </CardTitle>
              <CardDescription>
                Create campaigns from prompts, generate creatives, set budgets,
                and launch with approval or autopilot.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!ads || ads.platforms?.length === 0 ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  Paid ads are not enabled on this campaign.
                  <Button asChild size="sm" variant="outline">
                    <Link href="/ads-ai">Open Ads AI</Link>
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {(ads.platforms ?? []).map((platform) => (
                      <Badge key={platform} variant="secondary">
                        {AD_PLATFORMS.find((p) => p.id === platform)?.label ??
                          platform}
                      </Badge>
                    ))}
                    <Badge variant="outline">
                      ${ads.dailyBudget ?? 0}/day · $
                      {ads.totalBudget ?? 0} total
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {ads.launchMode || 'approval'}
                    </Badge>
                  </div>
                  {ads.creatives?.length ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {ads.creatives.map((creative) => (
                        <div
                          key={creative.id}
                          className="rounded-md border p-3"
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                            {AD_PLATFORMS.find((p) => p.id === creative.platform)
                              ?.label ?? creative.platform}
                          </p>
                          <p className="mt-1 text-sm font-medium text-navy">
                            {creative.headline}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {creative.primaryText}
                          </p>
                          <p className="mt-2 text-[11px] text-navy">
                            CTA: {creative.cta}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No creatives saved yet. Generate them from Ads AI or the
                      campaign wizard.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inbox">
          <Card className="shadow-none">
            <CardContent className="flex flex-wrap items-center gap-2 py-10 text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4" />
              Campaign inbox replies will appear here. Open the shared Inbox for
              live threads.
              <Button asChild size="sm" variant="outline">
                <Link href="/inbox">Go to Inbox</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-sm">Analytics snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              {topMetrics.map((row) => (
                <div key={row.label} className="rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">{row.label}</p>
                  <p className="text-xl font-semibold tabular-nums text-navy">
                    {row.value}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <CampaignControls
            status={status}
            dailyLimit={dailyLimit}
            onDailyLimitChange={setDailyLimit}
            onPause={pauseCampaign}
            onResume={resumeCampaign}
            onStop={stopCampaign}
            onEditFutureSteps={() => {
              setActiveTab('sequence');
              setEditStepsOpen(true);
            }}
            safetyOverrides={
              status === 'ATTENTION_REQUIRED' ? { bounce: true } : undefined
            }
            safetyChecks={
              status === 'ATTENTION_REQUIRED'
                ? resolveSafetyChecks({
                    overrides: { bounce: true },
                    assumePassedWhenUnknown: true,
                  })
                : undefined
            }
          />
        </TabsContent>
      </Tabs>

      <CampaignAddLeadsDialog
        open={addLeadsOpen}
        onOpenChange={setAddLeadsOpen}
        campaignId={campaign.id}
        onAssigned={() => {
          void Promise.all([
            campaignQuery.refetch(),
            statsQuery.refetch(),
            leadsQuery.refetch(),
          ]);
          void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
          void queryClient.invalidateQueries({ queryKey: ['campaign-leads', id] });
          toast('Leads added to campaign', 'success');
        }}
      />

      <CampaignEditFutureStepsDialog
        open={editStepsOpen}
        onOpenChange={setEditStepsOpen}
        steps={sequence}
        busy={busyAction === 'future-steps'}
        onSave={saveFutureSteps}
      />

      <LaunchConfirmDialog
        open={launchConfirmOpen}
        onOpenChange={setLaunchConfirmOpen}
        summary={buildLaunchSummaryFromCampaign({
          audience: campaign.audience,
          settings: campaign.settings,
          mailbox: campaign.mailbox,
          schedule: campaign.schedule,
          leadsCount: m.leadsAdded,
        })}
        confirmLabel={
          status === 'NEEDS_REVIEW' ? 'Approve & launch' : 'Launch campaign'
        }
        readinessNote={
          status === 'NEEDS_REVIEW'
            ? 'Approving starts the campaign immediately (or on its schedule). This is not another review request.'
            : undefined
        }
        busy={busyAction === 'run'}
        onConfirm={() => {
          setLaunchConfirmOpen(false);
          void runCampaign();
        }}
      />
    </div>
  );
}

function StatPill({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5 text-sm">
      <span className="text-white/60">{label}</span>
      <span className="font-semibold tabular-nums text-white">{value}</span>
      {sub ? <span className="text-xs text-white/50">{sub}</span> : null}
    </div>
  );
}
