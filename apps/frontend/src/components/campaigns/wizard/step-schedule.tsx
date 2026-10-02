'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { TimePicker } from '@/components/ui/time-picker';
import { isOvernightTimeRangeValid } from '@/lib/time-range';
import type { CampaignWizardData } from '@/types/campaigns';
import { cn } from '@/lib/utils';

type StepScheduleProps = {
  data: CampaignWizardData;
  onChange: (patch: Partial<CampaignWizardData>) => void;
};

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'UTC',
  'Europe/London',
];

const START_OPTIONS: {
  value: CampaignWizardData['schedule']['startOption'];
  label: string;
  description: string;
}[] = [
  { value: 'now', label: 'Start now', description: 'Begin sending as soon as launched' },
  { value: 'later', label: 'Schedule for later', description: 'Pick a specific start date/time' },
  { value: 'countdown', label: 'Countdown', description: 'Start after a delay window' },
];

export function StepSchedule({ data, onChange }: StepScheduleProps) {
  const update = (patch: Partial<CampaignWizardData['schedule']>) =>
    onChange({ schedule: { ...data.schedule, ...patch } });

  const quietValid = isOvernightTimeRangeValid(
    data.schedule.quietHoursStart,
    data.schedule.quietHoursEnd,
  );

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-navy">Schedule</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Choose when outreach begins and set quiet hours.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {START_OPTIONS.map((opt) => {
          const active = data.schedule.startOption === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => update({ startOption: opt.value })}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors',
                active
                  ? 'border-primary bg-accent'
                  : 'border-border hover:border-navy/30',
              )}
            >
              <p className="text-sm font-medium text-navy">{opt.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>

      {data.schedule.startOption === 'later' ? (
        <div className="space-y-1.5">
          <Label htmlFor="start-at">Start date &amp; time</Label>
          <Input
            id="start-at"
            type="datetime-local"
            value={data.schedule.startAt}
            onChange={(e) => update({ startAt: e.target.value })}
          />
        </div>
      ) : null}

      {data.schedule.startOption === 'countdown' ? (
        <div className="space-y-1.5">
          <Label htmlFor="countdown">Countdown (hours)</Label>
          <Input
            id="countdown"
            type="number"
            min={1}
            max={168}
            value={data.schedule.countdownHours}
            onChange={(e) =>
              update({ countdownHours: Number(e.target.value) || 1 })
            }
            className="max-w-[200px]"
          />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="tz">Time zone</Label>
        <Select
          id="tz"
          value={data.schedule.timeZone}
          onChange={(e) => update({ timeZone: e.target.value })}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="quiet-start">Quiet hours start</Label>
          <TimePicker
            id="quiet-start"
            value={data.schedule.quietHoursStart}
            onChange={(value) => update({ quietHoursStart: value })}
            aria-invalid={!quietValid}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quiet-end">Quiet hours end</Label>
          <TimePicker
            id="quiet-end"
            value={data.schedule.quietHoursEnd}
            onChange={(value) => update({ quietHoursEnd: value })}
            aria-invalid={!quietValid}
          />
        </div>
      </div>
      {!quietValid ? (
        <p className="text-sm text-red-700">
          Quiet hours start and end cannot be the same time.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          No sending between {data.schedule.quietHoursStart} and{' '}
          {data.schedule.quietHoursEnd} (overnight windows are allowed).
        </p>
      )}
    </div>
  );
}
