'use client';

import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileUp, Loader2, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MOCK_MAILBOXES } from '@/lib/campaigns-mock';
import {
  BRAND_TONES,
  CAMPAIGN_GOALS,
  type BrandTone,
  type CampaignWizardData,
} from '@/types/campaigns';
import { cn } from '@/lib/utils';

const ACCEPTED_DOCS =
  '.pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp';

type ProductOption = {
  id: string;
  name: string;
  description?: string | null;
  pricingNotes?: string | null;
};

type StepDetailsProps = {
  data: CampaignWizardData;
  onChange: (patch: Partial<CampaignWizardData>) => void;
  onGenerateAi: () => void;
  generating?: boolean;
};

const VERIFICATION_OPTIONS = [
  { value: 'VERIFIED', label: 'Verified' },
  { value: 'CATCH_ALL', label: 'Catch-all' },
  { value: 'RISKY', label: 'Risky' },
  { value: 'PENDING', label: 'Pending' },
];

export function StepDetails({
  data,
  onChange,
  onGenerateAi,
  generating,
}: StepDetailsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const productsQuery = useQuery({
    queryKey: ['wizard-products'],
    queryFn: () => api.get<ProductOption[]>('/products'),
    retry: false,
  });
  const products = productsQuery.data ?? [];

  const toggleVerification = (value: string) => {
    const current = data.audience.allowedVerification;
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({
      audience: { ...data.audience, allowedVerification: next },
    });
  };

  const applyProduct = (name: string) => {
    const selected = products.find((p) => p.name === name);
    onChange({
      product: name,
      pricing: selected?.pricingNotes || data.pricing,
      offer: selected?.description || data.offer,
    });
  };

  const attachDocuments = (files: FileList | null) => {
    if (!files?.length) return;
    const names = Array.from(files).map((f) => f.name);
    onChange({
      documents: Array.from(new Set([...data.documents, ...names])),
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeDocument = (name: string) => {
    onChange({ documents: data.documents.filter((d) => d !== name) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-navy">Business inputs</h3>
        <p className="text-xs text-muted-foreground">
          Tell FLA what you sell, who you want, and how much you can spend.
          The AI core uses this to find, qualify, and close.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="campaign-name">
              Campaign name <span className="text-red-600">*</span>
            </Label>
            <Input
              id="campaign-name"
              placeholder="Restoration Company Owners - WA"
              value={data.name}
              onChange={(e) => onChange({ name: e.target.value })}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="goal">
                Campaign goal <span className="text-red-600">*</span>
              </Label>
              <Select
                id="goal"
                value={data.goal}
                onChange={(e) =>
                  onChange({
                    goal: e.target.value as CampaignWizardData['goal'],
                  })
                }
              >
                <option value="">Select goal…</option>
                {CAMPAIGN_GOALS.map((g) => (
                  <option key={g.value} value={g.value}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="budget">Budget (USD)</Label>
              <Input
                id="budget"
                type="number"
                min={0}
                step={50}
                value={data.budget}
                onChange={(e) =>
                  onChange({ budget: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                placeholder="https://flacron.ai"
                value={data.website}
                onChange={(e) => onChange({ website: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product">
                Product / service <span className="text-red-600">*</span>
              </Label>
              {products.length > 0 ? (
                <Select
                  id="product"
                  value={
                    products.some((p) => p.name === data.product)
                      ? data.product
                      : ''
                  }
                  onChange={(e) => {
                    if (e.target.value) applyProduct(e.target.value);
                  }}
                >
                  <option value="">Select a product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  id="product"
                  placeholder="Flacron AR Platform Demo"
                  value={data.product}
                  onChange={(e) => onChange({ product: e.target.value })}
                />
              )}
              {products.length > 0 ? (
                <Input
                  className="mt-2"
                  placeholder="Or type a custom product name"
                  value={data.product}
                  onChange={(e) => onChange({ product: e.target.value })}
                />
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="offer">Offer</Label>
              <Input
                id="offer"
                placeholder="14-day pilot with onboarding"
                value={data.offer}
                onChange={(e) => onChange({ offer: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pricing">Pricing</Label>
              <Input
                id="pricing"
                placeholder="$499 / month or custom quote"
                value={data.pricing}
                onChange={(e) => onChange({ pricing: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brand-tone">Brand tone</Label>
            <div className="flex flex-wrap gap-1.5">
              {BRAND_TONES.map((tone) => {
                const active = data.brandTone === tone;
                return (
                  <button
                    key={tone}
                    type="button"
                    onClick={() => onChange({ brandTone: tone as BrandTone })}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs font-medium',
                      active
                        ? 'border-navy bg-navy text-white'
                        : 'border-border text-muted-foreground hover:border-navy/40',
                    )}
                  >
                    {tone}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Brand documents</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_DOCS}
              multiple
              className="sr-only"
              onChange={(e) => attachDocuments(e.target.files)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileUp className="h-3.5 w-3.5" />
                Attach Brand Documents
              </Button>
              <span className="text-[11px] text-muted-foreground">
                PDF, Word, slides, or images
              </span>
            </div>
            {data.documents.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {data.documents.map((doc) => (
                  <li
                    key={doc}
                    className="flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs text-navy"
                  >
                    <span className="max-w-[180px] truncate" title={doc}>
                      {doc}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${doc}`}
                      className="rounded p-0.5 text-muted-foreground hover:bg-background hover:text-navy"
                      onClick={() => removeDocument(doc)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                No documents attached yet. Attach pricing sheets, case studies,
                or brand guidelines for AI context.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-prompt">Campaign prompt (AI)</Label>
            <Textarea
              id="ai-prompt"
              placeholder='e.g. "Create a campaign for verified restoration company owners in Washington…"'
              value={data.aiPrompt}
              onChange={(e) => onChange({ aiPrompt: e.target.value })}
              className="min-h-[110px]"
              disabled={generating}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!data.aiPrompt.trim() || generating}
              onClick={onGenerateAi}
              aria-busy={generating}
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              )}
              {generating ? 'Generating campaign…' : 'Generate with AI'}
            </Button>
            {generating ? (
              <p
                role="status"
                className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950"
              >
                Generating campaign details and audience targeting from your
                prompt. This usually takes a few seconds…
              </p>
            ) : null}
          </div>

          {data.audience.industries.length > 0 ||
          data.audience.locations.length > 0 ||
          data.audience.jobTitles.length > 0 ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 text-sm text-navy">
              <p className="font-medium">AI audience targeting</p>
              <p className="mt-1 text-muted-foreground">
                {[
                  data.audience.industries.length
                    ? `Industries: ${data.audience.industries.join(', ')}`
                    : null,
                  data.audience.locations.length
                    ? `Locations: ${data.audience.locations.join(', ')}`
                    : null,
                  data.audience.jobTitles.length
                    ? `Titles: ${data.audience.jobTitles.join(', ')}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
          <p className="text-sm font-semibold text-navy">
            Connected mailbox, calendar & CRM
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="mailbox">From mailbox</Label>
            <Select
              id="mailbox"
              value={data.audience.mailboxId}
              onChange={(e) => {
                const mailboxId = e.target.value;
                const selected = MOCK_MAILBOXES.find((m) => m.id === mailboxId);
                const mailbox = selected?.email ?? selected?.label ?? mailboxId;
                onChange({
                  mailbox,
                  audience: { ...data.audience, mailboxId },
                });
              }}
            >
              {MOCK_MAILBOXES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="calendar">Calendar link</Label>
            <Input
              id="calendar"
              placeholder="https://cal.com/…"
              value={data.audience.calendarLink}
              onChange={(e) =>
                onChange({
                  calendarLink: e.target.value,
                  audience: {
                    ...data.audience,
                    calendarLink: e.target.value,
                  },
                })
              }
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-navy">
            <Checkbox
              checked={data.crmConnected}
              onChange={(e) => onChange({ crmConnected: e.target.checked })}
            />
            CRM pipeline connected
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="min-score">Minimum lead score</Label>
            <Input
              id="min-score"
              type="number"
              min={0}
              max={100}
              value={data.audience.minLeadScore}
              onChange={(e) =>
                onChange({
                  audience: {
                    ...data.audience,
                    minLeadScore: Number(e.target.value) || 0,
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Allowed verification statuses</Label>
            <div className="flex flex-wrap gap-2">
              {VERIFICATION_OPTIONS.map((opt) => {
                const selected = data.audience.allowedVerification.includes(
                  opt.value,
                );
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleVerification(opt.value)}
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                      selected
                        ? 'border-navy bg-navy text-white'
                        : 'border-border bg-background text-muted-foreground hover:border-navy/40',
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-navy">
            <Checkbox
              checked={data.audience.excludeExistingCustomers}
              onChange={(e) =>
                onChange({
                  audience: {
                    ...data.audience,
                    excludeExistingCustomers: e.target.checked,
                  },
                })
              }
            />
            Exclude existing customers
          </label>
        </div>
      </div>
    </div>
  );
}
