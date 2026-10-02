export type SafetyCheckSeverity = 'critical' | 'warning';
export type SafetyCheckStatus = 'passed' | 'warning' | 'blocking' | 'unknown';

export type SafetyCheckDef = {
  id: string;
  /** Affirmative label when the check is healthy */
  passLabel: string;
  /** Problem-oriented label when the check fails */
  failLabel: string;
  severity: SafetyCheckSeverity;
};

export type SafetyCheckView = SafetyCheckDef & {
  status: SafetyCheckStatus;
  detail?: string;
};

/** Canonical launch safety checks shown in the wizard and campaign settings. */
export const SAFETY_CHECK_DEFS: SafetyCheckDef[] = [
  {
    id: 'mailbox',
    passLabel: 'Mailbox connected',
    failLabel: 'No mailbox connected',
    severity: 'critical',
  },
  {
    id: 'dns',
    passLabel: 'SPF/DKIM/DMARC healthy',
    failLabel: 'SPF/DKIM/DMARC issues',
    severity: 'warning',
  },
  {
    id: 'bounce',
    passLabel: 'Bounce rate healthy',
    failLabel: 'Bounce rate is high',
    severity: 'warning',
  },
  {
    id: 'credits',
    passLabel: 'Credits available',
    failLabel: 'Insufficient credits',
    severity: 'critical',
  },
  {
    id: 'auth',
    passLabel: 'Mailbox auth valid',
    failLabel: 'Mailbox auth expired',
    severity: 'critical',
  },
];

const BLOCKER_MATCHERS: Record<string, RegExp[]> = {
  mailbox: [
    /mailbox.*(disconnect|not connected|no connected|missing)/i,
    /no (connected )?mailbox/i,
    /mailbox is disconnected/i,
  ],
  dns: [/deliverability/i, /spf/i, /dkim/i, /dmarc/i],
  bounce: [/bounce/i],
  credits: [/credit/i],
  auth: [/auth/i, /token.*expir/i, /authentication/i],
};

export type LaunchChecksPayload = {
  mailboxConnected?: boolean;
  mailboxAuthValid?: boolean;
  deliverabilitySafe?: boolean;
  creditsSufficient?: boolean;
  bounceRateHealthy?: boolean;
};

function statusFromBoolean(
  ok: boolean | undefined,
  severity: SafetyCheckSeverity,
  known: boolean,
): SafetyCheckStatus {
  if (!known || ok === undefined) return 'unknown';
  if (ok) return 'passed';
  return severity === 'critical' ? 'blocking' : 'warning';
}

function matchBlocker(id: string, blockers: string[]): string | undefined {
  const patterns = BLOCKER_MATCHERS[id] ?? [];
  return blockers.find((b) => patterns.some((re) => re.test(b)));
}

/**
 * Build display state for safety checks from API blockers and/or structured checks.
 * Problem labels only appear when a check is failing — never with a green success icon.
 */
export function resolveSafetyChecks(input: {
  blockers?: string[];
  checks?: LaunchChecksPayload | null;
  overrides?: Partial<Record<string, boolean>>;
  /** When false, checks that have no signal stay unknown instead of passed */
  assumePassedWhenUnknown?: boolean;
}): SafetyCheckView[] {
  const blockers = input.blockers ?? [];
  const checks = input.checks ?? null;
  const assumePassed = input.assumePassedWhenUnknown !== false;

  return SAFETY_CHECK_DEFS.map((def) => {
    const override = input.overrides?.[def.id];
    if (override === true) {
      return {
        ...def,
        status: def.severity === 'critical' ? 'blocking' : 'warning',
        detail: def.failLabel,
      };
    }
    if (override === false) {
      return { ...def, status: 'passed' as const };
    }

    if (checks) {
      const map: Record<string, boolean | undefined> = {
        mailbox: checks.mailboxConnected,
        auth: checks.mailboxAuthValid ?? checks.mailboxConnected,
        dns: checks.deliverabilitySafe,
        credits: checks.creditsSufficient,
        bounce: checks.bounceRateHealthy,
      };
      const value = map[def.id];
      if (value !== undefined) {
        return {
          ...def,
          status: statusFromBoolean(value, def.severity, true),
          detail: value ? undefined : def.failLabel,
        };
      }
    }

    const hit = matchBlocker(def.id, blockers);
    if (hit) {
      return {
        ...def,
        status: def.severity === 'critical' ? 'blocking' : 'warning',
        detail: hit,
      };
    }

    if (assumePassed && (blockers.length > 0 || checks || input.overrides)) {
      // We have live signal elsewhere; unmatched checks are healthy.
      return { ...def, status: 'passed' };
    }

    return {
      ...def,
      status: assumePassed ? 'passed' : 'unknown',
    };
  });
}

export function countSafetyIssues(checks: SafetyCheckView[]) {
  const blocking = checks.filter((c) => c.status === 'blocking').length;
  const warnings = checks.filter((c) => c.status === 'warning').length;
  return { blocking, warnings, total: blocking + warnings };
}

export function hasCriticalSafetyFailures(checks: SafetyCheckView[]) {
  return checks.some(
    (c) => c.status === 'blocking' && c.severity === 'critical',
  );
}

export function parseLaunchBlockersResponse(
  result: unknown,
): { blockers: string[]; checks: LaunchChecksPayload | null } {
  if (Array.isArray(result)) {
    return { blockers: result.filter((b) => typeof b === 'string'), checks: null };
  }
  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>;
    const blockers = Array.isArray(obj.blockers)
      ? obj.blockers.filter((b): b is string => typeof b === 'string')
      : [];
    const rawChecks =
      obj.checks && typeof obj.checks === 'object' && !Array.isArray(obj.checks)
        ? (obj.checks as Record<string, unknown>)
        : null;
    const checks: LaunchChecksPayload | null = rawChecks
      ? {
          mailboxConnected:
            typeof rawChecks.mailboxConnected === 'boolean'
              ? rawChecks.mailboxConnected
              : undefined,
          mailboxAuthValid:
            typeof rawChecks.mailboxAuthValid === 'boolean'
              ? rawChecks.mailboxAuthValid
              : undefined,
          deliverabilitySafe:
            typeof rawChecks.deliverabilitySafe === 'boolean'
              ? rawChecks.deliverabilitySafe
              : undefined,
          creditsSufficient:
            typeof rawChecks.creditsSufficient === 'boolean'
              ? rawChecks.creditsSufficient
              : undefined,
          bounceRateHealthy:
            typeof rawChecks.bounceRateHealthy === 'boolean'
              ? rawChecks.bounceRateHealthy
              : undefined,
        }
      : null;
    return { blockers, checks };
  }
  return { blockers: [], checks: null };
}
