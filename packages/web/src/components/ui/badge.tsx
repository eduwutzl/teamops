import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap [&_svg]:size-3 shrink-0', {
  variants: {
    variant: {
      default: 'bg-muted text-foreground',
      brand: 'bg-brand-soft text-brand-ink',
      outline: 'border text-muted-foreground',
      ok: 'bg-ok-soft text-ok',
      warn: 'bg-warn-soft text-warn',
      crit: 'bg-crit-soft text-crit',
      info: 'bg-info-soft text-info',
    },
  },
  defaultVariants: { variant: 'default' },
});

function Badge({ className, variant, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
