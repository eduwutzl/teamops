import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root className={cn('peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent transition-colors data-[state=checked]:bg-brand data-[state=unchecked]:bg-input disabled:opacity-50 cursor-pointer', className)} {...props}>
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 rounded-full transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5 data-[state=checked]:bg-brand-foreground data-[state=unchecked]:bg-foreground" />
    </SwitchPrimitive.Root>
  );
}

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root className={cn('peer size-[18px] shrink-0 rounded-[5px] border border-input bg-background data-[state=checked]:bg-brand data-[state=checked]:border-brand data-[state=checked]:text-brand-foreground disabled:opacity-50 cursor-pointer', className)} {...props}>
      <CheckboxPrimitive.Indicator className="flex items-center justify-center"><CheckIcon className="size-3.5" strokeWidth={3} /></CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

const Tabs = TabsPrimitive.Root;
function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('inline-flex h-9 items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground max-w-full overflow-x-auto', className)} {...props} />;
}
function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger className={cn('inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground hover:text-foreground cursor-pointer', className)} {...props} />;
}
const TabsContent = TabsPrimitive.Content;

function Progress({ className, value, tone = 'brand', ...props }: React.ComponentProps<typeof ProgressPrimitive.Root> & { tone?: 'brand' | 'ok' | 'warn' | 'crit' | 'unknown' }) {
  const fill = { brand: 'bg-brand', ok: 'bg-ok', warn: 'bg-warn', crit: 'bg-crit', unknown: 'bg-input' }[tone];
  return (
    <ProgressPrimitive.Root className={cn('relative h-2 w-full overflow-hidden rounded-full bg-muted', className)} value={value} {...props}>
      <ProgressPrimitive.Indicator className={cn('h-full rounded-full transition-all', fill)} style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }} />
    </ProgressPrimitive.Root>
  );
}

const TooltipProvider = TooltipPrimitive.Provider;
function Tooltip({ children, content }: { children: React.ReactNode; content: React.ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={150}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-xs rounded-md border bg-popover px-3 py-1.5 text-xs text-foreground animate-in fade-in-0">{content}</TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export { Switch, Checkbox, Tabs, TabsList, TabsTrigger, TabsContent, Progress, TooltipProvider, Tooltip };
