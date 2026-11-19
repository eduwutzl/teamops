import * as React from 'react';
import { ArrowRight, Bot, CheckCircle2, CircleDashed, Loader2, OctagonAlert, Pencil, Plug, Plus, Radio, Trash2, Wrench } from 'lucide-react';
import { Confirm, Empty, Field, Loading, PageHeader, RiskBadge, Sheet, useApp } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch, Tabs, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Input, Textarea } from '@/components/ui/input';
import { api, useData } from '@/lib/api';
import { relative } from '@/lib/utils';

const EX = { stdio: { command: 'npx', argsText: '-y\n@modelcontextprotocol/server-filesystem\n/caminho/da/pasta' }, http: { url: 'https://exemplo.com/mcp' }, sse: { url: 'https://exemplo.com/sse' } };

export default function Arms() {
  const { toast } = useApp();
  const { data: arms, reload, loading } = useData<any[]>('/mcps');
  const { data: tools, reload: reloadTools } = useData<any[]>('/tools');
  const [edit, setEdit] = React.useState<any | null>(null);
  const [del, setDel] = React.useState<any | null>(null);
  const [busy, setBusy] = React.useState<number | null>(null);
  const [found, setFound] = React.useState<{ arm: any; res: any } | null>(null);

  const test = async (m: any) => {
    setBusy(m.id);
    try { const res = await api(`/mcps/${m.id}/test`, { method: 'POST' }); setFound({ arm: m, res }); reload(); }
    catch (e) { toast((e as Error).message, 'crit'); }
    finally { setBusy(null); }
  };
  const adopt = async () => {
    const r = await api(`/mcps/${found!.arm.id}/adopt`, { body: {} });
    toast(r.created ? `${r.created} ferramenta(s) no catálogo.` : 'Todas já estavam no catálogo.'); setFound(null); reloadTools();
  };
  const save = async () => {
    const body = { ...edit, args: (edit.argsText ?? '').split('\n').map((s: string) => s.trim()).filter(Boolean), env: Object.fromEntries((edit.envText ?? '').split('\n').map((l: string) => { const i = l.indexOf('='); return i < 0 ? [l.trim(), ''] : [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }).filter(([k]: string[]) => k)) };
    try { await api(edit.id ? `/mcps/${edit.id}` : '/mcps', { method: edit.id ? 'PATCH' : 'POST', body }); toast('Braço salvo.'); setEdit(null); reload(); }
    catch (e) { toast((e as Error).message, 'crit'); }
  };
  const openEdit = (m: any) => setEdit({ ...m, argsText: (m.args ?? []).join('\n'), envText: Object.entries(m.env ?? {}).map(([k, v]) => `${k}=${v}`).join('\n') });

  return (
    <>
      <PageHeader title="Braços" hint="Conectores que dão alcance aos agentes: chamados, bancos, sistemas. Tecnicamente, servidores MCP.">
        <Button onClick={() => openEdit({ name: '', label: '', description: '', transport: 'stdio', command: '', args: [], url: '', env: {}, enabled: true })}><Plus />Novo braço</Button>
      </PageHeader>
      <Card className="mb-6 p-5">
        <div className="grid items-center gap-4 text-sm sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"><Bot className="size-5" /></span><div><div className="font-medium">1. O agente</div><div className="text-muted-foreground">precisa agir fora da conversa.</div></div></div>
          <ArrowRight className="hidden size-4 text-muted-foreground sm:block" />
          <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-ink"><Plug className="size-5" /></span><div><div className="font-medium">2. O braço</div><div className="text-muted-foreground">liga o agente a um sistema.</div></div></div>
          <ArrowRight className="hidden size-4 text-muted-foreground sm:block" />
          <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted"><Wrench className="size-5" /></span><div><div className="font-medium">3. As ferramentas</div><div className="text-muted-foreground">são o que o braço sabe fazer.</div></div></div>
        </div>
      </Card>
      {loading && <Loading />}
      {arms && !arms.length && <Empty icon={Plug} title="Nenhum braço" hint="Cadastre um conector e clique em Testar para descobrir as ferramentas dele." />}
      <div className="grid gap-4 lg:grid-cols-2">
        {(arms ?? []).map((m) => {
          const mine = (tools ?? []).filter((t) => t.mcpId === m.id);
          const st = m.lastTestOk === null ? { icon: CircleDashed, cls: 'text-muted-foreground', text: 'Ainda não testado' } : m.lastTestOk ? { icon: CheckCircle2, cls: 'text-ok', text: 'Respondeu' } : { icon: OctagonAlert, cls: 'text-crit', text: 'Falhou' };
          return (
            <Card key={m.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><h3 className="truncate font-semibold">{m.label || m.name}</h3><div className="font-mono text-xs text-muted-foreground">{m.name} · {m.transport === 'stdio' ? 'programa local' : 'endereço web'}</div></div>
                <div className="flex shrink-0 items-center gap-1">{!m.enabled && <Badge variant="outline">desligado</Badge>}<Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(m)} aria-label="Editar"><Pencil /></Button><Button variant="ghost" size="icon" className="size-8" onClick={() => setDel(m)} aria-label="Remover"><Trash2 /></Button></div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{m.description || 'Sem descrição.'}</p>
              <div className="mt-4 flex items-center gap-2 text-sm"><st.icon className={`size-4 ${st.cls}`} /><span className="font-medium">{st.text}</span><span className="min-w-0 truncate text-muted-foreground">{m.lastTestAt ? `· ${relative(m.lastTestAt)} · ${m.lastTestMessage}` : ''}</span></div>
              <div className="mt-4 flex items-center gap-3 border-t pt-4">
                <Button size="sm" onClick={() => test(m)} disabled={busy === m.id}>{busy === m.id ? <Loader2 className="animate-spin" /> : <Radio />}Testar e descobrir</Button>
                <span className="text-sm text-muted-foreground">{mine.length} ferramenta{mine.length === 1 ? '' : 's'} no catálogo{m.discovered.length > mine.length ? ` · ${m.discovered.length - mine.length} a adotar` : ''}</span>
              </div>
            </Card>
          );
        })}
      </div>

      <Sheet open={!!found} onClose={() => setFound(null)} title={`Teste · ${found?.arm.label || found?.arm.name || ''}`} hint={found?.res.ok ? `${found.res.message} ${found.res.server ? `Servidor: ${found.res.server}.` : ''}` : undefined}
        footer={found?.res.ok ? <><Button variant="ghost" onClick={() => setFound(null)}>Fechar</Button><Button onClick={adopt} disabled={found.res.tools.every((t: any) => t.inCatalog)}>Pôr as novas no catálogo</Button></> : <Button onClick={() => setFound(null)}>Fechar</Button>}>
        {found && !found.res.ok && <div className="flex items-start gap-3 rounded-lg border border-crit/40 bg-crit-soft p-4 text-sm text-crit"><OctagonAlert className="mt-0.5 size-4 shrink-0" /><div><div className="font-medium">O braço não respondeu</div><div>{found.res.message}</div></div></div>}
        {found?.res.ok && (
          <div className="divide-y rounded-lg border">
            {found.res.tools.map((t: any) => (
              <div key={t.name} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1"><div className="font-mono text-xs font-medium">{t.name}</div><div className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{t.description || 'Sem descrição.'}</div></div>
                <div className="flex shrink-0 flex-col items-end gap-1"><RiskBadge risk={t.risk} />{t.inCatalog ? <Badge variant="outline">já no catálogo</Badge> : <Badge variant="brand">nova</Badge>}</div>
              </div>
            ))}
          </div>
        )}
        {found?.res.ok && <p className="text-xs text-muted-foreground">O risco é um palpite pelo nome da ferramenta. Ajuste depois, na tela Ferramentas.</p>}
      </Sheet>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar braço' : 'Novo braço'} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={save} disabled={!edit?.name}>Salvar</Button></>}>
        {edit && (
          <>
            <Field label="Nome amigável"><Input value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value, ...(edit.id ? {} : { name: e.target.value.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }) })} placeholder="Central de chamados" /></Field>
            <Field label="Nome técnico" hint="Curto, sem espaços. Entra no nome das ferramentas."><Input className="font-mono text-xs" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Para que serve"><Textarea rows={2} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Como o braço é ligado">
              <Tabs value={edit.transport} onValueChange={(v) => setEdit({ ...edit, transport: v })}><TabsList><TabsTrigger value="stdio">Programa local</TabsTrigger><TabsTrigger value="http">Endereço web</TabsTrigger><TabsTrigger value="sse">Web (SSE)</TabsTrigger></TabsList></Tabs>
            </Field>
            {edit.transport === 'stdio' ? (
              <>
                <Field label="Comando" hint="O programa que o motor inicia."><Input className="font-mono text-xs" value={edit.command} onChange={(e) => setEdit({ ...edit, command: e.target.value })} placeholder={EX.stdio.command} /></Field>
                <Field label="Argumentos" hint="Um por linha."><Textarea rows={3} className="font-mono text-xs" value={edit.argsText} onChange={(e) => setEdit({ ...edit, argsText: e.target.value })} placeholder={EX.stdio.argsText} /></Field>
              </>
            ) : <Field label="Endereço"><Input className="font-mono text-xs" value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} placeholder={EX.http.url} /></Field>}
            <Field label="Variáveis de ambiente" hint="NOME=valor, uma por linha. Ficam só na instância; os arquivos gerados levam apenas ${NOME}."><Textarea rows={3} className="font-mono text-xs" value={edit.envText} onChange={(e) => setEdit({ ...edit, envText: e.target.value })} placeholder="API_TOKEN=..." /></Field>
            <label className="flex items-center justify-between text-sm"><span>Braço ligado</span><Switch checked={edit.enabled} onCheckedChange={(v) => setEdit({ ...edit, enabled: v })} /></label>
          </>
        )}
      </Sheet>
      <Confirm open={!!del} title="Remover braço?" text={`"${del?.label || del?.name}" sai da lista. As ferramentas dele continuam no catálogo.`} onClose={() => setDel(null)} onConfirm={async () => { await api(`/mcps/${del.id}`, { method: 'DELETE' }); reload(); }} />
    </>
  );
}
