'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Pause,
  Play,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Square,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { AUTOMATIC_PROTECTIONS } from '@/lib/campaigns-mock';
import {
  resolveSafetyChecks,
  type SafetyCheckStatus,
  type SafetyCheckView,
} from '@/lib/safety-checks';
import type { CampaignStatus } from '@/types/campaigns';

type CampaignControlsProps = {
  status: CampaignStatus;
  dailyLimit: number;
  onDailyLimitChange?: (value: number) => void;
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  onEditFutureSteps?: () => void;
  className?: string;
  /** Legacy boolean overrides: true = failing */
  safetyOverrides?: Partial<Record<string, boolean>>;
  /** Preferred: fully resolved check states from live launch blockers */
  safetyChecks?: SafetyCheckView[];
};

function statusStyles(status: SafetyCheckStatus) {
  switch (status) {
    case 'blocking':
      return {
        row: 'border-red-200 bg-red-50 text-red-900',
        badge: 'text-red-800',
        label: 'Blocking',
        Icon: XCircle,
        iconClass: 'text-red-600',
      };
    case 'warning':
      return {
        row: 'border-amber-200 bg-amber-50 text-amber-950',
        badge: 'text-amber-800',
        label: 'Warning',
        Icon: AlertTriangle,
        iconClass: 'text-amber-600',
      };
    case 'unknown':
      return {
        row: 'border-border bg-muted/30 text-muted-foreground',
        badge: 'text-muted-foreground',
        label: 'Unchecked',
        Icon: AlertTriangle,
        iconClass: 'text-muted-foreground',
      };
    case 'passed':
    default:
      return {
        row: 'border-emerald-200/80 bg-emerald-50/50 text-emerald-950',
        badge: 'text-emerald-800',
        label: 'Passed',
        Icon: CheckCircle2,
        iconClass: 'text-emerald-600',
      };
  }
}

export function CampaignControls({
  status,
  dailyLimit,
  onDailyLimitChange,
  onPause,
  onResume,
  onStop,
  onEditFutureSteps,
  className,
  safetyOverrides,
  safetyChecks: safetyChecksProp,
}: CampaignControlsProps) {
  const canPause = status === 'RUNNING' || status === 'SCHEDULED';
  const canResume =
    status === 'PAUSED' ||
    status === 'ATTENTION_REQUIRED' ||
    status === 'NEEDS_REVIEW';
  const canStop = !['COMPLETED', 'ARCHIVED', 'FAILED', 'DRAFT'].includes(status);
  const resumeLabel =
    status === 'NEEDS_REVIEW' ? 'Approve & launch' : 'Resume';

  const checks =
    safetyChecksProp ??
    resolveSafetyChecks({
      overrides: safetyOverrides,
      assumePassedWhenUnknown: true,
    });

  return (
    <div className={cn('grid gap-4 lg:grid-cols-2', className)}>
      <Card className="shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Settings2 className="h-4 w-4 text-primary" />
            Execution Controls
          </CardTitle>
          <CardDescription>
            Manage daily volume and campaign lifecycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="daily-limit">Daily sending limit</Label>
            <Input
              id="daily-limit"
              type="number"
              min={1}
              max={500}
              value={dailyLimit}
              onChange={(e) =>
                onDailyLimitChange?.(Number(e.target.value) || 1)
              }
              className="max-w-[160px]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {canPause ? (
              <Button variant="outline" size="sm" onClick={onPause}>
                <Pause className="h-3.5 w-3.5" />
                Pause
              </Button>
            ) : null}
            {canResume ? (
              <Button size="sm" onClick={onResume}>
                <Play className="h-3.5 w-3.5" />
                {resumeLabel}
              </Button>
            ) : null}
            {canStop ? (
              <Button variant="destructive" size="sm" onClick={onStop}>
                <Square className="h-3.5 w-3.5" />
                Stop
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={onEditFutureSteps}>
              Change future steps
            </Button>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <p className="text-sm font-medium text-navy">Approval mode</p>
              <p className="text-xs text-muted-foreground">
                Require manual review before sending each batch
              </p>
            </div>
            <Switch />
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldAlert className="h-4 w-4 text-primary" />
            Safety &amp; Automation Rules
          </CardTitle>
          <CardDescription>
            Green = passed, amber = warning, red = blocking. Problem wording only
            appears when a check fails.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Safety checks
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {checks.map((check) => {
                const style = statusStyles(check.status);
                const Icon = style.Icon;
                const label =
                  check.status === 'passed' || check.status === 'unknown'
                    ? check.passLabel
                    : check.failLabel;
                return (
                  <li
                    key={check.id}
                    className={cn(
                      'flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-xs',
                      style.row,
                    )}
                    title={check.detail}
                  >
                    <Icon
                      className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', style.iconClass)}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium leading-snug">
                        {label}
                      </span>
                      <span
                        className={cn(
                          'text-[10px] font-semibold uppercase tracking-wide',
                          style.badge,
                        )}
                      >
                        {style.label}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Automatic protections
            </p>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {AUTOMATIC_PROTECTIONS.map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-xs text-navy"
                >
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
