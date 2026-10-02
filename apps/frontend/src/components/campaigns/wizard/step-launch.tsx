'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  FileText,
  Loader2,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CampaignControls } from '@/components/campaigns/campaign-controls';
import {
  LaunchConfirmDialog,
  LaunchSummaryCard,
  buildLaunchSummaryFromWizard,
} from '@/components/campaigns/launch-confirm-dialog';
import { checkAdsBudget } from '@/lib/ads-budget';
import {
  countSafetyIssues,
  hasCriticalSafetyFailures,
  parseLaunchBlockersResponse,
  resolveSafetyChecks,
} from '@/lib/safety-checks';
import { isOvernightTimeRangeValid, isSameDayTimeRangeValid } from '@/lib/time-range';
import type { CampaignWizardData } from '@/types/campaigns';
import { cn } from '@/lib/utils';

type LaunchHandler = () => void;

export type WizardLaunchMode = 'draft' | 'approval' | 'autopilot';

type StepLaunchProps = {
  data: CampaignWizardData;
  campaignId: string | null;
  onChange: (patch: Partial<CampaignWizardData>) => void;
  onConfirm: LaunchHandler;
  busy?: boolean;
};

const LAUNCH_MODES: {
  id: WizardLaunchMode;
  label: string;
  icon: typeof FileText;
  description: string;
}[] = [
  {
    id: 'draft',
    label: 'Draft',
    icon: FileText,
    description: 'Save the campaign without sending anything. Status stays Draft.',
  },
  {
    id: 'approval',
    label: 'Submit for approval',
    icon: ShieldCheck,
    description:
      'Does not start sending. Saves as Needs Review and notifies owners/admins to approve before any emails go out.',
  },
  {
    id: 'autopilot',
    label: 'Autopilot',
    icon: Rocket,
    description:
      'Starts the campaign after safety checks pass — immediately or on your set schedule. Status becomes Running or Scheduled.',
  },
];

async function fetchLaunchBlockers(campaignId: string) {
  const result = await api.get<unknown>(`/campaigns/${campaignId}/launch-blockers`);
  return parseLaunchBlockersResponse(result);
}

