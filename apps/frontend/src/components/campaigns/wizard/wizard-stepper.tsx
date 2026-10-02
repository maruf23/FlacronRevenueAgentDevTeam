'use client';

import { Check } from 'lucide-react';
import {
  CalendarClock,
  ClipboardCheck,
  FileText,
  Mail,
  Megaphone,
  Rocket,
  Target,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { WIZARD_STEPS } from '@/types/campaigns';

const ICONS = [
  FileText,
  Target,
  Users,
  Megaphone,
  Mail,
  CalendarClock,
  ClipboardCheck,
  Rocket,
];

type WizardStepperProps = {
  currentStep: number;
  onStepClick?: (step: number) => void;
};

export function WizardStepper({ currentStep, onStepClick }: WizardStepperProps) {
  return (
    <div className="rounded-lg bg-navy px-3 py-3 text-navy-foreground sm:px-4">
      <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-white sm:text-left">
        Step {currentStep} of {WIZARD_STEPS.length}
      </p>
      <ol className="flex min-w-0 items-center gap-1 overflow-x-auto">
        {WIZARD_STEPS.map((step, index) => {
          const Icon = ICONS[index] ?? FileText;
          const done = step.id < currentStep;
          const active = step.id === currentStep;
          return (
            <li key={step.key} className="flex min-w-[4.5rem] flex-1 items-center">
              <button
                type="button"
                onClick={() => onStepClick?.(step.id)}
                className={cn(
                  'flex w-full flex-col items-center gap-1 rounded-md px-1 py-1 text-center transition-colors',
                  active && 'bg-white/10',
                  !active && 'hover:bg-white/5',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold',
                    done && 'border-emerald-400 bg-emerald-500 text-white',
                    active && 'border-primary bg-primary text-white',
                    !done && !active && 'border-white/30 bg-transparent text-white/80',
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
                </span>
                <span
                  className={cn(
                    'text-[11px] font-medium leading-tight',
                    active ? 'text-white' : 'text-white/80',
                  )}
                >
                  {step.label}
                </span>
              </button>
              {index < WIZARD_STEPS.length - 1 ? (
                <div
                  className={cn(
                    'mx-0.5 hidden h-px flex-1 sm:block',
                    step.id < currentStep ? 'bg-emerald-400/80' : 'bg-white/20',
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
