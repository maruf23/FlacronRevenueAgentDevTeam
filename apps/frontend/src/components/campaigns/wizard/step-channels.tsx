'use client';

import { useState } from 'react';
import {
  CalendarDays,
  Check,
  Loader2,
  Mail,
  Megaphone,
  MessageCircle,
  Share2,
  Sparkles,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { MOCK_AD_ACCOUNTS } from '@/lib/campaigns-mock';
import { checkAdsBudget } from '@/lib/ads-budget';
import {
  AD_PLATFORMS,
  CAMPAIGN_CHANNELS,
  type AdCreative,
  type AdPlatformId,
  type CampaignChannelId,
  type CampaignWizardData,
} from '@/types/campaigns';
import { cn } from '@/lib/utils';

const ACCOUNT_STATUS_STYLES = {
  connected: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  needs_auth: 'border-amber-200 bg-amber-50 text-amber-950',
  disconnected: 'border-red-200 bg-red-50 text-red-900',
} as const;

const ACCOUNT_STATUS_LABEL = {
  connected: 'Connected',
  needs_auth: 'Needs auth',
  disconnected: 'Disconnected',
} as const;

const CHANNEL_ICONS: Record<CampaignChannelId, typeof Mail> = {
  email: Mail,
  social: Share2,
  ads: Megaphone,
  chat: MessageCircle,
  calendar: CalendarDays,
  crm: Workflow,
};

type StepChannelsProps = {
  data: CampaignWizardData;
  onChange: (patch: Partial<CampaignWizardData>) => void;
  onGenerateAds: () => void;
  generatingAds?: boolean;
};

export function StepChannels({
  data,
  onChange,
  onGenerateAds,
  generatingAds,
}: StepChannelsProps) {
  const [docHint] = useState(
    'Ads AI creates campaigns from this prompt, then you approve or send to autopilot.',
  );
  const connectedPlatforms = new Set(
    MOCK_AD_ACCOUNTS.filter((account) => account.status === 'connected').map(
      (account) => account.platform,
    ),
  );

  const toggleChannel = (id: CampaignChannelId) => {
    onChange({
      channels: { ...data.channels, [id]: !data.channels[id] },
    });
  };

  const togglePlatform = (id: AdPlatformId) => {
    if (!connectedPlatforms.has(id)) return;
    const platforms = data.ads.platforms.includes(id)
      ? data.ads.platforms.filter((p) => p !== id)
      : [...data.ads.platforms, id];
    onChange({ ads: { ...data.ads, platforms } });
  };

  const toggleAdAccount = (id: string) => {
    const account = MOCK_AD_ACCOUNTS.find((item) => item.id === id);
    if (!account || account.status !== 'connected') return;
    const adAccountIds = data.ads.adAccountIds.includes(id)
      ? data.ads.adAccountIds.filter((a) => a !== id)
      : [...data.ads.adAccountIds, id];
    onChange({ ads: { ...data.ads, adAccountIds } });
  };

  const updateAds = (patch: Partial<CampaignWizardData['ads']>) =>
    onChange({ ads: { ...data.ads, ...patch } });

  const enabledCount = CAMPAIGN_CHANNELS.filter((c) => data.channels[c.id]).length;
  const budgetCheck = checkAdsBudget(data.ads.dailyBudget, data.ads.totalBudget);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-navy">Channels managed</h3>
        <p className="text-sm text-muted-foreground">
          Choose where this campaign runs. {enabledCount} channel
          {enabledCount === 1 ? '' : 's'} selected.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CAMPAIGN_CHANNELS.map((channel) => {
          const Icon = CHANNEL_ICONS[channel.id];
          const active = data.channels[channel.id];
          return (
            <div
              key={channel.id}
              role="button"
              tabIndex={0}
              onClick={() => toggleChannel(channel.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggleChannel(channel.id);
                }
              }}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                active
                  ? 'border-primary bg-accent'
                  : 'border-border hover:border-navy/30',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                  active ? 'bg-primary text-white' : 'bg-secondary text-navy',
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-navy">
                    {channel.label}
                  </span>
                  <Switch
                    checked={active}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={() => toggleChannel(channel.id)}
                  />
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {channel.description}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      {data.channels.ads ? (
        <div className="space-y-4 rounded-lg border border-primary/20 bg-accent/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-navy">
                <Sparkles className="h-4 w-4 text-primary" />
                Ads AI
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{docHint}</p>
            </div>
            <div className="flex gap-1 rounded-md border bg-background p-0.5">
              {(['approval', 'autopilot'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateAds({ launchMode: mode })}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs font-medium capitalize',
                    data.ads.launchMode === mode
                      ? 'bg-navy text-white'
                      : 'text-muted-foreground',
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ad platforms</Label>
            <div className="flex flex-wrap gap-1.5">
              {AD_PLATFORMS.map((platform) => {
                const active = data.ads.platforms.includes(platform.id);
                const available = connectedPlatforms.has(platform.id);
                return (
                  <button
                    key={platform.id}
                    type="button"
                    disabled={!available}
                    onClick={() => togglePlatform(platform.id)}
                    title={
                      available
                        ? platform.label
                        : 'Connect this ad account before selecting the platform'
                    }
                    className={cn(
                      'rounded-md border px-2.5 py-1 text-xs font-medium',
                      active
                        ? 'border-navy bg-navy text-white'
                        : 'border-border text-muted-foreground hover:border-navy/40',
                      !available && 'cursor-not-allowed opacity-50 hover:border-border',
                    )}
                  >
                    {platform.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ads-daily">Daily ad budget</Label>
              <Input
                id="ads-daily"
                type="number"
                min={1}
                value={data.ads.dailyBudget}
                onChange={(e) => {
                  const dailyBudget = Number(e.target.value) || 0;
                  const nextTotal =
                    data.ads.totalBudget < dailyBudget
                      ? dailyBudget * 30
                      : data.ads.totalBudget;
                  updateAds({ dailyBudget, totalBudget: nextTotal });
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ads-total">Total ad budget</Label>
              <Input
                id="ads-total"
                type="number"
                min={data.ads.dailyBudget || 0}
                value={data.ads.totalBudget}
                onChange={(e) =>
                  updateAds({ totalBudget: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>
          {budgetCheck.valid && budgetCheck.summary ? (
            <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
              Expected duration: {budgetCheck.summary}
            </p>
          ) : (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
              {budgetCheck.message}
            </p>
          )}

          <div className="space-y-1.5">
            <Label>Connected ad accounts</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {MOCK_AD_ACCOUNTS.map((account) => {
                const active = data.ads.adAccountIds.includes(account.id);
                const available = account.status === 'connected';
                return (
                  <button
                    key={account.id}
                    type="button"
                    disabled={!available}
                    onClick={() => toggleAdAccount(account.id)}
                    className={cn(
                      'rounded-md border px-3 py-2 text-left text-sm',
                      active && available
                        ? 'border-primary bg-white text-navy ring-1 ring-primary/30'
                        : 'border-border text-muted-foreground',
                      !available && 'cursor-not-allowed opacity-70',
                    )}
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="font-medium text-navy">{account.label}</span>
                      {active && available ? (
                        <Check className="h-4 w-4 shrink-0 text-primary" />
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        'mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold',
                        ACCOUNT_STATUS_STYLES[account.status],
                      )}
                    >
                      {ACCOUNT_STATUS_LABEL[account.status]}
                    </span>
                    {!available ? (
                      <span className="mt-1 block text-xs">
                        Authenticate this account before it can be used.
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ads-prompt">Ad prompt</Label>
            <Textarea
              id="ads-prompt"
              className="min-h-[90px]"
              placeholder="Create ads for restoration owners in Washington who need faster job costing…"
              value={data.ads.prompt}
              onChange={(e) => updateAds({ prompt: e.target.value })}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={generatingAds || data.ads.platforms.length === 0}
              onClick={onGenerateAds}
            >
              {generatingAds ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-primary" />
              )}
              Generate ad copy & creatives
            </Button>
          </div>

          {data.ads.creatives.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {data.ads.creatives.map((creative) => (
                <CreativeCard key={creative.id} creative={creative} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Generate creatives, or continue and Ads AI will draft them at
              launch.
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Turn on Paid ads to generate Meta, Google, LinkedIn, TikTok, or
          Microsoft campaigns from a prompt.
        </p>
      )}
    </div>
  );
}

function CreativeCard({ creative }: { creative: AdCreative }) {
  const platform =
    AD_PLATFORMS.find((p) => p.id === creative.platform)?.label ??
    creative.platform;
  return (
    <div className="rounded-md border bg-background p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
        {platform}
      </p>
      <p className="mt-1 text-sm font-medium text-navy">{creative.headline}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {creative.primaryText}
      </p>
      <p className="mt-2 text-[11px] text-navy">
        CTA: {creative.cta} · Audience: {creative.audience}
      </p>
    </div>
  );
}
