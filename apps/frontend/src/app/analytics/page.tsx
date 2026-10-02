'use client';

import { useQuery } from '@tanstack/react-query';
import {
  DollarSign,
  Users,
  CalendarCheck,
  Percent,
  Loader2,
} from 'lucide-react';
import {
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

type AnalyticsOverview = {
  metrics: {
    revenuePipeline: number;
    qualifiedLeads: number;
    meetingsBooked: number;
    conversionRate: number;
    newLeadsThisWeek: number;
    totalLeads: number;
    campaignsRunning: number;
    sentOutbound30d: number;
    replies30d: number;
    bounceRate: number;
    replyRate: number;
    suppressedContacts: number;
  };
  sources: Array<{ name: string; value: number }>;
  dailyVolume: Array<{ day: string; leads: number }>;
};

const SOURCE_COLORS = ['#FE4201', '#042963', '#F59E0B', '#10B981', '#6366F1'];

function formatCurrency(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1000)}k`;
  return `$${n.toLocaleString()}`;
}

export default function AnalyticsPage() {
  const query = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => api.get<AnalyticsOverview>('/analytics/overview'),
  });

  const m = query.data?.metrics;
  const volume = query.data?.dailyVolume ?? [];
  const sources = (query.data?.sources ?? []).map((s, i) => ({
    ...s,
    color: SOURCE_COLORS[i % SOURCE_COLORS.length]!,
  }));

  const metrics = [
    {
      label: 'Pipeline value',
      value: m ? formatCurrency(m.revenuePipeline) : '—',
      change: m ? `${m.totalLeads} open leads` : 'Loading…',
      icon: DollarSign,
    },
    {
      label: 'Qualified leads',
      value: m ? String(m.qualifiedLeads) : '—',
      change: m ? `+${m.newLeadsThisWeek} this week` : '',
      icon: Users,
    },
    {
      label: 'Meetings booked',
      value: m ? String(m.meetingsBooked) : '—',
      change: m ? `${m.campaignsRunning} campaigns running` : '',
      icon: CalendarCheck,
    },
    {
      label: 'Conversion rate',
      value: m ? `${m.conversionRate}%` : '—',
      change: m
        ? `Reply ${m.replyRate}% · Bounce ${m.bounceRate}%`
        : '',
      icon: Percent,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-navy">
          Analytics
        </h2>
        <p className="text-sm text-muted-foreground">
          Funnel, campaign, deliverability, and source metrics from live data.
        </p>
      </div>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading analytics…
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="shadow-none">
            <CardContent className="flex items-start gap-3 p-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-navy">
                <metric.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {metric.label}
                </p>
                <p className="text-xl font-semibold tabular-nums text-navy">
                  {metric.value}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {metric.change}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Lead Volume — Last 30 Days</CardTitle>
          <CardDescription>
            Daily new leads captured across all sources and campaigns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={volume}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 24% 88%)" />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 11, fill: 'hsl(214 22% 40%)' }}
                  interval={4}
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(214 24% 88%)' }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'hsl(214 22% 40%)' }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid hsl(214 24% 88%)',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="leads"
                  name="Leads"
                  stroke="#FE4201"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4, fill: '#FE4201' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle>Lead Sources</CardTitle>
          <CardDescription>
            Share of leads by acquisition channel (workspace total).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No source attribution yet. Import CSV or use Hunter to populate.
            </p>
          ) : (
            <div className="mx-auto h-[300px] w-full max-w-lg">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sources}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    label={({ name, percent }) =>
                      `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                    }
                  >
                    {sources.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 8,
                      border: '1px solid hsl(214 24% 88%)',
                      fontSize: 12,
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
