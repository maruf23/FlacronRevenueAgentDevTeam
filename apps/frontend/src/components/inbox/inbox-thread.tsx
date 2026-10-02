'use client';

import { Paperclip, Building2, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { InboxConversationDetail } from '@/types/inbox';
import { InboxReplyEditor } from '@/components/inbox/inbox-reply-editor';
import { MessageStatusBadge } from '@/components/inbox/message-status-badge';

type InboxThreadProps = {
  detail: InboxConversationDetail | undefined;
  loading?: boolean;
  empty?: boolean;
  conversationId: string | null;
};

export function InboxThread({
  detail,
  loading,
  empty,
  conversationId,
}: InboxThreadProps) {
  if (empty) {
    return (
      <section className="flex h-full min-h-0 flex-col items-center justify-center bg-background px-6 text-center">
        <Mail className="h-10 w-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium">Select a conversation</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Choose a thread from the left to view the full exchange and reply with
          AI assistance.
        </p>
      </section>
    );
  }

  if (loading || !detail) {
    return (
      <section className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading thread…
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold tracking-tight">
              {detail.subject || '(no subject)'}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {detail.contact.name}
              </span>
              <span>·</span>
              <span>{detail.contact.email}</span>
              {detail.contact.companyName ? (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {detail.contact.companyName}
                  </span>
                </>
              ) : null}
              {detail.contact.title ? (
                <Badge variant="secondary" className="font-normal">
                  {detail.contact.title}
                </Badge>
              ) : null}
            </div>
          </div>
          <Badge variant="outline">
            {detail.lead.status.replaceAll('_', ' ')}
          </Badge>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {detail.messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'max-w-[92%] rounded-lg border px-3 py-2.5 text-sm shadow-sm',
              m.direction === 'INBOUND'
                ? 'bg-card'
                : 'ml-auto border-navy/20 bg-navy text-navy-foreground',
            )}
          >
            <div
              className={cn(
                'mb-1.5 flex flex-wrap items-center gap-2 text-[11px]',
                m.direction === 'INBOUND'
                  ? 'text-muted-foreground'
                  : 'text-navy-foreground/70',
              )}
            >
              <span className="font-medium uppercase tracking-wide">
                {m.direction === 'INBOUND' ? 'Inbound' : 'You'}
              </span>
              <span>·</span>
              <span>{new Date(m.createdAt).toLocaleString()}</span>
              <MessageStatusBadge
                status={m.status}
                onDark={m.direction === 'OUTBOUND'}
              />
              {m.intent ? (
                <Badge
                  variant="secondary"
                  className={cn(
                    'font-normal',
                    m.direction === 'OUTBOUND' &&
                      'border-transparent bg-white/15 text-white',
                  )}
                >
                  {m.intent.replaceAll('_', ' ').toLowerCase()}
                </Badge>
              ) : null}
            </div>
            <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
            {m.status === 'FAILED' && m.errorMessage ? (
              <p
                className={cn(
                  'mt-2 text-xs',
                  m.direction === 'OUTBOUND'
                    ? 'text-red-200'
                    : 'text-red-700',
                )}
              >
                {m.errorMessage}
              </p>
            ) : null}
            {m.attachments && m.attachments.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.attachments.map((a) => (
                  <span
                    key={a.id}
                    className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px]"
                  >
                    <Paperclip className="h-3 w-3" />
                    {a.name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <Separator />
      {conversationId ? (
        <InboxReplyEditor
          conversationId={conversationId}
          defaultSubject={
            detail.subject
              ? detail.subject.startsWith('Re:')
                ? detail.subject
                : `Re: ${detail.subject}`
              : 'Re: Follow-up'
          }
          proposedReply={detail.proposedReply}
          classification={{
            intent: detail.aiInsight.intent,
            sentiment: detail.aiInsight.sentiment,
            recommendedResponse: detail.aiInsight.recommendedResponse,
          }}
        />
      ) : null}
    </section>
  );
}
