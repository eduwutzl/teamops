import * as React from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Download, Printer } from 'lucide-react';
import { Bars, HBars } from '@/components/charts';
import { ErrorNote, Loading, PageHeader, useApp } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useData } from '@/lib/api';
import { cn } from '@/lib/utils';

const day = (offset: number) => { const d = new Date(Date.now() - offset * 86400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function Reports() {
  const { me } = useApp();
  const [kind, setKind] = React.useState('productivity');
  const [f, setF] = React.useState({ from: day(13), to: day(0), agentId: 'all', groupId: 'all', projectId: 'all' });
  const { data: agents } = useData<any[]>('/agents');
  const { data: groups } = useData<any[]>('/groups');
  const { data: projects } = useData<any[]>('/projects');
  const qs = new URLSearchParams({ from: new Date(`${f.from}T00:00:00`).toISOString(), to: new Date(`${f.to}T23:59:59`).toISOString(), ...(f.agentId !== 'all' ? { agentId: f.agentId } : {}), ...(f.groupId !== 'all' ? { groupId: f.groupId } : {}), ...(f.projectId !== 'all' ? { projectId: f.projectId } : {}) }).toString();
  const { data: r, error, loading } = useData<any>(`/reports/${kind}?${qs}`);
  const preset = (n: number) => setF({ ...f, from: day(n - 1), to: day(0) });
  return (
    <>
      <PageHeader title="Relatórios" hint="Números prontos do time. Filtre, exporte ou transforme num resumo periódico feito por um agente.">
        <Button variant="outline" asChild><Link to={`/rotinas?relatorio=${kind}`}><CalendarClock />Agendar resumo</Link></Button>
        <Button variant="outline" asChild><a href={`/api/reports/${kind}.csv?${qs}`}><Download />CSV</a></Button>
        <Button variant="outline" onClick={() => window.print()}><Printer />PDF</Button>
      </PageHeader>
      <div className="no-print mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {me.reports.map((x) => (
          <button key={x.kind} onClick={() => setKind(x.kind)} aria-pressed={kind === x.kind} className={cn('rounded-xl border bg-card p-3 text-left transition-colors cursor-pointer', kind === x.kind ? 'border-brand-ink/60 bg-brand-soft' : 'hover:border-input')}>
            <div className={cn('text-sm font-semibold', kind === x.kind && 'text-brand-ink')}>{x.title}</div><div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{x.hint}</div>
          </button>
        ))}
      </div>
      <div className="no-print mb-6 flex flex-wrap items-center gap-2">
        <Input type="date" className="w-40" value={f.from} max={f.to} onChange={(e) => setF({ ...f, from: e.target.value || f.from })} aria-label="De" />
        <span className="text-sm text-muted-foreground">até</span>
        <Input type="date" className="w-40" value={f.to} min={f.from} onChange={(e) => setF({ ...f, to: e.target.value || f.to })} aria-label="Até" />
        {[7, 14, 30].map((n) => <Button key={n} size="sm" variant="ghost" onClick={() => preset(n)}>{n} dias</Button>)}
        <Select value={f.agentId} onValueChange={(v) => setF({ ...f, agentId: v })}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os agentes</SelectItem>{(agents ?? []).map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.emoji} {a.name}</SelectItem>)}</SelectContent></Select>
        <Select value={f.groupId} onValueChange={(v) => setF({ ...f, groupId: v })}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os grupos</SelectItem>{(groups ?? []).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.emoji} {g.name}</SelectItem>)}</SelectContent></Select>
        <Select value={f.projectId} onValueChange={(v) => setF({ ...f, projectId: v })}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os projetos</SelectItem>{(projects ?? []).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent></Select>
      </div>
      {loading && <Loading />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {r && (
        <div className="space-y-4">
          <div><h2 className="text-xl font-semibold">{r.title}</h2><p className="text-sm text-muted-foreground">{me.corp.name} · {r.subtitle}</p></div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {r.cards.map((c: any) => <Card key={c.label} className="print-break p-5"><div className="text-sm text-muted-foreground">{c.label}</div><div className="mt-2 tabular text-3xl font-semibold leading-none">{c.value}</div>{c.hint && <div className="mt-2 text-xs text-muted-foreground">{c.hint}</div>}</Card>)}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {r.charts.map((c: any) => (
              <Card key={c.title} className="print-break"><CardHeader><CardTitle>{c.title}</CardTitle></CardHeader><CardContent>{c.type === 'hbar' ? <HBars categories={c.categories} series={c.series} /> : <Bars categories={c.categories} series={c.series} />}</CardContent></Card>
            ))}
          </div>
          <Card className="overflow-auto">
            <table className="w-full text-sm">
              <thead><tr>{r.columns.map((c: any) => <th key={c.key} className={cn('whitespace-nowrap border-b px-4 py-3 font-medium text-muted-foreground', c.align === 'right' ? 'text-right' : 'text-left')}>{c.label}</th>)}</tr></thead>
              <tbody>
                {r.rows.map((row: any, i: number) => <tr key={i} className="hover:bg-muted/40">{r.columns.map((c: any) => <td key={c.key} className={cn('border-b px-4 py-2.5', c.align === 'right' && 'tabular text-right')}>{typeof row[c.key] === 'number' ? new Intl.NumberFormat('pt-BR').format(row[c.key]) : row[c.key] || '—'}</td>)}</tr>)}
                {!r.rows.length && <tr><td colSpan={r.columns.length} className="px-4 py-10 text-center text-muted-foreground">Sem dados para estes filtros.</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </>
  );
}
