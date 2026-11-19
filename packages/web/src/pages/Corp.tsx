import * as React from 'react';
import { Download, FileCode2, FolderKanban, FolderSearch, KeyRound, Loader2, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { Confirm, DiffView, Empty, ErrorNote, Field, PageHeader, Sheet, useApp } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/controls';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, useData } from '@/lib/api';
import { cn } from '@/lib/utils';

function Identity() {
  const { me, refreshMe, toast } = useApp();
  const [c, setC] = React.useState(me.corp);
  const dirty = JSON.stringify(c) !== JSON.stringify(me.corp);
  return (
    <Card>
      <CardHeader><CardTitle>Identidade</CardTitle></CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-2">
        <Field label="Nome do time ou empresa"><Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
        <Field label="Frase curta"><Input value={c.tagline} onChange={(e) => setC({ ...c, tagline: e.target.value })} placeholder="O que este time faz, em uma linha" /></Field>
        <Field label="Missão" className="md:col-span-2" hint="Entra no cabeçalho das regras que os agentes leem."><Textarea rows={2} value={c.mission ?? ''} onChange={(e) => setC({ ...c, mission: e.target.value })} /></Field>
        <div className="md:col-span-2"><Button disabled={!dirty} onClick={async () => { await api('/corp', { method: 'PUT', body: c }); refreshMe(); toast('Identidade salva.'); }}>Salvar</Button></div>
      </CardContent>
    </Card>
  );
}

function Users() {
  const { me, toast } = useApp();
  const { data: users, reload } = useData<any[]>('/users');
  const [edit, setEdit] = React.useState<any | null>(null);
  const [del, setDel] = React.useState<any | null>(null);
  const save = async () => {
    try {
      if (edit.id) {
        await api(`/users/${edit.id}`, { method: 'PATCH', body: edit });
        if (edit.password) await api(`/users/${edit.id}/password`, { body: { password: edit.password } });
      } else await api('/users', { body: edit });
      toast('Usuário salvo.'); setEdit(null); reload();
    } catch (e) { toast((e as Error).message, 'crit'); }
  };
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Usuários do sistema</CardTitle><div className="mt-1 text-sm text-muted-foreground">Pessoas que entram no TeamOps. Todos podem tudo: não há níveis.</div></div><Button size="sm" onClick={() => setEdit({ username: '', name: '', email: '', password: '', active: true })}><Plus />Novo</Button></CardHeader>
      <CardContent className="divide-y p-0">
        {(users ?? []).map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-5 py-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-muted"><UserRound className="size-4 text-muted-foreground" /></span>
            <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{u.name || u.username}{u.id === me.user.id && <span className="ml-2 text-xs font-normal text-muted-foreground">você</span>}</div><div className="truncate text-xs text-muted-foreground">@{u.username}{u.email ? ` · ${u.email}` : ''}</div></div>
            {!u.active && <Badge variant="outline">desativado</Badge>}
            <Button variant="ghost" size="icon" onClick={() => setEdit({ ...u, password: '' })} aria-label="Editar"><Pencil /></Button>
            {u.id !== me.user.id && <Button variant="ghost" size="icon" onClick={() => setDel(u)} aria-label="Remover"><Trash2 /></Button>}
          </div>
        ))}
      </CardContent>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar usuário' : 'Novo usuário'} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={save} disabled={!edit?.username || (!edit?.id && (edit?.password ?? '').length < 4)}>Salvar</Button></>}>
        {edit && (
          <>
            <Field label="Nome"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Usuário" hint="Usado para entrar."><Input value={edit.username} onChange={(e) => setEdit({ ...edit, username: e.target.value })} autoComplete="off" /></Field>
            <Field label="E-mail"><Input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></Field>
            <Field label={edit.id ? 'Nova senha' : 'Senha'} hint={edit.id ? 'Deixe vazio para manter.' : 'Mínimo de 4 caracteres.'}><div className="relative"><KeyRound className="absolute left-3 top-2.5 size-4 text-muted-foreground" /><Input className="pl-9" type="password" autoComplete="new-password" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} /></div></Field>
            <label className="flex items-center justify-between text-sm"><span>Pode entrar</span><Switch checked={edit.active} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /></label>
          </>
        )}
      </Sheet>
      <Confirm open={!!del} title="Remover usuário?" text={`${del?.name || del?.username} não poderá mais entrar. Dá para restaurar pelo Histórico.`} onClose={() => setDel(null)} onConfirm={async () => { await api(`/users/${del.id}`, { method: 'DELETE' }); reload(); }} />
    </Card>
  );
}

