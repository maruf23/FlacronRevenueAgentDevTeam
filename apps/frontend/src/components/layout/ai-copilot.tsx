'use client';

import { useMemo, useState, type FormEvent } from 'react';
import {
  Bot,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export type WorkflowStep = {
  id: string;
  title: string;
  detail: string;
};

export type ApprovalRequest = {
  id: string;
  prompt: string;
  createdAt: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  steps: WorkflowStep[];
};

type AiCopilotProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function buildWorkflowPlan(prompt: string): WorkflowStep[] {
  const target =
    prompt.replace(/^find\s+/i, '').trim() || 'the requested audience';
  return [
    {
      id: '1',
      title: 'Audience discovery',
      detail: `Search and enrich companies/contacts matching “${target}”.`,
    },
    {
      id: '2',
      title: 'Verification & scoring',
      detail: 'Verify emails, score fit, and suppress invalid or risky contacts.',
    },
    {
      id: '3',
      title: 'Campaign draft',
      detail: 'Create a sequenced outreach campaign with AI-generated first touch.',
    },
    {
      id: '4',
      title: 'Human approval gate',
      detail: 'Pause for operator approval before any sends or ad spend.',
    },
    {
      id: '5',
      title: 'Launch & monitor',
      detail: 'After approval, enroll leads and track replies in Inbox + Analytics.',
    },
  ];
}

export function AiCopilot({ open, onOpenChange }: AiCopilotProps) {
  const [prompt, setPrompt] = useState(
    'Find 200 restoration contractors in Florida with verified emails',
  );
  const [phase, setPhase] = useState<'prompt' | 'plan' | 'done'>('prompt');
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);

  const steps = useMemo(
    () => (approval ? approval.steps : buildWorkflowPlan(prompt)),
    [approval, prompt],
  );

  function reset() {
    setPhase('prompt');
    setBusy(false);
    setApproval(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!prompt.trim()) return;
    setBusy(true);
    // Simulate planning latency
    await new Promise((r) => setTimeout(r, 700));
    const request: ApprovalRequest = {
      id: `apr-${Date.now()}`,
      prompt: prompt.trim(),
      createdAt: new Date().toISOString(),
      status: 'pending_approval',
      steps: buildWorkflowPlan(prompt.trim()),
    };
    setApproval(request);
    setPhase('plan');
    setBusy(false);
  }

  function handleApprove() {
    if (!approval) return;
    setApproval({ ...approval, status: 'approved' });
    setPhase('done');
  }

  function handleReject() {
    if (!approval) return;
    setApproval({ ...approval, status: 'rejected' });
    setPhase('done');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-navy">
            <Bot className="h-5 w-5 text-primary" />
            AI Copilot
          </DialogTitle>
          <DialogDescription>
            Describe an outcome. Copilot builds a workflow plan and creates an
            approval request before anything launches.
          </DialogDescription>
        </DialogHeader>

        {phase === 'prompt' ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="text-xs font-medium text-navy" htmlFor="copilot-prompt">
              What should we do?
            </label>
            <Input
              id="copilot-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Find 200 restoration contractors…"
              className="h-11"
              autoFocus
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !prompt.trim()}>
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Planning…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate plan
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : null}

        {phase === 'plan' && approval ? (
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">Workflow plan</CardTitle>
                  <Badge className="border-transparent bg-amber-100 text-amber-900">
                    Pending approval
                  </Badge>
                </div>
                <CardDescription className="text-xs">
                  Request {approval.id} · “{approval.prompt}”
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {steps.map((step, idx) => (
                  <div
                    key={step.id}
                    className="rounded-md border bg-muted/30 px-3 py-2"
                  >
                    <p className="text-xs font-semibold text-navy">
                      {idx + 1}. {step.title}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {step.detail}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <div className="flex items-start gap-2 rounded-md border border-primary/20 bg-accent px-3 py-2 text-xs text-accent-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Nothing will launch until you approve this request.
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={handleReject}>
                Reject
              </Button>
              <Button type="button" onClick={handleApprove}>
                Approve & queue
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {phase === 'done' && approval ? (
          <div className="space-y-4 py-2 text-center">
            {approval.status === 'approved' ? (
              <>
                <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
                <div>
                  <p className="font-semibold text-navy">Approval recorded</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Workflow is queued. Launch remains gated until operators
                    confirm in Automations.
                  </p>
                </div>
                <Badge className="border-transparent bg-emerald-100 text-emerald-800">
                  Approved · {approval.id}
                </Badge>
              </>
            ) : (
              <>
                <X className="mx-auto h-10 w-10 text-destructive" />
                <div>
                  <p className="font-semibold text-navy">Request rejected</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    No jobs were started. You can refine the prompt and try again.
                  </p>
                </div>
              </>
            )}
            <DialogFooter className="sm:justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  reset();
                  setPhase('prompt');
                }}
              >
                New request
              </Button>
              <Button type="button" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function AiCopilotTrigger({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      className={cn('gap-2 shadow-sm', className)}
      aria-label="Open AI Copilot"
    >
      <Bot className="h-4 w-4" />
      <span className="hidden sm:inline">AI Copilot</span>
    </Button>
  );
}

export function AiCopilotFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open AI Copilot"
      className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:bottom-6 md:right-6"
    >
      <Bot className="h-6 w-6" />
    </button>
  );
}
