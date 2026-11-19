import * as React from 'react';
import { Link } from 'react-router-dom';
import { Check, CircleCheck, Lightbulb, Loader2, ShieldAlert, ShieldCheck, Sparkles, Undo2 } from 'lucide-react';
import { Empty, ErrorNote, Loading, PageHeader, useApp } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, useData } from '@/lib/api';
import { cn, relative } from '@/lib/utils';

const SEV = { high: ['Grave', 'crit', 'var(--crit)'], medium: ['Médio', 'warn', 'var(--warn)'], low: ['Leve', 'info', 'var(--info)'] } as const;
const HREF: Record<string, (id: number) => string> = { agent: (id) => `/agentes/${id}`, group: () => '/grupos', rule: () => '/regras', tool: () => '/ferramentas', mcp: () => '/bracos', project: () => '/corporacao', routine: () => '/rotinas' };

export default function Conflicts() {
  const { toast } = useApp();
  const { data, error, loading, reload } = useData<any>('/conflicts');
  const [tab, setTab] = React.useState('open');
  const [type, setType] = React.useState<string | null>(null);
  const [accept, setAccept] = React.useState<any | null>(null);
  const [note, setNote] = React.useState('');
  const [audit, setAudit] = React.useState<any | null>(null);
  const [auditing, setAuditing] = React.useState(false);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorNote>{error}</ErrorNote>;
  const src: any[] = tab === 'open' ? data.open : data.accepted;
  const types = [...new Set(src.map((c) => c.typeLabel))] as string[];
  const list = src.filter((c) => !type || c.typeLabel === type);
  const runAudit = async () => {
    setAuditing(true);
    try { const r = await api('/ai/audit', { method: 'POST' }); if (r.ok) setAudit(r); else toast('O motor de IA não respondeu. Tente de novo.', 'crit'); }
    catch (e) { toast((e as Error).message, 'crit'); }
    finally { setAuditing(false); }
  };
  return (
    <>
      <PageHeader title="Conflitos" hint="Onde regras, guardrails, ferramentas e rotinas se contradizem. A checagem é automática e não usa IA.">
        <Button variant="outline" onClick={runAudit} disabled={auditing}>{auditing ? <Loader2 className="animate-spin" /> : <Sparkles />}{auditing ? 'Auditando…' : 'Auditoria com IA'}</Button>
      </PageHeader>
      <div className="mb-5 grid grid-cols-3 gap-3 sm:max-w-xl">
        {(['high', 'medium', 'low'] as const).map((s) => (
          <div key={s} className="rounded-xl border bg-card p-4" style={{ borderLeftWidth: 4, borderLeftColor: SEV[s][2] }}><div className="tabular text-2xl font-semibold leading-none">{data.open.filter((c: any) => c.severity === s).length}</div><div className="mt-1.5 text-xs text-muted-foreground">{SEV[s][0]}{s === 'medium' ? 's' : s === 'high' ? 's' : 's'}</div></div>
        ))}
      </div>
      {audit && (
        <Card className="mb-6 border-brand-ink/40 p-5">
          <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 font-semibold"><Sparkles className="size-4 text-brand-ink" />Auditoria com IA</h2><Button variant="ghost" size="sm" onClick={() => setAudit(null)}>Fechar</Button></div>
          {!audit.findings.length && <p className="text-sm text-muted-foreground">A IA leu regras, prompts e guardrails e não achou contradição de sentido.</p>}
          <ul className="space-y-3">{audit.findings.map((f: any, i: number) => <li key={i} className="text-sm"><div className="flex items-center gap-2 font-medium"><Badge variant={SEV[f.severity as keyof typeof SEV][1]}>{SEV[f.severity as keyof typeof SEV][0]}</Badge>{f.title}</div><p className="mt-1 text-muted-foreground">{f.detail}</p></li>)}</ul>
          <p className="mt-3 text-xs text-muted-foreground">Leitura de apoio: a IA pode errar. Estes achados não entram na contagem.</p>
        </Card>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setType(null); }} className="min-w-0 max-w-full"><TabsList><TabsTrigger value="open">Abertos {data.open.length}</TabsTrigger><TabsTrigger value="accepted">Aceitos {data.accepted.length}</TabsTrigger><TabsTrigger value="resolved">Resolvidos {data.resolved.length}</TabsTrigger></TabsList></Tabs>
        {tab !== 'resolved' && types.map((t) => <button key={t} onClick={() => setType(type === t ? null : t)} aria-pressed={type === t} className={cn('rounded-md border px-2.5 py-1 text-xs transition-colors cursor-pointer', type === t ? 'border-brand-ink/50 bg-brand-soft text-brand-ink' : 'text-muted-foreground hover:border-input')}>{t}</button>)}
      </div>
      {tab === 'resolved' ? (
        <>
          {!data.resolved.length && <Empty icon={ShieldCheck} title="Nada por aqui" hint="Conflitos aceitos que deixaram de existir aparecem nesta lista." />}
          <div className="space-y-2">{data.resolved.map((m: any) => <Card key={m.fingerprint} className="flex items-center gap-3 p-4 text-sm"><CircleCheck className="size-4 shrink-0 text-ok" /><span className="flex-1">{m.title}</span><Badge variant="outline">{m.type}</Badge></Card>)}</div>
        </>
      ) : (
        <>
          {!list.length && <Empty icon={ShieldCheck} title={tab === 'open' ? 'Nenhum conflito aberto' : 'Nenhum conflito aceito'} hint={tab === 'open' ? 'Regras, guardrails, ferramentas e rotinas estão coerentes.' : undefined} />}
          <div className="space-y-3">
            {list.map((c) => {
              const [label, variant, color] = SEV[c.severity as keyof typeof SEV];
              return (
                <Card key={c.id} className="p-5" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
                  <div className="flex flex-wrap items-center gap-2"><Badge variant={variant}><ShieldAlert />{label}</Badge><Badge variant="outline">{c.typeLabel}</Badge></div>
                  <h3 className="mt-2 font-semibold leading-snug">{c.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{c.detail}</p>
                  <p className="mt-3 flex items-start gap-1.5 text-sm"><Lightbulb className="mt-0.5 size-4 shrink-0 text-brand-ink" /><span><span className="font-medium">Como resolver: </span>{c.fix}</span></p>
                  {c.mark && <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Aceito por {c.mark.userName} {relative(c.mark.createdAt)}{c.mark.note ? `: “${c.mark.note}”` : '.'}</p>}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    {c.refs.map((r: any, i: number) => <Button key={i} size="sm" variant="secondary" asChild><Link to={HREF[r.type](r.id)}>Abrir {r.name}</Link></Button>)}
                    {c.mark ? <Button size="sm" variant="ghost" className="ml-auto" onClick={async () => { await api(`/conflicts/${c.id}/mark`, { body: { accepted: false } }); reload(); }}><Undo2 />Reabrir</Button>
                      : <Button size="sm" variant="ghost" className="ml-auto" onClick={() => { setAccept(c); setNote(''); }}><Check />Aceitar o risco</Button>}
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
      <Dialog open={!!accept} onOpenChange={(o) => !o && setAccept(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aceitar este conflito?</DialogTitle><DialogDescription>Ele sai da lista de abertos e dos alertas, mas continua registrado com o seu nome.</DialogDescription></DialogHeader>
          <DialogBody><div className="rounded-lg border p-3 text-sm font-medium">{accept?.title}</div><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Por quê? (opcional)" /></DialogBody>
          <DialogFooter><Button variant="ghost" onClick={() => setAccept(null)}>Cancelar</Button><Button onClick={async () => { await api(`/conflicts/${accept.id}/mark`, { body: { accepted: true, note } }); setAccept(null); reload(); toast('Conflito aceito.'); }}>Aceitar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
