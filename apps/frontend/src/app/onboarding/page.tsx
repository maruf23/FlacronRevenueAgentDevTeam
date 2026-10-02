'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  CheckCircle2,
  Loader2,
  Mail,
  Package,
  Target,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

type WorkspaceCurrent = {
  id: string;
  name: string;
  needsOnboarding: boolean;
  onboardingCompletedAt: string | null;
  mailboxConnected: boolean;
  productCount: number;
  onboarding: {
    companyName: string;
    website: string | null;
    industry: string | null;
    companySummary: string | null;
    icpSummary: string | null;
    targetRoles: string[];
    geography: string | null;
  };
};

const STEPS = [
  { id: 'company', label: 'Company', icon: Building2 },
  { id: 'product', label: 'Product', icon: Package },
  { id: 'icp', label: 'Audience', icon: Target },
  { id: 'mailbox', label: 'Mailbox', icon: Mail },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);

  const workspaceQuery = useQuery({
    queryKey: ['workspace-current'],
    queryFn: () => api.get<WorkspaceCurrent>('/tenants/current'),
  });

  const ws = workspaceQuery.data;
  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [industry, setIndustry] = useState('');
  const [companySummary, setCompanySummary] = useState('');
  const [productName, setProductName] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [valueProps, setValueProps] = useState('');
  const [icpSummary, setIcpSummary] = useState('');
  const [targetRoles, setTargetRoles] = useState('');
  const [geography, setGeography] = useState('');
  const [seeded, setSeeded] = useState(false);

  if (ws && !seeded) {
    setCompanyName(ws.onboarding.companyName || ws.name || '');
    setWebsite(ws.onboarding.website || '');
    setIndustry(ws.onboarding.industry || '');
    setCompanySummary(ws.onboarding.companySummary || '');
    setIcpSummary(ws.onboarding.icpSummary || '');
    setTargetRoles(ws.onboarding.targetRoles.join(', '));
    setGeography(ws.onboarding.geography || '');
    setSeeded(true);
  }

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch<WorkspaceCurrent>('/tenants/current/onboarding', body),
    onSuccess: (data) => {
      void qc.setQueryData(['workspace-current'], data);
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const rolesList = useMemo(
    () =>
      targetRoles
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean),
    [targetRoles],
  );

  async function next() {
    if (step === 0) {
      await save.mutateAsync({
        companyName: companyName.trim(),
        website: website.trim() || undefined,
        industry: industry.trim() || undefined,
        companySummary: companySummary.trim() || undefined,
      });
      setStep(1);
      return;
    }
    if (step === 1) {
      if (!productName.trim()) return;
      await save.mutateAsync({
        product: {
          name: productName.trim(),
          description: productDesc.trim() || undefined,
          valueProps: valueProps
            .split('\n')
            .map((v) => v.trim())
            .filter(Boolean),
          audienceHints: rolesList,
        },
      });
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!icpSummary.trim()) return;
      await save.mutateAsync({
        icpSummary: icpSummary.trim(),
        targetRoles: rolesList,
        geography: geography.trim() || undefined,
      });
      setStep(3);
      return;
    }
    if (step === 3) {
      await save.mutateAsync({
        skipMailbox: !ws?.mailboxConnected,
        complete: true,
        icpSummary: icpSummary.trim(),
        product: productName.trim()
          ? {
              name: productName.trim(),
              description: productDesc.trim() || undefined,
            }
          : undefined,
      });
      router.replace('/');
    }
  }

  if (workspaceQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading workspace…
      </div>
    );
  }

  if (ws && !ws.needsOnboarding) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h1 className="text-2xl font-semibold text-navy">You&apos;re set up</h1>
        <p className="text-sm text-muted-foreground">
          Onboarding is already complete for this workspace.
        </p>
        <Button asChild>
          <Link href="/">Go to dashboard</Link>
        </Button>
      </div>
    );
  }

  const StepIcon = STEPS[step]!.icon;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary">
          Flacron Lead Agent
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-navy">
          Set up your workspace
        </h1>
        <p className="text-sm text-muted-foreground">
          A few minutes now so AI drafts, campaigns, and scoring stay grounded
          in your business.
        </p>
      </div>

      <ol className="flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li
            key={s.id}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium',
              i === step
                ? 'border-navy bg-navy text-white'
                : i < step
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-border bg-background text-muted-foreground',
            )}
          >
            <s.icon className="h-3.5 w-3.5" />
            {s.label}
          </li>
        ))}
      </ol>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-navy">
            <StepIcon className="h-5 w-5 text-primary" />
            {STEPS[step]!.label}
          </CardTitle>
          <CardDescription>
            {step === 0 && 'Company basics used in outreach context.'}
            {step === 1 && 'At least one product powers AI drafts and offers.'}
            {step === 2 && 'Ideal customer profile for targeting and scoring.'}
            {step === 3 &&
              'Connect a mailbox so sequences and replies run in the cloud.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="company">Company name</Label>
                <Input
                  id="company"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  placeholder="https://…"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="industry">Industry</Label>
                <Input
                  id="industry"
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="summary">Company summary</Label>
                <textarea
                  id="summary"
                  className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={companySummary}
                  onChange={(e) => setCompanySummary(e.target.value)}
                  placeholder="What you sell and who you help…"
                />
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="product">Product name</Label>
                <Input
                  id="product"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="Flacron Lead Agent"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-desc">Description</Label>
                <Input
                  id="product-desc"
                  value={productDesc}
                  onChange={(e) => setProductDesc(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="props">Value props (one per line)</Label>
                <textarea
                  id="props"
                  className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={valueProps}
                  onChange={(e) => setValueProps(e.target.value)}
                />
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="icp">ICP / audience summary</Label>
                <textarea
                  id="icp"
                  className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={icpSummary}
                  onChange={(e) => setIcpSummary(e.target.value)}
                  placeholder="US restoration firms, 5–200 employees, owners and ops directors…"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="roles">Decision-maker roles (comma-separated)</Label>
                <Input
                  id="roles"
                  value={targetRoles}
                  onChange={(e) => setTargetRoles(e.target.value)}
                  placeholder="Owner, Operations Director, Claims Manager"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="geo">Geography</Label>
                <Input
                  id="geo"
                  value={geography}
                  onChange={(e) => setGeography(e.target.value)}
                  placeholder="United States"
                />
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <div className="space-y-3 rounded-md border bg-secondary/40 p-4 text-sm">
              {ws?.mailboxConnected ? (
                <p className="flex items-center gap-2 text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" />
                  Mailbox already connected — you can finish.
                </p>
              ) : (
                <>
                  <p className="text-navy">
                    Connect Gmail or Microsoft so outreach and reply sync run in
                    the cloud even when your laptop is off.
                  </p>
                  <Button asChild variant="outline">
                    <Link href="/integrations" target="_blank">
                      Open Integrations
                    </Link>
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    You can skip for now and connect later from Settings /
                    Integrations.
                  </p>
                </>
              )}
            </div>
          ) : null}

          {save.isError ? (
            <p className="text-sm text-destructive">
              {(save.error as Error)?.message || 'Could not save. Try again.'}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              disabled={step === 0 || save.isPending}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Back
            </Button>
            <Button
              type="button"
              disabled={
                save.isPending ||
                (step === 0 && !companyName.trim()) ||
                (step === 1 && !productName.trim()) ||
                (step === 2 && !icpSummary.trim())
              }
              onClick={() => void next()}
            >
              {save.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
              )}
              {step === 3 ? 'Finish setup' : 'Continue'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
