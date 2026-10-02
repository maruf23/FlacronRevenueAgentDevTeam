'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  Megaphone,
  DollarSign,
  ShieldCheck,
  UserPlus,
  MessageSquareReply,
  FileText,
  Upload,
  Rocket,
  ArrowRight,
  CalendarCheck,
  Activity,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { LeadRow } from '@/types/leads';
import type { InboxConversationListItem } from '@/types/inbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type CampaignRow = {
  id: string;
  name: string;
  status: string;
  leadsCount?: number;
};

type DeliverabilitySummary = {
  bounce_rate: number;
  complaint_rate: number;
  total_sent: number;
  isPaused: boolean;
};

type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
  icon: React.ComponentType<{ className?: string }>;
};

function formatRelative(iso: string | null | undefined) {
  if (!iso) return '—';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function pipelineValue(leads: LeadRow[]) {
  // Approximate pipeline value from lead score (mock dollars per score point)
  // until a real deal-value field exists.
  const open = leads.filter(
    (l) =>
      !['LOST', 'UNQUALIFIED', 'BOUNCED', 'COMPLAINED', 'CONVERTED'].includes(
        l.status,
      ),
  );
  const total = open.reduce((sum, l) => sum + (l.leadScore ?? 40) * 250, 0);
  return total;
}

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${n.toLocaleString()}`;
}

const QUICK_ACTIONS = [
  {
    title: 'Generate Draft',
    description: 'AI-write a personalized outreach email',
    href: '/leads',
    icon: FileText,
  },
  {
    title: 'Import CSV',
    description: 'Upload and verify a lead list',
    href: '/leads',
    icon: Upload,
  },
  {
    title: 'Start Campaign',
    description: 'Launch a multi-step sequence',
    href: '/campaigns',
    icon: Rocket,
  },
];

export default function DashboardPage() {
  const leadsQuery = useQuery({
    queryKey: ['leads'],
    queryFn: () => api.get<LeadRow[]>('/leads'),
  });

  const campaignsQuery = useQuery({
    queryKey: ['lead-campaigns'],
    queryFn: () => api.get<CampaignRow[]>('/leads/campaigns'),
  });

  const deliverabilityQuery = useQuery({
    queryKey: ['deliverability-summary'],
    queryFn: () => api.get<DeliverabilitySummary>('/deliverability/summary'),
    retry: false,
  });

  const inboxQuery = useQuery({
    queryKey: ['inbox'],
    queryFn: () => api.get<InboxConversationListItem[]>('/inbox'),
    retry: false,
  });

  const leads = leadsQuery.data ?? [];
  const campaigns = campaignsQuery.data ?? [];
  const summary = deliverabilityQuery.data;
  const inbox = inboxQuery.data ?? [];

  const stats = useMemo(() => {
    const activeCampaigns = campaigns.filter((c) => c.status === 'ACTIVE').length;
    const meetings = leads.filter((l) => l.status === 'MEETING_SCHEDULED').length;
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const newThisWeek = leads.filter(
      (l) => new Date(l.createdAt).getTime() >= weekAgo,
    ).length;
    const deliverabilityScore =
      summary != null
        ? Math.max(
            0,
            Math.min(
              100,
              100 -
                summary.bounce_rate * 100 * 8 -
                summary.complaint_rate * 100 * 40,
            ),
          )
        : null;

    return [
      {
        label: 'Total Leads',
        value: leads.length.toLocaleString(),
        change: `+${newThisWeek} this week`,
        icon: Users,
      },
      {
        label: 'Active Campaigns',
        value: String(activeCampaigns),
        change: `${campaigns.length} total`,
        icon: Megaphone,
      },
      {
        label: 'Pipeline Value',
        value: formatCurrency(pipelineValue(leads)),
        change: 'Est. from lead scores',
        icon: DollarSign,
      },
      {
        label: 'Deliverability',
        value:
          deliverabilityScore != null
            ? `${deliverabilityScore.toFixed(1)}%`
            : '—',
        change: summary?.isPaused
          ? 'Paused'
          : summary
            ? `${summary.total_sent} sent (window)`
            : 'Unavailable',
        icon: ShieldCheck,
      },
      {
        label: 'Meetings Booked',
        value: String(meetings),
        change: 'MEETING_SCHEDULED stage',
        icon: CalendarCheck,
      },
    ];
  }, [leads, campaigns, summary]);

  const activity = useMemo(() => {
    const items: ActivityItem[] = [];

    const recentLeads = [...leads]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 4);

    for (const lead of recentLeads) {
      items.push({
        id: `lead-${lead.id}`,
        title: 'New lead added',
        detail: `${lead.contact.name || lead.contact.email}${
          lead.company.name ? ` · ${lead.company.name}` : ''
        }`,
        time: formatRelative(lead.createdAt),
        icon: UserPlus,
      });
    }

    const replies = inbox
      .filter(
        (c) =>
          c.latestMessage?.direction === 'INBOUND' ||
          c.filterHints.interested ||
          c.filterHints.needsReply,
      )
      .slice(0, 4);

    for (const conv of replies) {
      items.push({
        id: `inbox-${conv.id}`,
        title: conv.filterHints.meetingRequested
          ? 'Meeting requested'
          : conv.filterHints.interested
            ? 'Positive reply received'
            : 'Inbox reply',
        detail: `${conv.contact.name} · ${conv.subject || 'No subject'}`,
        time: formatRelative(conv.lastMessageAt),
        icon: MessageSquareReply,
      });
    }

    const engaged = leads
      .filter((l) =>
        ['CONTACTED', 'ENGAGED', 'REPLIED'].includes(l.status),
      )
      .sort(
        (a, b) =>
          new Date(b.lastActivityAt ?? b.updatedAt).getTime() -
          new Date(a.lastActivityAt ?? a.updatedAt).getTime(),
      )
      .slice(0, 3);

    for (const lead of engaged) {
      items.push({
        id: `act-${lead.id}`,
        title: `Lead ${lead.status.toLowerCase().replace(/_/g, ' ')}`,
        detail: `${lead.contact.name}${
          lead.campaign?.name ? ` · ${lead.campaign.name}` : ''
        }`,
        time: formatRelative(lead.lastActivityAt ?? lead.updatedAt),
        icon: Activity,
      });
    }

    return items.slice(0, 8);
  }, [leads, inbox]);

  const loading =
    leadsQuery.isLoading ||
    campaignsQuery.isLoading ||
    deliverabilityQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-navy">
          Dashboard
        </h2>
        <p className="text-sm text-muted-foreground">
          Live pipeline health, campaign performance, and recent workspace activity.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading workspace metrics…
        </div>
      ) : null}

      {leadsQuery.isError ? (
        <p className="text-sm text-destructive">
          Could not load leads. Check that the backend is running and you are signed in.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label} className="shadow-none">
            <CardContent className="flex items-start gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-navy">
                <stat.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {stat.label}
                </p>
                <p className="text-xl font-semibold tabular-nums text-navy">
                  {stat.value}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {stat.change}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 shadow-none">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>
                Latest lead adds, stage changes, and inbox replies from your workspace.
              </CardDescription>
            </div>
            <Badge variant="secondary">Live</Badge>
          </CardHeader>
          <CardContent className="space-y-1">
            {activity.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                No recent activity yet. Import leads or send outreach to get started.
              </p>
            ) : (
              activity.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-accent/50"
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-navy">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-navy">{item.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.detail}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {item.time}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Jump into the highest-leverage workflows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.title}
                href={action.href}
                className="flex items-center gap-3 rounded-md border border-border p-3 transition-colors hover:border-primary/40 hover:bg-accent/40"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <action.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-navy">{action.title}</p>
                  <p className="text-xs text-muted-foreground">{action.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
            <Button asChild className="mt-2 w-full">
              <Link href="/campaigns">View all campaigns</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
