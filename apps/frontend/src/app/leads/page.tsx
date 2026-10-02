'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/react-table';
import { Search, Upload, UserPlus } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import type { LeadRow } from '@/types/leads';
import { PIPELINE_STAGES } from '@/types/leads';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  PipelineStageBadge,
  VerificationBadge,
} from '@/components/leads/verification-badge';
import { LeadsEmptyState } from '@/components/leads/leads-empty-state';
import {
  EMPTY_FILTERS,
  LeadsFilterBar,
  type LeadFilters,
} from '@/components/leads/leads-filter-bar';
import {
  LeadsBulkToolbar,
  type BulkAction,
} from '@/components/leads/leads-bulk-toolbar';
import {
  LeadActionsMenu,
  type LeadAction,
} from '@/components/leads/lead-actions-menu';
import { LeadsSummaryCards } from '@/components/leads/leads-summary-cards';
import {
  LeadDetailDrawer,
  computeLeadScore,
} from '@/components/leads/lead-detail-drawer';
import {
  AddToCampaignDialog,
  buildEligibilityFromLeads,
} from '@/components/campaigns/add-to-campaign-dialog';
import { MOCK_CAMPAIGNS } from '@/lib/campaigns-mock';
import { cn } from '@/lib/utils';

type DraftResponse = {
  id: string;
  leadId: string;
  subject: string;
  body: string;
  evidence_used: string[];
  approvalStatus: string;
};

type ImportJobResponse = { jobId: string; status: string };

type ImportStatusResponse = {
  jobId: string;
  status: string;
  totalRecords: number;
  processedRecords: number;
  duplicateRecords: number;
  errorMessage?: string | null;
};

type CampaignOption = { id: string; name: string; status?: string };

type WorkspaceUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

type HunterContactPreview = {
  value: string;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  phone_number?: string | null;
  type?: string | null;
  confidence?: number | null;
};

type HunterDomainSearchResponse = {
  source?: string;
  data?: {
    emails?: HunterContactPreview[];
    domain?: string;
    organization?: string;
  };
  meta?: { results?: number };
};

type HunterConfirmImportResponse = {
  source: string;
  jobId: string;
  created: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  total: number;
  status: string;
};

type PickDialog =
  | { type: 'campaign'; leadIds: string[] }
  | { type: 'stage'; leadIds: string[] }
  | { type: 'assign'; leadIds: string[] }
  | { type: 'task'; leadId: string }
  | null;

function scoreTone(score: number | null) {
  if (score == null) return 'text-muted-foreground';
  if (score >= 75) return 'text-emerald-700 font-semibold';
  if (score >= 50) return 'text-amber-700 font-medium';
  return 'text-muted-foreground';
}

function nextBestActionLabel(lead: LeadRow): string {
  const existing = lead.nextRecommendedAction?.trim();
  if (existing) return existing;
  const v = lead.verification_status.toUpperCase();
  if (v === 'PENDING') return 'Verify email';
  if (!lead.industry || !lead.company.name) return 'Enrich company';
  if (!lead.campaignId) return 'Add to campaign';
  if ((lead.leadScore ?? 0) < 50) return 'Calculate score';
  if (lead.status === 'NEW' || lead.status === 'READY') return 'Generate outreach';
  if (lead.status === 'CONTACTED' || lead.status === 'ENGAGED') {
    return 'Follow up today';
  }
  if (lead.status === 'QUALIFIED') return 'Book demo';
  if (lead.status === 'MEETING_SCHEDULED') return 'Send proposal';
  return 'Review AI draft';
}

function resolveNextAction(label: string): LeadAction {
  const t = label.toLowerCase();
  if (t.includes('verify')) return 'verify';
  if (t.includes('enrich')) return 'enrich';
  if (t.includes('campaign')) return 'campaign';
  if (t.includes('score')) return 'score';
  if (t.includes('outreach') || t.includes('draft') || t.includes('follow')) {
    return 'outreach';
  }
  if (t.includes('stage') || t.includes('demo') || t.includes('proposal')) {
    return 'stage';
  }
  return 'view';
}

