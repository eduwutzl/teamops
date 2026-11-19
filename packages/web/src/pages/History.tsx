import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArchiveRestore, FilePlus2, FileX2, History as HistoryIcon, Import, PencilLine, RotateCcw } from 'lucide-react';
import { DiffView, Empty, Loading, PageHeader, Sheet, useApp } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, useData } from '@/lib/api';
import { dateTime, relative } from '@/lib/utils';

const ACT = { create: ['Criou', FilePlus2, 'text-ok'], update: ['Alterou', PencilLine, 'text-info'], delete: ['Removeu', FileX2, 'text-crit'], restore: ['Restaurou', ArchiveRestore, 'text-brand-ink'], import: ['Importou', Import, 'text-ok'] } as const;
const TYPES = [['agents', 'Agentes'], ['rules', 'Regras'], ['groups', 'Grupos'], ['tools', 'Ferramentas'], ['mcps', 'Braços'], ['routines', 'Rotinas'], ['projects', 'Projetos'], ['users', 'Usuários'], ['monitors', 'Conexões']];
const FIELD: Record<string, string> = { name: 'Nome', title: 'Título', description: 'Descrição', prompt: 'Prompt', guardrails: 'Guardrails', tools: 'Ferramentas', model: 'Modelo', engine: 'Motor', status: 'Situação', groupId: 'Grupo', projectIds: 'Projetos', body: 'Texto', cron: 'Agenda', enabled: 'Ligado', draft: 'Rascunho', why: 'Porquês da IA', extras: 'Campos extras', emoji: 'Ícone', category: 'Categoria', risk: 'Risco', weeklyCapacity: 'Capacidade semanal', agentId: 'Agente', requiredTools: 'Ferramentas necessárias', label: 'Nome amigável', capabilities: 'Permite', active: 'Ativo', position: 'Ordem', slug: 'Identificador' };

export default function History() {
  const { toast } = useApp();
  const [params, setParams] = useSearchParams();
  const entity = params.get('entity') ?? 'all', entityId = params.get('entityId');
  const { data: revs, loading, reload } = useData<any[]>(`/revisions?limit=300${entity !== 'all' ? `&entity=${entity}` : ''}${entityId ? `&entityId=${entityId}` : ''}`);
  const [openId, setOpenId] = React.useState<number | null>(null);
  const { data: rev } = useData<any>(openId ? `/revisions/${openId}` : null);
  const groups = new Map<string, any[]>();
  for (const r of revs ?? []) { const k = new Date(r.createdAt).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }); groups.set(k, [...(groups.get(k) ?? []), r]); }
  const restore = async () => {
    try { await api(`/revisions/${openId}/restore`, { method: 'POST' }); toast('Versão restaurada.'); setOpenId(null); reload(); }
    catch (e) { toast((e as Error).message, 'crit'); }
  };
  return (
    <>
      <PageHeader title="Histórico" hint="Toda mudança fica guardada. Veja o que mudou e volte a qualquer versão, inclusive de itens removidos.">
        {entityId && <Button variant="ghost" onClick={() => setParams({})}>Ver tudo</Button>}
        <Select value={entity} onValueChange={(v) => setParams(v === 'all' ? {} : { entity: v })}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos os tipos</SelectItem>{TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
      </PageHeader>
      {loading && <Loading />}
      {revs && !revs.length && <Empty icon={HistoryIcon} title="Sem mudanças registradas" />}
      {[...groups].map(([dayLabel, list]) => (
        <section key={dayLabel} className="mb-7">
          <h2 className="mb-3 text-sm font-semibold capitalize text-muted-foreground">{dayLabel}</h2>
          <Card className="divide-y">
            {list.map((r) => {
              const [label, Icon, cls] = ACT[r.action as keyof typeof ACT];
              return (
                <button key={r.id} onClick={() => setOpenId(r.id)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left text-sm hover:bg-muted/50 cursor-pointer">
                  <Icon className={`size-4 shrink-0 ${cls}`} />
                  <span className="min-w-0 flex-1 basis-48 truncate"><span className="text-muted-foreground">{label} {r.entityLabel.toLowerCase()}</span> <span className="font-medium">{r.label}</span></span>
                  <span className="hidden max-w-64 truncate text-xs text-muted-foreground md:inline">{r.changed.slice(0, 4).map((c: string) => FIELD[c] ?? c).join(', ')}</span>
                  <Badge variant="outline">v{r.version}</Badge>
                  <span className="w-40 text-right text-xs text-muted-foreground">{r.userName || 'sistema'} · {new Date(r.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                </button>
              );
            })}
          </Card>
        </section>
      ))}
      <Sheet wide open={!!openId} onClose={() => setOpenId(null)} title={rev ? `${rev.entityLabel} · ${rev.label}` : 'Versão'} hint={rev ? `Versão ${rev.version} · ${ACT[rev.action as keyof typeof ACT][0].toLowerCase()} por ${rev.userName || 'sistema'} em ${dateTime(rev.createdAt)} (${relative(rev.createdAt)})` : undefined}
        footer={rev && <><span className="mr-auto text-sm text-muted-foreground">{rev.isCurrent ? 'Esta é a versão em uso.' : `Restaurar muda ${rev.vsCurrent.length} campo(s) e cria uma versão nova.`}</span><Button variant="ghost" onClick={() => setOpenId(null)}>Fechar</Button><Button disabled={rev.isCurrent} onClick={restore}><RotateCcw />Restaurar esta versão</Button></>}>
        {!rev && <Loading />}
        {rev && (
          <>
            <div className="text-sm font-medium">O que mudou nesta versão</div>
            {!rev.changes.length && <p className="text-sm text-muted-foreground">{rev.action === 'delete' ? 'O item foi removido. Restaurar traz ele de volta.' : 'Nenhum campo diferente da versão anterior.'}</p>}
            {rev.changes.map((c: any) => (
              <div key={c.field}>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{FIELD[c.field] ?? c.field}</div>
                <DiffView lines={c.lines} />
              </div>
            ))}
          </>
        )}
      </Sheet>
    </>
  );
}
