'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Megaphone, Sparkles } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/store/toastStore';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import {
  AD_PLATFORMS,
  type AdCreative,
  type AdPlatformId,
} from '@/types/campaigns';
import { checkAdsBudget } from '@/lib/ads-budget';
import { cn } from '@/lib/utils';

type CampaignOption = { id: string; name: string; status: string };

function extractError(error: unknown): string {
  if (error instanceof ApiError) {
    const body = error.body;
    if (body && typeof body === 'object') {
      const msg = (body as { message?: string | string[] }).message;
      if (Array.isArray(msg) && msg.length) return msg.join(', ');
      if (typeof msg === 'string' && msg.trim()) return msg;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

export default function AdsAiPage() {
  const [prompt, setPrompt] = useState('');
  const [platforms, setPlatforms] = useState<AdPlatformId[]>(['meta', 'google']);
  const [dailyBudget, setDailyBudget] = useState(50);
  const [totalBudget, setTotalBudget] = useState(1500);
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [campaignId, setCampaignId] = useState('');

  const campaignsQuery = useQuery({
    queryKey: ['campaigns'],
    queryFn: () => api.get<CampaignOption[]>('/campaigns'),
  });

  const generate = useMutation({
    mutationFn: () =>
      api.post<{ creatives: AdCreative[] }>('/campaigns/ai/generate-ads', {
        prompt,
        platforms,
        dailyBudget,
      }),
    onSuccess: (data) => {
      setCreatives(data.creatives ?? []);
      toast('Ad creatives generated', 'success');
    },
    onError: (error) => {
      toast(`Ads AI failed: ${extractError(error)}`, 'error');
    },
  });

  const attach = useMutation({
    mutationFn: () =>
      api.patch(`/campaigns/${campaignId}`, {
        channels: {
          email: true,
          social: false,
          ads: true,
          chat: false,
          calendar: true,
          crm: true,
        },
        ads: {
          platforms,
          prompt,
          dailyBudget,
          totalBudget,
          creatives,
          launchMode: 'approval',
          adAccountIds: [],
        },
      }),
    onSuccess: () => toast('Ads attached to campaign', 'success'),
    onError: (error) =>
      toast(`Could not attach ads: ${extractError(error)}`, 'error'),
  });

  const togglePlatform = (id: AdPlatformId) => {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight text-navy">
            Ads AI
          </h2>
          <p className="text-sm text-muted-foreground">
            Create Meta, Google, LinkedIn, TikTok, and Microsoft campaigns from
            a prompt. Generate copy, build audiences, set budgets, then launch
            with approval or autopilot.
          </p>
        </div>
        <Button asChild>
          <Link href="/campaigns/new?ads=1">Use in new campaign</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" />
              Prompt to campaign
            </CardTitle>
            <CardDescription>
              Ads AI writes headlines, primary text, CTAs, and audience notes.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ads-prompt">Prompt</Label>
              <Textarea
                id="ads-prompt"
                className="min-h-[120px]"
                placeholder="Create ads for restoration company owners in Washington who need faster job costing…"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Platforms</Label>
              <div className="flex flex-wrap gap-1.5">
                {AD_PLATFORMS.map((platform) => {
                  const active = platforms.includes(platform.id);
                  return (
                    <button
                      key={platform.id}
                      type="button"
                      onClick={() => togglePlatform(platform.id)}
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-xs font-medium',
                        active
                          ? 'border-navy bg-navy text-white'
                          : 'border-border text-muted-foreground',
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
                <Label htmlFor="ads-budget">Daily budget (USD)</Label>
                <Input
                  id="ads-budget"
                  type="number"
                  min={1}
                  value={dailyBudget}
                  onChange={(e) => {
                    const nextDaily = Number(e.target.value) || 0;
                    setDailyBudget(nextDaily);
                    if (totalBudget < nextDaily) setTotalBudget(nextDaily * 30);
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ads-total">Total ad budget (USD)</Label>
                <Input
                  id="ads-total"
                  type="number"
                  min={dailyBudget || 0}
                  value={totalBudget}
                  onChange={(e) => setTotalBudget(Number(e.target.value) || 0)}
                />
              </div>
            </div>
            {checkAdsBudget(dailyBudget, totalBudget).valid ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                Expected duration:{' '}
                {checkAdsBudget(dailyBudget, totalBudget).summary}
              </p>
            ) : (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                {checkAdsBudget(dailyBudget, totalBudget).message}
              </p>
            )}
            <Button
              disabled={
                prompt.trim().length < 8 ||
                generate.isPending ||
                !checkAdsBudget(dailyBudget, totalBudget).valid
              }
              onClick={() => generate.mutate()}
            >
              {generate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Megaphone className="h-4 w-4" />
              )}
              Generate creatives
            </Button>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Creatives</CardTitle>
            <CardDescription>
              Review copy, then attach it to a campaign or start a new one.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {creatives.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Generate creatives to preview headlines, body copy, and CTAs
                for each platform.
              </p>
            ) : (
              <div className="grid gap-3">
                {creatives.map((creative) => (
                  <div key={creative.id} className="rounded-md border p-3">
                    <Badge variant="secondary" className="capitalize">
                      {AD_PLATFORMS.find((p) => p.id === creative.platform)
                        ?.label ?? creative.platform}
                    </Badge>
                    <p className="mt-2 text-sm font-medium text-navy">
                      {creative.headline}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {creative.primaryText}
                    </p>
                    <p className="mt-2 text-[11px] text-navy">
                      CTA: {creative.cta} · {creative.audience}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {creatives.length > 0 ? (
              <div className="space-y-2 border-t pt-4">
                <Label htmlFor="attach-campaign">Attach to campaign</Label>
                <div className="flex flex-wrap gap-2">
                  <Select
                    id="attach-campaign"
                    value={campaignId}
                    onChange={(e) => setCampaignId(e.target.value)}
                    className="min-w-[220px] flex-1"
                  >
                    <option value="">Select campaign…</option>
                    {(campaignsQuery.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    variant="secondary"
                    disabled={!campaignId || attach.isPending}
                    onClick={() => attach.mutate()}
                  >
                    {attach.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    Save to campaign
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
