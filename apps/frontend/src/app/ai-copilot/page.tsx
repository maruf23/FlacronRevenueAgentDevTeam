'use client';

import { Bot, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AiCopilot } from '@/components/layout/ai-copilot';

export default function AiCopilotPage() {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight text-navy">
          AI Copilot
        </h2>
        <p className="max-w-xl text-sm text-muted-foreground">
          Describe outcomes in plain language. Copilot drafts a workflow and
          creates an approval request before anything launches.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            Start a run
          </CardTitle>
          <CardDescription>
            Example: “Find 200 restoration contractors in Florida with verified
            emails”
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" onClick={() => setOpen(true)}>
            <Sparkles className="h-4 w-4" />
            Open Copilot
          </Button>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Approval history</CardTitle>
            <Badge variant="secondary">Soon</Badge>
          </div>
          <CardDescription>
            Approved and rejected Copilot requests will appear here once the
            automations API is connected.
          </CardDescription>
        </CardHeader>
      </Card>

      <AiCopilot open={open} onOpenChange={setOpen} />
    </div>
  );
}
