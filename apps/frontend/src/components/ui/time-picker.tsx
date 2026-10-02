'use client';

import { cn } from '@/lib/utils';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

function partsOf(value: string) {
  const [hour = '09', minute = '00'] = (value || '09:00').split(':');
  const normalizedMinute = MINUTES.includes(minute)
    ? minute
    : String(Math.round(Number(minute) / 15) * 15).padStart(2, '0');
  return {
    hour: HOURS.includes(hour) ? hour : '09',
    minute: MINUTES.includes(normalizedMinute) ? normalizedMinute : '00',
  };
}

type TimePickerProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  'aria-invalid'?: boolean;
};

export function TimePicker({
  id,
  value,
  onChange,
  disabled,
  className,
  ...props
}: TimePickerProps) {
  const parts = partsOf(value);

  const emit = (hour: string, minute: string) => {
    onChange(`${hour}:${minute}`);
  };

  return (
    <div
      className={cn(
        'flex h-10 items-center gap-1 rounded-md border border-input bg-background px-2',
        disabled && 'opacity-50',
        className,
      )}
    >
      <select
        id={id}
        aria-label="Hour"
        disabled={disabled}
        value={parts.hour}
        onChange={(e) => emit(e.target.value, parts.minute)}
        aria-invalid={props['aria-invalid']}
        className="h-8 rounded-sm bg-transparent px-1 text-sm text-navy outline-none"
      >
        {HOURS.map((hour) => (
          <option key={hour} value={hour}>
            {hour}
          </option>
        ))}
      </select>
      <span className="text-sm font-medium text-navy">:</span>
      <select
        aria-label="Minutes"
        disabled={disabled}
        value={parts.minute}
        onChange={(e) => emit(parts.hour, e.target.value)}
        className="h-8 rounded-sm bg-transparent px-1 text-sm text-navy outline-none"
      >
        {MINUTES.map((minute) => (
          <option key={minute} value={minute}>
            {minute}
          </option>
        ))}
      </select>
    </div>
  );
}
