'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Mail,
  Building2,
  Crosshair,
  CalendarDays,
  Megaphone,
  CheckCircle2,
  Unplug,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

type ConnectionBlock = {
  connected: boolean;
  accountEmail?: string | null;
  via?: string | null;
  detail?: string | null;
};

type IntegrationsStatus = {
  gmail: ConnectionBlock;
  microsoft: ConnectionBlock;
  hunter: ConnectionBlock;
  googleCalendar: ConnectionBlock;
  metaAds: ConnectionBlock;
  smtpConfigured: boolean;
};

type IntegrationCard = {
  id: 'gmail' | 'microsoft' | 'hunter' | 'googleCalendar' | 'metaAds';
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  connectable: boolean;
  provider?: 'gmail' | 'microsoft';
};

const CARDS: IntegrationCard[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Send and sync outreach from Google Workspace inboxes.',
    icon: Mail,
    connectable: true,
    provider: 'gmail',
  },
  {
    id: 'microsoft',
    name: 'Microsoft 365',
    description: 'Outlook send + calendar sync for Microsoft tenants.',
    icon: Building2,
    connectable: true,
    provider: 'microsoft',
  },
  {
    id: 'hunter',
    name: 'Hunter.io',
    description: 'Domain search and email enrichment for lead discovery.',
    icon: Crosshair,
    connectable: false,
  },
  {
    id: 'googleCalendar',
    name: 'Google Calendar',
    description: 'Book demos and sync meeting availability automatically.',
    icon: CalendarDays,
    connectable: false,
  },
  {
    id: 'metaAds',
    name: 'Meta Ads',
    description: 'Pull lead ads and sync campaign performance into Ads AI.',
    icon: Megaphone,
    connectable: false,
  },
];

export default function IntegrationsPage() {
  const queryClient = useQueryClient();

  const statusQuery = useQuery({
    queryKey: ['integrations-status'],
    queryFn: () => api.get<IntegrationsStatus>('/integrations/status'),
  });

  const connectMutation = useMutation({
    mutationFn: (provider: 'gmail' | 'microsoft') =>
      api.post<{ url: string }>(`/integrations/${provider}/connect`),
    onSuccess: (data) => {
      if (data?.url) {
        window.location.href = data.url;
      }
    },
  });

  const status = statusQuery.data;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-navy">
          Integrations
        </h2>
        <p className="text-sm text-muted-foreground">
          Live connection status for email, enrichment, calendar, and ads.
        </p>
      </div>

      {statusQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking integrations…
        </div>
      ) : null}

      {statusQuery.isError ? (
        <p className="text-sm text-destructive">
          Could not load integration status.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CARDS.map((card) => {
          const block = status?.[card.id];
          const connected = Boolean(block?.connected);
          const detail =
            block?.accountEmail ||
            block?.detail ||
            (card.id === 'gmail' && status?.smtpConfigured
              ? 'Connected via SMTP app password'
              : null);

          return (
            <Card key={card.id} className="flex flex-col shadow-none">
              <CardHeader className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-md',
                      connected
                        ? 'bg-primary/10 text-primary'
                        : 'bg-secondary text-navy',
                    )}
                  >
                    <card.icon className="h-5 w-5" />
                  </div>
                  <Badge
                    className={
                      connected
                        ? 'border-transparent bg-emerald-100 text-emerald-800'
                        : 'border-transparent bg-muted text-muted-foreground'
                    }
                  >
                    {connected ? (
                      <span className="inline-flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        <Unplug className="h-3 w-3" />
                        Disconnected
                      </span>
                    )}
                  </Badge>
                </div>
                <div>
                  <CardTitle>{card.name}</CardTitle>
                  <CardDescription className="mt-1">
                    {card.description}
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                {detail ? (
                  <p className="rounded-md bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                    {detail}
                    {block?.via ? ` · via ${block.via}` : ''}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {card.id === 'hunter'
                      ? 'Set HUNTER_API_KEY in backend .env to connect.'
                      : card.id === 'metaAds'
                        ? 'Meta Ads integration is not configured yet.'
                        : card.id === 'googleCalendar'
                          ? 'Connect Gmail OAuth to enable calendar sync.'
                          : 'Not connected yet.'}
                  </p>
                )}
              </CardContent>
              <CardFooter>
                {card.connectable && card.provider ? (
                  <Button
                    className="w-full"
                    variant={connected ? 'outline' : 'default'}
                    disabled={connectMutation.isPending}
                    onClick={() => {
                      connectMutation.mutate(card.provider!);
                      void queryClient.invalidateQueries({
                        queryKey: ['integrations-status'],
                      });
                    }}
                  >
                    {connectMutation.isPending &&
                    connectMutation.variables === card.provider ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {connected ? 'Reconnect' : 'Connect'}
                  </Button>
                ) : (
                  <Button className="w-full" variant="outline" disabled>
                    {connected ? 'Configured' : 'Configure in .env'}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