function exportLeadsCsv(leads: LeadRow[]) {
  const headers = [
    'Name',
    'Email',
    'Title',
    'Company',
    'Industry',
    'Location',
    'Lead Score',
    'Verification',
    'Campaign',
    'Stage',
    'Last Activity',
    'Assigned User',
    'Next Action',
  ];
  const rows = leads.map((l) => [
    l.contact.name,
    l.contact.email,
    l.contact.title ?? '',
    l.company.name ?? '',
    l.industry ?? '',
    l.location ?? '',
    l.leadScore ?? '',
    l.verification_status,
    l.campaign?.name ?? '',
    l.status,
    l.lastActivityAt ?? '',
    l.assignedUser?.name ?? '',
    l.nextRecommendedAction ?? '',
  ]);
  const escape = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
  const csv = [headers, ...rows]
    .map((r) => r.map(escape).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leads-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function applyFilters(leads: LeadRow[], filters: LeadFilters) {
  const q = filters.search.trim().toLowerCase();
  const min = filters.scoreMin === '' ? null : Number(filters.scoreMin);
  const max = filters.scoreMax === '' ? null : Number(filters.scoreMax);

  return leads.filter((lead) => {
    if (q) {
      const hay = [
        lead.contact.name,
        lead.contact.email,
        lead.company.name,
        lead.industry,
        lead.location,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (filters.industry && lead.industry !== filters.industry) return false;
    if (filters.location && lead.location !== filters.location) return false;
    if (
      filters.verification &&
      lead.verification_status.toUpperCase() !== filters.verification
    ) {
      return false;
    }
    if (filters.campaignId && lead.campaignId !== filters.campaignId) {
      return false;
    }
    if (filters.stage && lead.status !== filters.stage) return false;
    if (filters.userId && lead.assignedUserId !== filters.userId) return false;
    if (filters.source && lead.source !== filters.source) return false;
    if (min != null && !Number.isNaN(min) && (lead.leadScore ?? -1) < min) {
      return false;
    }
    if (max != null && !Number.isNaN(max) && (lead.leadScore ?? 999) > max) {
      return false;
    }
    return true;
  });
}

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<LeadFilters>(EMPTY_FILTERS);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [draftOpen, setDraftOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [hunterOpen, setHunterOpen] = useState(false);
  const [hunterDomain, setHunterDomain] = useState('');
  const [hunterMessage, setHunterMessage] = useState<string | null>(null);
  const [hunterContacts, setHunterContacts] = useState<HunterContactPreview[]>(
    [],
  );
  const [hunterOrg, setHunterOrg] = useState<string | null>(null);
  const [drawerLead, setDrawerLead] = useState<LeadRow | null>(null);
  const [previewLead, setPreviewLead] = useState<LeadRow | null>(null);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pickDialog, setPickDialog] = useState<PickDialog>(null);
  const [pickValue, setPickValue] = useState('');
  const [addForm, setAddForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    companyName: '',
    title: '',
  });

  const leadsQuery = useQuery({
    queryKey: ['leads'],
    queryFn: () => api.get<LeadRow[]>('/leads'),
  });

  const campaignsQuery = useQuery({
    queryKey: ['lead-campaigns'],
    queryFn: () => api.get<CampaignOption[]>('/leads/campaigns'),
  });

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<WorkspaceUser[]>('/users'),
    retry: false,
  });

  const invalidateLeads = () =>
    void queryClient.invalidateQueries({ queryKey: ['leads'] });

  const generateDraft = useMutation({
    mutationFn: (leadId: string) =>
      api.post<DraftResponse>('/drafts/generate', { leadId }),
    onSuccess: (data) => {
      setDraft(data);
      setDraftSubject(data.subject);
      setDraftBody(data.body);
      setDraftOpen(true);
      setActionMessage(null);
    },
  });

  const approveDraft = useMutation({
    mutationFn: ({
      draftId,
      subject,
      body,
    }: {
      draftId: string;
      subject: string;
      body: string;
    }) =>
      api.patch<{
        sent?: boolean;
        to?: string;
        via?: string;
        approvalStatus: string;
      }>(`/drafts/${draftId}/approve`, { subject, body }),
    onSuccess: (data) => {
      setDraftOpen(false);
      setDraft(null);
      setDraftSubject('');
      setDraftBody('');
      setActionMessage(
        data.sent
          ? `Email sent to ${data.to} via ${data.via ?? 'SMTP'}.`
          : 'Draft approved.',
      );
      invalidateLeads();
    },
    onError: (err) => {
      let msg: string | undefined;
      if (err instanceof ApiError) {
        const body = err.body as { message?: string | string[] } | undefined;
        msg = Array.isArray(body?.message)
          ? body.message.join(', ')
          : body?.message;
      }
      setActionMessage(
        msg ||
          (err as Error)?.message ||
          'Send failed. Configure SMTP in Settings.',
      );
    },
  });

  const rejectDraft = useMutation({
    mutationFn: (draftId: string) => api.patch(`/drafts/${draftId}/reject`),
    onSuccess: () => {
      setDraftOpen(false);
      setDraft(null);
      setDraftSubject('');
      setDraftBody('');
      invalidateLeads();
    },
  });

  const createLead = useMutation({
    mutationFn: () => api.post<LeadRow>('/leads', addForm),
    onSuccess: () => {
      setAddOpen(false);
      setAddForm({
        email: '',
        firstName: '',
        lastName: '',
        companyName: '',
        title: '',
      });
      invalidateLeads();
    },
  });

  const hunterSearch = useMutation({
    mutationFn: (domain: string) =>
      api.post<HunterDomainSearchResponse>('/hunter/domain-search', {
        domain,
      }),
    onSuccess: (data) => {
      const emails = Array.isArray(data?.data?.emails)
        ? data.data.emails.filter((e) => e?.value)
        : [];
      const org =
        data?.data?.organization || data?.data?.domain || hunterDomain;
      setHunterContacts(emails);
      setHunterOrg(org);
      setHunterMessage(
        emails.length > 0
          ? `Hunter found ${emails.length} contact${emails.length === 1 ? '' : 's'} for ${org}.`
          : `No contacts found for ${org}.`,
      );
    },
    onError: (err) => {
      setHunterContacts([]);
      setHunterOrg(null);
      const message =
        err instanceof ApiError
          ? err.message
          : (err as Error)?.message || 'Hunter search failed.';
      setHunterMessage(message);
    },
  });

  const hunterImport = useMutation({
    mutationFn: () =>
      api.post<HunterConfirmImportResponse>('/hunter/confirm-import', {
        domain: hunterDomain.trim(),
        organization: hunterOrg || undefined,
        contacts: hunterContacts.map((c) => ({
          value: c.value,
          first_name: c.first_name ?? undefined,
          last_name: c.last_name ?? undefined,
          position: c.position ?? undefined,
          phone_number: c.phone_number ?? undefined,
        })),
      }),
    onSuccess: (data) => {
      setHunterOpen(false);
      setHunterContacts([]);
      setHunterOrg(null);
      setHunterMessage(null);
      setHunterDomain('');
      setActionMessage(
        `Imported ${data.created} Hunter lead${data.created === 1 ? '' : 's'}` +
          (data.skippedDuplicates
            ? ` (${data.skippedDuplicates} duplicate${data.skippedDuplicates === 1 ? '' : 's'} skipped)`
            : '') +
          '. Verification queued.',
      );
      invalidateLeads();
    },
    onError: (err) => {
      const message =
        err instanceof ApiError
          ? err.message
          : (err as Error)?.message || 'Hunter import failed.';
      setHunterMessage(message);
    },
  });

  const verifyLead = useMutation({
    mutationFn: (leadId: string) =>
      api.post<LeadRow>(`/leads/${leadId}/verify`),
    onSuccess: () => {
      setActionMessage('Email verification updated.');
      invalidateLeads();
    },
  });

  const enrichLead = useMutation({
    mutationFn: (leadId: string) =>
      api.post<LeadRow>(`/leads/${leadId}/enrich`),
    onSuccess: () => {
      setActionMessage('Lead enriched.');
      invalidateLeads();
    },
  });

  const updateLead = useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      campaignId?: string | null;
      assignedUserId?: string | null;
      leadScore?: number | null;
      nextRecommendedAction?: string | null;
      status?: string;
    }) => api.patch(`/leads/${id}`, body),
    onSuccess: () => {
      setActionMessage('Lead updated.');
      invalidateLeads();
    },
  });

  const updateStage = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.patch(`/leads/${id}/stage`, { stage }),
    onSuccess: () => {
      setActionMessage('Pipeline stage updated.');
      invalidateLeads();
    },
  });

  const deleteLead = useMutation({
    mutationFn: (leadId: string) => api.delete(`/leads/${leadId}`),
    onSuccess: () => {
      setActionMessage('Lead deleted.');
      setDrawerLead(null);
      setPreviewLead(null);
      invalidateLeads();
    },
  });

  const bulkVerify = useMutation({
    mutationFn: (leadIds: string[]) =>
      api.post('/leads/bulk/verify', { leadIds }),
    onSuccess: () => {
      setActionMessage('Selected leads verified.');
      setRowSelection({});
      invalidateLeads();
    },
  });

  const bulkEnrich = useMutation({
    mutationFn: (leadIds: string[]) =>
      api.post('/leads/bulk/enrich', { leadIds }),
    onSuccess: () => {
      setActionMessage('Selected leads enriched.');
      setRowSelection({});
      invalidateLeads();
    },
  });

  const bulkCampaign = useMutation({
    mutationFn: ({
      leadIds,
      campaignId,
    }: {
      leadIds: string[];
      campaignId: string;
    }) => api.post('/leads/bulk/campaign', { leadIds, campaignId }),
    onSuccess: () => {
      setActionMessage('Selected leads added to campaign.');
      setRowSelection({});
      invalidateLeads();
    },
  });

  const bulkDelete = useMutation({
    mutationFn: (leadIds: string[]) =>
      api.post('/leads/bulk/delete', { leadIds }),
    onSuccess: () => {
      setActionMessage('Selected leads deleted.');
      setRowSelection({});
      invalidateLeads();
    },
  });

  const importCsv = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const started = await api.upload<ImportJobResponse>(
        '/leads/import',
        formData,
      );

      for (let i = 0; i < 20; i += 1) {
        await new Promise((r) => setTimeout(r, 1500));
        const status = await api.get<ImportStatusResponse>(
          `/leads/import/${started.jobId}/status`,
        );
        if (status.status === 'COMPLETED' || status.status === 'FAILED') {
          return status;
        }
      }
      return {
        jobId: started.jobId,
        status: 'PROCESSING',
        totalRecords: 0,
        processedRecords: 0,
        duplicateRecords: 0,
      } satisfies ImportStatusResponse;
    },
    onSuccess: (status) => {
      if (status.status === 'COMPLETED') {
        setImportMessage(
          `Import done: ${status.processedRecords} created, ${status.duplicateRecords} duplicates skipped.`,
        );
      } else if (status.status === 'FAILED') {
        setImportMessage(status.errorMessage || 'Import failed.');
      } else {
        setImportMessage('Import still processing — refresh in a moment.');
      }
      invalidateLeads();
    },
    onError: () => {
      setImportMessage('CSV import failed. Check API and file format.');
    },
  });

  const allLeads = leadsQuery.data ?? [];
  const filteredLeads = useMemo(
    () => applyFilters(allLeads, filters),
    [allLeads, filters],
  );

  const campaignOptions = useMemo(() => {
    const fromApi = (campaignsQuery.data ?? []).map((c) => ({
      value: c.id,
      label: c.name,
    }));
    if (fromApi.length) return fromApi;
    const fromMock = MOCK_CAMPAIGNS.map((c) => ({
      value: c.id,
      label: c.name,
    }));
    if (fromMock.length) return fromMock;
    const map = new Map<string, string>();
    for (const lead of allLeads) {
      if (lead.campaign) map.set(lead.campaign.id, lead.campaign.name);
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [campaignsQuery.data, allLeads]);

  const campaignDialogOptions = useMemo(
    () =>
      campaignOptions.map((c) => ({
        id: c.value,
        name: c.label,
      })),
    [campaignOptions],
  );

  const campaignEligibility = useMemo(() => {
    if (pickDialog?.type !== 'campaign') {
      return buildEligibilityFromLeads([]);
    }
    const selected = allLeads.filter((l) =>
      pickDialog.leadIds.includes(l.id),
    );
    return buildEligibilityFromLeads(selected);
  }, [pickDialog, allLeads]);

  const userOptions = useMemo(() => {
    const fromApi = (usersQuery.data ?? []).map((u) => ({
      value: u.id,
      label:
        [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.email,
    }));
    if (fromApi.length) return fromApi;
    const map = new Map<string, string>();
    for (const lead of allLeads) {
      if (lead.assignedUser) {
        map.set(lead.assignedUser.id, lead.assignedUser.name);
      }
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [usersQuery.data, allLeads]);

  const industries = useMemo(
    () =>
      [...new Set(allLeads.map((l) => l.industry).filter(Boolean) as string[])].sort(),
    [allLeads],
  );

  const locations = useMemo(
    () =>
      [...new Set(allLeads.map((l) => l.location).filter(Boolean) as string[])].sort(),
    [allLeads],
  );

  const sources = useMemo(
    () =>
      [...new Set(allLeads.map((l) => l.source).filter(Boolean) as string[])].sort(),
    [allLeads],
  );

  const actionBusy =
    verifyLead.isPending ||
    enrichLead.isPending ||
    updateStage.isPending ||
    updateLead.isPending ||
    deleteLead.isPending ||
    bulkVerify.isPending ||
    bulkEnrich.isPending ||
    bulkCampaign.isPending ||
    bulkDelete.isPending ||
    generateDraft.isPending;

  function openLead(lead: LeadRow) {
    setPreviewLead(lead);
    setDrawerLead(lead);
  }

  function handleLeadAction(action: LeadAction, lead: LeadRow) {
    setActiveLeadId(lead.id);
    setPreviewLead(lead);
    switch (action) {
      case 'view':
        openLead(lead);
        break;
      case 'enrich':
        enrichLead.mutate(lead.id);
        break;
      case 'verify':
        verifyLead.mutate(lead.id);
        break;
      case 'score':
        void api
          .post<LeadRow>(`/leads/${lead.id}/score`)
          .then(() => {
            void queryClient.invalidateQueries({ queryKey: ['leads'] });
            setActionMessage('Lead score calculated with explanation.');
          })
          .catch(() => {
            updateLead.mutate({
              id: lead.id,
              leadScore: computeLeadScore(lead),
              nextRecommendedAction: 'Add to campaign',
            });
            setActionMessage('Lead score calculated (local fallback).');
          });
        break;
      case 'outreach':
        generateDraft.mutate(lead.id);
        break;
      case 'campaign':
        setPickValue('');
        setPickDialog({ type: 'campaign', leadIds: [lead.id] });
        break;
      case 'stage':
        setPickValue(lead.status);
        setPickDialog({ type: 'stage', leadIds: [lead.id] });
        break;
      case 'assign':
        setPickValue(lead.assignedUserId ?? '');
        setPickDialog({ type: 'assign', leadIds: [lead.id] });
        break;
      case 'task':
        setPickValue(lead.nextRecommendedAction ?? '');
        setPickDialog({ type: 'task', leadId: lead.id });
        break;
      case 'archive':
        updateStage.mutate({ id: lead.id, stage: 'PAUSED' });
        break;
      case 'delete':
        if (
          window.confirm(
            `Delete lead ${lead.contact.name}? This cannot be undone.`,
          )
        ) {
          deleteLead.mutate(lead.id);
        }
        break;
      default:
        break;
    }
  }

  function handleBulkAction(action: BulkAction) {
    const ids = Object.keys(rowSelection).filter((id) => rowSelection[id]);
    if (!ids.length) return;
    switch (action) {
      case 'enrich':
        bulkEnrich.mutate(ids);
        break;
      case 'verify':
        bulkVerify.mutate(ids);
        break;
      case 'score': {
        const selected = filteredLeads.filter((l) => ids.includes(l.id));
        void Promise.all(
          selected.map((lead) =>
            api.patch(`/leads/${lead.id}`, {
              leadScore: computeLeadScore(lead),
            }),
          ),
        ).then(() => {
          setActionMessage('Scores updated for selected leads.');
          setRowSelection({});
          invalidateLeads();
        });
        break;
      }
      case 'campaign':
        setPickValue('');
        setPickDialog({ type: 'campaign', leadIds: ids });
        break;
      case 'assign':
        setPickValue('');
        setPickDialog({ type: 'assign', leadIds: ids });
        break;
      case 'export':
        exportLeadsCsv(filteredLeads.filter((l) => ids.includes(l.id)));
        break;
      case 'delete':
        if (
          window.confirm(
            `Delete ${ids.length} lead(s)? This cannot be undone.`,
          )
        ) {
          bulkDelete.mutate(ids);
        }
        break;
      default:
        break;
    }
  }

  function confirmPick() {
    if (!pickDialog || !pickValue) return;
    if (pickDialog.type === 'campaign') {
      // Handled by AddToCampaignDialog
      return;
    } else if (pickDialog.type === 'stage') {
      void Promise.all(
        pickDialog.leadIds.map((id) =>
          api.patch(`/leads/${id}/stage`, { stage: pickValue }),
        ),
      ).then(() => {
        setActionMessage('Pipeline stage updated.');
        invalidateLeads();
      });
    } else if (pickDialog.type === 'assign') {
      void Promise.all(
        pickDialog.leadIds.map((id) =>
          api.patch(`/leads/${id}`, { assignedUserId: pickValue }),
        ),
      ).then(() => {
        setActionMessage('Owner assigned.');
        setRowSelection({});
        invalidateLeads();
      });
    } else if (pickDialog.type === 'task') {
      updateLead.mutate({
        id: pickDialog.leadId,
        nextRecommendedAction: pickValue,
      });
    }
    setPickDialog(null);
    setPickValue('');
  }

  function confirmAddToCampaign(campaignId: string) {
    if (!pickDialog || pickDialog.type !== 'campaign') return;
    if (pickDialog.leadIds.length === 1) {
      updateLead.mutate({
        id: pickDialog.leadIds[0],
        campaignId,
      });
    } else {
      bulkCampaign.mutate({
        leadIds: pickDialog.leadIds,
        campaignId,
      });
    }
    setPickDialog(null);
    setPickValue('');
  }

  const columns = useMemo<ColumnDef<LeadRow>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={table.getIsSomePageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            aria-label="Select all"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
            aria-label="Select row"
            onClick={(e) => e.stopPropagation()}
          />
        ),
        size: 40,
      },
      {
        id: 'contact',
        header: 'Contact',
        cell: ({ row }) => (
          <button
            type="button"
            className="min-w-0 max-w-[220px] text-left"
            onClick={(e) => {
              e.stopPropagation();
              openLead(row.original);
            }}
          >
            <p className="truncate font-medium leading-tight text-navy hover:underline">
              {row.original.contact.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {row.original.contact.email}
              {row.original.contact.title
                ? ` · ${row.original.contact.title}`
                : ''}
            </p>
          </button>
        ),
      },
      {
        id: 'company',
        header: 'Company',
        cell: ({ row }) => (
          <div className="min-w-0 max-w-[160px]">
            <p className="truncate text-sm font-medium">
              {row.original.company.name ?? '—'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {[row.original.industry, row.original.location]
                .filter(Boolean)
                .join(' · ') || '—'}
            </p>
          </div>
        ),
      },
      {
        id: 'leadScore',
        header: 'Lead score',
        cell: ({ row }) => (
          <span className={cn('tabular-nums', scoreTone(row.original.leadScore))}>
            {row.original.leadScore ?? '—'}
          </span>
        ),
      },
      {
        id: 'verification',
        header: 'Verification',
        cell: ({ row }) => (
          <VerificationBadge status={row.original.verification_status} />
        ),
      },
      {
        id: 'stage',
        header: 'Pipeline stage',
        cell: ({ row }) => (
          <PipelineStageBadge status={row.original.status} />
        ),
      },
      {
        id: 'nextAction',
        header: 'Next Best Action',
        cell: ({ row }) => {
          const label = nextBestActionLabel(row.original);
          return (
            <button
              type="button"
              className="max-w-[180px] truncate text-left text-sm font-medium text-navy underline-offset-2 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                handleLeadAction(resolveNextAction(label), row.original);
              }}
            >
              {label}
            </button>
          );
        },
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div onClick={(e) => e.stopPropagation()}>
            <LeadActionsMenu
              lead={row.original}
              disabled={actionBusy}
              onAction={handleLeadAction}
            />
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actionBusy],
  );

  const table = useReactTable({
    data: filteredLeads,
    columns,
    state: { rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const selectedCount = Object.values(rowSelection).filter(Boolean).length;
  const isEmpty =
    !leadsQuery.isLoading && !leadsQuery.isError && allLeads.length === 0;

  // Keep drawer/preview in sync with refreshed data
  const liveDrawer =
    drawerLead && allLeads.find((l) => l.id === drawerLead.id)
      ? allLeads.find((l) => l.id === drawerLead.id)!
      : drawerLead;
  const livePreview =
    previewLead && allLeads.find((l) => l.id === previewLead.id)
      ? allLeads.find((l) => l.id === previewLead.id)!
      : previewLead;

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-navy">
            Leads
          </h2>
          <p className="text-sm text-muted-foreground">
            Search, filter, and act on your pipeline with bulk tools.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setImportMessage('Importing CSV…');
                importCsv.mutate(file);
              }
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={importCsv.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            {importCsv.isPending ? 'Importing…' : 'Import CSV'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setHunterMessage(null);
              setHunterOpen(true);
            }}
          >
            <Search className="h-4 w-4" />
            Flacron Search
          </Button>
          <Button type="button" onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Add Lead
          </Button>
        </div>
      </div>

      {importMessage ? (
        <p className="text-sm text-muted-foreground">{importMessage}</p>
      ) : null}
      {actionMessage ? (
        <p className="text-sm text-muted-foreground">{actionMessage}</p>
      ) : null}

      {leadsQuery.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading leads…</p>
      ) : leadsQuery.isError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Failed to load leads</p>
          <p className="mt-1 text-muted-foreground">
            {(leadsQuery.error as Error)?.message ??
              'Sign in and ensure the API is running on http://localhost:3001.'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void leadsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : isEmpty ? (
        <LeadsEmptyState
          importing={importCsv.isPending}
          onImport={() => fileInputRef.current?.click()}
          onAdd={() => setAddOpen(true)}
        />
      ) : (
        <>
          <LeadsSummaryCards leads={allLeads} />

          <LeadsFilterBar
            filters={filters}
            onChange={setFilters}
            industries={industries}
            locations={locations}
            sources={sources}
            campaigns={campaignOptions}
            users={userOptions}
          />

          <LeadsBulkToolbar
            selectedCount={selectedCount}
            busy={actionBusy}
            onClear={() => setRowSelection({})}
            onAction={handleBulkAction}
          />

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
            <div className="min-h-0 flex-1 overflow-y-auto">
              <Table className="table-fixed w-full">
                <TableHeader>
                  {table.getHeaderGroups().map((hg) => (
                    <TableRow key={hg.id} className="hover:bg-transparent">
                      {hg.headers.map((header) => (
                        <TableHead
                          key={header.id}
                          className="whitespace-nowrap bg-muted/40"
                          style={
                            header.column.id === 'select'
                              ? { width: 40 }
                              : header.column.id === 'actions'
                                ? { width: 56 }
                                : header.column.id === 'leadScore'
                                  ? { width: 88 }
                                  : undefined
                          }
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext(),
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {table.getRowModel().rows.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        data-state={
                          row.getIsSelected() ||
                          previewLead?.id === row.original.id
                            ? 'selected'
                            : undefined
                        }
                        className="cursor-pointer data-[state=selected]:bg-accent/50"
                        onClick={() => {
                          setPreviewLead(row.original);
                          setDrawerLead(row.original);
                        }}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="align-top py-2.5">
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No leads match the current filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
              <span>
                Showing {filteredLeads.length} of {allLeads.length} leads
              </span>
              {activeLeadId && actionBusy ? (
                <span>Working on selected lead…</span>
              ) : null}
            </div>

            {livePreview ? (
              <div className="grid gap-3 border-t bg-muted/30 px-4 py-3 sm:grid-cols-[1fr_auto]">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Lead preview
                  </p>
                  <p className="truncate font-medium text-navy">
                    {livePreview.contact.name}
                    <span className="font-normal text-muted-foreground">
                      {' '}
                      · {livePreview.company.name ?? 'No company'}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Next: {nextBestActionLabel(livePreview)}
                    {livePreview.campaign
                      ? ` · Campaign: ${livePreview.campaign.name}`
                      : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <VerificationBadge status={livePreview.verification_status} />
                  <PipelineStageBadge status={livePreview.status} />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openLead(livePreview)}
                  >
                    Open profile
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </>
      )}

      <LeadDetailDrawer
        lead={liveDrawer}
        open={Boolean(drawerLead)}
        onClose={() => setDrawerLead(null)}
        onAction={(action) => {
          if (!liveDrawer) return;
          handleLeadAction(action as LeadAction, liveDrawer);
        }}
      />

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add lead</DialogTitle>
            <DialogDescription>
              Create a single contact and lead in this workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {(
              [
                ['email', 'Email', 'email'],
                ['firstName', 'First name', 'text'],
                ['lastName', 'Last name', 'text'],
                ['companyName', 'Company', 'text'],
                ['title', 'Title', 'text'],
              ] as const
            ).map(([key, label, type]) => (
              <div key={key} className="space-y-1">
                <label className="text-xs font-medium" htmlFor={key}>
                  {label}
                </label>
                <Input
                  id={key}
                  type={type}
                  value={addForm[key]}
                  onChange={(e) =>
                    setAddForm((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  required={key === 'email'}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!addForm.email || createLead.isPending}
              onClick={() => createLead.mutate()}
            >
              {createLead.isPending ? 'Saving…' : 'Save lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={hunterOpen}
        onOpenChange={(open) => {
          setHunterOpen(open);
          if (!open) {
            setHunterMessage(null);
            setHunterContacts([]);
            setHunterOrg(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Flacron Search</DialogTitle>
            <DialogDescription>
              Find contacts associated with a company domain via Hunter.io.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <label className="text-xs font-medium" htmlFor="hunter-domain">
              Company domain
            </label>
            <Input
              id="hunter-domain"
              placeholder="e.g. stripe.com"
              value={hunterDomain}
              onChange={(e) => {
                setHunterDomain(e.target.value);
                setHunterContacts([]);
                setHunterOrg(null);
                setHunterMessage(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && hunterDomain.trim()) {
                  hunterSearch.mutate(hunterDomain.trim());
                }
              }}
            />
          </div>
          {hunterMessage ? (
            <p className="text-sm text-muted-foreground">{hunterMessage}</p>
          ) : null}
          {hunterContacts.length > 0 ? (
            <div className="max-h-56 overflow-y-auto rounded-md border">
              <ul className="divide-y text-sm">
                {hunterContacts.map((c) => {
                  const name =
                    [c.first_name, c.last_name].filter(Boolean).join(' ') ||
                    '—';
                  return (
                    <li
                      key={c.value}
                      className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.value}
                          {c.position ? ` · ${c.position}` : ''}
                        </p>
                      </div>
                      {typeof c.confidence === 'number' ? (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {c.confidence}%
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHunterOpen(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              disabled={!hunterDomain.trim() || hunterSearch.isPending}
              onClick={() => hunterSearch.mutate(hunterDomain.trim())}
            >
              {hunterSearch.isPending ? 'Searching…' : 'Search'}
            </Button>
            {hunterContacts.length > 0 ? (
              <Button
                disabled={hunterImport.isPending}
                onClick={() => hunterImport.mutate()}
              >
                {hunterImport.isPending
                  ? 'Importing…'
                  : `Import ${hunterContacts.length}`}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AddToCampaignDialog
        open={pickDialog?.type === 'campaign'}
        onOpenChange={(open) => {
          if (!open) {
            setPickDialog(null);
            setPickValue('');
          }
        }}
        leadIds={pickDialog?.type === 'campaign' ? pickDialog.leadIds : []}
        campaigns={campaignDialogOptions}
        eligibility={campaignEligibility}
        onConfirmExisting={confirmAddToCampaign}
        busy={bulkCampaign.isPending || updateLead.isPending}
      />

      <Dialog
        open={Boolean(pickDialog) && pickDialog?.type !== 'campaign'}
        onOpenChange={(open) => {
          if (!open) {
            setPickDialog(null);
            setPickValue('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pickDialog?.type === 'stage'
                ? 'Move pipeline stage'
                : pickDialog?.type === 'assign'
                  ? 'Assign owner'
                  : 'Create task'}
            </DialogTitle>
            <DialogDescription>
              {pickDialog?.type === 'task'
                ? 'Set the next recommended action for this lead.'
                : 'Choose a value to apply.'}
            </DialogDescription>
          </DialogHeader>
          {pickDialog?.type === 'stage' ? (
            <Select
              value={pickValue}
              onChange={(e) => setPickValue(e.target.value)}
            >
              <option value="">Select stage…</option>
              {PIPELINE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {s.replaceAll('_', ' ')}
                </option>
              ))}
            </Select>
          ) : null}
          {pickDialog?.type === 'assign' ? (
            <Select
              value={pickValue}
              onChange={(e) => setPickValue(e.target.value)}
            >
              <option value="">Select user…</option>
              {userOptions.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </Select>
          ) : null}
          {pickDialog?.type === 'task' ? (
            <Input
              value={pickValue}
              onChange={(e) => setPickValue(e.target.value)}
              placeholder="e.g. Follow up today"
            />
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPickDialog(null);
                setPickValue('');
              }}
            >
              Cancel
            </Button>
            <Button disabled={!pickValue} onClick={confirmPick}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={draftOpen}
        onOpenChange={(open) => {
          setDraftOpen(open);
          if (!open) {
            setDraft(null);
            setDraftSubject('');
            setDraftBody('');
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>AI email draft</DialogTitle>
            <DialogDescription>
              Edit the generated outreach, then approve to send.
            </DialogDescription>
          </DialogHeader>
          {draft ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="draft-subject"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Subject
                </label>
                <Input
                  id="draft-subject"
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                  placeholder="Email subject"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor="draft-body"
                  className="text-xs font-medium text-muted-foreground"
                >
                  Body
                </label>
                <Textarea
                  id="draft-body"
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  placeholder="Email body"
                  className="min-h-[16rem] resize-y"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!draft || rejectDraft.isPending}
              onClick={() => draft && rejectDraft.mutate(draft.id)}
            >
              Reject Draft
            </Button>
            <Button
              disabled={
                !draft ||
                approveDraft.isPending ||
                !draftSubject.trim() ||
                !draftBody.trim()
              }
              onClick={() =>
                draft &&
                approveDraft.mutate({
                  draftId: draft.id,
                  subject: draftSubject.trim(),
                  body: draftBody.trim(),
                })
              }
            >
              {approveDraft.isPending ? 'Sending…' : 'Approve & Send'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
