'use client';

import { useState } from 'react';
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  PERSONALIZATION_VARS,
  SEQUENCE_STEP_TYPES,
  type CampaignWizardData,
  type SequenceStep,
  type SequenceStepType,
} from '@/types/campaigns';
import { cn } from '@/lib/utils';

type StepSequenceProps = {
  data: CampaignWizardData;
  onChange: (patch: Partial<CampaignWizardData>) => void;
  onGenerate: () => void;
  generating?: boolean;
};

function emptyStep(step: number): SequenceStep {
  return {
    id: `step-${Date.now()}-${step}`,
    step,
    type: step === 1 ? 'Initial' : step >= 5 ? 'Final' : 'Follow-up',
    subject: '',
    body: '',
    delayDays: step === 1 ? 0 : 2,
    conditions: step === 1 ? 'Always' : 'No reply',
    attachments: [],
    approved: false,
  };
}

export function StepSequence({
  data,
  onChange,
  onGenerate,
  generating,
}: StepSequenceProps) {
  const [editing, setEditing] = useState<SequenceStep | null>(null);

  const updateSteps = (sequence: SequenceStep[]) =>
    onChange({
      sequence: sequence.map((s, i) => ({ ...s, step: i + 1 })),
    });

  const addStep = () => {
    updateSteps([...data.sequence, emptyStep(data.sequence.length + 1)]);
  };

  const removeStep = (id: string) => {
    updateSteps(data.sequence.filter((s) => s.id !== id));
  };

  const saveEdit = () => {
    if (!editing) return;
    updateSteps(
      data.sequence.map((s) => (s.id === editing.id ? editing : s)),
    );
    setEditing(null);
  };

  const approveStep = (id: string) => {
    updateSteps(
      data.sequence.map((s) =>
        s.id === id ? { ...s, approved: true } : s,
      ),
    );
  };

  const regenerateStep = (id: string) => {
    updateSteps(
      data.sequence.map((s) =>
        s.id === id
          ? {
              ...s,
              subject: `${s.subject || 'Follow-up'} (regenerated)`,
              body: `${s.body}\n\n[AI regenerated copy for ${data.product || 'product'}]`,
              approved: false,
            }
          : s,
      ),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-navy">Email Sequence Builder</h3>
          <p className="text-xs text-muted-foreground">
            Configure steps, delays, conditions, and AI personalization.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addStep}>
            <Plus className="h-3.5 w-3.5" />
            Add Step
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={generating}
            onClick={onGenerate}
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            AI Generate Sequence
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">Step</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead className="w-24">Delay</TableHead>
              <TableHead>Conditions</TableHead>
              <TableHead className="w-36">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.sequence.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No steps yet. Add a step or generate with AI.
                </TableCell>
              </TableRow>
            ) : (
              data.sequence.map((step) => (
                <TableRow key={step.id}>
                  <TableCell className="font-medium tabular-nums">
                    {step.step}
                  </TableCell>
                  <TableCell>
                    <span className="rounded-md bg-secondary px-2 py-0.5 text-xs text-navy">
                      {step.type}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="line-clamp-1 text-sm">{step.subject || '—'}</span>
                      {step.approved ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums text-sm">
                    {step.delayDays} days
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {step.conditions}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setEditing(step)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => regenerateStep(step.id)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-emerald-700"
                        onClick={() => approveStep(step.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeStep(step.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          AI Personalization Variables
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PERSONALIZATION_VARS.map((v) => (
            <code
              key={v}
              className={cn(
                'rounded-md border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-navy',
              )}
            >
              {v}
            </code>
          ))}
        </div>
      </div>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit sequence step {editing?.step}</DialogTitle>
          </DialogHeader>
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Type</Label>
                  <Select
                    value={editing.type}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        type: e.target.value as SequenceStepType,
                      })
                    }
                  >
                    {SEQUENCE_STEP_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Delay (days)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={editing.delayDays}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        delayDays: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Subject</Label>
                <Input
                  value={editing.subject}
                  onChange={(e) =>
                    setEditing({ ...editing, subject: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Message body</Label>
                <Textarea
                  className="min-h-[140px]"
                  value={editing.body}
                  onChange={(e) =>
                    setEditing({ ...editing, body: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Conditions</Label>
                <Select
                  value={editing.conditions}
                  onChange={(e) =>
                    setEditing({ ...editing, conditions: e.target.value })
                  }
                >
                  <option value="Always">Always</option>
                  <option value="No reply">No reply</option>
                  <option value="Opened, no reply">Opened, no reply</option>
                  <option value="Clicked, no reply">Clicked, no reply</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Attachments (comma-separated)</Label>
                <Input
                  value={editing.attachments.join(', ')}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      attachments: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="case-study.pdf"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save step</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