export function StepLaunch({
  data,
  campaignId,
  onChange,
  onConfirm,
  busy,
}: StepLaunchProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const mode = data.launchMode ?? 'draft';
  const summary = buildLaunchSummaryFromWizard(data);
  const budgetCheck = checkAdsBudget(data.ads.dailyBudget, data.ads.totalBudget);
  const hoursValid = isSameDayTimeRangeValid(
    data.audience.sendingHoursStart,
    data.audience.sendingHoursEnd,
  );
  const quietValid = isOvernightTimeRangeValid(
    data.schedule.quietHoursStart,
    data.schedule.quietHoursEnd,
  );

  const blockersQuery = useQuery({
    queryKey: ['campaign-launch-blockers', campaignId],
    queryFn: () => fetchLaunchBlockers(campaignId!),
    enabled: Boolean(campaignId),
    refetchOnWindowFocus: true,
  });

  const blockers = blockersQuery.data?.blockers ?? [];
  const structuredChecks = blockersQuery.data?.checks ?? null;
  const hasBlockers = blockers.length > 0;
  const checking = blockersQuery.isLoading || blockersQuery.isFetching;

  const safetyChecks = resolveSafetyChecks({
    blockers,
    checks: structuredChecks,
    assumePassedWhenUnknown: Boolean(campaignId) && blockersQuery.isSuccess,
  });

  const issueCounts = countSafetyIssues(safetyChecks);
  const criticalBlocked = hasCriticalSafetyFailures(safetyChecks);
  const ready =
    Boolean(campaignId) && blockersQuery.isSuccess && !hasBlockers && !criticalBlocked;

  const autopilotBlocked =
    Boolean(busy) ||
    checking ||
    hasBlockers ||
    criticalBlocked ||
    (Boolean(campaignId) && blockersQuery.isFetched && !ready);

  /** Critical mailbox/credits/auth failures also block Submit for Approval. */
  const approvalBlocked =
    Boolean(busy) ||
    checking ||
    criticalBlocked ||
    (Boolean(campaignId) && blockersQuery.isError);

  const confirmDisabled =
    Boolean(busy) ||
    (mode === 'autopilot' && autopilotBlocked) ||
    (mode === 'approval' && approvalBlocked) ||
    (data.channels.ads && !budgetCheck.valid) ||
    !hoursValid ||
    !quietValid;

  const scheduleLabel =
    data.schedule.startOption === 'now'
      ? 'Start immediately'
      : data.schedule.startOption === 'later'
        ? data.schedule.startAt
          ? `Scheduled for ${data.schedule.startAt}`
          : 'Scheduled for a later start time'
        : `Starts in ${data.schedule.countdownHours}h`;

  const selectMode = (next: WizardLaunchMode) => {
    onChange({
      launchMode: next,
      approvalMode: next === 'approval',
    });
  };

  const confirmLabel =
    mode === 'draft'
      ? 'Save as Draft'
      : mode === 'approval'
        ? 'Submit for Approval'
        : data.schedule.startOption === 'now'
          ? 'Launch Autopilot'
          : 'Schedule Autopilot';

  const confirmHint =
    mode === 'draft'
      ? 'No emails will be sent. Status: Draft.'
      : mode === 'approval'
        ? 'Sends to admins for review — does not launch yet. Status: Needs Review.'
        : ready || !campaignId
          ? `${scheduleLabel}. Status: ${data.schedule.startOption === 'now' ? 'Running' : 'Scheduled'}.`
          : 'Disabled until blocking safety checks pass';

  const readinessTitle = !campaignId
    ? 'Safety checks run after the campaign is saved'
    : checking && !blockersQuery.data
      ? 'Running safety checks…'
      : blockersQuery.isError
        ? 'Could not verify launch readiness'
        : issueCounts.blocking > 0
          ? `${issueCounts.blocking} issue${issueCounts.blocking === 1 ? '' : 's'} must be fixed before launch`
          : issueCounts.warnings > 0
            ? `Ready with ${issueCounts.warnings} warning${issueCounts.warnings === 1 ? '' : 's'}`
            : ready
              ? 'Ready to launch'
              : 'Pre-launch safety checks';

  const readinessTone =
    !campaignId || (checking && !blockersQuery.data)
      ? 'amber'
      : blockersQuery.isError || issueCounts.blocking > 0
        ? 'red'
        : issueCounts.warnings > 0
          ? 'amber'
          : ready
            ? 'green'
            : 'amber';

  const disabledReason =
    mode === 'approval' && criticalBlocked
      ? 'Fix blocking issues (mailbox, auth, or credits) before submitting for approval.'
      : mode === 'autopilot' && (hasBlockers || criticalBlocked)
        ? blockers[0] || 'Resolve all blockers before Autopilot is available.'
        : data.channels.ads && !budgetCheck.valid
          ? budgetCheck.message ?? undefined
          : !hoursValid || !quietValid
            ? 'Fix sending hours or quiet hours before continuing.'
            : undefined;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-navy">Launch</h3>
        <p className="text-xs text-muted-foreground">
          Choose how this campaign should finish. Submitting for approval does not
          start sending; Autopilot does.
        </p>
      </div>

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Launch Mode
        </p>
        <div
          role="radiogroup"
          aria-label="Launch mode"
          className="grid gap-2 rounded-lg border bg-muted/30 p-1 sm:grid-cols-3"
        >
          {LAUNCH_MODES.map((item) => {
            const Icon = item.icon;
            const selected = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={busy}
                onClick={() => selectMode(item.id)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                  selected
                    ? 'bg-background text-navy shadow-sm'
                    : 'text-muted-foreground hover:bg-background/60 hover:text-navy',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {LAUNCH_MODES.find((m) => m.id === mode)?.description}
        </p>
      </div>

      {/* Readiness banner — always visible on Launch step */}
      <div
        role="status"
        className={cn(
          'rounded-lg border px-4 py-3 shadow-sm',
          readinessTone === 'green' && 'border-emerald-300 bg-emerald-50 text-emerald-950',
          readinessTone === 'amber' && 'border-amber-300 bg-amber-50 text-amber-950',
          readinessTone === 'red' && 'border-red-300 bg-red-50 text-red-950',
        )}
      >
        <div className="mb-1 flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {checking && !blockersQuery.data ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : readinessTone === 'green' ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : readinessTone === 'red' ? (
              <XCircle className="h-4 w-4 text-red-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            {readinessTitle}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              readinessTone === 'red' && 'text-red-900 hover:bg-red-100',
              readinessTone === 'amber' && 'text-amber-900 hover:bg-amber-100',
              readinessTone === 'green' && 'text-emerald-900 hover:bg-emerald-100',
            )}
            disabled={!campaignId || checking}
            onClick={() => void blockersQuery.refetch()}
          >
            Refresh
          </Button>
        </div>
        {!campaignId ? (
          <p className="text-xs opacity-90">
            Confirming will save the campaign and assign leads, then re-check
            mailbox, credits, and deliverability.
          </p>
        ) : checking && !blockersQuery.data ? (
          <p className="text-xs opacity-90">
            Validating mailbox, verification, eligible leads, content, credits,
            and deliverability…
          </p>
        ) : blockersQuery.isError ? (
          <p className="text-xs opacity-90">
            Could not load launch blockers from the server. Try Refresh.
          </p>
        ) : issueCounts.total > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {safetyChecks
              .filter((c) => c.status === 'blocking' || c.status === 'warning')
              .map((check) => (
                <li
                  key={check.id}
                  className="flex items-start gap-2 text-sm"
                >
                  {check.status === 'blocking' ? (
                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  )}
                  <span>
                    <span className="font-medium">{check.failLabel}</span>
                    {check.detail && check.detail !== check.failLabel
                      ? ` — ${check.detail}`
                      : null}
                    <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide opacity-80">
                      {check.status === 'blocking' ? 'Blocking' : 'Warning'}
                    </span>
                  </span>
                </li>
              ))}
            {blockers
              .filter(
                (b) =>
                  !safetyChecks.some(
                    (c) =>
                      (c.status === 'blocking' || c.status === 'warning') &&
                      (c.detail === b ||
                        c.failLabel.toLowerCase().includes(b.toLowerCase().slice(0, 12))),
                  ),
              )
              .map((blocker) => (
                <li
                  key={blocker}
                  className="flex items-start gap-2 text-sm"
                >
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>{blocker}</span>
                </li>
              ))}
          </ul>
        ) : ready ? (
          <p className="text-xs opacity-90">
            All safety checks passed. You can submit for approval or launch
            Autopilot.
          </p>
        ) : null}
      </div>

      {mode === 'autopilot' ? (
        <div
          role="status"
          className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sky-950 shadow-sm"
        >
          <div className="flex items-start gap-2">
            <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">Runs in the cloud</p>
              <p className="text-sm text-sky-900">
                Campaign runs automatically in the cloud. Closing your browser
                or turning off your computer will not stop it.
              </p>
              <p className="text-xs text-sky-800">{scheduleLabel}</p>
            </div>
          </div>
        </div>
      ) : null}

      {mode === 'approval' ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
          <p className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-amber-700" />
            Approval required — campaign will not send yet
          </p>
          <p className="mt-1 text-xs text-amber-900">
            Owners and admins will be notified. Status becomes{' '}
            <strong>Needs Review</strong>. An admin must use Approve &amp; launch
            before any emails are sent.
          </p>
        </div>
      ) : null}

      <LaunchSummaryCard summary={summary} />

      {data.channels.ads && budgetCheck.valid && budgetCheck.summary ? (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
          Ad spend duration: {budgetCheck.summary}
        </p>
      ) : null}

      {data.channels.ads && !budgetCheck.valid ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {budgetCheck.message}
        </p>
      ) : null}

      {disabledReason && confirmDisabled && mode !== 'draft' ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {disabledReason}
        </p>
      ) : null}

      <Button
        type="button"
        className="h-auto w-full flex-col items-start gap-1 px-4 py-3"
        disabled={confirmDisabled}
        onClick={() => setConfirmOpen(true)}
        title={disabledReason ?? confirmLabel}
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          {mode === 'draft' ? (
            <FileText className="h-4 w-4" />
          ) : mode === 'approval' ? (
            <ShieldCheck className="h-4 w-4" />
          ) : (
            <Rocket className="h-4 w-4" />
          )}
          {busy ? 'Saving…' : confirmLabel}
        </span>
        <span className="text-left text-xs font-normal opacity-90">
          {confirmHint}
        </span>
      </Button>

      <LaunchConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        summary={summary}
        confirmLabel={confirmLabel}
        busy={busy}
        launchMode={mode}
        readinessNote={
          mode === 'approval'
            ? 'This submits for admin review. The campaign will not start sending until approved.'
            : mode === 'autopilot'
              ? ready
                ? 'All safety checks passed. Confirm to start Autopilot.'
                : undefined
              : 'Saves the campaign as a draft. No emails will be sent.'
        }
        onConfirm={() => {
          setConfirmOpen(false);
          onConfirm();
        }}
      />

      <CampaignControls
        status="DRAFT"
        dailyLimit={data.audience.dailySendingLimit}
        onDailyLimitChange={(value) =>
          onChange({
            audience: { ...data.audience, dailySendingLimit: value },
          })
        }
        safetyChecks={
          campaignId && blockersQuery.isSuccess
            ? safetyChecks
            : resolveSafetyChecks({ assumePassedWhenUnknown: false })
        }
      />
    </div>
  );
}
