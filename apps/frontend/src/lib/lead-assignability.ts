const ALLOWED_BY_DEFAULT = new Set(['VERIFIED', 'CATCH_ALL']);

export function leadVerificationStatus(lead: {
  verification_status?: string | null;
  contact?: { verification_status?: string | null };
}): string {
  return (
    lead.verification_status ||
    lead.contact?.verification_status ||
    'PENDING'
  ).toUpperCase();
}

export function isLeadAssignableByDefault(lead: {
  verification_status?: string | null;
  contact?: { verification_status?: string | null };
}) {
  return ALLOWED_BY_DEFAULT.has(leadVerificationStatus(lead));
}

export function leadAssignBlockReason(lead: {
  verification_status?: string | null;
  contact?: { verification_status?: string | null };
}) {
  const status = leadVerificationStatus(lead);
  if (ALLOWED_BY_DEFAULT.has(status)) return null;
  if (status === 'INVALID') {
    return 'Invalid contacts cannot be assigned to a campaign.';
  }
  if (status === 'PENDING') {
    return 'Unverified contacts are blocked until email verification completes.';
  }
  if (status === 'RISKY') {
    return 'Risky contacts are excluded from campaigns by default.';
  }
  return `${status} contacts cannot be assigned to a campaign by default.`;
}
