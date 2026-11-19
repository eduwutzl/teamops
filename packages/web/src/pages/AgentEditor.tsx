import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Check, CircleCheck, History, Loader2, Plus, ShieldQuestion, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { Confirm, DiffView, ErrorNote, Field, Loading, RiskBadge, Why, useApp } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/controls';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, useData } from '@/lib/api';
import { cn } from '@/lib/utils';

const BLANK = { name: '', emoji: '🤖', title: '', description: '', status: 'draft', groupId: null, projectIds: [], engine: 'claude-code', model: 'sonnet', draft: '', prompt: '', guardrails: { can: [], approval: [], never: [] }, tools: [], extras: {}, why: {}, weeklyCapacity: 40 };
const COLS = [
  { key: 'can', label: 'Pode', hint: 'Faz sozinho', icon: CircleCheck, cls: 'text-ok', ph: 'Ex.: ler os chamados' },
  { key: 'approval', label: 'Com aprovação', hint: 'Pergunta antes', icon: ShieldQuestion, cls: 'text-warn', ph: 'Ex.: oferecer desconto' },
  { key: 'never', label: 'Nunca', hint: 'Proibido', icon: Ban, cls: 'text-crit', ph: 'Ex.: apagar dados' },
] as const;

function GuardCol({ col, items, onChange }: { col: (typeof COLS)[number]; items: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = React.useState('');
  const add = () => { const t = text.trim(); if (t && !items.includes(t)) onChange([...items, t]); setText(''); };
  return (
    <div className="flex flex-col rounded-lg border bg-background">
      <div className="flex items-center gap-2 border-b px-3 py-2.5"><col.icon className={cn('size-4 shrink-0', col.cls)} /><div className="min-w-0"><div className="truncate text-sm font-semibold leading-tight">{col.label}</div><div className="truncate text-xs text-muted-foreground">{col.hint}</div></div></div>
      <ul className="flex-1 space-y-1 p-2">
        {items.map((it, i) => (
          <li key={i} className="group flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
            <span className="flex-1 break-words">{it}</span>
            <button onClick={() => onChange(items.filter((_, k) => k !== i))} className="mt-0.5 text-muted-foreground opacity-60 hover:text-crit group-hover:opacity-100 cursor-pointer" aria-label={`Remover: ${it}`}><X className="size-3.5" /></button>
          </li>
        ))}
        {!items.length && <li className="px-2 py-1.5 text-sm text-muted-foreground">Nada definido.</li>}
      </ul>
      <div className="flex gap-1.5 border-t p-2"><Input className="h-8 text-[13px]" value={text} placeholder={col.ph} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} /><Button size="icon" variant="secondary" className="size-8" onClick={add} aria-label={`Adicionar em ${col.label}`}><Plus /></Button></div>
    </div>
  );
}

