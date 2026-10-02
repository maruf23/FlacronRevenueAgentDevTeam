'use client';

import { useEffect, useState } from 'react';
import { Loader2, ListOrdered } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SequenceStep } from '@/types/campaigns';

type CampaignEditFutureStepsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  steps: SequenceStep[];
  busy?: boolean;
  onSave: (steps: SequenceStep[]) => Promise<void> | void;
};

export function CampaignEditFutureStepsDialog({
  open,
  onOpenChange,
  steps,
  busy,
  onSave,
}: CampaignEditFutureStepsDialogProps) {
  const [draft, setDraft] = useState<SequenceStep[]>(steps);

  useEffect(() => {
    if (open) {
      setDraft(steps.map((s) => ({ ...s })));
    }
  }, [open, steps]);

  const updateStep = (
    id: string,
    patch: Partial<Pick<SequenceStep, 'subject' | 'body' | 'delayDays'>>,
  ) => {
    setDraft((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListOrdered className="h-4 w-4" />
            Edit Future Steps
          </DialogTitle>
          <DialogDescription>
            Changes apply to unsent sequence steps (draft/queued messages).
          </DialogDescription>
        </DialogHeader>

        {draft.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            No sequence steps to edit.
          </p>
        ) : (
          <div className="space-y-4">
            {draft.map((step) => (
              <div
                key={step.id}
                className="space-y-2 rounded-lg border p-3"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Step {step.step} · {step.type}
                </p>
                <div className="grid gap-2 sm:grid-cols-[1fr_100px]">
                  <div className="space-y-1">
                    <Label htmlFor={`subj-${step.id}`}>Subject</Label>
                    <Input
                      id={`subj-${step.id}`}
                      value={step.subject}
                      onChange={(e) =>
                        updateStep(step.id, { subject: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`delay-${step.id}`}>Delay (days)</Label>
                    <Input
                      id={`delay-${step.id}`}
                      type="number"
                      min={0}
                      value={step.delayDays}
                      onChange={(e) =>
                        updateStep(step.id, {
                          delayDays: Number(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`body-${step.id}`}>Body</Label>
                  <textarea
                    id={`body-${step.id}`}
                    className="min-h-[88px] w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={step.body}
                    onChange={(e) =>
                      updateStep(step.id, { body: e.target.value })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={busy || draft.length === 0}
            onClick={() => onSave(draft)}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save future steps
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
