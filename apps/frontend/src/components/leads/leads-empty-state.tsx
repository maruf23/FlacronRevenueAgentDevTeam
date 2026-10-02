'use client';

import { Upload, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

type LeadsEmptyStateProps = {
  onImport: () => void;
  onAdd: () => void;
  importing?: boolean;
};

export function LeadsEmptyState({
  onImport,
  onAdd,
  importing,
}: LeadsEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-gradient-to-b from-secondary/60 to-background px-6 py-16 text-center">
      <div className="relative mb-6">
        <svg
          width="220"
          height="160"
          viewBox="0 0 220 160"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <ellipse cx="110" cy="138" rx="70" ry="10" fill="#002D69" opacity="0.08" />
          <rect
            x="48"
            y="36"
            width="124"
            height="88"
            rx="10"
            fill="#fff"
            stroke="#002D69"
            strokeOpacity="0.18"
            strokeWidth="2"
          />
          <path
            d="M48 52h124"
            stroke="#002D69"
            strokeOpacity="0.12"
            strokeWidth="2"
          />
          <circle cx="68" cy="44" r="3" fill="#FA4100" />
          <circle cx="80" cy="44" r="3" fill="#002D69" opacity="0.35" />
          <circle cx="92" cy="44" r="3" fill="#002D69" opacity="0.2" />
          <rect x="62" y="66" width="40" height="8" rx="4" fill="#002D69" opacity="0.12" />
          <rect x="62" y="82" width="64" height="6" rx="3" fill="#002D69" opacity="0.08" />
          <rect x="62" y="96" width="52" height="6" rx="3" fill="#002D69" opacity="0.08" />
          <rect
            x="148"
            y="70"
            width="44"
            height="56"
            rx="8"
            fill="#FA4100"
            opacity="0.12"
            transform="rotate(12 148 70)"
          />
          <path
            d="M158 88c8-18 28-22 36-10"
            stroke="#FA4100"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="196" cy="74" r="10" fill="#FA4100" />
          <path
            d="M192 74h8M196 70v8"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M34 108c12-22 28-20 36-4"
            stroke="#002D69"
            strokeOpacity="0.25"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="4 4"
            fill="none"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold tracking-tight text-foreground">
        No leads yet
      </h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Import a CSV to get started — or add your first contact and let the
        agent enrich, verify, and draft outreach.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button type="button" onClick={onImport} disabled={importing}>
          <Upload className="h-4 w-4" />
          {importing ? 'Importing…' : 'Import CSV'}
        </Button>
        <Button type="button" variant="outline" onClick={onAdd}>
          <UserPlus className="h-4 w-4" />
          Add Lead
        </Button>
      </div>
    </div>
  );
}
