import * as React from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, Inbox, Lightbulb, Loader2, OctagonAlert, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

// ---------- app context ----------
export interface Me {
  user: { id: number; name: string; username: string };
  corp: { name: string; tagline: string; mission: string };
  engines: { id: string; label: string; hint: string; ready: boolean; models: { id: string; label: string }[] }[];
  adapters: { id: string; label: string }[];
  reports: { kind: string; title: string; hint: string }[];
  ai: { engine: string; model: string };
  severities: string[];
  version: string;
  commit: string;
}
export const AppContext = React.createContext<{ me: Me; refreshMe: () => void; toast: (text: string, tone?: 'ok' | 'crit') => void }>(null as never);
export const useApp = () => React.useContext(AppContext);

// ---------- toasts ----------
export function Toasts({ items, dismiss }: { items: { id: number; text: string; tone: 'ok' | 'crit' }[]; dismiss: (id: number) => void }) {
  return (
    <div className="no-print fixed top-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="flex items-start gap-3 rounded-lg border bg-popover px-4 py-3 text-sm animate-in slide-in-from-top-2">
          {t.tone === 'ok' ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" /> : <OctagonAlert className="mt-0.5 size-4 shrink-0 text-crit" />}
          <span className="flex-1">{t.text}</span>
          <button onClick={() => dismiss(t.id)} className="text-muted-foreground hover:text-foreground cursor-pointer" aria-label="Fechar aviso"><X className="size-4" /></button>
        </div>
      ))}
    </div>
  );
}

// ---------- page scaffolding ----------
export function PageHeader({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {hint && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{hint}</p>}
      </div>
      {children && <div className="no-print flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Empty({ icon: Icon = Inbox, title, hint, children }: { icon?: React.ComponentType<{ className?: string }>; title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <Icon className="size-7 text-muted-foreground" />
      <div className="font-medium">{title}</div>
      {hint && <div className="max-w-sm text-sm text-muted-foreground">{hint}</div>}
      {children && <div className="mt-3 flex gap-2">{children}</div>}
    </div>
  );
}

export function Loading({ label = 'Carregando' }: { label?: string }) {
  return <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{label}…</div>;
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return <div className="flex items-start gap-2 rounded-lg border border-crit/40 bg-crit-soft px-4 py-3 text-sm text-crit"><OctagonAlert className="mt-0.5 size-4 shrink-0" /><div>{children}</div></div>;
}

export function Field({ label, hint, why, filled, children, className }: { label: string; hint?: string; why?: string; filled?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', filled && 'rounded-lg border border-brand-ink/40 bg-brand-soft/40 p-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {filled && <Badge variant="brand">preenchido pela IA</Badge>}
      </div>
      {children}
      {hint && !why && <p className="text-xs text-muted-foreground">{hint}</p>}
      {why && <Why>{why}</Why>}
    </div>
  );
}

/** The "💡 por quê" note the AI leaves next to each field it filled. */
export function Why({ children }: { children: React.ReactNode }) {
  return <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Lightbulb className="mt-px size-3.5 shrink-0 text-brand-ink" /><span><span className="font-medium text-foreground">Por quê: </span>{children}</span></p>;
}

// ---------- status: colour + icon + word, never colour alone ----------
export type Level = 'ok' | 'warn' | 'crit' | 'unknown';
const LEVEL = {
  ok: { icon: CheckCircle2, label: 'Tudo certo', cls: 'text-ok', variant: 'ok' },
  warn: { icon: AlertTriangle, label: 'Atenção', cls: 'text-warn', variant: 'warn' },
  crit: { icon: OctagonAlert, label: 'Crítico', cls: 'text-crit', variant: 'crit' },
  unknown: { icon: CircleHelp, label: 'Sem dado', cls: 'text-muted-foreground', variant: 'outline' },
} as const;

export function LevelIcon({ level, className }: { level: Level; className?: string }) {
  const L = LEVEL[level];
  return <L.icon className={cn('size-4 shrink-0', L.cls, className)} aria-label={L.label} />;
}
export function LevelBadge({ level, children }: { level: Level; children?: React.ReactNode }) {
  const L = LEVEL[level];
  return <Badge variant={L.variant}><L.icon />{children ?? L.label}</Badge>;
}

const RISK = { low: ['Baixo', 'ok'], medium: ['Médio', 'info'], high: ['Alto', 'warn'], critical: ['Crítico', 'crit'] } as const;
export function RiskBadge({ risk }: { risk: keyof typeof RISK }) {
  const [label, variant] = RISK[risk] ?? RISK.medium;
  return <Badge variant={variant}>Risco {label.toLowerCase()}</Badge>;
}

export function Avatar({ emoji, className }: { emoji: string; className?: string }) {
  return <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-xl', className)} aria-hidden>{emoji || '🤖'}</span>;
}

// ---------- confirm ----------
export function Confirm({ open, title, text, action = 'Remover', onConfirm, onClose }: { open: boolean; title: string; text: string; action?: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{text}</DialogDescription></DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={() => { onConfirm(); onClose(); }}>{action}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Right-side sheet with a form: the single editing pattern of the app. */
export function Sheet({ open, onClose, title, hint, children, footer, wide }: { open: boolean; onClose: () => void; title: string; hint?: string; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent side="right" className={wide ? 'sm:max-w-3xl' : undefined} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader><DialogTitle>{title}</DialogTitle>{hint ? <DialogDescription>{hint}</DialogDescription> : <DialogDescription className="sr-only">{title}</DialogDescription>}</DialogHeader>
        <DialogBody>{children}</DialogBody>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export function DiffView({ lines }: { lines: { op: ' ' | '+' | '-'; text: string }[] }) {
  if (!lines.length) return null;
  return (
    <pre className="max-h-80 overflow-auto rounded-lg border bg-background p-3 font-mono text-xs leading-relaxed">
      {lines.map((l, i) => (
        <div key={i} className={cn('whitespace-pre-wrap break-words px-1', l.op === '+' && 'bg-ok-soft text-ok', l.op === '-' && 'bg-crit-soft text-crit', l.op === ' ' && 'text-muted-foreground')}>
          <span className="select-none opacity-70">{l.op === ' ' ? '  ' : l.op + ' '}</span>{l.text || ' '}
        </div>
      ))}
    </pre>
  );
}

/** Tiny safe Markdown: bold, inline code, line breaks. Enough for agent answers. */
export function Prose({ text, className }: { text: string; className?: string }) {
  const html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 font-mono text-[0.85em]">$1</code>');
  return <div className={cn('whitespace-pre-wrap break-words text-sm leading-relaxed', className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
