'use client';

import {
  BarChart3,
  Bot,
  Megaphone,
  MessageSquare,
  Search,
  Shield,
  Sparkles,
  Target,
  Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FLA_AGENTS } from '@/types/campaigns';

const ICONS = {
  discovery: Search,
  enrichment: Sparkles,
  scoring: Target,
  ads: Megaphone,
  outreach: MessageSquare,
  replies: Bot,
  pipeline: Workflow,
  analytics: BarChart3,
  automation: Shield,
} as const;

type AiAgentCoreProps = {
  active?: string[];
  className?: string;
};

export function AiAgentCore({ active, className }: AiAgentCoreProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <div>
        <h3 className="text-sm font-semibold text-navy">FLA AI core</h3>
        <p className="text-xs text-muted-foreground">
          Specialized agents that find, qualify, and close while you manage
          approvals.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {FLA_AGENTS.map((agent) => {
          const Icon = ICONS[agent.id as keyof typeof ICONS] ?? Bot;
          const isActive = !active || active.includes(agent.id);
          return (
            <div
              key={agent.id}
              className={cn(
                'flex gap-2.5 rounded-lg border p-3',
                isActive ? 'border-border bg-card' : 'opacity-60',
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-secondary text-navy">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-medium text-navy">{agent.label}</p>
                <p className="text-[11px] text-muted-foreground">
                  {agent.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
