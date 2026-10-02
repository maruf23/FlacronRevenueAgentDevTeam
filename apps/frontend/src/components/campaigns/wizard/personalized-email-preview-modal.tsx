'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Bold,
  Building2,
  ChevronLeft,
  ChevronRight,
  Italic,
  List,
  ListOrdered,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  Sparkles,
  Unlock,
  User,
} from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type CampaignEmailPreview = {
  leadId: string;
  draftId?: string | null;
  contactName: string;
  company: string | null;
  email: string;
  step: number;
  subject: string;
  body: string;
  source: 'ai' | 'template' | 'edited';
  locked?: boolean;
  evidence?: Array<{ label: string; value: string }>;
};

type PersonalizedEmailPreviewModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string | null;
  loading: boolean;
  error: string | null;
  emails: CampaignEmailPreview[];
  onEmailsChange: (emails: CampaignEmailPreview[]) => void;
};

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function bodyToHtml(body: string) {
  if (/<[a-z][\s\S]*>/i.test(body)) return body;
  return body
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function htmlToPlainish(html: string) {
  return html
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function PersonalizedEmailPreviewModal({
  open,
  onOpenChange,
  campaignId,
  loading,
  error,
  emails,
  onEmailsChange,
}: PersonalizedEmailPreviewModalProps) {
  const [index, setIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const current = emails[index] ?? null;
  const total = emails.length;

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setEditing(false);
    setActionError(null);
  }, [open]);

  useEffect(() => {
    if (!current) return;
    setEditSubject(current.subject);
    setEditing(false);
    setActionError(null);
  }, [current?.leadId]);

  useEffect(() => {
    if (!editing || !current || !editorRef.current) return;
    editorRef.current.innerHTML = bodyToHtml(current.body);
  }, [editing, current?.leadId]);

  const replaceEmail = (updated: CampaignEmailPreview) => {
    onEmailsChange(
      emails.map((email) =>
        email.leadId === updated.leadId ? { ...email, ...updated } : email,
      ),
    );
  };

  const goPrev = () => {
    if (total < 2) return;
    setIndex((i) => (i - 1 + total) % total);
  };

  const goNext = () => {
    if (total < 2) return;
    setIndex((i) => (i + 1) % total);
  };

  const runFormat = (command: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false);
  };

  const saveEdit = async () => {
    if (!campaignId || !current || current.locked) return;
    const html = editorRef.current?.innerHTML ?? '';
    const body = htmlToPlainish(html) || html;
    setActionBusy('edit');
    setActionError(null);
    try {
      const updated = await api.patch<CampaignEmailPreview>(
        `/campaigns/${campaignId}/preview-emails/${current.leadId}`,
        { subject: editSubject, body },
      );
      replaceEmail(updated);
      setEditing(false);
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to save edits'));
    } finally {
      setActionBusy(null);
    }
  };

  const regenerateOne = async () => {
    if (!campaignId || !current || current.locked) return;
    setActionBusy('regen');
    setActionError(null);
    try {
      const updated = await api.post<CampaignEmailPreview>(
        `/campaigns/${campaignId}/preview-emails/${current.leadId}/regenerate`,
      );
      replaceEmail(updated);
      setEditing(false);
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to regenerate email'));
    } finally {
      setActionBusy(null);
    }
  };

  const regenerateAll = async () => {
    if (!campaignId) return;
    setActionBusy('regen-all');
    setActionError(null);
    try {
      const result = await api.post<{ emails: CampaignEmailPreview[] }>(
        `/campaigns/${campaignId}/preview-emails/regenerate-all`,
      );
      onEmailsChange(result.emails ?? []);
      setIndex(0);
      setEditing(false);
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to regenerate all emails'));
    } finally {
      setActionBusy(null);
    }
  };

  const toggleLock = async () => {
    if (!campaignId || !current) return;
    const nextLocked = !current.locked;
    setActionBusy('lock');
    setActionError(null);
    try {
      const updated = await api.post<CampaignEmailPreview>(
        `/campaigns/${campaignId}/preview-emails/${current.leadId}/lock`,
        { locked: nextLocked },
      );
      replaceEmail(updated);
      if (nextLocked) setEditing(false);
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to update lock'));
    } finally {
      setActionBusy(null);
    }
  };

  const evidence =
    current?.evidence && current.evidence.length > 0
      ? current.evidence
      : current
        ? [
            { label: 'Contact Name', value: current.contactName },
            ...(current.company
              ? [{ label: 'Company', value: current.company }]
              : []),
            { label: 'Email', value: current.email },
          ]
        : [];

  const busy = Boolean(actionBusy);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Personalized email samples</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating personalized emails…
            </div>
          ) : null}

          {error && !loading ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {error}
            </p>
          ) : null}

          {actionError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              {actionError}
            </p>
          ) : null}

          {!loading && current ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={total < 2 || busy}
                    onClick={goPrev}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous Lead
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={total < 2 || busy}
                    onClick={goNext}
                  >
                    Next Lead
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs tabular-nums text-muted-foreground">
                  Lead {Math.min(index + 1, total)} of {total}
                </p>
              </div>

              <div className="rounded-md border p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-medium text-navy">
                    <User className="h-3.5 w-3.5" />
                    {current.contactName}
                  </span>
                  {current.company ? (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {current.company}
                    </span>
                  ) : null}
                  <span>{current.email}</span>
                  <Badge variant="outline" className="text-[10px]">
                    Step {current.step}
                    {current.source === 'ai'
                      ? ' · AI'
                      : current.source === 'edited'
                        ? ' · Edited'
                        : ' · Template'}
                  </Badge>
                  {current.locked ? (
                    <Badge className="border-transparent bg-emerald-100 text-[10px] text-emerald-900">
                      Locked
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || current.locked}
                    onClick={() => setEditing(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || current.locked}
                    onClick={() => void regenerateOne()}
                  >
                    {actionBusy === 'regen' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Regenerate
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy || !campaignId}
                    onClick={() => void regenerateAll()}
                  >
                    {actionBusy === 'regen-all' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Regenerate All
                  </Button>
                  <Button
                    type="button"
                    variant={current.locked ? 'secondary' : 'outline'}
                    size="sm"
                    disabled={busy}
                    onClick={() => void toggleLock()}
                  >
                    {actionBusy === 'lock' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : current.locked ? (
                      <Unlock className="h-3.5 w-3.5" />
                    ) : (
                      <Lock className="h-3.5 w-3.5" />
                    )}
                    {current.locked
                      ? 'Unlock Draft'
                      : 'Lock Approved Version'}
                  </Button>
                </div>

                {editing ? (
                  <div className="mt-4 space-y-3 rounded-md border bg-muted/20 p-3">
                    <div>
                      <p className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                        Subject
                      </p>
                      <Input
                        value={editSubject}
                        onChange={(e) => setEditSubject(e.target.value)}
                        disabled={busy}
                      />
                    </div>
                    <div>
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                          Body
                        </p>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => runFormat('bold')}
                            title="Bold"
                          >
                            <Bold className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => runFormat('italic')}
                            title="Italic"
                          >
                            <Italic className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => runFormat('insertUnorderedList')}
                            title="Bullet list"
                          >
                            <List className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => runFormat('insertOrderedList')}
                            title="Numbered list"
                          >
                            <ListOrdered className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div
                        ref={editorRef}
                        contentEditable
                        suppressContentEditableWarning
                        className={cn(
                          'min-h-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          'prose prose-sm max-w-none',
                        )}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => setEditing(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        onClick={() => void saveEdit()}
                      >
                        {actionBusy === 'edit' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        Save edits
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-semibold text-navy">
                      {current.subject}
                    </p>
                    <pre className="whitespace-pre-wrap text-sm text-foreground">
                      {current.body}
                    </pre>
                  </div>
                )}

                <div className="mt-4 rounded-md border border-sky-200 bg-sky-50/70 px-3 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-900">
                    Personalization Evidence
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {evidence.map((row) => (
                      <li
                        key={`${row.label}-${row.value}`}
                        className="text-sm text-sky-950"
                      >
                        <span className="font-medium">{row.label}:</span>{' '}
                        {row.value}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : null}

          {!loading && !error && total === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No personalized drafts available yet.
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
