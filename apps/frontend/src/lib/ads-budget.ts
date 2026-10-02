export type AdsBudgetCheck = {
  daily: number;
  total: number;
  days: number;
  valid: boolean;
  message: string | null;
  summary: string | null;
};

export function formatUsd(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

export function checkAdsBudget(dailyBudget: number, totalBudget: number): AdsBudgetCheck {
  const daily = Number.isFinite(dailyBudget) ? dailyBudget : 0;
  const total = Number.isFinite(totalBudget) ? totalBudget : 0;

  if (daily <= 0 || total <= 0) {
    return {
      daily,
      total,
      days: 0,
      valid: false,
      message: 'Enter a daily budget and a total ad budget greater than $0.',
      summary: null,
    };
  }

  if (total < daily) {
    return {
      daily,
      total,
      days: 0,
      valid: false,
      message: `Total ad budget (${formatUsd(total)}) cannot be lower than daily budget (${formatUsd(daily)}).`,
      summary: null,
    };
  }

  const days = Math.floor(total / daily);
  const remainder = Math.round((total - days * daily) * 100) / 100;
  const summary =
    remainder > 0
      ? `${formatUsd(daily)}/day × ${days} days = ${formatUsd(days * daily)} (${formatUsd(remainder)} leftover)`
      : `${formatUsd(daily)}/day × ${days} days = ${formatUsd(total)}`;

  return {
    daily,
    total,
    days,
    valid: true,
    message: null,
    summary,
  };
}
