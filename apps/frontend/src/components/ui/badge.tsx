import * as React from 'react';
import { cn } from '@/lib/utils';

const Badge = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: 'default' | 'secondary' | 'outline';
  }
>(({ className, variant = 'default', ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors',
      variant === 'default' &&
        'border-transparent bg-primary text-primary-foreground',
      variant === 'secondary' &&
        'border-transparent bg-secondary text-secondary-foreground',
      variant === 'outline' && 'border-border text-navy',
      className,
    )}
    {...props}
  />
));
Badge.displayName = 'Badge';

export { Badge };
