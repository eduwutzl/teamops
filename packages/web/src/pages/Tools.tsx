import * as React from 'react';
import { Check, Pencil, Plus, Search, Trash2, Wrench } from 'lucide-react';
import { Confirm, Empty, Field, Loading, PageHeader, RiskBadge, Sheet, useApp } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from '@/components/ui/controls';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, useData } from '@/lib/api';
import { cn } from '@/lib/utils';

const CAPS = [['read', 'Ler'], ['write', 'Alterar arquivos'], ['exec', 'Executar comandos'], ['web', 'Acessar a internet'], ['delete', 'Apagar'], ['send', 'Enviar mensagens'], ['delegate', 'Delegar']] as const;
const RISKS = [['low', 'Baixo'], ['medium', 'Médio'], ['high', 'Alto'], ['critical', 'Crítico']] as const;
const RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const DOT: Record<string, string> = { low: 'bg-ok', medium: 'bg-info', high: 'bg-warn', critical: 'bg-crit' };

export default function Tools() {
  const { toast } = useApp();
  const { data: tools, reload, loading } = useData<any[]>('/tools');
  const { data: agents, reload: reloadAgents } = useData<any[]>('/agents');
  const [q, setQ] = React.useState('');
  const [risk, setRisk] = React.useState('all');
  const [edit, setEdit] = React.useState<any | null>(null);
  const [del, setDel] = React.useState<any | null>(null);
  const list = (tools ?? []).filter((t) => (risk === 'all' || t.risk === risk) && `${t.label} ${t.key} ${t.description} ${t.category}`.toLowerCase().includes(q.toLowerCase()));
  const cats = [...new Set(list.map((t) => t.category))];
  const users = (key: string) => (agents ?? []).filter((a) => a.tools.includes(key));
  const save = async () => {
    try { await api(edit.id ? `/tools/${edit.id}` : '/tools', { method: edit.id ? 'PATCH' : 'POST', body: edit }); toast('Ferramenta salva.'); setEdit(null); reload(); }
    catch (e) { toast((e as Error).message, 'crit'); }
  };
  const toggle = async (agent: any, key: string) => {
    const next = agent.tools.includes(key) ? agent.tools.filter((k: string) => k !== key) : [...agent.tools, key];
    try { await api(`/agents/${agent.id}`, { method: 'PATCH', body: { tools: next } }); reloadAgents(); }
    catch (e) { toast((e as Error).message, 'crit'); }
  };
  const matrixTools = [...list].sort((a, b) => RANK[b.risk] - RANK[a.risk] || a.label.localeCompare(b.label));
  const matrixAgents = (agents ?? []).filter((a) => a.status !== 'draft');
  return (
    <>
      <PageHeader title="Ferramentas" hint="Tudo o que um agente pode usar, com nome simples e nível de risco. O mapa mostra quem tem o quê.">
        <Button onClick={() => setEdit({ key: '', label: '', description: '', risk: 'medium', category: 'Geral', capabilities: [], source: 'custom' })}><Plus />Nova ferramenta</Button>
      </PageHeader>
      <Tabs defaultValue="catalog">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <TabsList><TabsTrigger value="catalog">Catálogo</TabsTrigger><TabsTrigger value="map">Mapa ferramenta × agente</TabsTrigger></TabsList>
          <div className="relative ml-auto w-full sm:w-64"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar ferramenta" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <Select value={risk} onValueChange={setRisk}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todo risco</SelectItem>{RISKS.map(([v, l]) => <SelectItem key={v} value={v}>Risco {l.toLowerCase()}</SelectItem>)}</SelectContent></Select>
        </div>
        {loading && <Loading />}
        <TabsContent value="catalog">
          {tools && !list.length && <Empty icon={Wrench} title="Nada encontrado" />}
          {cats.map((cat) => (
            <section key={cat} className="mb-7">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{cat}</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {list.filter((t) => t.category === cat).map((t) => {
                  const us = users(t.key);
                  return (
                    <Card key={t.id} className="group p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><div className="truncate font-medium">{t.label}</div><div className="truncate font-mono text-xs text-muted-foreground">{t.key}</div></div>
                        <RiskBadge risk={t.risk} />
                      </div>
                      <p className="mt-2 line-clamp-2 min-h-10 text-sm text-muted-foreground">{t.description}</p>
                      <div className="mt-3 flex items-center gap-1">
                        {us.slice(0, 5).map((a) => <Tooltip key={a.id} content={a.name}><span className="flex size-6 items-center justify-center rounded-md bg-muted text-xs">{a.emoji}</span></Tooltip>)}
                        <span className="ml-1 text-xs text-muted-foreground">{us.length ? `${us.length} agente${us.length > 1 ? 's' : ''}` : 'ninguém usa'}</span>
                        <span className="ml-auto flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"><Button variant="ghost" size="icon" className="size-7" onClick={() => setEdit(t)} aria-label="Editar"><Pencil /></Button><Button variant="ghost" size="icon" className="size-7" onClick={() => setDel(t)} aria-label="Remover"><Trash2 /></Button></span>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </TabsContent>
        <TabsContent value="map">
          <p className="mb-3 text-sm text-muted-foreground">Clique numa casa para dar ou tirar a ferramenta. Ordenado do maior risco para o menor.</p>
          <Card className="overflow-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr><th className="sticky left-0 z-10 min-w-56 border-b bg-card px-4 py-3 text-left font-medium text-muted-foreground">Ferramenta</th>
                  {matrixAgents.map((a) => <th key={a.id} className="border-b px-2 py-3 text-center font-medium"><div className="text-lg leading-none">{a.emoji}</div><div className="mt-1 w-16 truncate text-xs text-muted-foreground">{a.name}</div></th>)}</tr>
              </thead>
              <tbody>
                {matrixTools.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/40">
                    <td className="sticky left-0 z-10 border-b bg-card px-4 py-2"><div className="flex items-center gap-2"><Tooltip content={`Risco ${RISKS.find(([v]) => v === t.risk)?.[1].toLowerCase()}`}><span className={cn('size-2.5 shrink-0 rounded-full', DOT[t.risk])} /></Tooltip><span className="truncate">{t.label}</span></div></td>
                    {matrixAgents.map((a) => {
                      const on = a.tools.includes(t.key);
                      return <td key={a.id} className="border-b p-1 text-center"><button onClick={() => toggle(a, t.key)} aria-pressed={on} aria-label={`${a.name}: ${t.label}`} className={cn('mx-auto flex size-7 items-center justify-center rounded-md border transition-colors cursor-pointer', on ? (RANK[t.risk] >= 2 ? 'border-warn bg-warn-soft text-warn' : 'border-brand-ink/50 bg-brand-soft text-brand-ink') : 'border-transparent text-transparent hover:border-input')}><Check className="size-4" strokeWidth={2.5} /></button></td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><span className="size-3 rounded border border-brand-ink/50 bg-brand-soft" />tem a ferramenta</span><span className="flex items-center gap-1.5"><span className="size-3 rounded border border-warn bg-warn-soft" />tem, e o risco é alto</span></div>
        </TabsContent>
      </Tabs>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar ferramenta' : 'Nova ferramenta'} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={save} disabled={!edit?.key || !edit?.label}>Salvar</Button></>}>
        {edit && (
          <>
            <Field label="Nome amigável"><Input value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="Ex.: Responder cliente" /></Field>
            <Field label="Nome técnico" hint="Como o motor chama a ferramenta."><Input className="font-mono text-xs" value={edit.key} disabled={edit.source === 'builtin'} onChange={(e) => setEdit({ ...edit, key: e.target.value })} placeholder="mcp__servidor__ferramenta" /></Field>
            <Field label="O que faz"><Textarea rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Risco"><Select value={edit.risk} onValueChange={(v) => setEdit({ ...edit, risk: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{RISKS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Categoria"><Input value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></Field>
            </div>
            <Field label="O que ela permite" hint="O analisador de conflitos cruza isto com os guardrails.">
              <div className="grid grid-cols-2 gap-2">{CAPS.map(([v, l]) => <label key={v} className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={edit.capabilities.includes(v)} onCheckedChange={(c) => setEdit({ ...edit, capabilities: c ? [...edit.capabilities, v] : edit.capabilities.filter((x: string) => x !== v) })} />{l}</label>)}</div>
            </Field>
            {edit.source !== 'custom' && <Badge variant="outline">{edit.source === 'builtin' ? 'Nativa do motor' : 'Vem de um braço'}</Badge>}
          </>
        )}
      </Sheet>
      <Confirm open={!!del} title="Remover ferramenta?" text={`"${del?.label}" sai do catálogo. Agentes que a usam passam a aparecer em Conflitos.`} onClose={() => setDel(null)} onConfirm={async () => { await api(`/tools/${del.id}`, { method: 'DELETE' }); reload(); }} />
    </>
  );
}
