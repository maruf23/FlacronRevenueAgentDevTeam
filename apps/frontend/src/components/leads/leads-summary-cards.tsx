'use client';

import {
  Users,
  BadgeCheck,
  Flame,
  Megaphone,
  MessageSquareReply,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { LeadRow } from '@/types/leads';

type LeadsSummaryCardsProps = {
  leads: LeadRow[];
};

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="flex items-center gap-3 p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-navy">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="text-lg font-semibold tabular-nums text-navy">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export function LeadsSummaryCards({ leads }: LeadsSummaryCardsProps) {
  const total = leads.length;
  const verified = leads.filter(
    (l) => l.verification_status.toUpperCase() === 'VERIFIED',
  ).length;
  const highFit = leads.filter((l) => (l.leadScore ?? 0) >= 75).length;
  const inCampaigns = leads.filter((l) => Boolean(l.campaignId)).length;
  const replied = leads.filter((l) => l.status === 'REPLIED').length;
  const qualified = leads.filter(
    (l) => l.status === 'QUALIFIED' || l.status === 'MEETING_SCHEDULED',
  ).length;

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      <StatCard label="Total leads" value={total} icon={Users} />
      <StatCard label="Verified" value={verified} icon={BadgeCheck} />
      <StatCard label="High-fit" value={highFit} icon={Flame} />
      <StatCard label="Assigned Leads" value={inCampaigns} icon={Megaphone} />
      <StatCard label="Replied Leads" value={replied} icon={MessageSquareReply} />
      <StatCard label="Qualified" value={qualified} icon={Sparkles} />
    </div>
  );
}
