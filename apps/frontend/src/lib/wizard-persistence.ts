import type { CampaignWizardData } from '@/types/campaigns';
import { DEFAULT_WIZARD_DATA } from '@/lib/campaigns-mock';

const STORAGE_KEY = 'flacron.campaign-wizard.draft.v1';

type WizardDraft = {
  data: CampaignWizardData;
  step: number;
  draftCampaignId: string | null;
  savedAt: number;
};

function isBrowser() {
  return typeof window !== 'undefined';
}

/** Deep-merge nested wizard slices so step patches never wipe sibling fields. */
export function mergeWizardData(
  prev: CampaignWizardData,
  partial: Partial<CampaignWizardData>,
): CampaignWizardData {
  return {
    ...prev,
    ...partial,
    audience: partial.audience
      ? { ...prev.audience, ...partial.audience }
      : prev.audience,
    schedule: partial.schedule
      ? { ...prev.schedule, ...partial.schedule }
      : prev.schedule,
    channels: partial.channels
      ? { ...prev.channels, ...partial.channels }
      : prev.channels,
    ads: partial.ads ? { ...prev.ads, ...partial.ads } : prev.ads,
    eligibility: partial.eligibility
      ? { ...prev.eligibility, ...partial.eligibility }
      : prev.eligibility,
    documents: partial.documents ?? prev.documents,
    leadSources: partial.leadSources ?? prev.leadSources,
    selectedLeadIds: partial.selectedLeadIds ?? prev.selectedLeadIds,
    sequence: partial.sequence ?? prev.sequence,
  };
}

export function loadWizardDraft(): WizardDraft | null {
  if (!isBrowser()) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardDraft;
    if (!parsed?.data || typeof parsed.step !== 'number') return null;
    return {
      data: mergeWizardData(DEFAULT_WIZARD_DATA, parsed.data),
      step: parsed.step,
      draftCampaignId: parsed.draftCampaignId ?? null,
      savedAt: parsed.savedAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveWizardDraft(draft: Omit<WizardDraft, 'savedAt'>) {
  if (!isBrowser()) return;
  try {
    const payload: WizardDraft = { ...draft, savedAt: Date.now() };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota / private mode — ignore
  }
}

export function clearWizardDraft() {
  if (!isBrowser()) return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
