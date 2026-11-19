import * as React from 'react';
import { Bot, Check, CheckCheck, Clock, ExternalLink, Loader2, Plug, Radio, Server, Settings2, Siren, Tag, Trash2 } from 'lucide-react';
import { Avatar, Confirm, Empty, ErrorNote, Field, Loading, PageHeader, Prose, Sheet, useApp } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/controls';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, useData } from '@/lib/api';
import { cn, duration, relative } from '@/lib/utils';

const ALL = '__all';

function since(ts: number): string {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
  return `${Math.floor(s / 86400)} d ${Math.round((s % 86400) / 3600)} h`;
}

function Pick({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-auto min-w-36 max-w-56" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value={ALL}>{label}: todos</SelectItem>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function Connections({ open, onClose, onChange }: { open: boolean; onClose: () => void; onChange: () => void }) {
  const { toast } = useApp();
  const { data: list, reload } = useData<any[]>(open ? '/monitors' : null);
  const [edit, setEdit] = React.useState<any | null>(null);
  const [test, setTest] = React.useState<Record<number, { ok: boolean; message: string } | 'busy'>>({});
  const [del, setDel] = React.useState<any | null>(null);
  const blank = { name: '', url: '', token: '', enabled: true, useForCapacity: false, hostsText: '', usageHost: '', usageKeysText: '' };
  const save = async () => {
    const body = { name: edit.name, url: edit.url, token: edit.token, enabled: edit.enabled, useForCapacity: edit.useForCapacity, kind: 'zabbix', hosts: edit.hostsText.split(/[\n,]/).map((s: string) => s.trim()).filter(Boolean), usageHost: edit.usageHost,
      usageKeys: Object.fromEntries(edit.usageKeysText.split('\n').map((l: string) => l.split('=').map((s) => s.trim())).filter((p: string[]) => p.length === 2 && p[0] && p[1])) };
    try {
      await api(edit.id ? `/monitors/${edit.id}` : '/monitors', { method: edit.id ? 'PATCH' : 'POST', body });
      toast('Conexão salva.'); setEdit(null); reload(); onChange();
    } catch (e) { toast((e as Error).message, 'crit'); }
  };
  const run = async (id: number) => { setTest((t) => ({ ...t, [id]: 'busy' })); const r = await api(`/monitors/${id}/test`, { method: 'POST' }).catch((e) => ({ ok: false, message: e.message })); setTest((t) => ({ ...t, [id]: r })); };
  return (
    <Sheet open={open} onClose={onClose} title="Conexões de monitoramento" hint="Cada conexão é um Zabbix. O token fica guardado só no servidor e nunca volta para a tela."
      footer={edit ? <><Button variant="ghost" onClick={() => setEdit(null)}>Voltar</Button><Button onClick={save} disabled={!edit.name || !edit.url}>Salvar</Button></> : <Button onClick={() => setEdit(blank)}><Plug />Nova conexão</Button>}>
      {!edit && (list ?? []).map((m) => {
        const t = test[m.id];
        return (
          <Card key={m.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><div className="font-medium">{m.name}</div><div className="truncate font-mono text-xs text-muted-foreground">{m.url.startsWith('file:') ? 'endereço por referência' : m.url}</div></div>
              <div className="flex shrink-0 gap-1">{!m.enabled && <Badge variant="outline">desligada</Badge>}{m.useForCapacity && <Badge variant="brand">capacidade</Badge>}</div>
            </div>
            {t && t !== 'busy' && <div className={cn('mt-3 text-sm', t.ok ? 'text-ok' : 'text-crit')}>{t.ok ? <Check className="mr-1 inline size-4" /> : null}{t.message}</div>}
            <div className="mt-3 flex gap-2">
              <Button size="sm" variant="outline" onClick={() => run(m.id)} disabled={t === 'busy'}>{t === 'busy' ? <Loader2 className="animate-spin" /> : <Radio />}Testar</Button>
              <Button size="sm" variant="ghost" onClick={() => setEdit({ ...m, token: '', hostsText: m.hosts.join('\n'), usageKeysText: Object.entries(m.usageKeys).map(([k, v]) => `${k}=${v}`).join('\n') })}>Editar</Button>
              <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => setDel(m)} aria-label="Remover"><Trash2 /></Button>
            </div>
          </Card>
        );
      })}
      {!edit && list && !list.length && <Empty icon={Plug} title="Nenhuma conexão" hint="Conecte um Zabbix para ver os problemas aqui." />}
      {edit && (
        <>
          <Field label="Nome"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Zabbix principal" /></Field>
          <Field label="Endereço" hint="URL do Zabbix. Aceita também uma referência: file:/caminho.json#chave.url"><Input value={edit.url} onChange={(e) => setEdit({ ...edit, url: e.target.value })} placeholder="https://zabbix.example.com" /></Field>
          <Field label="Token da API" hint={edit.id ? 'Deixe vazio para manter o token atual.' : 'Token de API do Zabbix, ou uma referência file:/caminho.json#chave.token'}><Input type="password" autoComplete="off" value={edit.token} onChange={(e) => setEdit({ ...edit, token: e.target.value })} placeholder={edit.tokenSet ? '•••••••• (guardado)' : ''} /></Field>
          <label className="flex items-center justify-between gap-3 text-sm"><span>Conexão ligada</span><Switch checked={edit.enabled} onCheckedChange={(v) => setEdit({ ...edit, enabled: v })} /></label>
          <label className="flex items-center justify-between gap-3 text-sm"><span>Usar como fonte da tela Capacidade<span className="block text-xs text-muted-foreground">Sem nenhuma fonte marcada, a Capacidade lê o próprio servidor.</span></span><Switch checked={edit.useForCapacity} onCheckedChange={(v) => setEdit({ ...edit, useForCapacity: v })} /></label>
          {edit.useForCapacity && (
            <>
              <Field label="Hosts dos servidores" hint="Nome técnico de cada host no Zabbix, um por linha."><Textarea rows={3} value={edit.hostsText} onChange={(e) => setEdit({ ...edit, hostsText: e.target.value })} className="font-mono text-xs" /></Field>
              <Field label="Host com o uso do motor de IA" hint="Opcional. Host cujos itens trazem o uso da assinatura."><Input value={edit.usageHost} onChange={(e) => setEdit({ ...edit, usageHost: e.target.value })} className="font-mono text-xs" /></Field>
              <Field label="Chaves dos itens de uso" hint="Uma por linha: windowPct, windowReset, weekPct, weekReset, tokensToday, model:<nome> = chave do item."><Textarea rows={5} value={edit.usageKeysText} onChange={(e) => setEdit({ ...edit, usageKeysText: e.target.value })} className="font-mono text-xs" placeholder="windowPct=minha.chave.pct" /></Field>
            </>
          )}
        </>
      )}
      <Confirm open={!!del} title="Remover conexão?" text={`"${del?.name}" sai da lista. Dá para restaurar pelo Histórico.`} onClose={() => setDel(null)} onConfirm={async () => { await api(`/monitors/${del.id}`, { method: 'DELETE' }); reload(); onChange(); }} />
    </Sheet>
  );
}

export default function Problems() {
  const { me, toast } = useApp();
  const { data, error, loading, reload } = useData<any>('/problems', 30_000);
  const { data: agents } = useData<any[]>('/agents');
  const [f, setF] = React.useState({ sev: ALL, host: ALL, group: ALL, tag: ALL, ack: ALL });
  const [conn, setConn] = React.useState(false);
  const [send, setSend] = React.useState<any | null>(null);
  const [agentId, setAgentId] = React.useState('');
  const [ack, setAck] = React.useState<any | null>(null);
  const [msg, setMsg] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [limit, setLimit] = React.useState(24);

  const list: any[] = data?.problems ?? [];
  const waiting = list.some((p) => p.diagnoses.some((d: any) => d.status === 'queued' || d.status === 'running'));
  React.useEffect(() => { if (!waiting) return; const t = setInterval(reload, 4000); return () => clearInterval(t); }, [waiting, reload]);

  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  const shown = list.filter((p) => (f.sev === ALL || String(p.severity) === f.sev) && (f.host === ALL || p.host === f.host) && (f.group === ALL || p.groups.includes(f.group)) && (f.tag === ALL || p.tags.some((t: any) => `${t.tag}${t.value ? ':' + t.value : ''}` === f.tag)) && (f.ack === ALL || String(p.acknowledged) === f.ack));
  const counts = [0, 1, 2, 3, 4, 5].map((s) => list.filter((p) => p.severity === s).length);
  const active = (agents ?? []).filter((a) => a.status === 'active');

  const diagnose = async () => {
    setBusy(true);
    try { await api('/problems/diagnose', { body: { key: send.key, agentId: Number(agentId) } }); toast('Enviado. O diagnóstico aparece no cartão.'); setSend(null); reload(); }
    catch (e) { toast((e as Error).message, 'crit'); }
    finally { setBusy(false); }
  };
  const doAck = async () => {
    setBusy(true);
    try { await api('/problems/ack', { body: { key: ack.key, message: msg } }); toast('Reconhecido no Zabbix.'); setAck(null); setMsg(''); reload(); }
    catch (e) { toast((e as Error).message, 'crit'); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader title="Problemas" hint="O que o monitoramento está apontando agora. Mande um problema para um agente e receba o diagnóstico no cartão.">
        {data && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="size-2 rounded-full bg-ok" />ao vivo · {relative(data.at)}</span>}
        <Button variant="outline" onClick={() => setConn(true)}><Settings2 />Conexões</Button>
      </PageHeader>
      {loading && <Loading label="Lendo o monitoramento" />}
      {error && <ErrorNote>{error}</ErrorNote>}
      {data?.errors.map((e: string) => <div key={e} className="mb-4"><ErrorNote>{e}</ErrorNote></div>)}
      {data && !data.monitors && <Empty icon={Siren} title="Nenhum monitoramento conectado" hint="Cadastre a URL e o token de um Zabbix. O TeamOps só lê; reconhecer um alerta acontece apenas quando você clica."><Button onClick={() => setConn(true)}><Plug />Conectar Zabbix</Button></Empty>}

      {data && data.monitors > 0 && (
        <>
          <div className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[5, 4, 3, 2, 1, 0].map((s) => (
              <button key={s} onClick={() => setF({ ...f, sev: f.sev === String(s) ? ALL : String(s) })} aria-pressed={f.sev === String(s)}
                className={cn('rounded-xl border bg-card p-3 text-left transition-colors cursor-pointer hover:border-input', f.sev === String(s) && 'border-foreground/60')} style={{ borderLeftWidth: 4, borderLeftColor: `var(--sev-${s})` }}>
                <div className="tabular text-2xl font-semibold leading-none">{counts[s]}</div>
                <div className="mt-1.5 truncate text-xs text-muted-foreground">{me.severities[s]}</div>
              </button>
            ))}
          </div>
          <div className="mb-5 flex flex-wrap gap-2">
            <Pick label="Host" value={f.host} onChange={(v) => setF({ ...f, host: v })} options={uniq(list.map((p) => p.host)).map((h) => ({ value: h, label: h }))} />
            <Pick label="Grupo" value={f.group} onChange={(v) => setF({ ...f, group: v })} options={uniq(list.flatMap((p) => p.groups)).map((h) => ({ value: h, label: h }))} />
            <Pick label="Tag" value={f.tag} onChange={(v) => setF({ ...f, tag: v })} options={uniq(list.flatMap((p) => p.tags.map((t: any) => `${t.tag}${t.value ? ':' + t.value : ''}`))).map((h) => ({ value: h, label: h }))} />
            <Pick label="Reconhecido" value={f.ack} onChange={(v) => setF({ ...f, ack: v })} options={[{ value: 'false', label: 'Não reconhecidos' }, { value: 'true', label: 'Reconhecidos' }]} />
            {Object.values(f).some((v) => v !== ALL) && <Button variant="ghost" onClick={() => setF({ sev: ALL, host: ALL, group: ALL, tag: ALL, ack: ALL })}>Limpar filtros</Button>}
            <span className="ml-auto self-center text-sm text-muted-foreground">{shown.length} de {list.length}</span>
          </div>
          {!shown.length && <Empty icon={CheckCheck} title={list.length ? 'Nada com esses filtros' : 'Nenhum problema aberto'} hint={list.length ? undefined : 'O monitoramento está limpo.'} />}
          <div className="grid gap-3 lg:grid-cols-2">
            {shown.slice(0, limit).map((p) => (
              <Card key={p.key} className="overflow-hidden" style={{ borderLeftWidth: 4, borderLeftColor: `var(--sev-${p.severity})` }}>
                <div className="p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="flex items-center gap-1.5 font-semibold" style={{ color: `var(--sev-${p.severity})` }}><Siren className="size-3.5" />{me.severities[p.severity]}</span>
                    <span className="flex items-center gap-1 text-muted-foreground"><Clock className="size-3.5" />há {since(p.since)}</span>
                    {p.acknowledged ? <Badge variant="ok"><CheckCheck />Reconhecido</Badge> : <Badge variant="outline">Não reconhecido</Badge>}
                    {data.monitors > 1 && <Badge variant="outline">{p.monitorName}</Badge>}
                  </div>
                  <h3 className="mt-2 font-medium leading-snug">{p.name}</h3>
                  <div className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground"><Server className="size-3.5 shrink-0" /><span className="truncate">{p.host}</span></div>
                  {p.items.length > 0 && <div className="mt-2 space-y-0.5 rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs">{p.items.slice(0, 2).map((i: any, k: number) => <div key={k} className="truncate"><span className="text-muted-foreground">{i.name}: </span>{i.value.length > 60 ? i.value.slice(0, 60) + '…' : i.value} {i.units}</div>)}</div>}
                  {p.tags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{p.tags.slice(0, 6).map((t: any, k: number) => <Badge key={k} variant="default" className="max-w-60"><Tag /><span className="truncate">{t.tag}{t.value ? `: ${t.value}` : ''}</span></Badge>)}{p.tags.length > 6 && <Badge variant="outline">+{p.tags.length - 6}</Badge>}</div>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => { setSend(p); setAgentId(String(active.find((a) => /sre|plant|oper|monitor/i.test(`${a.title} ${a.name}`))?.id ?? active[0]?.id ?? '')); }}><Bot />Mandar para um agente</Button>
                    {!p.acknowledged && <Button size="sm" variant="outline" onClick={() => setAck(p)}><Check />Reconhecer</Button>}
                    <Button size="sm" variant="ghost" asChild><a href={p.link} target="_blank" rel="noreferrer"><ExternalLink />Abrir no Zabbix</a></Button>
                  </div>
                </div>
                {p.diagnoses.map((d: any) => (
                  <div key={d.id} className="border-t bg-background/60 p-4">
                    <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><Avatar emoji={d.emoji} className="size-6 rounded-md text-sm" /><span className="font-medium text-foreground">{d.agent}</span><span>· {relative(d.createdAt)}{d.durationMs ? ` · ${duration(d.durationMs)}` : ''}</span></div>
                    {(d.status === 'queued' || d.status === 'running') && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />{d.status === 'queued' ? 'Na fila' : 'Analisando'}…</div>}
                    {d.status === 'ok' && <Prose text={d.output} />}
                    {(d.status === 'failed' || d.status === 'timeout') && <div className="text-sm text-crit">Não consegui o diagnóstico. {d.log}</div>}
                  </div>
                ))}
              </Card>
            ))}
          </div>
          {shown.length > limit && <div className="mt-5 flex justify-center"><Button variant="outline" onClick={() => setLimit(limit + 24)}>Mostrar mais {Math.min(24, shown.length - limit)} de {shown.length - limit}</Button></div>}
        </>
      )}

      <Dialog open={!!send} onOpenChange={(o) => !o && setSend(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mandar para um agente</DialogTitle><DialogDescription>O agente recebe o problema, o host e os últimos valores, e devolve um diagnóstico. Ele não reconhece nem altera nada.</DialogDescription></DialogHeader>
          <DialogBody>
            <div className="rounded-lg border p-3 text-sm"><div className="font-medium">{send?.name}</div><div className="text-muted-foreground">{send?.host}</div></div>
            <Field label="Agente">
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger><SelectValue placeholder="Escolha um agente" /></SelectTrigger>
                <SelectContent>{active.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.emoji} {a.name} · {a.title}{a.engine === 'mock' ? ' (simulado)' : ''}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
          </DialogBody>
          <DialogFooter><Button variant="ghost" onClick={() => setSend(null)}>Cancelar</Button><Button onClick={diagnose} disabled={!agentId || busy}>{busy ? <Loader2 className="animate-spin" /> : <Bot />}Pedir diagnóstico</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ack} onOpenChange={(o) => !o && setAck(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reconhecer no Zabbix?</DialogTitle><DialogDescription>Isto grava o reconhecimento no Zabbix em seu nome. É a única ação de escrita desta tela.</DialogDescription></DialogHeader>
          <DialogBody>
            <div className="rounded-lg border p-3 text-sm"><div className="font-medium">{ack?.name}</div><div className="text-muted-foreground">{ack?.host}</div></div>
            <Field label="Mensagem (opcional)"><Input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ex.: ciente, verificando" /></Field>
          </DialogBody>
          <DialogFooter><Button variant="ghost" onClick={() => setAck(null)}>Cancelar</Button><Button onClick={doAck} disabled={busy}><Check />Reconhecer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <Connections open={conn} onClose={() => setConn(false)} onChange={reload} />
    </>
  );
}
