'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import NewCampaignWizard from './wizard-client';

export default function NewCampaignPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading campaign wizard…
        </div>
      }
    >
      <NewCampaignWizard />
    </Suspense>
  );
}
