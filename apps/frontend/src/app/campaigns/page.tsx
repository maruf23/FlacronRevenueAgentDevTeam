'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Megaphone,
  MessageSquareReply,
  Play,
  Plus,
  Users,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/store/toastStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CampaignStatusBadge, normalizeCampaignStatus } from '@/components/campaigns/campaign-status-badge';
import {
  LaunchConfirmDialog,
  buildLaunchSummaryFromCampaign,
  type LaunchSummary,
} from '@/components/campaigns/launch-confirm-dialog';
import { MOCK_CAMPAIGNS } from '@/lib/campaigns-mock';
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_GOALS,
  type CampaignChannelId,
  type CampaignListItem,
} from '@/types/campaigns';

type ApiCampaign = {
  id: string;
  name: string;
  status: string;
  goal?: string | null;
  product?: string | null;
  mailbox?: string | null;
  audience?: Record<string, unknown> | null;
  schedule?: Record<string, unknown> | null;
  leadsCount: number;
  sequencesCount: number;
  leadsSent: number;
  repliesReceived: number;
  settings?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
};

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

function channelsFromSettings(
  settings?: Record<string, unknown> | null,
): CampaignChannelId[] {
  const raw = settings?.channels;
  if (!raw || typeof raw !== 'object') return ['email'];
  const record = raw as Record<string, unknown>;
  const ids = CAMPAIGN_CHANNELS.map((c) => c.id).filter((id) => record[id]);
  return ids.length ? ids : ['email'];
}

function budgetFromSettings(settings?: Record<string, unknown> | null) {
  const value = settings?.budget;
  return typeof value === 'number' ? value : null;
}

export default function CampaignsPage() {
  const queryClient = useQueryClient();
  const [launchTarget, setLaunchTarget] = useState<{
    id: string;
    status: string;
    summary: LaunchSummary;
  } | null>(null);
  const campaignsQuery = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<ApiCampaign[]>('/campaigns'),
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/run`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      setLaunchTarget(null);
      toast('Campaign launched successfully — status: Running.', 'success');
    },
    onError: (error) => {
      toast(`Could not run campaign: ${extractError(error)}`, 'error');
    },
  });

  const fromApi: CampaignListItem[] = (campaignsQuery.data ?? []).map((c) => ({
    ...c,
    status: normalizeCampaignStatus(c.status),
    goal: c.goal,
    product: c.product,
    channels: channelsFromSettings(c.settings),
    budget: budgetFromSettings(c.settings),
    launchMode:
      typeof c.settings?.launchMode === 'string' ? c.settings.launchMode : null,
  }));

  const campaigns: CampaignListItem[] = campaignsQuery.isError
    ? MOCK_CAMPAIGNS
    : fromApi;

  const canRun = (status: string) =>
    ['DRAFT', 'SCHEDULED', 'NEEDS_REVIEW'].includes(status);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-navy">
            Campaigns
          </h2>
          <p className="text-sm text-muted-foreground">
            Find it. Qualify it. Close it. Add a campaign, let the AI core
            manage channels, then run it in the cloud.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/ads-ai">Ads AI</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/leads">Assign from Leads</Link>
          </Button>
          <Button asChild>
            <Link href="/campaigns/new">
              <Plus className="h-4 w-4" />
              Add campaign
            </Link>
          </Button>
        </div>
      </div>

      {campaignsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading campaigns…
        </div>
      ) : null}

      {!campaignsQuery.isLoading && campaigns.length === 0 ? (
        <Card className="shadow-none">
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-secondary text-navy">
              <Megaphone className="h-6 w-6" />
            </div>
            <div>
              <p className="font-medium text-navy">No campaigns yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add business inputs, pick sources and channels, then launch
                email, social, and ads on autopilot.
              </p>
            </div>
            <Button asChild>
              <Link href="/campaigns/new">Add campaign</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {campaigns.map((campaign) => {
          const goal =
            CAMPAIGN_GOALS.find((g) => g.value === campaign.goal)?.label ||
            campaign.goal ||
            'Outreach';
          return (
            <Card key={campaign.id} className="flex flex-col shadow-none">
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Megaphone className="h-4 w-4" />
                  </div>
                  <CampaignStatusBadge status={campaign.status} />
                </div>
                <div>
                  <CardTitle>
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="hover:text-primary"
                    >
                      {campaign.name}
                    </Link>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {goal}
                    {campaign.product ? ` · ${campaign.product}` : ''}
                    {campaign.budget
                      ? ` · $${campaign.budget.toLocaleString()} budget`
                      : ''}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex-1 space-y-3">
                {campaign.channels && campaign.channels.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {campaign.channels.map((id) => (
                      <Badge key={id} variant="secondary" className="capitalize">
                        {CAMPAIGN_CHANNELS.find((c) => c.id === id)?.label ?? id}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md border border-border p-2.5">
                    <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Assigned Leads
                    </div>
                    <p className="text-lg font-semibold tabular-nums text-navy">
                      {(campaign.leadsCount ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-md border border-border p-2.5">
                    <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Users className="h-3 w-3" />
                      Contacted Leads
                    </div>
                    <p className="text-lg font-semibold tabular-nums text-navy">
                      {(campaign.leadsSent ?? 0).toLocaleString()}
                    </p>
                  </div>
                  <div className="rounded-md border border-border p-2.5">
                    <div className="mb-1 flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      <MessageSquareReply className="h-3 w-3" />
                      Replied Leads
                    </div>
                    <p className="text-lg font-semibold tabular-nums text-navy">
                      {(campaign.repliesReceived ?? 0).toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="gap-2">
                <Button asChild variant="outline" className="flex-1" size="sm">
                  <Link href={`/campaigns/${campaign.id}`}>Manage</Link>
                </Button>
                {canRun(campaign.status) ? (
                  <Button
                    size="sm"
                    disabled={runMutation.isPending}
                    onClick={() => {
                      const source = (campaignsQuery.data ?? []).find(
                        (c) => c.id === campaign.id,
                      );
                      setLaunchTarget({
                        id: campaign.id,
                        status: campaign.status,
                        summary: buildLaunchSummaryFromCampaign({
                          audience: source?.audience,
                          settings: source?.settings,
                          mailbox: source?.mailbox,
                          schedule: source?.schedule,
                          leadsCount: campaign.leadsCount,
                        }),
                      });
                    }}
                  >
                    {runMutation.isPending && launchTarget?.id === campaign.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                    {campaign.status === 'NEEDS_REVIEW'
                      ? 'Approve & launch'
                      : 'Launch'}
                  </Button>
                ) : (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/leads?campaign=${campaign.id}`}>Leads</Link>
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <LaunchConfirmDialog
        open={Boolean(launchTarget)}
        onOpenChange={(open) => {
          if (!open) setLaunchTarget(null);
        }}
        summary={
          launchTarget?.summary ?? {
            audience: '—',
            leadsCount: 0,
            mailbox: '—',
            channels: '—',
            dailyLimit: '—',
            schedule: '—',
            estimatedAdSpend: '—',
          }
        }
        confirmLabel={
          launchTarget?.status === 'NEEDS_REVIEW'
            ? 'Approve & launch'
            : 'Launch campaign'
        }
        readinessNote={
          launchTarget?.status === 'NEEDS_REVIEW'
            ? 'Approving starts the campaign immediately (or on its schedule). This is not another review request.'
            : undefined
        }
        busy={runMutation.isPending}
        onConfirm={() => {
          if (launchTarget) runMutation.mutate(launchTarget.id);
        }}
      />
    </div>
  );
}