function ExportSheet({ project, onClose }: { project: any | null; onClose: () => void }) {
  const { me, toast } = useApp();
  const [adapter, setAdapter] = React.useState('claude-code');
  const { data, error, reload } = useData<any>(project ? `/projects/${project.id}/export?adapter=${adapter}` : null);
  const [open, setOpen] = React.useState<string | null>(null);
  const ST = { new: ['novo', 'brand'], changed: ['mudou', 'warn'], same: ['igual', 'outline'] } as const;
  return (
    <Sheet wide open={!!project} onClose={onClose} title={`Gerar arquivos · ${project?.name ?? ''}`} hint="O TeamOps é a fonte da verdade. Aqui ele escreve os arquivos que o motor lê, na pasta do projeto dentro da instância."
      footer={<><span className="mr-auto truncate font-mono text-xs text-muted-foreground">{data?.dir}</span><Button variant="ghost" onClick={onClose}>Fechar</Button><Button disabled={!data} onClick={async () => { const r = await api(`/projects/${project.id}/export`, { body: { adapter } }); toast(`${r.written} arquivo(s) gravados.`); reload(); }}><Download />Gravar arquivos</Button></>}>
      <Tabs value={adapter} onValueChange={setAdapter}><TabsList>{me.adapters.map((a) => <TabsTrigger key={a.id} value={a.id}>{a.label}</TabsTrigger>)}</TabsList></Tabs>
      {error && <ErrorNote>{error}</ErrorNote>}
      {data?.files.map((f: any) => {
        const [label, variant] = ST[f.status as keyof typeof ST];
        return (
          <div key={f.path} className="rounded-lg border">
            <button className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm cursor-pointer" onClick={() => setOpen(open === f.path ? null : f.path)}>
              <FileCode2 className="size-4 text-muted-foreground" /><span className="flex-1 truncate font-mono text-xs">{f.path}</span><Badge variant={variant}>{label}</Badge>
            </button>
            {open === f.path && <div className="border-t p-3">{f.status === 'changed' ? <DiffView lines={f.diff} /> : <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 font-mono text-xs">{f.content}</pre>}</div>}
          </div>
        );
      })}
      {data && data.files.length <= 2 && adapter === 'claude-code' && <p className="text-sm text-muted-foreground">Nenhum agente ativo do Claude Code neste projeto. Marque o projeto no cadastro de um agente.</p>}
    </Sheet>
  );
}

function ImportSheet({ open, onClose, projects }: { open: boolean; onClose: () => void; projects: any[] }) {
  const { toast } = useApp();
  const [path, setPath] = React.useState('');
  const [scan, setScan] = React.useState<any | null>(null);
  const [pick, setPick] = React.useState<string[]>([]);
  const [opts, setOpts] = React.useState({ rules: false, mcps: false, projectId: 'none' });
  const [busy, setBusy] = React.useState(false);
  const doScan = async () => {
    setBusy(true);
    try { const s = await api('/import/claude-code/scan', { body: { path } }); setScan(s); setPick(s.agents.filter((a: any) => !a.exists).map((a: any) => a.slug)); }
    catch (e) { toast((e as Error).message, 'crit'); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    setBusy(true);
    try {
      const r = await api('/import/claude-code/apply', { body: { path, agents: pick, rules: opts.rules, mcps: opts.mcps, projectId: opts.projectId === 'none' ? null : Number(opts.projectId) } });
      toast(`Importado: ${r.agents} agente(s), ${r.rules} regra(s), ${r.mcps} braço(s).`); setScan(null); onClose();
    } catch (e) { toast((e as Error).message, 'crit'); }
    finally { setBusy(false); }
  };
  return (
    <Sheet wide open={open} onClose={onClose} title="Importar ambiente Claude Code" hint="Só leitura: nada é alterado na pasta de origem. Os agentes entram como rascunho, para você revisar."
      footer={scan ? <><Button variant="ghost" onClick={() => setScan(null)}>Voltar</Button><Button onClick={apply} disabled={busy || (!pick.length && !opts.rules && !opts.mcps)}>{busy && <Loader2 className="animate-spin" />}Importar selecionados</Button></> : undefined}>
      {!scan && (
        <>
          <Field label="Pasta do ambiente" hint="A pasta que contém .claude/ (ou a própria pasta .claude), no servidor do TeamOps."><Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/home/voce/projeto" className="font-mono text-xs" /></Field>
          <Button onClick={doScan} disabled={!path.startsWith('/') || busy}>{busy ? <Loader2 className="animate-spin" /> : <FolderSearch />}Ler pasta</Button>
        </>
      )}
      {scan && (
        <>
          {scan.warnings.map((w: string) => <p key={w} className="text-sm text-warn">{w}</p>)}
          <div>
            <div className="mb-2 text-sm font-medium">Agentes encontrados ({scan.agents.length})</div>
            <div className="divide-y rounded-lg border">
              {scan.agents.map((a: any) => (
                <label key={a.slug} className={cn('flex items-start gap-3 px-4 py-3', a.exists ? 'opacity-60' : 'cursor-pointer')}>
                  <Checkbox className="mt-0.5" disabled={a.exists} checked={pick.includes(a.slug)} onCheckedChange={(v) => setPick(v ? [...pick, a.slug] : pick.filter((s) => s !== a.slug))} />
                  <span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2 text-sm font-medium">{a.name}<Badge variant="outline">{a.model}</Badge>{a.exists && <Badge variant="outline">já existe</Badge>}</span><span className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{a.description || 'Sem descrição'}</span><span className="mt-1 block text-xs text-muted-foreground">{a.tools.length} ferramenta(s) · {a.guardrails.can.length + a.guardrails.approval.length + a.guardrails.never.length} guardrail(s)</span></span>
                </label>
              ))}
              {!scan.agents.length && <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nenhum agente nesta pasta.</div>}
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm"><Checkbox checked={opts.rules} onCheckedChange={(v) => setOpts({ ...opts, rules: !!v })} disabled={!scan.rules.length} />Importar {scan.rules.length} trecho(s) de regras do CLAUDE.md</label>
          <label className="flex items-center gap-3 text-sm"><Checkbox checked={opts.mcps} onCheckedChange={(v) => setOpts({ ...opts, mcps: !!v })} disabled={!scan.mcps.length} />Importar {scan.mcps.length} braço(s) do .mcp.json, desligados e sem os segredos</label>
          <Field label="Colocar no projeto">
            <Select value={opts.projectId} onValueChange={(v) => setOpts({ ...opts, projectId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Nenhum por enquanto</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent></Select>
          </Field>
          {scan.skills.length > 0 && <p className="text-xs text-muted-foreground">Também há {scan.skills.length} skill(s) na pasta. Skills ainda não são importadas.</p>}
        </>
      )}
    </Sheet>
  );
}

function Projects() {
  const { me, toast } = useApp();
  const { data: projects, reload } = useData<any[]>('/projects');
  const { data: agents } = useData<any[]>('/agents');
  const [edit, setEdit] = React.useState<any | null>(null);
  const [del, setDel] = React.useState<any | null>(null);
  const [exp, setExp] = React.useState<any | null>(null);
  const [imp, setImp] = React.useState(false);
  const save = async () => {
    try { await api(edit.id ? `/projects/${edit.id}` : '/projects', { method: edit.id ? 'PATCH' : 'POST', body: edit }); toast('Projeto salvo.'); setEdit(null); reload(); }
    catch (e) { toast((e as Error).message, 'crit'); }
  };
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-lg font-semibold">Projetos</h2><p className="text-sm text-muted-foreground">Cada projeto tem a sua pasta e os seus agentes.</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => setImp(true)}><FolderSearch />Importar ambiente</Button><Button onClick={() => setEdit({ name: '', description: '', engine: 'claude-code', active: true })}><Plus />Novo projeto</Button></div>
      </div>
      {projects && !projects.length && <Empty icon={FolderKanban} title="Nenhum projeto" hint="Crie um projeto ou importe um ambiente que já existe." />}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(projects ?? []).map((p) => {
          const mine = (agents ?? []).filter((a) => a.projectIds.includes(p.id));
          return (
            <Card key={p.id}>
              <CardContent className="flex h-full flex-col gap-3">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate font-semibold">{p.name}</div><div className="font-mono text-xs text-muted-foreground">{p.slug}</div></div>{!p.active && <Badge variant="outline">parado</Badge>}</div>
                <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">{p.description || 'Sem descrição.'}</p>
                <div className="flex items-center gap-1.5">{mine.slice(0, 6).map((a) => <span key={a.id} title={a.name} className="flex size-7 items-center justify-center rounded-md bg-muted text-sm">{a.emoji}</span>)}<span className="ml-1 text-xs text-muted-foreground">{mine.length ? `${mine.length} agente${mine.length > 1 ? 's' : ''}` : 'sem agentes'}</span></div>
                <div className="flex gap-2 border-t pt-3"><Button size="sm" variant="secondary" onClick={() => setExp(p)}><FileCode2 />Gerar arquivos</Button><Button size="sm" variant="ghost" onClick={() => setEdit(p)}>Editar</Button><Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => setDel(p)} aria-label="Remover"><Trash2 /></Button></div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar projeto' : 'Novo projeto'} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={save} disabled={!edit?.name}>Salvar</Button></>}>
        {edit && (
          <>
            <Field label="Nome"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="Descrição" hint="Uma ou duas frases. Vai no topo do CLAUDE.md do projeto."><Textarea rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></Field>
            <Field label="Motor padrão"><Select value={edit.engine} onValueChange={(v) => setEdit({ ...edit, engine: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{me.engines.map((e) => <SelectItem key={e.id} value={e.id}>{e.label}{e.ready ? '' : ' (fase 2)'}</SelectItem>)}</SelectContent></Select></Field>
            <label className="flex items-center justify-between text-sm"><span>Projeto ativo</span><Switch checked={edit.active} onCheckedChange={(v) => setEdit({ ...edit, active: v })} /></label>
          </>
        )}
      </Sheet>
      <ExportSheet project={exp} onClose={() => setExp(null)} />
      <ImportSheet open={imp} onClose={() => { setImp(false); reload(); }} projects={projects ?? []} />
      <Confirm open={!!del} title="Remover projeto?" text={`"${del?.name}" sai da lista. Os agentes continuam. Dá para restaurar pelo Histórico.`} onClose={() => setDel(null)} onConfirm={async () => { await api(`/projects/${del.id}`, { method: 'DELETE' }); reload(); }} />
    </>
  );
}

export default function Corp() {
  return (
    <>
      <PageHeader title="Corporação" hint="O nome do time, quem entra no sistema e os projetos em que os agentes trabalham." />
      <div className="grid gap-4 lg:grid-cols-2"><Identity /><Users /></div>
      <div className="mt-8"><Projects /></div>
    </>
  );
}
