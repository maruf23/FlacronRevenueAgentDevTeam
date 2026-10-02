'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Send,
  Pencil,
  RefreshCw,
  Minimize2,
  Maximize2,
  Languages,
  Smile,
  DollarSign,
  Calendar,
  FileText,
  Clock,
  PenLine,
  Loader2,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

type TransformAction =
  | 'shorten'
  | 'expand'
  | 'translate'
  | 'change_tone'
  | 'add_pricing'
  | 'add_calendar_link'
  | 'add_proposal'
  | 'regenerate'
  | 'custom';

type ProposedReply = {
  subject: string;
  body: string;
  generatedAt?: string;
} | null | undefined;

type InboxReplyEditorProps = {
  conversationId: string;
  defaultSubject: string;
  proposedReply?: ProposedReply;
  classification?: {
    intent: string | null;
    sentiment: string | null;
    recommendedResponse: string;
  };
};

const TONES = [
  { id: 'professional', label: 'Professional' },
  { id: 'casual', label: 'Casual' },
  { id: 'urgent', label: 'Urgent' },
] as const;

const LANGUAGES = [
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Italian',
] as const;

const TOOLS: Array<{
  id: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  action?: TransformAction;
  kind:
    | 'suggest'
    | 'transform'
    | 'send'
    | 'edit'
    | 'schedule'
    | 'custom'
    | 'tone'
    | 'translate';
}> = [
  { id: 'edit', label: 'Edit', icon: Pencil, kind: 'edit' },
  {
    id: 'regen',
    label: 'Regenerate',
    icon: RefreshCw,
    kind: 'transform',
    action: 'regenerate',
  },
  {
    id: 'shorten',
    label: 'Shorten',
    icon: Minimize2,
    kind: 'transform',
    action: 'shorten',
  },
  {
    id: 'expand',
    label: 'Expand',
    icon: Maximize2,
    kind: 'transform',
    action: 'expand',
  },
  {
    id: 'translate',
    label: 'Translate',
    icon: Languages,
    kind: 'translate',
  },
  {
    id: 'tone',
    label: 'Change tone',
    icon: Smile,
    kind: 'tone',
  },
  {
    id: 'pricing',
    label: 'Add pricing',
    icon: DollarSign,
    kind: 'transform',
    action: 'add_pricing',
  },
  {
    id: 'calendar',
    label: 'Add calendar link',
    icon: Calendar,
    kind: 'transform',
    action: 'add_calendar_link',
  },
  {
    id: 'proposal',
    label: 'Add proposal',
    icon: FileText,
    kind: 'transform',
    action: 'add_proposal',
  },
  { id: 'schedule', label: 'Schedule', icon: Clock, kind: 'schedule' },
  { id: 'send', label: 'Send', icon: Send, kind: 'send' },
  { id: 'custom', label: 'Write custom', icon: PenLine, kind: 'custom' },
];

