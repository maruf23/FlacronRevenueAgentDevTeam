'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  isLeadAssignableByDefault,
  leadAssignBlockReason,
  leadVerificationStatus,
} from '@/lib/lead-assignability';
import { VerificationBadge } from '@/components/leads/verification-badge';

type LeadOption = {
  id: string;
  status?: string;
  leadScore?: number | null;
  campaignId?: string | null;
  email?: string;
  firstName?: string | null;
  lastName?: string | null;
  /** API returns `{ name }`; older shapes may use a plain string */
  company?: string | { name?: string | null } | null;
  verification_status?: string | null;
  contact?: {
    email?: string;
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    companyName?: string | null;
    verification_status?: string | null;
  };
};

type CampaignAddLeadsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  onAssigned: () => void;
};

function companyLabel(lead: LeadOption): string {
  if (typeof lead.company === 'string') return lead.company;
  if (lead.company && typeof lead.company === 'object' && lead.company.name) {
    return lead.company.name;
  }
  return lead.contact?.companyName ?? '';
}

function leadLabel(lead: LeadOption) {
  const first = lead.contact?.firstName ?? lead.firstName;
  const last = lead.contact?.lastName ?? lead.lastName;
  const email = lead.contact?.email ?? lead.email ?? '';
  const name =
    [first, last].filter(Boolean).join(' ').trim() ||
    lead.contact?.name?.trim() ||
    '';
  return name || email || lead.id;
}

export function CampaignAddLeadsDialog({
  open,
  onOpenChange,
  campaignId,
  onAssigned,
}: CampaignAddLeadsDialogProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [blockWarning, setBlockWarning] = useState<string | null>(null);

  const leadsQuery = useQuery({
    queryKey: ['campaign-add-leads', campaignId],
    queryFn: () => api.get<LeadOption[]>('/leads'),
    enabled: open,
  });

  const available = useMemo(() => {
    const rows = leadsQuery.data ?? [];
    return rows.filter((l) => l.campaignId !== campaignId);
  }, [leadsQuery.data, campaignId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return available;
    return available.filter((l) => {
      const hay = [
        leadLabel(l),
        l.contact?.email ?? l.email,
        companyLabel(l),
        l.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [available, search]);

  const toggle = (lead: LeadOption) => {
    if (selected.includes(lead.id)) {
      setBlockWarning(null);
      setSelected((prev) => prev.filter((x) => x !== lead.id));
      return;
    }
    const reason = leadAssignBlockReason(lead);
    if (reason) {
      setBlockWarning(reason);
      return;
    }
    setBlockWarning(null);
    setSelected((prev) => [...prev, lead.id]);
  };

  const submit = async () => {
    if (!selected.length) return;
    setBusy(true);
    try {
      await api.post(`/campaigns/${campaignId}/leads`, { leadIds: selected });
      setSelected([]);
      setSearch('');
      onOpenChange(false);
      onAssigned();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setSelected([]);
          setSearch('');
        }
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            Add Leads
          </DialogTitle>
          <DialogDescription>
            Assign eligible leads to this campaign. Invalid and unverified
            contacts are blocked by default.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="Search leads…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {blockWarning ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            {blockWarning}
          </p>
        ) : null}

        <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-2">
          {leadsQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading leads…
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No available leads to add.
            </p>
          ) : (
            filtered.slice(0, 100).map((lead) => {
              const checked = selected.includes(lead.id);
              const assignable = isLeadAssignableByDefault(lead);
              return (
                <button
                  key={lead.id}
                  type="button"
                  onClick={() => toggle(lead)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted/60',
                    checked && 'bg-accent',
                    !assignable && 'opacity-70',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    readOnly
                    className="mt-1"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-navy">
                      {leadLabel(lead)}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">
                      {lead.contact?.email ?? lead.email} ·{' '}
                      {companyLabel(lead) || '—'}
                    </span>
                  </span>
                  <VerificationBadge status={leadVerificationStatus(lead)} />
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <p className="mr-auto text-xs text-muted-foreground">
            {selected.length} assigned
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!selected.length || busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add to campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
