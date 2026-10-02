'use client';

import { useEffect, useState, type FormEvent, type MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/store/toastStore';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { WizardStepper } from '@/components/campaigns/wizard/wizard-stepper';
import { StepDetails } from '@/components/campaigns/wizard/step-details';
import { StepAudience } from '@/components/campaigns/wizard/step-audience';
import { StepLeads } from '@/components/campaigns/wizard/step-leads';
import { StepChannels } from '@/components/campaigns/wizard/step-channels';
import { StepSequence } from '@/components/campaigns/wizard/step-sequence';
import { StepSchedule } from '@/components/campaigns/wizard/step-schedule';
import { StepReview } from '@/components/campaigns/wizard/step-review';
import { StepLaunch } from '@/components/campaigns/wizard/step-launch';
import {
  DEFAULT_WIZARD_DATA,
  MOCK_MAILBOXES,
  mockEligibilityFromSources,
} from '@/lib/campaigns-mock';
import { isOvernightTimeRangeValid, isSameDayTimeRangeValid } from '@/lib/time-range';
import { checkAdsBudget } from '@/lib/ads-budget';
import {
  hasCriticalSafetyFailures,
  parseLaunchBlockersResponse,
  resolveSafetyChecks,
} from '@/lib/safety-checks';
import {
  clearWizardDraft,
  loadWizardDraft,
  mergeWizardData,
  saveWizardDraft,
} from '@/lib/wizard-persistence';
import {
  CAMPAIGN_GOALS,
  WIZARD_STEP,
  WIZARD_STEPS,
  type AdCreative,
  type AdPlatformId,
  type CampaignWizardData,
  type LeadSourceId,
} from '@/types/campaigns';

type LaunchMode = 'draft' | 'approval' | 'autopilot';

type CreateCampaignResponse = {
  campaignId: string;
  id?: string;
  status?: string;
};

type AssignLeadsResponse = {
  updated: number;
  skipped: number;
};

/** Consolidated payload sent to POST /api/campaigns */
function buildCampaignRequestBody(data: CampaignWizardData) {
  const mailbox =
    data.mailbox ||
    MOCK_MAILBOXES.find((m) => m.id === data.audience.mailboxId)?.email ||
    MOCK_MAILBOXES.find((m) => m.id === data.audience.mailboxId)?.label ||
    data.audience.mailboxId;

  const calendarLink = data.calendarLink || data.audience.calendarLink || '';

  return {
    name: data.name.trim(),
    goal: data.goal,
    product: data.product,
    ai_prompt: data.aiPrompt,
    prompt: data.aiPrompt,
    aiPrompt: data.aiPrompt,
    audience: {
      ...data.audience,
      industry: data.audience.industries,
      location: data.audience.locations,
      companySize: data.audience.companySizes,
      jobTitles: data.audience.jobTitles,
      minLeadScore: data.audience.minLeadScore,
      verificationStatuses: data.audience.allowedVerification,
    },
    sequence: data.sequence,
    schedule: {
      ...data.schedule,
      dailySendLimit: data.audience.dailySendingLimit,
      timezone: data.schedule.timeZone,
      quietHours: {
        start: data.schedule.quietHoursStart,
        end: data.schedule.quietHoursEnd,
      },
      startDate: data.schedule.startAt,
      startMode: data.schedule.startOption,
    },
    mailbox,
    calendarLink,
    approvalMode: data.launchMode === 'approval' || data.approvalMode,
    launchMode: data.launchMode,
    leadSources: data.leadSources,
    eligibility: data.eligibility,
    website: data.website,
    offer: data.offer,
    pricing: data.pricing,
    budget: data.budget,
    brandTone: data.brandTone,
    documents: data.documents,
    channels: data.channels,
    ads: data.ads,
    crmConnected: data.crmConnected,
  };
}

function extractApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body;
    if (body && typeof body === 'object') {
      const msg = (body as { message?: string | string[] }).message;
      if (Array.isArray(msg) && msg.length > 0) return msg.join(', ');
      if (typeof msg === 'string' && msg.trim()) return msg;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

export default function NewCampaignWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Single consolidated wizard state across all steps (session-persisted after hydrate)
  const [data, setData] = useState<CampaignWizardData>(DEFAULT_WIZARD_DATA);
  const [step, setStep] = useState(1);
  const [draftCampaignId, setDraftCampaignId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [generatingDetails, setGeneratingDetails] = useState(false);
  const [generatingSequence, setGeneratingSequence] = useState(false);
  const [generatingAds, setGeneratingAds] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [validationHint, setValidationHint] = useState<string | null>(null);

  useEffect(() => {
    const restored = loadWizardDraft();
    if (restored) {
      setData(restored.data);
      setStep(restored.step);
      setDraftCampaignId(restored.draftCampaignId);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveWizardDraft({ data, step, draftCampaignId });
  }, [data, step, draftCampaignId, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const name = searchParams.get('name');
    const leads = Number(searchParams.get('leads') || 0);
    const ads = searchParams.get('ads');
    if (!name && !leads && !ads) return;
    // URL params only seed empty drafts so they never wipe AI/manual progress
    setData((prev) => {
      const hasProgress =
        Boolean(prev.name.trim()) ||
        prev.selectedLeadIds.length > 0 ||
        Boolean(prev.aiPrompt.trim());
      if (hasProgress && !name && !ads) return prev;
      return mergeWizardData(prev, {
        name: name || prev.name,
        leadSources: leads > 0 ? ['existing'] : prev.leadSources,
        channels:
          ads === '1'
            ? { ...prev.channels, ads: true, email: true }
            : prev.channels,
        eligibility:
          leads > 0 && prev.selectedLeadIds.length === 0
            ? {
                total: leads,
                verified: Math.max(0, leads - Math.ceil(leads * 0.2)),
                catchAll: Math.ceil(leads * 0.1),
                risky: Math.ceil(leads * 0.05),
                invalid: Math.ceil(leads * 0.03),
                duplicates: Math.ceil(leads * 0.02),
                suppressed: 0,
                excluded:
                  Math.ceil(leads * 0.05) +
                  Math.ceil(leads * 0.03) +
                  Math.ceil(leads * 0.02),
                unsubscribed: 0,
              }
            : prev.eligibility,
      });
    });
    if (leads > 0) setStep((s) => (s === 1 ? WIZARD_STEP.SOURCES : s));
  }, [searchParams, hydrated]);

  const patch = (partial: Partial<CampaignWizardData>) => {
    setData((prev) => mergeWizardData(prev, partial));
    setValidationHint(null);
  };

  const ensureCampaignCreated = async (): Promise<string> => {
    if (draftCampaignId) return draftCampaignId;

    if (!data.name.trim()) {
      throw new Error('Campaign name is required before assigning leads');
    }

    const body = buildCampaignRequestBody(data);
    console.log('[Campaign Wizard] POST /api/campaigns (draft for leads)', body);

    const created = await api.post<CreateCampaignResponse>('/campaigns', body);
    const campaignId = created.campaignId || created.id;
    if (!campaignId) {
      throw new Error('Server did not return a campaignId');
    }
    setDraftCampaignId(campaignId);
    return campaignId;
  };

  const assignSelectedLeads = async (campaignId: string) => {
    if (data.selectedLeadIds.length === 0) {
      throw new Error('Select at least one lead to assign');
    }

    const payload = { leadIds: data.selectedLeadIds };
    console.log(
      `[Campaign Wizard] POST /api/campaigns/${campaignId}/leads`,
      payload,
    );

    const result = await api.post<AssignLeadsResponse>(
      `/campaigns/${campaignId}/leads`,
      payload,
    );

    if (result.updated === 0) {
      throw new Error(
        result.skipped > 0
          ? `None of the ${result.skipped} lead(s) could be assigned`
          : 'No leads were assigned to the campaign',
      );
    }

    return result;
  };

  const goBack = (event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    setStep((s) => Math.max(1, s - 1));
  };

  const goNext = async (event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    const blocked = nextBlockedReason();
    if (blocked) {
      setValidationHint(blocked);
      toast(blocked, 'error');
      return;
    }
    if (busy) return;
    setValidationHint(null);

    // Leaving Sources: create campaign (if needed) and assign selected leads
    if (step === WIZARD_STEP.SOURCES) {
      setBusy(true);
      setMessage(null);
      try {
        const campaignId = await ensureCampaignCreated();
        const result = await assignSelectedLeads(campaignId);
        toast(
          `Assigned ${result.updated} lead${result.updated === 1 ? '' : 's'} to campaign`,
          'success',
        );
        setMessage(
          `Assigned ${result.updated} lead${result.updated === 1 ? '' : 's'}${
            result.skipped ? ` (${result.skipped} skipped)` : ''
          }.`,
        );
      } catch (error) {
        const detail = extractApiErrorMessage(error);
        toast(`Failed to assign leads: ${detail}`, 'error');
        setMessage(`Failed to assign leads: ${detail}`);
        setBusy(false);
        return;
      } finally {
        setBusy(false);
      }
    }

    const persistSteps = [
      WIZARD_STEP.CHANNELS,
      WIZARD_STEP.OUTREACH,
      WIZARD_STEP.SCHEDULE,
      WIZARD_STEP.REVIEW,
    ];
    if (persistSteps.includes(step as (typeof persistSteps)[number])) {
      setBusy(true);
      setMessage(null);
      try {
        const campaignId = await ensureCampaignCreated();
        await api.patch(`/campaigns/${campaignId}`, buildCampaignRequestBody(data));
      } catch (error) {
        const detail = extractApiErrorMessage(error);
        toast(`Failed to save campaign: ${detail}`, 'error');
        setMessage(`Failed to save campaign: ${detail}`);
        setBusy(false);
        return;
      } finally {
        setBusy(false);
      }
    }

    setStep((s) => Math.min(WIZARD_STEP.LAUNCH, s + 1));
  };

  const handleGenerateDetails = async () => {
    if (!data.aiPrompt.trim()) {
      toast('Enter a campaign prompt first', 'error');
      return;
    }
    setGeneratingDetails(true);
    setMessage(null);
    try {
      type GenerateDetailsResponse = {
        name?: string;
        goal?: CampaignWizardData['goal'] | string;
        product?: string;
        website?: string;
        offer?: string;
        pricing?: string;
        budget?: number;
        brandTone?: string;
        audience?: {
          industries?: string[];
          locations?: string[];
          jobTitles?: string[];
          minLeadScore?: number;
          allowedVerification?: string[];
          industry?: string[];
          location?: string[];
          job_titles?: string[];
          min_lead_score?: number;
          allowed_verification?: string[];
        };
        data?: GenerateDetailsResponse;
        result?: GenerateDetailsResponse;
      };

      const payload = await api.post<GenerateDetailsResponse>(
        '/campaigns/ai/generate-details',
        {
          prompt: data.aiPrompt,
          productHint: data.product || undefined,
        },
      );

      const generated =
        payload?.name || payload?.audience
          ? payload
          : payload?.data?.name || payload?.data?.audience
            ? payload.data
            : payload?.result?.name || payload?.result?.audience
              ? payload.result
              : payload;

      const name = (generated?.name || '').trim();
      const product = (generated?.product || '').trim();
      const goalRaw = String(generated?.goal || '')
        .toLowerCase()
        .trim()
        .replace(/[\s-]+/g, '_');
      const goal = (
        [
          'book_meetings',
          'collect_replies',
          'nurture',
          'announce',
          'reengage',
          'win_customers',
        ] as const
      ).includes(goalRaw as (typeof CAMPAIGN_GOALS)[number]['value'])
        ? (goalRaw as CampaignWizardData['goal'])
        : '';

      const audience = generated?.audience ?? {};
      const industries =
        audience.industries ?? audience.industry ?? [];
      const locations = audience.locations ?? audience.location ?? [];
      const jobTitles =
        audience.jobTitles ?? audience.job_titles ?? [];
      const minLeadScore =
        audience.minLeadScore ?? audience.min_lead_score;
      const allowedVerification =
        audience.allowedVerification ?? audience.allowed_verification;

      if (!name) {
        throw new Error(
          'AI returned empty campaign details. Try a clearer prompt.',
        );
      }

      setData((prev) =>
        mergeWizardData(prev, {
          name,
          goal: goal || prev.goal || 'book_meetings',
          product: product || prev.product,
          website: (generated?.website || prev.website).trim(),
          offer: (generated?.offer || prev.offer).trim(),
          pricing: (generated?.pricing || prev.pricing).trim(),
          budget:
            typeof generated?.budget === 'number' && Number.isFinite(generated.budget)
              ? generated.budget
              : prev.budget,
          brandTone: (['Professional', 'Friendly', 'Direct', 'Consultative', 'Bold'] as const).includes(
            (generated?.brandTone || '') as CampaignWizardData['brandTone'],
          )
            ? (generated?.brandTone as CampaignWizardData['brandTone'])
            : prev.brandTone,
          audience: {
            industries: Array.isArray(industries)
              ? industries
              : prev.audience.industries,
            locations: Array.isArray(locations)
              ? locations
              : prev.audience.locations,
            jobTitles: Array.isArray(jobTitles)
              ? jobTitles
              : prev.audience.jobTitles,
            minLeadScore:
              typeof minLeadScore === 'number' && Number.isFinite(minLeadScore)
                ? minLeadScore
                : prev.audience.minLeadScore,
            allowedVerification: Array.isArray(allowedVerification)
              ? allowedVerification
              : prev.audience.allowedVerification,
          },
        }),
      );

      const targetingBits = [
        Array.isArray(industries) && industries.length
          ? `${industries.length} industries`
          : null,
        Array.isArray(locations) && locations.length
          ? `${locations.length} locations`
          : null,
        Array.isArray(jobTitles) && jobTitles.length
          ? `${jobTitles.length} job titles`
          : null,
      ].filter(Boolean);

      setMessage(
        `Campaign generated successfully — “${name}”` +
          (product ? ` · ${product}` : '') +
          (targetingBits.length ? ` · ${targetingBits.join(', ')}` : '') +
          '. Values stay filled when you move between steps.',
      );
      toast('Campaign generated successfully', 'success');
    } catch (error) {
      const detail = extractApiErrorMessage(error);
      toast(`AI generate failed: ${detail}`, 'error');
      setMessage(`Failed to generate with AI: ${detail}`);
    } finally {
      setGeneratingDetails(false);
    }
  };

  const handleGenerateSequence = async () => {
    const prompt =
      data.aiPrompt.trim() ||
      [data.name, data.goal, data.product].filter(Boolean).join(' — ');
    if (prompt.length < 8) {
      toast('Add a campaign prompt or name/product first', 'error');
      return;
    }
    setGeneratingSequence(true);
    setMessage(null);
    try {
      const generated = await api.post<{
        steps: Array<{
          type: string;
          subject: string;
          body: string;
          delayDays: number;
          conditions: string;
        }>;
      }>('/campaigns/ai/generate-sequence', {
        prompt,
        name: data.name,
        goal: data.goal || 'book_meetings',
        product: data.product,
        calendarLink: data.calendarLink || data.audience.calendarLink,
      });
      const steps = (generated.steps ?? []).map((step, index) => ({
        id: `ai-step-${Date.now()}-${index + 1}`,
        step: index + 1,
        type: (['Initial', 'Follow-up', 'Case study', 'Final'].includes(step.type)
          ? step.type
          : index === 0
            ? 'Initial'
            : 'Follow-up') as CampaignWizardData['sequence'][number]['type'],
        subject: step.subject,
        body: step.body,
        delayDays: step.delayDays ?? (index === 0 ? 0 : index * 2),
        conditions: step.conditions || (index === 0 ? 'Always' : 'No reply'),
        attachments: [] as string[],
        approved: false,
      }));
      if (steps.length === 0) {
        throw new Error('AI returned no sequence steps');
      }
      patch({ sequence: steps });
      setMessage(`AI generated a ${steps.length}-step email sequence.`);
      toast('Sequence generated', 'success');
    } catch (error) {
      const detail = extractApiErrorMessage(error);
      toast(`AI sequence failed: ${detail}`, 'error');
      setMessage(`Failed to generate sequence: ${detail}`);
    } finally {
      setGeneratingSequence(false);
    }
  };

  const handleGenerateAds = async () => {
    const prompt =
      data.ads.prompt.trim() ||
      data.aiPrompt.trim() ||
      [data.name, data.offer, data.product, data.goal].filter(Boolean).join(' — ');
    if (prompt.length < 8) {
      toast('Add an ad prompt or campaign brief first', 'error');
      return;
    }
    if (data.ads.platforms.length === 0) {
      toast('Select at least one ad platform', 'error');
      return;
    }
    setGeneratingAds(true);
    setMessage(null);
    try {
      const generated = await api.post<{ creatives: AdCreative[] }>(
        '/campaigns/ai/generate-ads',
        {
          prompt,
          name: data.name,
          product: data.product,
          offer: data.offer,
          website: data.website,
          brandTone: data.brandTone,
          platforms: data.ads.platforms,
          dailyBudget: data.ads.dailyBudget,
          audience: data.audience,
        },
      );
      const creatives = (generated.creatives ?? []).map((item, index) => ({
        id: item.id || `ad-${Date.now()}-${index}`,
        platform: (data.ads.platforms.includes(item.platform as AdPlatformId)
          ? item.platform
          : data.ads.platforms[index % data.ads.platforms.length]) as AdPlatformId,
        headline: item.headline,
        primaryText: item.primaryText,
        description: item.description || '',
        cta: item.cta || 'Learn more',
        audience: item.audience || data.audience.jobTitles.join(', ') || 'ICP',
      }));
      if (creatives.length === 0) {
        throw new Error('AI returned no ad creatives');
      }
      patch({
        ads: { ...data.ads, prompt: data.ads.prompt || prompt, creatives },
        channels: { ...data.channels, ads: true },
      });
      setMessage(`Ads AI generated ${creatives.length} creatives.`);
      toast('Ad creatives generated', 'success');
    } catch (error) {
      const detail = extractApiErrorMessage(error);
      toast(`Ads AI failed: ${detail}`, 'error');
      setMessage(`Failed to generate ads: ${detail}`);
    } finally {
      setGeneratingAds(false);
    }
  };

  const toggleSource = (source: LeadSourceId) => {
    setData((prev) => {
      const leadSources = prev.leadSources.includes(source)
        ? prev.leadSources.filter((s) => s !== source)
        : [...prev.leadSources, source];
      return mergeWizardData(prev, {
        leadSources,
        // Keep selection-based eligibility when leads are already chosen
        eligibility:
          prev.selectedLeadIds.length > 0
            ? prev.eligibility
            : mockEligibilityFromSources(leadSources.length),
      });
    });
  };

  const nextBlockedReason = (): string | null => {
    if (step === WIZARD_STEP.BUSINESS) {
      if (!data.name.trim()) return 'Enter a campaign name to continue.';
      if (!data.goal) return 'Select a campaign goal to continue.';
      if (!data.product.trim())
        return 'Enter a product or service to continue.';
      return null;
    }
    if (step === WIZARD_STEP.AUDIENCE) {
      if (
        !isSameDayTimeRangeValid(
          data.audience.sendingHoursStart,
          data.audience.sendingHoursEnd,
        )
      ) {
        return 'Set valid same-day sending hours (start before end).';
      }
      const hasTargeting =
        data.audience.industries.length > 0 ||
        data.audience.locations.length > 0 ||
        data.audience.jobTitles.length > 0;
      if (!hasTargeting) {
        return 'Add at least one industry, location, or job title before continuing.';
      }
      return null;
    }
    if (step === WIZARD_STEP.SOURCES) {
      if (data.selectedLeadIds.length === 0) {
        return 'Assign at least one eligible lead to continue.';
      }
      return null;
    }
    if (step === WIZARD_STEP.CHANNELS) {
      if (!Object.values(data.channels).some(Boolean)) {
        return 'Select at least one channel to continue.';
      }
      if (
        data.channels.ads &&
        !checkAdsBudget(data.ads.dailyBudget, data.ads.totalBudget).valid
      ) {
        return (
          checkAdsBudget(data.ads.dailyBudget, data.ads.totalBudget).message ||
          'Fix the ads budget before continuing.'
        );
      }
      return null;
    }
    if (step === WIZARD_STEP.OUTREACH) {
      if (data.channels.email && data.sequence.length === 0) {
        return 'Add or generate at least one email sequence step.';
      }
      return null;
    }
    if (step === WIZARD_STEP.SCHEDULE) {
      if (
        !isOvernightTimeRangeValid(
          data.schedule.quietHoursStart,
          data.schedule.quietHoursEnd,
        )
      ) {
        return 'Set valid quiet hours before continuing.';
      }
      return null;
    }
    return null;
  };

  const canNext = () => nextBlockedReason() === null;

  const finish = async (
    mode: LaunchMode = data.launchMode,
    event?: MouseEvent<HTMLButtonElement> | FormEvent,
  ) => {
    event?.preventDefault();
    if (busy) return;

    if (!data.name.trim()) {
      toast('Failed to save campaign: Campaign name is required', 'error');
      return;
    }

    if (data.selectedLeadIds.length === 0) {
      toast('Failed to save campaign: Select at least one lead', 'error');
      setStep(WIZARD_STEP.SOURCES);
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const body = {
        ...buildCampaignRequestBody({
          ...data,
          launchMode: mode,
          approvalMode: mode === 'approval',
        }),
      };
      let campaignId = draftCampaignId;

      if (!campaignId) {
        console.log('[Campaign Wizard] POST /api/campaigns', { mode, body });
        const created = await api.post<CreateCampaignResponse>(
          '/campaigns',
          body,
        );
        campaignId = created.campaignId || created.id || null;
        if (!campaignId) {
          throw new Error('Server did not return a campaignId');
        }
        setDraftCampaignId(campaignId);
      } else {
        console.log('[Campaign Wizard] PATCH /api/campaigns/' + campaignId, body);
        await api.patch(`/campaigns/${campaignId}`, body);
      }

      const assignResult = await assignSelectedLeads(campaignId);
      console.log('[Campaign Wizard] leads assigned', assignResult);

      if (mode === 'autopilot') {
        const blockersResult = await api.get<unknown>(
          `/campaigns/${campaignId}/launch-blockers`,
        );
        const { blockers } = parseLaunchBlockersResponse(blockersResult);
        if (blockers.length > 0) {
          throw new Error(
            blockers[0] ||
              'Pre-launch safety checks failed. Resolve blockers before launching.',
          );
        }
        const status =
          data.schedule.startOption === 'now' ? 'RUNNING' : 'SCHEDULED';
        await api.patch(`/campaigns/${campaignId}`, {
          status,
          approvalMode: false,
        });
      } else if (mode === 'approval') {
        const blockersResult = await api.get<unknown>(
          `/campaigns/${campaignId}/launch-blockers`,
        );
        const { blockers, checks } = parseLaunchBlockersResponse(blockersResult);
        const safety = resolveSafetyChecks({ blockers, checks });
        if (hasCriticalSafetyFailures(safety)) {
          const first = safety.find((c) => c.status === 'blocking');
          throw new Error(
            first?.detail ||
              first?.failLabel ||
              'Fix blocking safety issues before submitting for approval.',
          );
        }
        await api.patch(`/campaigns/${campaignId}`, {
          status: 'NEEDS_REVIEW',
          approvalMode: true,
        });
      } else {
        await api.patch(`/campaigns/${campaignId}`, {
          status: 'DRAFT',
          approvalMode: false,
        });
      }

      const successMessage =
        mode === 'draft'
          ? 'Campaign saved successfully — status: Draft.'
          : mode === 'approval'
            ? 'Campaign submitted successfully — status: Needs Review. Owners/admins have been notified.'
            : data.schedule.startOption === 'now'
              ? 'Campaign launched successfully — status: Running.'
              : 'Campaign scheduled successfully — status: Scheduled.';

      toast(successMessage, 'success');
      clearWizardDraft();
      router.push('/campaigns');
    } catch (error) {
      const detail = extractApiErrorMessage(error);
      toast(`Failed to save campaign: ${detail}`, 'error');
      setMessage(`Failed to save campaign: ${detail}`);
    } finally {
      setBusy(false);
    }
  };

  const currentMeta = WIZARD_STEPS[step - 1];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
              <Link href="/campaigns">
                <ArrowLeft className="h-4 w-4" />
                Campaigns
              </Link>
            </Button>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-navy">
            Add campaign
          </h1>
          <p className="text-sm text-muted-foreground">
            Find it. Qualify it. Close it. — Step {step} of {WIZARD_STEPS.length}{' '}
            — {currentMeta?.description}
          </p>
        </div>
      </div>

      <div className="sticky top-0 z-20 -mx-1 !mt-0 bg-background/95 pb-3 pt-4 backdrop-blur-sm sm:-mx-2">
        <WizardStepper
          currentStep={step}
          onStepClick={(s) => {
            if (s <= step) setStep(s);
          }}
        />
      </div>

      {message ? (
        <p
          className={
            message.startsWith('Failed')
              ? 'rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900'
              : 'rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900'
          }
        >
          {message}
        </p>
      ) : null}

      {generatingDetails ? (
        <p
          role="status"
          className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950"
        >
          Generating campaign… Please keep this page open.
        </p>
      ) : null}

      {validationHint ? (
        <p
          role="alert"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950"
        >
          {validationHint}
        </p>
      ) : null}

      <Card className="shadow-none">
        <CardHeader className="border-b bg-muted/20">
          <CardTitle>{currentMeta?.label}</CardTitle>
        </CardHeader>
        <CardContent className="pt-5">
          {step === WIZARD_STEP.BUSINESS ? (
            <StepDetails
              data={data}
              onChange={patch}
              onGenerateAi={handleGenerateDetails}
              generating={generatingDetails}
            />
          ) : null}
          {step === WIZARD_STEP.AUDIENCE ? (
            <StepAudience data={data} onChange={patch} />
          ) : null}
          {step === WIZARD_STEP.SOURCES ? (
            <StepLeads
              data={data}
              onChange={patch}
              onToggleSource={toggleSource}
            />
          ) : null}
          {step === WIZARD_STEP.CHANNELS ? (
            <StepChannels
              data={data}
              onChange={patch}
              onGenerateAds={handleGenerateAds}
              generatingAds={generatingAds}
            />
          ) : null}
          {step === WIZARD_STEP.OUTREACH ? (
            <StepSequence
              data={data}
              onChange={patch}
              onGenerate={handleGenerateSequence}
              generating={generatingSequence}
            />
          ) : null}
          {step === WIZARD_STEP.SCHEDULE ? (
            <StepSchedule data={data} onChange={patch} />
          ) : null}
          {step === WIZARD_STEP.REVIEW ? (
            <StepReview
              data={data}
              campaignId={draftCampaignId}
              onEligibilityLoaded={(eligibility) => patch({ eligibility })}
            />
          ) : null}
          {step === WIZARD_STEP.LAUNCH ? (
            <StepLaunch
              data={data}
              campaignId={draftCampaignId}
              onChange={patch}
              busy={busy}
              onConfirm={() => finish(data.launchMode)}
            />
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/10">
          <Button
            type="button"
            variant="outline"
            disabled={step === 1 || busy}
            onClick={goBack}
          >
            Back
          </Button>
          <div className="flex gap-2">
            <Button asChild variant="ghost">
              <Link href="/campaigns">Cancel</Link>
            </Button>
            {step < WIZARD_STEP.LAUNCH ? (
              <div className="flex flex-col items-end gap-1">
                <Button
                  type="button"
                  disabled={!canNext() || busy || generatingDetails}
                  onClick={goNext}
                  title={nextBlockedReason() ?? 'Continue to next step'}
                >
                  Continue
                  <ArrowRight className="h-4 w-4" />
                </Button>
                {!canNext() ? (
                  <p className="max-w-xs text-right text-[11px] text-amber-800">
                    {nextBlockedReason()}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
