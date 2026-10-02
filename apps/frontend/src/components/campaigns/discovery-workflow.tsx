'use client';

import { Check, CircleDot, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CampaignWorkflow } from '@/types/campaigns';

type DiscoveryWorkflowProps = {
  workflow?: CampaignWorkflow | null;
  compact?: boolean;
  className?: string;
};

export function DiscoveryWorkflow({
  workflow,
  compact,
  className,
}: DiscoveryWorkflowProps) {
  const steps = workflow?.steps ?? [];
  if (steps.length === 0) return null;

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-navy">
            Discovery to conversion
          </h3>
          <p className="text-xs text-muted-foreground">
            Step {workflow?.currentStep ?? 1} of {steps.length} —{' '}
            {workflow?.completedCount ?? 0} complete
          </p>
        </div>
      </div>
      <ol
        className={cn(
          'grid gap-2',
          compact
            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
            : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
        )}
      >
        {steps.map((step) => (
          <li
            key={step.key}
            className={cn(
              'rounded-lg border px-3 py-2.5',
              step.status === 'done' && 'border-emerald-200 bg-emerald-50/70',
              step.status === 'current' && 'border-primary bg-accent',
              step.status === 'blocked' && 'border-red-200 bg-red-50',
              step.status === 'upcoming' && 'border-border bg-background',
            )}
          >
            <div className="flex items-start gap-2">
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                  step.status === 'done' && 'bg-emerald-500 text-white',
                  step.status === 'current' && 'bg-primary text-white',
                  step.status === 'blocked' && 'bg-red-500 text-white',
                  step.status === 'upcoming' && 'bg-secondary text-muted-foreground',
                )}
              >
                {step.status === 'done' ? (
                  <Check className="h-3 w-3" />
                ) : step.status === 'blocked' ? (
                  <Lock className="h-3 w-3" />
                ) : step.status === 'current' ? (
                  <CircleDot className="h-3 w-3" />
                ) : (
                  step.id
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-navy">{step.label}</p>
                {!compact ? (
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {step.description}
                  </p>
                ) : null}
                {typeof step.count === 'number' && step.count > 0 ? (
                  <p className="mt-1 text-[11px] tabular-nums text-navy">
                    {step.count}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
