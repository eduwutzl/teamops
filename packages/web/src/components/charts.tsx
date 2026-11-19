/** Flat charts on top of Recharts: solid fills, thin marks, hairline grid, tooltip on hover. Colours come from theme.css. */
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { cn, compact } from '@/lib/utils';

export type Tone = 'brand' | 'bad' | 'warn' | 'muted' | 'info';
export const TONE: Record<Tone, string> = { brand: 'var(--chart-1)', info: 'var(--chart-2)', warn: 'var(--chart-3)', bad: 'var(--chart-bad)', muted: 'var(--chart-muted)' };
export interface Series { name: string; tone: Tone; values: number[] }

const axis = { fontSize: 11, fill: 'var(--muted-foreground)' };

function Tip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 tabular">
          <span className="size-2 rounded-[2px]" style={{ background: p.color ?? p.fill }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto pl-3 font-medium">{compact(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => <span key={s.name} className="flex items-center gap-1.5"><span className="size-2.5 rounded-[2px]" style={{ background: TONE[s.tone] }} />{s.name}</span>)}
    </div>
  );
}

/** Vertical bars; several series stack with a 2px surface gap between segments. */
export function Bars({ categories, series, height = 220, className }: { categories: string[]; series: Series[]; height?: number; className?: string }) {
  const data = categories.map((c, i) => ({ c, ...Object.fromEntries(series.map((s) => [s.name, s.values[i] ?? 0])) }));
  const empty = series.every((s) => s.values.every((v) => !v));
  if (empty) return <div className={cn('flex items-center justify-center text-sm text-muted-foreground', className)} style={{ height }}>Sem dados no período</div>;
  return (
    <div className={cn('space-y-3', className)}>
      <Legend series={series} />
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="c" tick={axis} tickLine={false} axisLine={{ stroke: 'var(--chart-grid)' }} interval="preserveStartEnd" minTickGap={12} />
            <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(v) => compact(v)} width={48} />
            <RTooltip content={<Tip />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} isAnimationActive={false} />
            {series.map((s, i) => (
              <Bar key={s.name} dataKey={s.name} name={s.name} stackId="a" fill={TONE[s.tone]} maxBarSize={24} isAnimationActive={false} stroke="var(--card)" strokeWidth={series.length > 1 ? 2 : 0} radius={i === series.length - 1 ? [4, 4, 0, 0] : 0} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Horizontal bars for rankings: label on the left, value at the tip. */
export function HBars({ categories, series, className }: { categories: string[]; series: Series[]; className?: string }) {
  const totals = categories.map((_, i) => series.reduce((s, x) => s + (x.values[i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  if (!categories.length || totals.every((t) => !t)) return <div className={cn('flex h-32 items-center justify-center text-sm text-muted-foreground', className)}>Sem dados no período</div>;
  return (
    <div className={cn('space-y-3', className)}>
      <Legend series={series} />
      <div className="space-y-2.5">
        {categories.map((c, i) => (
          <div key={c + i} className="grid grid-cols-[minmax(5rem,9rem)_1fr_auto] items-center gap-3 text-sm" title={`${c}: ${series.map((s) => `${s.name} ${s.values[i] ?? 0}`).join(' · ')}`}>
            <span className="truncate text-muted-foreground">{c}</span>
            <span className="flex h-3 gap-0.5">
              {series.map((s) => (s.values[i] ? <span key={s.name} className="h-full rounded-[3px]" style={{ width: `${(s.values[i] / max) * 100}%`, background: TONE[s.tone] }} /> : null))}
            </span>
            <span className="tabular w-12 text-right font-medium">{compact(totals[i])}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** 14-point column sparkline for stat tiles. */
export function Spark({ values, tone = 'brand' }: { values: number[]; tone?: Tone }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <div className="h-8 w-24" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barCategoryGap={2}>
          <Bar dataKey="v" isAnimationActive={false} radius={[2, 2, 0, 0]}>
            {data.map((d) => <Cell key={d.i} fill={d.i === data.length - 1 ? TONE[tone] : 'var(--chart-muted)'} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
