'use client';

import { useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { TimePicker } from '@/components/ui/time-picker';
import { Button } from '@/components/ui/button';
import {
  MOCK_COMPANY_SIZES,
  MOCK_INDUSTRIES,
  MOCK_JOB_TITLES,
  MOCK_LOCATIONS,
  MOCK_MAILBOXES,
} from '@/lib/campaigns-mock';
import { isSameDayTimeRangeValid } from '@/lib/time-range';
import type { CampaignWizardData } from '@/types/campaigns';
import { cn } from '@/lib/utils';

type StepAudienceProps = {
  data: CampaignWizardData;
  onChange: (patch: Partial<CampaignWizardData>) => void;
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function MultiChip({
  label,
  options,
  selected,
  onToggle,
  onClear,
  searchable,
}: {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  searchable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const mergedOptions = Array.from(new Set([...options, ...selected]));
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mergedOptions;
    return mergedOptions.filter((opt) => opt.toLowerCase().includes(q));
  }, [mergedOptions, query]);

  const customMatch =
    query.trim().length > 1 &&
    !mergedOptions.some((opt) => opt.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>
          {label}
          <span className="ml-1.5 font-normal text-muted-foreground">
            {selected.length} selected
          </span>
        </Label>
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium text-muted-foreground hover:text-navy"
          >
            Clear all
          </button>
        ) : null}
      </div>
      {searchable ? (
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="h-9 pl-8"
            placeholder={`Search ${label.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customMatch) {
                e.preventDefault();
                onToggle(query.trim());
                setQuery('');
              }
            }}
          />
        </div>
      ) : null}
      <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
        {filtered.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={cn(
                'rounded-md border px-2.5 py-1 text-sm font-medium transition-colors',
                active
                  ? 'border-navy bg-navy text-white'
                  : 'border-border bg-background text-muted-foreground hover:border-navy/40',
              )}
            >
              {opt}
            </button>
          );
        })}
        {customMatch ? (
          <button
            type="button"
            onClick={() => {
              onToggle(query.trim());
              setQuery('');
            }}
            className="rounded-md border border-dashed px-2.5 py-1 text-sm text-navy"
          >
            Add “{query.trim()}”
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function StepAudience({ data, onChange }: StepAudienceProps) {
  const update = (patch: Partial<CampaignWizardData['audience']>) =>
    onChange({ audience: { ...data.audience, ...patch } });

  const toggle = (
    key: 'industries' | 'locations' | 'companySizes' | 'jobTitles' | 'sendingDays',
    value: string,
  ) => {
    const current = data.audience[key];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    update({ [key]: next });
  };

  const selectedCount =
    data.audience.industries.length +
    data.audience.locations.length +
    data.audience.companySizes.length +
    data.audience.jobTitles.length;

  const hoursValid = isSameDayTimeRangeValid(
    data.audience.sendingHoursStart,
    data.audience.sendingHoursEnd,
  );

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="flex items-center justify-between lg:col-span-2">
        <p className="text-sm text-muted-foreground">
          {selectedCount} targeting chip{selectedCount === 1 ? '' : 's'} selected
          {selectedCount === 0
            ? ' — add at least one industry, location, or job title to continue'
            : ''}
          . Values persist when you go Back.
        </p>
        {selectedCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              update({
                industries: [],
                locations: [],
                companySizes: [],
                jobTitles: [],
              })
            }
          >
            <X className="h-3.5 w-3.5" />
            Clear all filters
          </Button>
        ) : null}
      </div>

      <MultiChip
        label="Industry"
        options={MOCK_INDUSTRIES}
        selected={data.audience.industries}
        onToggle={(v) => toggle('industries', v)}
        onClear={() => update({ industries: [] })}
        searchable
      />
      <MultiChip
        label="Location"
        options={MOCK_LOCATIONS}
        selected={data.audience.locations}
        onToggle={(v) => toggle('locations', v)}
        onClear={() => update({ locations: [] })}
        searchable
      />
      <MultiChip
        label="Company size"
        options={MOCK_COMPANY_SIZES}
        selected={data.audience.companySizes}
        onToggle={(v) => toggle('companySizes', v)}
        onClear={() => update({ companySizes: [] })}
      />
      <MultiChip
        label="Job titles"
        options={MOCK_JOB_TITLES}
        selected={data.audience.jobTitles}
        onToggle={(v) => toggle('jobTitles', v)}
        onClear={() => update({ jobTitles: [] })}
        searchable
      />

      <div className="space-y-1.5">
        <Label htmlFor="aud-min-score">Min lead score</Label>
        <Input
          id="aud-min-score"
          type="number"
          min={0}
          max={100}
          value={data.audience.minLeadScore}
          onChange={(e) => update({ minLeadScore: Number(e.target.value) || 0 })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="daily-limit">Daily sending limit</Label>
        <Input
          id="daily-limit"
          type="number"
          min={1}
          max={500}
          value={data.audience.dailySendingLimit}
          onChange={(e) =>
            update({ dailySendingLimit: Number(e.target.value) || 1 })
          }
        />
      </div>

      <div className="space-y-2 lg:col-span-2">
        <Label>Sending days</Label>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((day) => {
            const active = data.audience.sendingDays.includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggle('sendingDays', day)}
                className={cn(
                  'h-9 w-12 rounded-md border text-sm font-medium',
                  active
                    ? 'border-navy bg-navy text-white'
                    : 'border-border text-muted-foreground',
                )}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:col-span-2">
        <div className="space-y-1.5">
          <Label htmlFor="hours-start">Sending hours start</Label>
          <TimePicker
            id="hours-start"
            value={data.audience.sendingHoursStart}
            onChange={(value) => update({ sendingHoursStart: value })}
            aria-invalid={!hoursValid}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="hours-end">Sending hours end</Label>
          <TimePicker
            id="hours-end"
            value={data.audience.sendingHoursEnd}
            onChange={(value) => update({ sendingHoursEnd: value })}
            aria-invalid={!hoursValid}
          />
        </div>
        {!hoursValid ? (
          <p className="col-span-2 text-sm text-red-700">
            Sending hours end must be after start on the same day.
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="aud-mailbox">Sender mailbox</Label>
        <Select
          id="aud-mailbox"
          value={data.audience.mailboxId}
          onChange={(e) => {
            const mailboxId = e.target.value;
            const mailbox =
              MOCK_MAILBOXES.find((m) => m.id === mailboxId)?.label ?? mailboxId;
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

      <div className="space-y-1.5 lg:col-span-2">
        <Label htmlFor="aud-calendar">Calendar link</Label>
        <Input
          id="aud-calendar"
          placeholder="https://cal.com/…"
          value={data.audience.calendarLink}
          onChange={(e) =>
            onChange({
              calendarLink: e.target.value,
              audience: { ...data.audience, calendarLink: e.target.value },
            })
          }
        />
      </div>
    </div>
  );
}
