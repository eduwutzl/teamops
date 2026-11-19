import * as React from 'react';
import { Pencil, Plus, ScrollText, Trash2 } from 'lucide-react';
import { Confirm, Empty, Field, Loading, PageHeader, Sheet, useApp } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/controls';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, useData } from '@/lib/api';
import { cn } from '@/lib/utils';

export default function Rules() {
  const { toast } = useApp();
  const { data: rules, reload, loading } = useData<any[]>('/rules');
  const { data: projects } = useData<any[]>('/projects');
  const [edit, setEdit] = React.useState<any | null>(null);
  const [del, setDel] = React.useState<any | null>(null);
  const list = [...(rules ?? [])].sort((a, b) => a.position - b.position);
  const cats = [...new Set(list.map((r) => r.category))];
  const save = async () => {
    try { await api(edit.id ? `/rules/${edit.id}` : '/rules', { method: edit.id ? 'PATCH' : 'POST', body: { ...edit, projectId: edit.projectId === 'all' || edit.projectId == null ? null : Number(edit.projectId) } }); toast('Regra salva.'); setEdit(null); reload(); }
    catch (e) { toast((e as Error).message, 'crit'); }
  };
  return (
    <>
      <PageHeader title="Regras gerais" hint="Normas de trabalho que valem para todos os agentes. Viram o CLAUDE.md de cada projeto.">
        <Button onClick={() => setEdit({ title: '', body: '', category: cats[0] ?? 'Regras gerais', projectId: 'all', position: (list.at(-1)?.position ?? 0) + 1, active: true })}><Plus />Nova regra</Button>
      </PageHeader>
      {loading && <Loading />}
      {rules && !rules.length && <Empty icon={ScrollText} title="Nenhuma regra" hint="Comece pelo básico: como responder, o que nunca fazer, quando pedir aprovação." />}
      {cats.map((cat) => (
        <section key={cat} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{cat}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {list.filter((r) => r.category === cat).map((r) => (
              <Card key={r.id} className={cn('p-5', !r.active && 'opacity-60')}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold leading-snug">{r.title}</h3>
                  <div className="flex shrink-0 gap-1"><Button variant="ghost" size="icon" className="size-8" onClick={() => setEdit({ ...r, projectId: r.projectId ?? 'all' })} aria-label="Editar"><Pencil /></Button><Button variant="ghost" size="icon" className="size-8" onClick={() => setDel(r)} aria-label="Remover"><Trash2 /></Button></div>
                </div>
                <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{r.body}</p>
                <div className="mt-3 flex gap-1.5">{r.projectId ? <Badge variant="info">só {projects?.find((p) => p.id === r.projectId)?.name ?? 'um projeto'}</Badge> : <Badge variant="outline">todos os projetos</Badge>}{!r.active && <Badge variant="outline">desligada</Badge>}</div>
              </Card>
            ))}
          </div>
        </section>
      ))}
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar regra' : 'Nova regra'} hint="Frases curtas e diretas. Comece proibições por “Nunca”, para o analisador de conflitos entender." footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={save} disabled={!edit?.title}>Salvar</Button></>}>
        {edit && (
          <>
            <Field label="Título"><Input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></Field>
            <Field label="Texto"><Textarea rows={8} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Categoria"><Input value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} list="rule-cats" /><datalist id="rule-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></Field>
              <Field label="Ordem"><Input type="number" value={edit.position} onChange={(e) => setEdit({ ...edit, position: Number(e.target.value) })} /></Field>
            </div>
            <Field label="Vale para"><Select value={String(edit.projectId)} onValueChange={(v) => setEdit({ ...edit, projectId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os projetos</SelectItem>{(projects ?? []).map((p) => <SelectItem key={p.id} value={String(p.id)}>Só {p.name}</SelectItem>)}</SelectContent></Select></Field>
            <label className="flex items-center justify-between text-sm"><span>Regra ligada</span><Switch checked={edit.active} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /></label>
          </>
        )}
      </Sheet>
      <Confirm open={!!del} title="Remover regra?" text={`"${del?.title}" deixa de valer. Dá para restaurar pelo Histórico.`} onClose={() => setDel(null)} onConfirm={async () => { await api(`/rules/${del.id}`, { method: 'DELETE' }); reload(); }} />
    </>
  );
}
