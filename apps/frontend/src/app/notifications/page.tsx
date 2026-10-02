'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCheck,
  Loader2,
  Megaphone,
  ShieldAlert,
  Sparkles,
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

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationsResponse = {
  unreadCount: number;
  notifications: NotificationItem[];
};

function formatRelative(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function typeIcon(type: string) {
  if (type === 'LEADS_READY' || type === 'CAMPAIGN_APPROVAL_REQUIRED') {
    return Megaphone;
  }
  if (type === 'EMERGENCY_STOP' || type === 'DELIVERABILITY_ALERT') {
    return ShieldAlert;
  }
  return Bell;
}

function hrefFromMeta(meta: Record<string, unknown> | null): string | null {
  if (!meta) return null;
  if (typeof meta.href === 'string') return meta.href;
  if (typeof meta.campaignId === 'string') return `/campaigns/${meta.campaignId}`;
  return null;
}

export default function NotificationsPage() {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<NotificationsResponse>('/notifications'),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      void qc.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  const items = query.data?.notifications ?? [];
  const unread = query.data?.unreadCount ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-navy">
            Notifications
          </h2>
          <p className="text-sm text-muted-foreground">
            Review-ready audiences, approvals, pause events, and system alerts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{unread} unread</Badge>
          <Button
            variant="outline"
            size="sm"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            {markAll.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
            )}
            Mark all read
          </Button>
        </div>
      </div>

      {query.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading notifications…
        </div>
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-navy">
              <Sparkles className="h-4 w-4 text-primary" />
              You&apos;re caught up
            </CardTitle>
            <CardDescription>
              When a campaign audience is review-ready or autopilot needs
              attention, it will appear here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const Icon = typeIcon(n.type);
            const href = hrefFromMeta(n.metadata);
            const samples = Array.isArray(n.metadata?.sampleLeads)
              ? (n.metadata!.sampleLeads as Array<Record<string, unknown>>)
              : [];
            return (
              <li key={n.id}>
                <Card
                  className={cn(
                    'transition-colors',
                    !n.readAt && 'border-primary/30 bg-accent/30',
                  )}
                >
                  <CardContent className="flex gap-3 p-4">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-navy">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-navy">{n.title}</p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {n.body}
                          </p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatRelative(n.createdAt)}
                        </span>
                      </div>
                      {samples.length > 0 ? (
                        <div className="rounded-md border bg-background px-3 py-2 text-xs">
                          <p className="mb-1.5 font-medium text-navy">
                            Sample leads
                          </p>
                          <ul className="space-y-1">
                            {samples.slice(0, 5).map((s, i) => (
                              <li key={i} className="text-muted-foreground">
                                <span className="font-medium text-navy">
                                  {String(s.name ?? 'Lead')}
                                </span>
                                {s.title ? ` · ${String(s.title)}` : ''}
                                {s.company ? ` @ ${String(s.company)}` : ''}
                                {s.leadScore != null
                                  ? ` · fit ${String(s.leadScore)}`
                                  : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {href ? (
                          <Button asChild size="sm">
                            <Link href={href}>Review</Link>
                          </Button>
                        ) : null}
                        {!n.readAt ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={markRead.isPending}
                            onClick={() => markRead.mutate(n.id)}
                          >
                            Mark read
                          </Button>
                        ) : (
                          <Badge variant="secondary">Read</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
