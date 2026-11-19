import * as React from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Pencil, Plus, Trash2 } from 'lucide-react';
import { Confirm, Empty, Field, Loading, PageHeader, Sheet, useApp } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/controls';
import { Input, Textarea } from '@/components/ui/input';
import { api, useData } from '@/lib/api';

export default function Groups() {
  const { toast } = useApp();
  const { data: groups, reload, loading } = useData<any[]>('/groups');
  const { data: agents, reload: reloadAgents } = useData<any[]>('/agents');
  const [edit, setEdit] = React.useState<any | null>(null);
  const [members, setMembers] = React.useState<number[]>([]);
  const [del, setDel] = React.useState<any | null>(null);
  const open = (g: any) => { setEdit(g); setMembers((agents ?? []).filter((a) => g.id && a.groupId === g.id).map((a) => a.id)); };
  const save = async () => {
    try {
      const g = await api(edit.id ? `/groups/${edit.id}` : '/groups', { method: edit.id ? 'PATCH' : 'POST', body: edit });
      // the group and its agents are tied together: membership is saved on each agent
      for (const a of agents ?? []) {
        const inGroup = members.includes(a.id);
        if (inGroup && a.groupId !== g.id) await api(`/agents/${a.id}`, { method: 'PATCH', body: { groupId: g.id } });
        if (!inGroup && a.groupId === g.id) await api(`/agents/${a.id}`, { method: 'PATCH', body: { groupId: null } });
      }
      toast('Grupo salvo.'); setEdit(null); reload(); reloadAgents();
    } catch (e) { toast((e as Error).message, 'crit'); }
  };
  return (
    <>
      <PageHeader title="Grupos de agentes" hint="Áreas do time. Cada agente fica em um grupo; mudar aqui muda no agente.">
        <Button onClick={() => open({ name: '', description: '', emoji: '🧩', color: '#b6ff3b' })}><Plus />Novo grupo</Button>
      </PageHeader>
      {loading && <Loading />}
      {groups && !groups.length && <Empty icon={Boxes} title="Nenhum grupo" hint="Crie áreas como Atendimento, Engenharia ou Operações." />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(groups ?? []).map((g) => {
          const mine = (agents ?? []).filter((a) => a.groupId === g.id);
          return (
            <Card key={g.id} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-2xl">{g.emoji}</span>
                <div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{g.name}</h3><p className="line-clamp-2 text-sm text-muted-foreground">{g.description || 'Sem descrição.'}</p></div>
                <div className="flex shrink-0"><Button variant="ghost" size="icon" className="size-8" onClick={() => open(g)} aria-label="Editar"><Pencil /></Button><Button variant="ghost" size="icon" className="size-8" onClick={() => setDel(g)} aria-label="Remover"><Trash2 /></Button></div>
              </div>
              <div className="mt-4 flex-1 space-y-1.5">
                {mine.map((a) => (
                  <Link key={a.id} to={`/agentes/${a.id}`} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                    <span className="text-base">{a.emoji}</span><span className="truncate font-medium">{a.name}</span><span className="truncate text-muted-foreground">{a.title}</span>
                    {a.status !== 'active' && <Badge variant="outline" className="ml-auto">{a.status === 'draft' ? 'rascunho' : 'pausado'}</Badge>}
                  </Link>
                ))}
                {!mine.length && <button onClick={() => open(g)} className="w-full rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground hover:border-input cursor-pointer">Sem agentes. Amarrar agora</button>}
              </div>
            </Card>
          );
        })}
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar grupo' : 'Novo grupo'} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={save} disabled={!edit?.name}>Salvar</Button></>}>
        {edit && (
          <>
            <div className="grid grid-cols-[5rem_1fr] gap-4"><Field label="Ícone"><Input className="text-center text-lg" value={edit.emoji} maxLength={4} onChange={(e) => setEdit({ ...edit, emoji: e.target.value })} /></Field><Field label="Nome"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field></div>
            <Field label="O que este grupo faz"><Textarea rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Agentes do grupo" hint="Marcar aqui tira o agente do grupo em que ele estava.">
              <div className="divide-y rounded-lg border">
                {(agents ?? []).map((a) => (
                  <label key={a.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                    <Checkbox checked={members.includes(a.id)} onCheckedChange={(v) => setMembers(v ? [...members, a.id] : members.filter((x) => x !== a.id))} />
                    <span>{a.emoji}</span><span className="font-medium">{a.name}</span>
                    {a.groupId && a.groupId !== edit.id && <span className="ml-auto text-xs text-muted-foreground">hoje em {groups?.find((g) => g.id === a.groupId)?.name}</span>}
                  </label>
                ))}
                {!agents?.length && <div className="px-3 py-4 text-center text-sm text-muted-foreground">Nenhum agente cadastrado.</div>}
              </div>
            </Field>
          </>
        )}
      </Sheet>
      <Confirm open={!!del} title="Remover grupo?" text={`"${del?.name}" sai da lista e os agentes dele ficam sem grupo. Dá para restaurar pelo Histórico.`} onClose={() => setDel(null)} onConfirm={async () => { for (const a of (agents ?? []).filter((x) => x.groupId === del.id)) await api(`/agents/${a.id}`, { method: 'PATCH', body: { groupId: null } }); await api(`/groups/${del.id}`, { method: 'DELETE' }); reload(); reloadAgents(); }} />
    </>
  );
}
