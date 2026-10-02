'use client';

import type { ComponentType, ReactNode } from 'react';
import {
  Brain,
  Heart,
  Gauge,
  MessageSquareQuote,
  Sparkles,
  ArrowRight,
  Kanban,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { InboxConversationDetail } from '@/types/inbox';

type InboxInsightPanelProps = {
  insight: InboxConversationDetail['aiInsight'] | null | undefined;
  loading?: boolean;
};

function InsightCard({
  icon: Icon,
  label,
  children,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 shadow-sm">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function sentimentClass(sentiment: string | null) {
  const s = (sentiment || '').toLowerCase();
  if (s === 'positive') return 'border-transparent bg-emerald-100 text-emerald-800';
  if (s === 'negative') return 'border-transparent bg-red-100 text-red-800';
  return 'border-transparent bg-muted text-muted-foreground';
}

export function InboxInsightPanel({ insight, loading }: InboxInsightPanelProps) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-l bg-secondary/30">
      <div className="border-b bg-card px-3 py-3">
        <h3 className="text-sm font-semibold tracking-tight">AI Insight</h3>
        <p className="text-[11px] text-muted-foreground">
          Classification, evidence, and recommended next steps
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Analyzing…</p>
        ) : !insight ? (
          <p className="text-sm text-muted-foreground">
            Select a conversation to see AI insights.
          </p>
        ) : (
          <>
            <InsightCard icon={Brain} label="Intent">
              <Badge className="mt-0.5">
                {insight.intent || 'Unknown'}
              </Badge>
            </InsightCard>

            <InsightCard icon={Heart} label="Sentiment">
              <Badge className={cn(sentimentClass(insight.sentiment))}>
                {insight.sentiment || 'Neutral'}
              </Badge>
            </InsightCard>

            <InsightCard icon={Gauge} label="Confidence Score">
              <p className="text-lg font-semibold tabular-nums text-navy">
                {insight.confidence != null
                  ? `${Math.round(insight.confidence * 100)}%`
                  : '—'}
              </p>
            </InsightCard>

            <InsightCard icon={MessageSquareQuote} label="Key Evidence">
              {insight.evidence?.length ? (
                <ul className="list-disc space-y-1.5 pl-4 text-muted-foreground">
                  {insight.evidence.map((item) => (
                    <li key={item} className="leading-relaxed">
                      “{item}”
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  No evidence snippets yet.
                </p>
              )}
            </InsightCard>

            <InsightCard icon={Sparkles} label="Recommended Response">
              <p className="leading-relaxed text-foreground">
                {insight.recommendedResponse ||
                  'Reply helpfully and keep the conversation moving.'}
              </p>
            </InsightCard>

            <InsightCard icon={ArrowRight} label="Next Best Action">
              <p className="font-medium text-primary">
                {insight.nextBestAction || 'Review thread'}
              </p>
            </InsightCard>

            <InsightCard icon={Kanban} label="Suggested Pipeline Stage">
              <Badge variant="secondary" className="mb-1.5">
                {(insight.suggestedPipelineStage || 'NEW').replaceAll('_', ' ')}
              </Badge>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {insight.pipelineMove ||
                  `Current stage: ${(insight.currentPipelineStage || 'NEW').replaceAll('_', ' ')}`}
              </p>
            </InsightCard>
          </>
        )}
      </div>
    </aside>
  );
}
