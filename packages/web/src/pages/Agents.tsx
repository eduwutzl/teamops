import * as React from 'react';
import { Link } from 'react-router-dom';
import { Bot, Plus, Search, ShieldAlert, Wrench } from 'lucide-react';
import { Empty, Loading, PageHeader } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Input } from '@/components/ui/input';
import { useData } from '@/lib/api';
import { cn } from '@/lib/utils';

const ST = { draft: ['Rascunho', 'outline'], active: ['Ativo', 'ok'], paused: ['Pausado', 'warn'] } as const;

export default function Agents() {
  const { data: agents, loading } = useData<any[]>('/agents');
  const { data: groups } = useData<any[]>('/groups');
  const { data: tools } = useData<any[]>('/tools');
  const { data: conflicts } = useData<any>('/conflicts');
  const [q, setQ] = React.useState('');
  const [tab, setTab] = React.useState('all');
  const list = (agents ?? []).filter((a) => (tab === 'all' || a.status === tab) && `${a.name} ${a.title} ${a.description}`.toLowerCase().includes(q.toLowerCase()));
  const count = (s: string) => (agents ?? []).filter((a) => a.status === s).length;
  const sections = [...(groups ?? []).map((g) => ({ id: g.id, name: `${g.emoji} ${g.name}` })), { id: null, name: 'Sem grupo' }].map((g) => ({ ...g, agents: list.filter((a) => (a.groupId ?? null) === g.id) })).filter((g) => g.agents.length);
  return (
    <>
      <PageHeader title="Agentes" hint="Quem faz parte do time. Abra um agente para ver perfil, limites, ferramentas e prompt.">
        <Button asChild><Link to="/agentes/novo"><Plus />Novo agente</Link></Button>
      </PageHeader>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0 max-w-full"><TabsList><TabsTrigger value="all">Todos {agents?.length ?? ''}</TabsTrigger><TabsTrigger value="active">Ativos {count('active')}</TabsTrigger><TabsTrigger value="draft">Rascunhos {count('draft')}</TabsTrigger><TabsTrigger value="paused">Pausados {count('paused')}</TabsTrigger></TabsList></Tabs>
        <div className="relative ml-auto w-full sm:w-64"><Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" placeholder="Buscar agente" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      {loading && <Loading />}
      {agents && !list.length && <Empty icon={Bot} title={agents.length ? 'Nada com esse filtro' : 'Nenhum agente ainda'} hint={agents.length ? undefined : 'Escreva um rascunho em poucas linhas e deixe a IA montar o perfil.'}>{!agents.length && <Button asChild><Link to="/agentes/novo"><Plus />Criar o primeiro</Link></Button>}</Empty>}
      {sections.map((sec) => (
        <section key={String(sec.id)} className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{sec.name}</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sec.agents.map((a) => {
              const risky = a.tools.filter((k: string) => ['high', 'critical'].includes(tools?.find((t) => t.key === k)?.risk)).length;
              const issues = (conflicts?.open ?? []).filter((c: any) => c.refs.some((r: any) => r.type === 'agent' && r.id === a.id)).length;
              const [label, variant] = ST[a.status as keyof typeof ST];
              return (
                <Link key={a.id} to={`/agentes/${a.id}`} className={cn('group flex flex-col rounded-xl border bg-card p-5 transition-colors hover:border-brand-ink/60', a.status === 'draft' && 'border-dashed')}>
                  <div className="flex items-start gap-3">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-muted text-2xl">{a.emoji}</span>
                    <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate font-semibold">{a.name}</h3></div><p className="truncate text-sm text-muted-foreground">{a.title || 'Perfil ainda não gerado'}</p></div>
                    <Badge variant={variant}>{label}</Badge>
                  </div>
                  <p className="mt-3 line-clamp-2 min-h-10 flex-1 text-sm text-muted-foreground">{a.description || a.draft || 'Sem descrição.'}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t pt-3 text-xs">
                    <Badge variant="default">{a.engine === 'mock' ? 'simulado' : a.model}</Badge>
                    <Badge variant="default"><Wrench />{a.tools.length}</Badge>
                    {risky > 0 && <Badge variant="warn">{risky} de risco alto</Badge>}
                    {issues > 0 && <Badge variant="crit" className="ml-auto"><ShieldAlert />{issues} conflito{issues > 1 ? 's' : ''}</Badge>}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
