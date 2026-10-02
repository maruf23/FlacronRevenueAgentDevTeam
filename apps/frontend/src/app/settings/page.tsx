'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Mail,
  AlertTriangle,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Package,
  Ban,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { api } from '@/lib/api';
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
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type EmailStatus = {
  smtpConfigured: boolean;
  smtpHost: string;
  smtpUser: string | null;
  smtpFrom: string | null;
  oauthRequired: boolean;
  hint: string;
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  valueProps: string[];
  audienceHints: string[];
  pricingNotes: string | null;
};

type Suppression = {
  id: string;
  email: string;
  reason: string;
  source: string | null;
  createdAt: string;
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const [showKey, setShowKey] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('Flacron Growth');
  const [displayName, setDisplayName] = useState('Rodrigue Flacron');
  const [email, setEmail] = useState('rodrigue@flacron.io');
  const [productName, setProductName] = useState('');
  const [productDesc, setProductDesc] = useState('');
  const [suppressEmail, setSuppressEmail] = useState('');

  const statusQuery = useQuery({
    queryKey: ['email-status'],
    queryFn: () => api.get<EmailStatus>('/integrations/email-status'),
  });

  const productsQuery = useQuery({
    queryKey: ['products'],
    queryFn: () => api.get<Product[]>('/products'),
  });

  const suppressionsQuery = useQuery({
    queryKey: ['suppressions'],
    queryFn: () => api.get<Suppression[]>('/suppressions'),
  });

  const createProduct = useMutation({
    mutationFn: () =>
      api.post('/products', {
        name: productName.trim(),
        description: productDesc.trim() || undefined,
      }),
    onSuccess: () => {
      setProductName('');
      setProductDesc('');
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
  });

  const deleteProduct = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['products'] }),
  });

  const addSuppression = useMutation({
    mutationFn: () =>
      api.post('/suppressions', {
        email: suppressEmail.trim(),
        reason: 'MANUAL',
      }),
    onSuccess: () => {
      setSuppressEmail('');
      void qc.invalidateQueries({ queryKey: ['suppressions'] });
    },
  });

  const removeSuppression = useMutation({
    mutationFn: (id: string) => api.delete(`/suppressions/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['suppressions'] }),
  });

  const status = statusQuery.data;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-navy">
          Settings
        </h2>
        <p className="text-sm text-muted-foreground">
          Workspace preferences, products, suppression list, and API access.
        </p>
      </div>

      <Tabs defaultValue="workspace">
        <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="suppressions">Suppress</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="notifications">Alerts</TabsTrigger>
          <TabsTrigger value="api">API</TabsTrigger>
        </TabsList>

        <TabsContent value="workspace" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Workspace Name</CardTitle>
              <CardDescription>
                Shown in the sidebar, emails, and billing statements.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="workspace-name">Name</Label>
                <Input
                  id="workspace-name"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="workspace-slug">Slug</Label>
                <Input
                  id="workspace-slug"
                  value="flacron-growth"
                  readOnly
                  className="bg-muted/40"
                />
              </div>
              <Button>Save workspace</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-primary" />
                  Outbound email (SMTP / App Password)
                </CardTitle>
                {status ? (
                  <Badge
                    className={
                      status.smtpConfigured
                        ? 'border-transparent bg-emerald-100 text-emerald-800'
                        : 'border-transparent bg-amber-100 text-amber-900'
                    }
                  >
                    {status.smtpConfigured ? 'Configured' : 'Not configured'}
                  </Badge>
                ) : null}
              </div>
              <CardDescription>
                Use a Gmail App Password so Approve Draft can send without OAuth.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {statusQuery.isLoading ? (
                <p className="text-muted-foreground">Checking mail status…</p>
              ) : status?.smtpConfigured ? (
                <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p className="font-medium">SMTP is ready</p>
                    <p className="mt-0.5 text-xs">
                      Host: {status.smtpHost} · From:{' '}
                      {status.smtpFrom || status.smtpUser}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>{status?.hint ?? 'SMTP is not configured yet.'}</p>
                </div>
              )}

              <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
                <li>
                  Open{' '}
                  <a
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Google App Passwords
                    <ExternalLink className="h-3 w-3" />
                  </a>{' '}
                  (2-Step Verification must be on).
                </li>
                <li>
                  Create an app password for <strong>Mail</strong>.
                </li>
                <li>
                  Edit{' '}
                  <code className="rounded bg-secondary px-1 text-navy">
                    apps/backend/.env
                  </code>{' '}
                  with SMTP_* values, then restart the backend.
                </li>
              </ol>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                Product catalog
              </CardTitle>
              <CardDescription>
                Products power AI drafts, campaign briefs, and qualification
                rules (FR-003).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="product-name">Name</Label>
                  <Input
                    id="product-name"
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
                    placeholder="AI revenue OS for outreach"
                  />
                </div>
              </div>
              <Button
                disabled={!productName.trim() || createProduct.isPending}
                onClick={() => createProduct.mutate()}
              >
                {createProduct.isPending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                )}
                Add product
              </Button>
              <ul className="divide-y rounded-md border">
                {(productsQuery.data ?? []).map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-3 px-3 py-2.5"
                  >
                    <div>
                      <p className="font-medium text-navy">{p.name}</p>
                      {p.description ? (
                        <p className="text-xs text-muted-foreground">
                          {p.description}
                        </p>
                      ) : null}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Delete product"
                      onClick={() => deleteProduct.mutate(p.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
                {(productsQuery.data ?? []).length === 0 &&
                !productsQuery.isLoading ? (
                  <li className="px-3 py-4 text-sm text-muted-foreground">
                    No products yet. Add one to ground AI outreach.
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppressions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ban className="h-5 w-5 text-primary" />
                Suppression list
              </CardTitle>
              <CardDescription>
                Blocked emails never receive outreach (bounces, complaints,
                unsubscribes, manual).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  type="email"
                  placeholder="email@company.com"
                  value={suppressEmail}
                  onChange={(e) => setSuppressEmail(e.target.value)}
                />
                <Button
                  disabled={!suppressEmail.trim() || addSuppression.isPending}
                  onClick={() => addSuppression.mutate()}
                >
                  {addSuppression.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Suppress
                </Button>
              </div>
              <ul className="max-h-80 divide-y overflow-y-auto rounded-md border">
                {(suppressionsQuery.data ?? []).map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium text-navy">{s.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.reason}
                        {s.source ? ` · ${s.source}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove suppression"
                      onClick={() => removeSuppression.mutate(s.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
                {(suppressionsQuery.data ?? []).length === 0 &&
                !suppressionsQuery.isLoading ? (
                  <li className="px-3 py-4 text-sm text-muted-foreground">
                    Suppression list is empty.
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Settings</CardTitle>
              <CardDescription>
                Your personal details used across drafts and assignments.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="display-name">Display name</Label>
                <Input
                  id="display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Input id="timezone" defaultValue="America/Chicago" />
              </div>
              <Button>Save profile</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>
                Choose which events trigger in-app and email alerts.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                {
                  id: 'replies',
                  title: 'Positive replies',
                  description: 'Notify when a lead replies with buying intent.',
                  defaultChecked: true,
                },
                {
                  id: 'bounces',
                  title: 'Deliverability alerts',
                  description: 'Warn when bounce or complaint rates spike.',
                  defaultChecked: true,
                },
                {
                  id: 'leads-ready',
                  title: 'Audience review-ready',
                  description:
                    'Alert when a campaign audience is ready to approve.',
                  defaultChecked: true,
                },
                {
                  id: 'meetings',
                  title: 'Meeting booked',
                  description: 'Alert when a demo is scheduled from outreach.',
                  defaultChecked: true,
                },
              ].map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4 rounded-md border border-border p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-navy">{item.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                  <Switch defaultChecked={item.defaultChecked} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                API Keys
              </CardTitle>
              <CardDescription>
                Authenticate programmatic access to the Flacron Lead Agent API.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Production key</Label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    className="font-mono text-xs"
                    type={showKey ? 'text' : 'password'}
                    value="flc_live_8f3a9c2e1b7d4a6e0f5c8d2a9b1e3f7"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button variant="outline" size="icon" aria-label="Copy key">
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                Keep keys secret. Rotate immediately if exposed. Rate limit:{' '}
                <span className="font-medium text-navy">1,000 req / hour</span>.
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline">Rotate key</Button>
                <Button>Create new key</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
