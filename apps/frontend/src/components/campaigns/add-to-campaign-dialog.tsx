'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CreditCard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  LeadEligibilitySummary,
  eligibleLeadCount,
} from '@/components/campaigns/lead-eligibility-summary';
import type { LeadEligibility } from '@/types/campaigns';
import { cn } from '@/lib/utils';

export type CampaignOption = { id: string; name: string; status?: string };

type AddToCampaignDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadIds: string[];
  campaigns: CampaignOption[];
  eligibility: LeadEligibility;
  onConfirmExisting: (campaignId: string) => void;
  busy?: boolean;
};

export function AddToCampaignDialog({
  open,
  onOpenChange,
  leadIds,
  campaigns,
  eligibility,
  onConfirmExisting,
  busy,
}: AddToCampaignDialogProps) {
  const router = useRouter();
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [campaignId, setCampaignId] = useState('');
  const [newName, setNewName] = useState('');

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === campaignId),
    [campaigns, campaignId],
  );

  const credits = eligibleLeadCount(eligibility) + eligibility.catchAll;
  const canSubmit =
    mode === 'existing' ? Boolean(campaignId) : Boolean(newName.trim());

  const handleSubmit = () => {
    if (mode === 'existing' && campaignId) {
      onConfirmExisting(campaignId);
      return;
    }
    if (mode === 'new' && newName.trim()) {
      onOpenChange(false);
      router.push(
        `/campaigns/new?name=${encodeURIComponent(newName.trim())}&leads=${leadIds.length}`,
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setCampaignId('');
          setNewName('');
          setMode('existing');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add to Campaign</DialogTitle>
          <DialogDescription>
            Assign {leadIds.length} lead
            {leadIds.length === 1 ? '' : 's'} after eligibility checks.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-md border p-3',
                mode === 'existing' && 'border-navy bg-secondary/60',
              )}
            >
              <input
                type="radio"
                className="mt-1"
                checked={mode === 'existing'}
                onChange={() => setMode('existing')}
              />
              <span className="flex-1 space-y-2">
                <span className="block text-sm font-medium text-navy">
                  Add to existing campaign
                </span>
                <Select
                  value={campaignId}
                  disabled={mode !== 'existing'}
                  onChange={(e) => setCampaignId(e.target.value)}
                >
                  <option value="">Select campaign…</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </span>
            </label>

            <label
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-md border p-3',
                mode === 'new' && 'border-navy bg-secondary/60',
              )}
            >
              <input
                type="radio"
                className="mt-1"
                checked={mode === 'new'}
                onChange={() => setMode('new')}
              />
              <span className="flex-1 space-y-2">
                <span className="block text-sm font-medium text-navy">
                  Create new campaign
                </span>
                <Input
                  placeholder="Campaign name"
                  disabled={mode !== 'new'}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Opens the campaign wizard with these leads pre-selected.
                </p>
              </span>
            </label>
          </div>

          <LeadEligibilitySummary eligibility={eligibility} compact />

          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5 text-primary" />
              Estimated credit usage
            </span>
            <span className="font-semibold tabular-nums text-navy">
              {credits}
            </span>
          </div>

          {selectedCampaign && mode === 'existing' ? (
            <p className="text-xs text-muted-foreground">
              {eligibleLeadCount(eligibility)} leads will be added to the
              campaign &ldquo;{selectedCampaign.name}&rdquo;. Catch-all leads
              require review; risky/invalid/duplicates are skipped.
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button disabled={!canSubmit || busy} onClick={handleSubmit}>
            {mode === 'new' ? 'Create Campaign' : 'Add to Campaign'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Build eligibility summary from lead verification statuses */
export function buildEligibilityFromLeads(
  leads: { verification_status: string; campaignId?: string | null }[],
): LeadEligibility {
  const counts: LeadEligibility = {
    total: leads.length,
    verified: 0,
    catchAll: 0,
    risky: 0,
    invalid: 0,
    duplicates: 0,
    suppressed: 0,
    excluded: 0,
    unsubscribed: 0,
  };

  for (const lead of leads) {
    const v = lead.verification_status.toUpperCase();
    if (lead.campaignId) {
      counts.duplicates += 1;
      continue;
    }
    if (v === 'VERIFIED') counts.verified += 1;
    else if (v === 'CATCH_ALL' || v === 'CATCHALL') counts.catchAll += 1;
    else if (v === 'RISKY') counts.risky += 1;
    else if (v === 'INVALID') counts.invalid += 1;
    else if (v === 'UNSUBSCRIBED') {
      counts.suppressed += 1;
      counts.unsubscribed += 1;
    } else counts.risky += 1;
  }

  counts.excluded =
    counts.risky + counts.invalid + counts.duplicates + counts.suppressed;

  return counts;
}