export default function AgentEditor() {
  const { id } = useParams();
  const isNew = id === 'novo';
  const nav = useNavigate();
  const { me, toast } = useApp();
  const { data: loaded, error } = useData<any>(isNew ? null : `/agents/${id}`);
  const { data: groups } = useData<any[]>('/groups');
  const { data: projects } = useData<any[]>('/projects');
  const { data: tools } = useData<any[]>('/tools');
  const [a, setA] = React.useState<any>(isNew ? BLANK : null);
  const [saved, setSaved] = React.useState<string>(JSON.stringify(BLANK));
  const [filled, setFilled] = React.useState<string[]>([]);
  const [gen, setGen] = React.useState(false);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState<'' | 'suggest' | 'review' | 'save'>('');
  const [hint, setHint] = React.useState('');
  const [review, setReview] = React.useState<any | null>(null);
  const [del, setDel] = React.useState(false);

  React.useEffect(() => { if (loaded) { setA(loaded); setSaved(JSON.stringify(loaded)); } }, [loaded]);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!a) return <Loading />;
  const set = (patch: any) => setA((cur: any) => ({ ...cur, ...patch }));
  const dirty = JSON.stringify(a) !== saved;
  const engine = me.engines.find((e) => e.id === a.engine) ?? me.engines[0];
  const isFilled = (f: string) => filled.includes(f);
  const why = (f: string) => (isFilled(f) ? a.why?.[f] : undefined);

  const generate = async () => {
    setGen(true); setNote('');
    try {
      const r = await api('/ai/profile', { body: { draft: a.draft, name: a.name } });
      const fields = Object.fromEntries(Object.entries(r.fields).filter(([, v]) => v !== '' && v != null));
      set({ ...fields, why: r.why });
      setFilled(Object.keys(fields));
      setNote(r.byAi ? '' : r.note);
      toast(r.byAi ? 'Perfil preenchido. Confira os campos em destaque.' : 'Preenchi com regras simples.');
    } catch (e) { toast((e as Error).message, 'crit'); }
    finally { setGen(false); }
  };
  const save = async (status?: string) => {
    setBusy('save');
    try {
      const body = { ...a, ...(status ? { status } : {}) };
      const r = isNew ? await api('/agents', { body }) : await api(`/agents/${a.id}`, { method: 'PATCH', body });
      toast(status === 'active' ? 'Agente ativado.' : 'Agente salvo.');
      setA(r); setSaved(JSON.stringify(r)); setFilled([]);
      if (isNew) nav(`/agentes/${r.id}`, { replace: true });
    } catch (e) { toast((e as Error).message, 'crit'); }
    finally { setBusy(''); }
  };
  const suggest = async () => {
    setBusy('suggest');
    try { const r = await api('/ai/prompt/suggest', { body: { agent: a, hint } }); if (r.ok) { set({ prompt: r.text }); setFilled((f) => [...new Set([...f, 'prompt'])]); toast('Prompt sugerido. Leia antes de salvar.'); } else toast(r.text, 'crit'); }
    catch (e) { toast((e as Error).message, 'crit'); }
    finally { setBusy(''); }
  };
  const doReview = async () => {
    setBusy('review');
    try { setReview(await api('/ai/prompt/review', { body: { agent: a } })); }
    catch (e) { toast((e as Error).message, 'crit'); }
    finally { setBusy(''); }
  };

  const cats = [...new Set((tools ?? []).map((t) => t.category))];
  const unknown = a.tools.filter((k: string) => tools && !tools.some((t) => t.key === k));
  const ST = { draft: ['Rascunho', 'outline'], active: ['Ativo', 'ok'], paused: ['Pausado', 'warn'] } as const;

  return (
    <div className="pb-24">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link to="/agentes" aria-label="Voltar"><ArrowLeft /></Link></Button>
        <span className="flex size-12 items-center justify-center rounded-xl bg-muted text-2xl">{a.emoji}</span>
        <div className="min-w-0 flex-1"><h1 className="truncate text-2xl font-semibold">{a.name || 'Novo agente'}</h1><p className="truncate text-sm text-muted-foreground">{a.title || 'Escreva um rascunho e deixe a IA montar o perfil.'}</p></div>
        <Badge variant={ST[a.status as keyof typeof ST][1]}>{ST[a.status as keyof typeof ST][0]}</Badge>
        {!isNew && <Button variant="ghost" size="sm" asChild><Link to={`/historico?entity=agents&entityId=${a.id}`}><History />Versões</Link></Button>}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <Card className="border-brand-ink/40">
            <CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-brand-ink" />Rascunho</CardTitle><div className="text-sm text-muted-foreground">Descreva com as suas palavras o que o agente faz. A IA preenche o resto e explica cada escolha.</div></CardHeader>
            <CardContent className="space-y-3">
              <Textarea rows={4} value={a.draft} onChange={(e) => set({ draft: e.target.value })} placeholder="Ex.: quero um agente que leia os chamados novos toda manhã, classifique por urgência e rascunhe as respostas. Ele não pode enviar nada sem eu aprovar." />
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={generate} disabled={gen || a.draft.trim().length < 10}>{gen ? <Loader2 className="animate-spin" /> : <Wand2 />}{gen ? 'Gerando perfil…' : 'Gerar perfil'}</Button>
                <span className="text-xs text-muted-foreground">{gen ? 'Leva de 20 a 60 segundos.' : `Usa o motor local (${me.ai.engine}, ${me.ai.model}). Nada é salvo até você clicar em Salvar.`}</span>
              </div>
              {note && <p className="text-sm text-warn">{note}</p>}
              {filled.length > 0 && !note && <p className="flex items-center gap-1.5 text-sm text-brand-ink"><Check className="size-4" />{filled.length} campos preenchidos. Eles estão em destaque abaixo, com o porquê.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Identidade</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-[5rem_1fr] gap-4">
                <Field label="Ícone"><Input className="text-center text-lg" maxLength={4} value={a.emoji} onChange={(e) => set({ emoji: e.target.value })} /></Field>
                <Field label="Nome" filled={isFilled('name')} why={why('name')}><Input value={a.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              </div>
              <Field label="Função" filled={isFilled('title')} why={why('title')} hint="Em poucas palavras."><Input value={a.title} onChange={(e) => set({ title: e.target.value })} placeholder="Triagem de chamados" /></Field>
              <Field label="Quando usar" filled={isFilled('description')} why={why('description')} hint="Uma frase. É por ela que os outros agentes decidem chamar este."><Textarea rows={2} value={a.description} onChange={(e) => set({ description: e.target.value })} /></Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Guardrails</CardTitle><div className="text-sm text-muted-foreground">Os limites do agente, em três colunas. Enter adiciona.</div></CardHeader>
            <CardContent className={cn('space-y-3', isFilled('guardrails') && 'rounded-b-xl bg-brand-soft/30')}>
              <div className="grid gap-3 md:grid-cols-3">{COLS.map((c) => <GuardCol key={c.key} col={c} items={a.guardrails[c.key]} onChange={(v) => set({ guardrails: { ...a.guardrails, [c.key]: v } })} />)}</div>
              {why('guardrails') && <Why>{why('guardrails')}</Why>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Ferramentas</CardTitle><div className="text-sm text-muted-foreground">Marque só o necessário. {a.tools.length} marcada{a.tools.length === 1 ? '' : 's'}.</div></CardHeader>
            <CardContent className={cn('space-y-5', isFilled('tools') && 'rounded-b-xl bg-brand-soft/30')}>
              {why('tools') && <Why>{why('tools')}</Why>}
              {cats.map((cat) => (
                <div key={cat}>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</div>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {(tools ?? []).filter((t) => t.category === cat).map((t) => {
                      const on = a.tools.includes(t.key);
                      return (
                        <label key={t.id} className={cn('flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors', on ? 'border-brand-ink/50 bg-brand-soft/50' : 'hover:border-input')}>
                          <Checkbox className="mt-0.5" checked={on} onCheckedChange={(v) => set({ tools: v ? [...a.tools, t.key] : a.tools.filter((k: string) => k !== t.key) })} />
                          <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{t.label}</span><RiskBadge risk={t.risk} /></span><span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{t.description}</span></span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              {unknown.length > 0 && <div className="text-sm text-warn">Fora do catálogo: {unknown.map((k: string) => <button key={k} className="mr-1 inline-flex items-center gap-1 rounded bg-warn-soft px-1.5 font-mono text-xs cursor-pointer" onClick={() => set({ tools: a.tools.filter((x: string) => x !== k) })}>{k}<X className="size-3" /></button>)}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Prompt</CardTitle><div className="text-sm text-muted-foreground">As instruções que o agente recebe. Os guardrails entram sozinhos no fim.</div></CardHeader>
            <CardContent className="space-y-3">
              <Field label="Texto" filled={isFilled('prompt')} why={why('prompt')}><Textarea rows={14} className="font-mono text-[13px]" value={a.prompt} onChange={(e) => set({ prompt: e.target.value })} placeholder="Você é…" /></Field>
              <div className="flex flex-wrap items-center gap-2">
                <Input className="min-w-48 flex-1" value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Pedido para a IA (opcional): mais curto, mais formal…" />
                <Button variant="secondary" onClick={suggest} disabled={!!busy}>{busy === 'suggest' ? <Loader2 className="animate-spin" /> : <Sparkles />}Sugerir</Button>
                <Button variant="secondary" onClick={doReview} disabled={!!busy || !a.prompt.trim()}>{busy === 'review' ? <Loader2 className="animate-spin" /> : <ShieldQuestion />}Revisar</Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Motor e modelo</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Motor" hint={engine.hint}>
                <Select value={a.engine} onValueChange={(v) => set({ engine: v, model: me.engines.find((e) => e.id === v)!.models[0].id })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{me.engines.map((e) => <SelectItem key={e.id} value={e.id}>{e.label}{e.ready ? '' : ' (fase 2)'}</SelectItem>)}</SelectContent></Select>
              </Field>
              <Field label="Modelo" filled={isFilled('model')} why={why('model')}>
                <Select value={a.model} onValueChange={(v) => set({ model: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{engine.models.map((m) => <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>)}{!engine.models.some((m) => m.id === a.model) && <SelectItem value={a.model}>{a.model}</SelectItem>}</SelectContent></Select>
              </Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Onde trabalha</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <Field label="Grupo" filled={isFilled('groupId')} why={why('groupId')}>
                <Select value={String(a.groupId ?? 'none')} onValueChange={(v) => set({ groupId: v === 'none' ? null : Number(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem grupo</SelectItem>{(groups ?? []).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.emoji} {g.name}</SelectItem>)}</SelectContent></Select>
              </Field>
              <Field label="Projetos">
                <div className="space-y-2">{(projects ?? []).map((p) => <label key={p.id} className="flex cursor-pointer items-center gap-2.5 text-sm"><Checkbox checked={a.projectIds.includes(p.id)} onCheckedChange={(v) => set({ projectIds: v ? [...a.projectIds, p.id] : a.projectIds.filter((x: number) => x !== p.id) })} />{p.name}</label>)}{!projects?.length && <span className="text-sm text-muted-foreground">Nenhum projeto cadastrado.</span>}</div>
              </Field>
              <Field label="Capacidade semanal" hint="Quantas tarefas por semana ele aguenta. Usado na tela Capacidade."><Input type="number" min={1} value={a.weeklyCapacity} onChange={(e) => set({ weeklyCapacity: Number(e.target.value) || 1 })} /></Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Campos extras</CardTitle><div className="text-sm text-muted-foreground">Anotações livres: dono, contato, origem.</div></CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(a.extras as Record<string, string>).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2"><span className="w-24 shrink-0 truncate text-sm text-muted-foreground">{k}</span><Input className="h-8" value={v} onChange={(e) => set({ extras: { ...a.extras, [k]: e.target.value } })} /><Button variant="ghost" size="icon" className="size-8" onClick={() => { const { [k]: _, ...rest } = a.extras; set({ extras: rest }); }} aria-label={`Remover ${k}`}><X /></Button></div>
              ))}
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget.elements.namedItem('k') as HTMLInputElement; const k = f.value.trim(); if (k && !(k in a.extras)) set({ extras: { ...a.extras, [k]: '' } }); f.value = ''; }}><Input name="k" className="h-8" placeholder="Nome do campo" /><Button type="submit" size="sm" variant="secondary"><Plus />Campo</Button></form>
            </CardContent>
          </Card>
          {!isNew && <Button variant="destructive" className="w-full" onClick={() => setDel(true)}><Trash2 />Remover agente</Button>}
        </div>
      </div>

      <div className="no-print fixed inset-x-0 bottom-0 z-20 border-t bg-card lg:left-64">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-2 px-4 py-3 sm:px-8">
          <span className="mr-auto text-sm text-muted-foreground">{dirty ? 'Há mudanças não salvas.' : 'Tudo salvo.'}</span>
          {a.status === 'active' && <Button variant="ghost" disabled={!!busy} onClick={() => save('paused')}>Pausar</Button>}
          <Button variant={a.status === 'active' ? 'default' : 'secondary'} disabled={!!busy || !a.name || !dirty} onClick={() => save()}>{busy === 'save' && <Loader2 className="animate-spin" />}Salvar</Button>
          {a.status !== 'active' && <Button disabled={!!busy || !a.name} onClick={() => save('active')}><Check />Salvar e ativar</Button>}
        </div>
      </div>

      <Dialog open={!!review} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Revisão do prompt</DialogTitle><DialogDescription>{review?.ok ? `${review.issues.length} ponto(s) encontrados.` : 'A revisão não ficou pronta.'}</DialogDescription></DialogHeader>
          <DialogBody>
            <ul className="space-y-2">{review?.issues.map((i: string, k: number) => <li key={k} className="flex gap-2 text-sm"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warn" />{i}</li>)}</ul>
            {review?.improved && <><div className="text-sm font-medium">Versão sugerida (verde entra, vermelho sai)</div><DiffView lines={review.diff} /></>}
          </DialogBody>
          <DialogFooter><Button variant="ghost" onClick={() => setReview(null)}>Manter o meu</Button>{review?.improved && <Button onClick={() => { set({ prompt: review.improved }); setFilled((f) => [...new Set([...f, 'prompt'])]); setReview(null); }}>Usar a versão sugerida</Button>}</DialogFooter>
        </DialogContent>
      </Dialog>
      <Confirm open={del} title="Remover agente?" text={`${a.name} sai do time. Dá para restaurar pelo Histórico.`} onClose={() => setDel(false)} onConfirm={async () => { await api(`/agents/${a.id}`, { method: 'DELETE' }); toast('Agente removido.'); nav('/agentes'); }} />
    </div>
  );
}
