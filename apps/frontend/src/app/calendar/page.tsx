'use client';

import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Video,
} from 'lucide-react';
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

type CalendarEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string;
  type: 'demo' | 'call' | 'internal';
  location?: string;
};

const EVENTS: CalendarEvent[] = [
  {
    id: '1',
    title: 'Demo with TechCorp',
    date: '2026-08-07',
    time: '2:00 PM',
    type: 'demo',
    location: 'Zoom',
  },
  {
    id: '2',
    title: 'Follow-up call — Sarah Chen',
    date: '2026-08-12',
    time: '10:30 AM',
    type: 'call',
    location: 'Phone',
  },
  {
    id: '3',
    title: 'NovaTech discovery meeting',
    date: '2026-08-18',
    time: '1:00 PM',
    type: 'demo',
    location: 'Google Meet',
  },
  {
    id: '4',
    title: 'Weekly pipeline review',
    date: '2026-08-21',
    time: '9:00 AM',
    type: 'internal',
    location: 'HQ Conference B',
  },
  {
    id: '5',
    title: 'Helix Biometrics demo',
    date: '2026-08-26',
    time: '3:30 PM',
    type: 'demo',
    location: 'Zoom',
  },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TYPE_STYLES: Record<CalendarEvent['type'], string> = {
  demo: 'bg-primary/15 text-primary border-primary/20',
  call: 'bg-navy/10 text-navy border-navy/20',
  internal: 'bg-amber-50 text-amber-900 border-amber-200',
};

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export default function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date(2026, 7, 1)); // Aug 2026
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const cells = useMemo(() => {
    const firstDow = new Date(year, month, 1).getDay();
    const total = daysInMonth(year, month);
    const blanks = Array.from({ length: firstDow }, () => null);
    const days = Array.from({ length: total }, (_, i) => i + 1);
    return [...blanks, ...days];
  }, [year, month]);

  const monthLabel = cursor.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of EVENTS) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    return map;
  }, []);

  const upcoming = EVENTS.filter((e) => e.date.startsWith(`${year}-${pad(month + 1)}`));

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-navy">
            Calendar
          </h2>
          <p className="text-sm text-muted-foreground">
            Meetings, demos, and scheduled follow-ups across your pipeline.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(year, month - 1, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-semibold text-navy">
            {monthLabel}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor(new Date(year, month + 1, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="shadow-none lg:col-span-2">
          <CardContent className="p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="px-1 py-2 text-center text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {d}
                </div>
              ))}
              {cells.map((day, idx) => {
                if (!day) {
                  return <div key={`blank-${idx}`} className="min-h-[88px] rounded-md bg-muted/20" />;
                }
                const key = `${year}-${pad(month + 1)}-${pad(day)}`;
                const dayEvents = eventsByDate.get(key) ?? [];
                return (
                  <div
                    key={key}
                    className={cn(
                      'min-h-[88px] rounded-md border border-border bg-card p-1.5',
                      dayEvents.length > 0 && 'border-primary/30',
                    )}
                  >
                    <div className="mb-1 text-xs font-semibold tabular-nums text-navy">
                      {day}
                    </div>
                    <div className="space-y-0.5">
                      {dayEvents.map((event) => (
                        <div
                          key={event.id}
                          className={cn(
                            'truncate rounded border px-1 py-0.5 text-[10px] font-medium leading-tight',
                            TYPE_STYLES[event.type],
                          )}
                          title={`${event.title} · ${event.time}`}
                        >
                          {event.title}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle>Upcoming this month</CardTitle>
            <CardDescription>
              {upcoming.length} scheduled event{upcoming.length === 1 ? '' : 's'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events this month.</p>
            ) : (
              upcoming.map((event) => (
                <div
                  key={event.id}
                  className="rounded-md border border-border p-3"
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-navy">{event.title}</p>
                    <Badge variant="secondary" className="capitalize">
                      {event.type}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(event.date).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      · {event.time}
                    </span>
                    {event.location ? (
                      <span className="inline-flex items-center gap-1">
                        {event.type === 'demo' ? (
                          <Video className="h-3 w-3" />
                        ) : (
                          <MapPin className="h-3 w-3" />
                        )}
                        {event.location}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
