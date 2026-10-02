'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import type {
  InboxConversationDetail,
  InboxConversationListItem,
  InboxFilter,
} from '@/types/inbox';
import { InboxConversationList } from '@/components/inbox/inbox-conversation-list';
import { InboxThread } from '@/components/inbox/inbox-thread';
import { InboxInsightPanel } from '@/components/inbox/inbox-insight-panel';
import { Button } from '@/components/ui/button';

function matchesFilter(
  item: InboxConversationListItem,
  filter: InboxFilter,
): boolean {
  switch (filter) {
    case 'unread':
      return item.unread;
    case 'interested':
      return item.filterHints.interested;
    case 'needs_reply':
      return item.filterHints.needsReply;
    case 'meeting_requested':
      return item.filterHints.meetingRequested;
    case 'objection':
      return item.filterHints.objection;
    case 'ooo':
      return item.filterHints.ooo;
    default:
      return true;
  }
}

type SyncResult = {
  ok: boolean;
  backfilledConversations: number;
  imported: number;
  skipped: number;
  scanned: number;
  hint?: string;
};

const AUTO_SYNC_MS = 60_000;

export default function InboxPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>('all');
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const autoStarted = useRef(false);

  const listQuery = useQuery({
    queryKey: ['inbox'],
    queryFn: () => api.get<InboxConversationListItem[]>('/inbox'),
    refetchInterval: 15_000,
  });

  const syncMutation = useMutation({
    mutationFn: () => api.post<SyncResult>('/inbox/sync'),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['inbox'] });
      void queryClient.invalidateQueries({ queryKey: ['leads'] });
      if (data.hint) {
        setSyncMessage(data.hint);
        return;
      }
      if (data.imported > 0) {
        setSyncMessage(
          `Auto-synced ${data.imported} new repl${data.imported === 1 ? 'y' : 'ies'} from Gmail.`,
        );
      } else {
        setSyncMessage(
          `Up to date · ${data.scanned} mail scanned · last check just now`,
        );
      }
    },
    onError: (err) => {
      setSyncMessage(
        err instanceof Error ? err.message : 'Inbox sync failed',
      );
    },
  });

  // Auto-sync on open, then every 60s while Inbox stays open
  useEffect(() => {
    const run = () => {
      if (syncMutation.isPending) return;
      syncMutation.mutate();
    };

    if (!autoStarted.current) {
      autoStarted.current = true;
      run();
    }

    const id = window.setInterval(run, AUTO_SYNC_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync once + interval; mutate identity is stable enough
  }, []);

  const filtered = useMemo(
    () => (listQuery.data ?? []).filter((c) => matchesFilter(c, filter)),
    [listQuery.data, filter],
  );

  useEffect(() => {
    if (!selectedId && filtered[0]) {
      setSelectedId(filtered[0].id);
      return;
    }
    if (selectedId && !filtered.some((c) => c.id === selectedId)) {
      setSelectedId(filtered[0]?.id ?? null);
    }
  }, [filtered, selectedId]);

  const detailQuery = useQuery({
    queryKey: ['inbox', selectedId],
    queryFn: () =>
      api.get<InboxConversationDetail>(
        `/inbox/messages?conversationId=${selectedId}`,
      ),
    enabled: Boolean(selectedId),
  });

  return (
    <div className="-m-4 flex h-[calc(100vh-3.5rem)] min-h-0 flex-col sm:-m-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            Auto-syncs from Gmail every minute (and every 2 min on the server).
          </p>
          {syncMessage ? (
            <p className="mt-0.5 truncate text-xs text-navy">{syncMessage}</p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={syncMutation.isPending}
          onClick={() => syncMutation.mutate()}
          title="Force sync now"
        >
          <RefreshCw
            className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin' : ''}`}
          />
          {syncMutation.isPending ? 'Syncing…' : 'Sync now'}
        </Button>
      </div>

      {listQuery.isError ? (
        <div className="m-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Failed to load inbox</p>
          <p className="mt-1 text-muted-foreground">
            {(listQuery.error as Error)?.message ??
              'Ensure you are signed in and the API is running.'}
          </p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)_280px]">
          <InboxConversationList
            items={filtered}
            selectedId={selectedId}
            filter={filter}
            loading={listQuery.isLoading}
            onFilterChange={setFilter}
            onSelect={setSelectedId}
          />
          <InboxThread
            conversationId={selectedId}
            detail={detailQuery.data}
            loading={Boolean(selectedId) && detailQuery.isLoading}
            empty={!selectedId}
          />
          <InboxInsightPanel
            insight={detailQuery.data?.aiInsight}
            loading={Boolean(selectedId) && detailQuery.isLoading}
          />
        </div>
      )}
    </div>
  );
}