export function InboxReplyEditor({
  conversationId,
  defaultSubject,
  proposedReply,
  classification,
}: InboxReplyEditorProps) {
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState('');
  const [editing, setEditing] = useState(false);
  const [isProposed, setIsProposed] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [toneOpen, setToneOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const autoLoaded = useRef<string | null>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['inbox'] });
    void queryClient.invalidateQueries({
      queryKey: ['inbox', conversationId],
    });
  };

  const logAction = (action: string, detail?: string) => {
    void api
      .post(`/inbox/${conversationId}/reply-action`, { action, detail })
      .catch(() => undefined);
  };

  const suggest = useMutation({
    mutationFn: () =>
      api.post<{ subject: string; body: string }>(
        `/inbox/${conversationId}/suggest-reply`,
      ),
    onSuccess: (data) => {
      setSubject(data.subject || defaultSubject);
      setBody(data.body);
      setIsProposed(true);
      setEditing(false);
      setStatusMsg('AI proposed reply ready.');
      invalidate();
    },
    onError: () => setStatusMsg('Could not generate AI suggestion.'),
  });

  const transform = useMutation({
    mutationFn: (payload: {
      action: TransformAction;
      tone?: string;
      language?: string;
      customInstruction?: string;
    }) =>
      api.post<{ body: string }>(`/inbox/${conversationId}/transform-reply`, {
        body,
        ...payload,
      }),
    onSuccess: (data, vars) => {
      setBody(data.body);
      setIsProposed(true);
      setEditing(true);
      setStatusMsg(
        vars.action === 'regenerate'
          ? 'New AI draft generated.'
          : 'Reply updated.',
      );
    },
    onError: () => setStatusMsg('Could not transform reply.'),
  });

  const send = useMutation({
    mutationFn: (payload?: { scheduleAt?: string }) =>
      api.post(`/inbox/${conversationId}/send`, {
        subject,
        body,
        scheduleAt: payload?.scheduleAt,
      }),
    onSuccess: (_data, vars) => {
      setBody('');
      setIsProposed(false);
      setEditing(false);
      setStatusMsg(vars?.scheduleAt ? 'Reply scheduled.' : 'Reply sent.');
      invalidate();
    },
    onError: () =>
      setStatusMsg(
        'Send failed. Connect Gmail/Microsoft in Settings, then retry.',
      ),
  });

  // Load cached proposed reply, or generate one when opening a thread
  useEffect(() => {
    if (autoLoaded.current === conversationId) return;
    autoLoaded.current = conversationId;
    setSubject(defaultSubject);
    setEditing(false);
    setStatusMsg(null);

    if (proposedReply?.body?.trim()) {
      setSubject(proposedReply.subject || defaultSubject);
      setBody(proposedReply.body);
      setIsProposed(true);
      setStatusMsg('AI proposed reply loaded.');
      return;
    }

    setBody('');
    setIsProposed(false);
    suggest.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per conversation
  }, [conversationId, proposedReply?.body, proposedReply?.subject, defaultSubject]);

  const busy =
    suggest.isPending || transform.isPending || send.isPending;

  function requireBody(): boolean {
    if (!body.trim()) {
      setStatusMsg('Generate or write a reply first.');
      return false;
    }
    return true;
  }

  function runTool(tool: (typeof TOOLS)[number]) {
    if (tool.kind === 'send') {
      if (!requireBody()) return;
      send.mutate(undefined);
      return;
    }
    if (tool.kind === 'edit') {
      setEditing(true);
      setIsProposed(false);
      logAction('edit');
      setStatusMsg('Editor unlocked — edit the AI draft freely.');
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }
    if (tool.kind === 'schedule') {
      if (!requireBody()) return;
      logAction('schedule_open');
      setScheduleOpen(true);
      return;
    }
    if (tool.kind === 'custom') {
      setBody('');
      setSubject(defaultSubject);
      setEditing(true);
      setIsProposed(false);
      logAction('write_custom');
      setStatusMsg('Editor cleared — write your reply manually.');
      requestAnimationFrame(() => textareaRef.current?.focus());
      return;
    }
    if (tool.kind === 'tone') {
      if (!requireBody()) return;
      setToneOpen(true);
      return;
    }
    if (tool.kind === 'translate') {
      if (!requireBody()) return;
      setTranslateOpen(true);
      return;
    }
    if (tool.kind === 'transform' && tool.action) {
      if (!requireBody()) return;
      transform.mutate({ action: tool.action });
    }
  }

  return (
    <div className="shrink-0 border-t bg-card px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-navy">
          <Sparkles className="h-3.5 w-3.5" />
          Proposed reply
        </div>
        {classification?.intent ? (
          <Badge variant="secondary" className="font-normal capitalize">
            {classification.intent.replaceAll('_', ' ').toLowerCase()}
          </Badge>
        ) : null}
        {classification?.sentiment ? (
          <Badge variant="outline" className="font-normal capitalize">
            {classification.sentiment.toLowerCase()}
          </Badge>
        ) : null}
        {isProposed && !editing ? (
          <Badge className="border-transparent bg-emerald-100 text-emerald-800">
            AI draft
          </Badge>
        ) : null}
        {editing ? (
          <Badge className="border-transparent bg-amber-100 text-amber-900">
            Editing
          </Badge>
        ) : null}
        {suggest.isPending ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Generating…
          </span>
        ) : null}
      </div>

      {classification?.recommendedResponse ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          Guidance: {classification.recommendedResponse}
        </p>
      ) : null}

      <div className="mb-2 flex flex-wrap gap-1.5">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isPrimary = tool.kind === 'send';
          return (
            <Button
              key={tool.id}
              type="button"
              size="sm"
              variant={isPrimary ? 'default' : 'outline'}
              disabled={busy}
              className={cn(
                'h-8 text-[11px]',
                isPrimary && 'bg-emerald-600 hover:bg-emerald-700',
              )}
              onClick={() => runTool(tool)}
            >
              <Icon className="h-3.5 w-3.5" />
              {tool.label}
            </Button>
          );
        })}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy}
          className="h-8 text-[11px]"
          onClick={() => suggest.mutate()}
        >
          <Sparkles className="h-3.5 w-3.5" />
          AI suggest
        </Button>
      </div>

      <Input
        value={subject}
        onChange={(e) => {
          setSubject(e.target.value);
          setIsProposed(false);
        }}
        disabled={!editing || busy}
        className="mb-2 h-9"
        placeholder="Subject"
      />
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setIsProposed(false);
        }}
        disabled={!editing || busy}
        rows={6}
        placeholder="AI proposed reply will appear here…"
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-70"
      />
      {statusMsg ? (
        <p className="mt-2 text-xs text-muted-foreground">{statusMsg}</p>
      ) : null}

      <Dialog open={toneOpen} onOpenChange={setToneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change tone</DialogTitle>
            <DialogDescription>
              Rewrite the current draft in a different tone.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-3">
            {TONES.map((tone) => (
              <Button
                key={tone.id}
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setToneOpen(false);
                  logAction('tone_select', tone.id);
                  transform.mutate({
                    action: 'change_tone',
                    tone: tone.label.toLowerCase(),
                  });
                }}
              >
                {tone.label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={translateOpen} onOpenChange={setTranslateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Translate</DialogTitle>
            <DialogDescription>
              Translate the current draft into another language.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((language) => (
              <Button
                key={language}
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setTranslateOpen(false);
                  logAction('translate_select', language);
                  transform.mutate({
                    action: 'translate',
                    language,
                  });
                }}
              >
                {language}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule send</DialogTitle>
            <DialogDescription>
              Choose when this reply should go out.
            </DialogDescription>
          </DialogHeader>
          <Input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!scheduleAt || busy}
              onClick={() => {
                setScheduleOpen(false);
                send.mutate({
                  scheduleAt: new Date(scheduleAt).toISOString(),
                });
              }}
            >
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
