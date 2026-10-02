import type { LeadSourceId } from '@/types/campaigns';

export type ConnectionBlock = {
  connected: boolean;
  accountEmail?: string | null;
  via?: string | null;
  detail?: string | null;
};

export type IntegrationsStatus = {
  gmail?: ConnectionBlock;
  microsoft?: ConnectionBlock;
  hunter?: ConnectionBlock;
  googleCalendar?: ConnectionBlock;
  metaAds?: ConnectionBlock;
  smtpConfigured?: boolean;
};

export type SourceConnectionState = {
  /** Can be marked Active without leaving the wizard */
  available: boolean;
  /** Short status for the tile */
  statusLabel: 'Active' | 'Available' | 'Connect' | 'Configure';
  /** Why Connect/Configure is needed */
  reason?: string;
  /** Where to send the user to finish setup */
  href?: string;
};

/**
 * Which sources need a live integration before they can be "Active".
 * Always-available sources (CSV, existing leads, manual) need no connection.
 */
export function getSourceConnectionState(
  sourceId: LeadSourceId,
  status: IntegrationsStatus | null | undefined,
  options?: { crmConnected?: boolean; isActive?: boolean },
): SourceConnectionState {
  const active = Boolean(options?.isActive);
  const href = '/integrations';

  if (sourceId === 'hunter') {
    const ok = Boolean(status?.hunter?.connected);
    if (ok) {
      return {
        available: true,
        statusLabel: active ? 'Active' : 'Available',
      };
    }
    return {
      available: false,
      statusLabel: 'Connect',
      reason: 'Connect Hunter.io (or Apollo) under Integrations before using Lead Providers.',
      href,
    };
  }

  if (sourceId === 'marketplace') {
    const ok = Boolean(status?.metaAds?.connected);
    if (ok) {
      return {
        available: true,
        statusLabel: active ? 'Active' : 'Available',
      };
    }
    return {
      available: false,
      statusLabel: 'Configure',
      reason: 'Connect Meta Ads (or another ad lead source) under Integrations.',
      href,
    };
  }

  if (sourceId === 'crm') {
    const emailOk =
      Boolean(status?.gmail?.connected) ||
      Boolean(status?.microsoft?.connected) ||
      Boolean(status?.smtpConfigured);
    const ok = emailOk || Boolean(options?.crmConnected);
    if (ok) {
      return {
        available: true,
        statusLabel: active ? 'Active' : 'Available',
      };
    }
    return {
      available: false,
      statusLabel: 'Connect',
      reason: 'Connect Gmail, Microsoft 365, or mark CRM as connected before importing CRM contacts.',
      href,
    };
  }

  if (sourceId === 'social') {
    // No LinkedIn/social OAuth in status API yet — require Integrations visit.
    return {
      available: false,
      statusLabel: 'Configure',
      reason: 'Social engagement needs a connected LinkedIn/social account. Configure under Integrations.',
      href,
    };
  }

  if (sourceId === 'google_places') {
    // Places may use server API keys; treat as available but hint configure if hunter-style keys missing.
    return {
      available: true,
      statusLabel: active ? 'Active' : 'Available',
      reason: active
        ? undefined
        : 'Uses Google Places when API keys are configured on the server.',
    };
  }

  // csv, website_visitors, webforms, existing, manual — always usable
  return {
    available: true,
    statusLabel: active ? 'Active' : 'Available',
  };
}
