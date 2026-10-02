/** Shared copy for lead eligibility / assignment counts in the wizard. */
export const LEAD_COUNT_HELP: Record<string, string> = {
  eligible:
    'Leads that pass verification rules and can be assigned to this campaign (typically Verified and Catch-all).',
  blocked:
    'Leads that cannot be assigned yet — invalid, risky, pending verification, suppressed, or excluded.',
  assigned:
    'Leads you have selected to include in this campaign. These are the contacts that will enter the sequence.',
  verified:
    'Email verified as deliverable. Prefer these for outbound sending.',
  catchAll:
    'Domain accepts all addresses (catch-all). Deliverable is uncertain — review before heavy sending.',
  risky:
    'Verification flagged risk (role accounts, disposable domains, etc.). Excluded from sends by default.',
  pending:
    'Verification has not finished yet. Finish verification before launching.',
  invalid:
    'Email failed verification and should not be emailed.',
  duplicates:
    'Duplicate contacts already present in the workspace or selection.',
  suppressed:
    'On the suppression list (bounce, unsubscribe, complaint) — never send.',
  excluded:
    'Sum of leads held out of sending (risky, invalid, duplicate, suppressed).',
};
