'use client';

import { Mail, AlertTriangle, Calendar, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  INBOX_FILTERS,
  type InboxConversationListItem,
  type InboxFilter,
} from '@/types/inbox';

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function priorityDot(priority: InboxConversationListItem['priority']) {
  if (priority === 'high') return 'bg-primary';
  if (priority === 'medium') return 'bg-amber-500';
  return 'bg-muted-foreground/40';
}

type InboxConversationListProps = {
  items: InboxConversationListItem[];
  selectedId: string | null;
  filter: InboxFilter;
  loading?: boolean;
  onFilterChange: (filter: InboxFilter) => void;
  onSelect: (id: string) => void;
};

export function InboxConversationList({
  items,
  selectedId,
  filter,
  loading,
  onFilterChange,
  onSelect,
}: InboxConversationListProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-r bg-card">
      <div className="border-b px-3 py-3">
        <h2 className="text-sm font-semibold tracking-tight">Inbox</h2>
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {INBOX_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onFilterChange(f.id)}
              className={cn(
                'shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                filter === f.id
                  ? 'bg-navy text-navy-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <div className="p-6 text-center">
            <Mail className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              No conversations in this filter.
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {items.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    'w-full px-3 py-3 text-left transition-colors hover:bg-accent/60',
                    selectedId === c.id && 'bg-accent',
                    c.unread && 'bg-primary/[0.03]',
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                        priorityDot(c.priority),
                      )}
                      title={`${c.priority} priority`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p
                          className={cn(
                            'truncate text-sm',
                            c.unread ? 'font-semibold' : 'font-medium',
                          )}
                        >
                          {c.contact.name}
                        </p>
                        {c.unread ? (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                            New
                          </span>
                        ) : null}
                        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                          {formatTime(c.lastMessageAt)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.contact.companyName || c.contact.email}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {c.lastMessagePreview || c.subject || '(no preview)'}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <Badge variant="outline" className="font-normal">
                          {c.lead.status.replaceAll('_', ' ')}
                        </Badge>
                        {c.filterHints.meetingRequested ? (
                          <Badge className="border-transparent bg-sky-100 text-sky-900">
                            <Calendar className="mr-1 h-3 w-3" />
                            Meeting
                          </Badge>
                        ) : null}
                        {c.filterHints.objection ? (
                          <Badge className="border-transparent bg-amber-100 text-amber-900">
                            <AlertTriangle className="mr-1 h-3 w-3" />
                            Objection
                          </Badge>
                        ) : null}
                        {c.priority === 'high' ? (
                          <Badge className="border-transparent bg-primary/15 text-primary">
                            <Circle className="mr-1 h-2 w-2 fill-current" />
                            High
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
