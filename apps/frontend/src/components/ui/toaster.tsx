'use client';

import { X } from 'lucide-react';
import { useToastStore } from '@/store/toastStore';
import { cn } from '@/lib/utils';

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-4 top-16 z-[100] flex w-[min(100vw-2rem,24rem)] flex-col gap-2 sm:top-20"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm shadow-md',
            t.variant === 'success' &&
              'border-emerald-200 bg-emerald-50 text-emerald-950',
            t.variant === 'error' &&
              'border-red-200 bg-red-50 text-red-950',
            t.variant === 'info' &&
              'border-border bg-card text-foreground',
          )}
          role="status"
        >
          <p className="flex-1 leading-snug">{t.message}</p>
          <button
            type="button"
            aria-label="Dismiss"
            className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
            onClick={() => dismiss(t.id)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
