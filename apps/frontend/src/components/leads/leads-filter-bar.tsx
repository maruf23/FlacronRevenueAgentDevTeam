'use client';

import { useEffect, useState } from 'react';
import { Bookmark, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PIPELINE_STAGES, VERIFICATION_STATUSES } from '@/types/leads';

export type LeadFilters = {
  search: string;
  industry: string;
  location: string;
  scoreMin: string;
  scoreMax: string;
  verification: string;
  campaignId: string;
  stage: string;
  userId: string;
  source: string;
};

export const EMPTY_FILTERS: LeadFilters = {
  search: '',
  industry: '',
  location: '',
  scoreMin: '',
  scoreMax: '',
  verification: '',
  campaignId: '',
  stage: '',
  userId: '',
  source: '',
};

const SAVED_FILTERS_KEY = 'flacron.leads.savedFilters';

type Option = { value: string; label: string };

type LeadsFilterBarProps = {
  filters: LeadFilters;
  onChange: (next: LeadFilters) => void;
  industries: string[];
  locations: string[];
  sources: string[];
  campaigns: Option[];
  users: Option[];
};

export function LeadsFilterBar({
  filters,
  onChange,
  industries,
  locations,
  sources,
  campaigns,
  users,
}: LeadsFilterBarProps) {
  const [showMore, setShowMore] = useState(false);
  const [savedName, setSavedName] = useState('');
  const [savedFilters, setSavedFilters] = useState<
    Array<{ name: string; filters: LeadFilters }>
  >([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_FILTERS_KEY);
      if (raw) setSavedFilters(JSON.parse(raw) as typeof savedFilters);
    } catch {
      /* ignore */
    }
  }, []);

  const set = <K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) =>
    onChange({ ...filters, [key]: value });

  const hasActive = Object.values(filters).some((v) => v !== '');

  function saveCurrent() {
    const name = savedName.trim() || `Filter ${savedFilters.length + 1}`;
    const next = [...savedFilters.filter((s) => s.name !== name), { name, filters }];
    setSavedFilters(next);
    localStorage.setItem(SAVED_FILTERS_KEY, JSON.stringify(next));
    setSavedName('');
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search}
          onChange={(e) => set('search', e.target.value)}
          placeholder="Search name, email, or company…"
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        <Select
          value={filters.industry}
          onChange={(e) => set('industry', e.target.value)}
          aria-label="Industry"
        >
          <option value="">Industry</option>
          {industries.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>

        <Select
          value={filters.location}
          onChange={(e) => set('location', e.target.value)}
          aria-label="Location"
        >
          <option value="">Location</option>
          {locations.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </Select>

        <Input
          type="number"
          min={0}
          max={100}
          placeholder="Min Score"
          value={filters.scoreMin}
          onChange={(e) => set('scoreMin', e.target.value)}
          aria-label="Minimum score"
        />

        <Input
          type="number"
          min={0}
          max={100}
          placeholder="Max Score"
          value={filters.scoreMax}
          onChange={(e) => set('scoreMax', e.target.value)}
          aria-label="Maximum score"
        />

        <Select
          value={filters.verification}
          onChange={(e) => set('verification', e.target.value)}
          aria-label="Verification"
        >
          <option value="">Verification</option>
          {VERIFICATION_STATUSES.map((v) => (
            <option key={v} value={v}>
              {v.replace('_', '-')}
            </option>
          ))}
        </Select>

        <Select
          value={filters.campaignId}
          onChange={(e) => set('campaignId', e.target.value)}
          aria-label="Campaign"
        >
          <option value="">Campaign</option>
          {campaigns.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>

        <Select
          value={filters.stage}
          onChange={(e) => set('stage', e.target.value)}
          aria-label="Pipeline stage"
        >
          <option value="">Stage</option>
          {PIPELINE_STAGES.map((s) => (
            <option key={s} value={s}>
              {s.replaceAll('_', ' ')}
            </option>
          ))}
        </Select>

        <Select
          value={filters.userId}
          onChange={(e) => set('userId', e.target.value)}
          aria-label="Assigned user"
        >
          <option value="">Assigned User</option>
          {users.map((u) => (
            <option key={u.value} value={u.value}>
              {u.label}
            </option>
          ))}
        </Select>
      </div>

      {showMore ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Select
            value={filters.source}
            onChange={(e) => set('source', e.target.value)}
            aria-label="Source"
          >
            <option value="">Source</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <div className="flex gap-2 md:col-span-2">
            <Input
              value={savedName}
              onChange={(e) => setSavedName(e.target.value)}
              placeholder="Name this filter set…"
            />
            <Button type="button" variant="outline" onClick={saveCurrent}>
              <Bookmark className="h-4 w-4" />
              Save
            </Button>
          </div>
          {savedFilters.length > 0 ? (
            <Select
              defaultValue=""
              onChange={(e) => {
                const found = savedFilters.find((s) => s.name === e.target.value);
                if (found) onChange(found.filters);
                e.target.value = '';
              }}
              aria-label="Saved filters"
            >
              <option value="">Load saved filter…</option>
              {savedFilters.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowMore((v) => !v)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          More filters
          <ChevronDown
            className={`h-3.5 w-3.5 transition ${showMore ? 'rotate-180' : ''}`}
          />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={saveCurrent}>
          <Bookmark className="h-3.5 w-3.5" />
          Save filter
        </Button>
        {hasActive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange(EMPTY_FILTERS)}
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
