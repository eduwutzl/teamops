import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Clock, FolderSearch, Loader2, OctagonAlert, Pencil, Play, Plus, Timer, Trash2 } from 'lucide-react';
import { cronToSchedule, describeCron, isValidCron, nextRuns, scheduleToCron, type Schedule } from '@teamops/core';
import { Avatar, Confirm, Empty, Field, Loading, PageHeader, Prose, Sheet, useApp } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox, Switch } from '@/components/ui/controls';
import { Input, Textarea } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, useData } from '@/lib/api';
import { cn, compact, dateTime, duration, relative, weekdayTime } from '@/lib/utils';

const DAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const DAY_FULL = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const KINDS: [Schedule['kind'], string][] = [['weekdays', 'Dias úteis'], ['daily', 'Todos os dias'], ['weekly', 'Dias da semana'], ['monthly', 'Uma vez por mês'], ['hourly', 'Toda hora'], ['minutes', 'A cada X minutos'], ['custom', 'Avançado (cron)']];
const RUN = { ok: ['Sucesso', 'ok', CheckCircle2], failed: ['Falhou', 'crit', OctagonAlert], timeout: ['Tempo esgotado', 'crit', Timer], running: ['Rodando', 'info', Loader2], queued: ['Na fila', 'outline', Clock] } as const;

/** Friendly schedule editor: the user picks "weekdays at 08:30"; cron stays behind the scenes. */
function ScheduleEditor({ cron, onChange }: { cron: string; onChange: (c: string) => void }) {
  const s = cronToSchedule(cron);
  const time = 'time' in s ? s.time : '09:00';
  const pick = (kind: Schedule['kind']) => {
    const next: Schedule = kind === 'weekdays' || kind === 'daily' ? { kind, time } : kind === 'weekly' ? { kind, days: [1], time } : kind === 'monthly' ? { kind, day: 1, time } : kind === 'hourly' ? { kind, minute: 0 } : kind === 'minutes' ? { kind, every: 30 } : { kind: 'custom', expr: cron };
    onChange(scheduleToCron(next));
  };
  const valid = isValidCron(cron);
  return (
    <div className="space-y-3 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={s.kind} onValueChange={(v) => pick(v as Schedule['kind'])}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>{KINDS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select>
        {'time' in s && <><span className="text-sm text-muted-foreground">às</span><Input type="time" className="w-28" value={s.time} onChange={(e) => onChange(scheduleToCron({ ...s, time: e.target.value || '09:00' }))} /></>}
        {s.kind === 'monthly' && <><span className="text-sm text-muted-foreground">no dia</span><Input type="number" min={1} max={31} className="w-20" value={s.day} onChange={(e) => onChange(scheduleToCron({ ...s, day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) }))} /></>}
        {s.kind === 'hourly' && <><span className="text-sm text-muted-foreground">no minuto</span><Input type="number" min={0} max={59} className="w-20" value={s.minute} onChange={(e) => onChange(scheduleToCron({ ...s, minute: Math.min(59, Math.max(0, Number(e.target.value) || 0)) }))} /></>}
        {s.kind === 'minutes' && <><span className="text-sm text-muted-foreground">a cada</span><Input type="number" min={1} max={59} className="w-20" value={s.every} onChange={(e) => onChange(scheduleToCron({ ...s, every: Number(e.target.value) || 5 }))} /><span className="text-sm text-muted-foreground">min</span></>}
      </div>
      {s.kind === 'weekly' && (
        <div className="flex gap-1.5">{DAYS.map((d, i) => { const on = s.days.includes(i); return <button key={i} type="button" aria-pressed={on} aria-label={DAY_FULL[i]} onClick={() => { const days = on ? s.days.filter((x) => x !== i) : [...s.days, i]; if (days.length) onChange(scheduleToCron({ ...s, days })); }} className={cn('size-9 rounded-md border text-sm font-medium transition-colors cursor-pointer', on ? 'border-brand bg-brand text-brand-foreground' : 'hover:border-input')}>{d}</button>; })}</div>
      )}
      {s.kind === 'custom' && <Input className="font-mono text-xs" value={cron} onChange={(e) => onChange(e.target.value)} placeholder="minuto hora dia mês dia-da-semana" />}
      <div className={cn('text-sm', valid ? 'text-muted-foreground' : 'text-crit')}>
        {valid ? <><span className="font-medium text-foreground">{describeCron(cron)}.</span> Próximas: {nextRuns(cron, 3).map((d) => weekdayTime(d.toISOString())).join(' · ')}</> : 'Agenda inválida. Use 5 campos: minuto hora dia mês dia-da-semana.'}
      </div>
    </div>
  );
}

function RunsSheet({ routine, onClose }: { routine: any | null; onClose: () => void }) {
  const { data: runs, reload } = useData<any[]>(routine ? `/runs?routineId=${routine.id}&limit=40` : null);
  const [open, setOpen] = React.useState<any | null>(null);
  const live = (runs ?? []).some((r) => r.status === 'queued' || r.status === 'running');
  React.useEffect(() => { if (!live) return; const t = setInterval(reload, 2500); return () => clearInterval(t); }, [live, reload]);
  const show = async (r: any) => setOpen(open?.id === r.id ? null : await api(`/runs/${r.id}`));
  return (
    <Sheet wide open={!!routine} onClose={onClose} title={`Execuções · ${routine?.name ?? ''}`} hint="As 40 mais recentes. Clique para ver a saída e o log.">
      {!runs && <Loading />}
      {runs && !runs.length && <Empty icon={CalendarClock} title="Ainda não rodou" hint="Use Rodar agora para testar." />}
      <div className="divide-y rounded-lg border empty:hidden">
        {(runs ?? []).map((r) => {
          const [label, variant, Icon] = RUN[r.status as keyof typeof RUN];
          return (
            <div key={r.id}>
              <button onClick={() => show(r)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left text-sm hover:bg-muted/50 cursor-pointer">
                <Badge variant={variant}><Icon className={r.status === 'running' ? 'animate-spin' : ''} />{label}</Badge>
                <span>{dateTime(r.createdAt)}</span>
                <span className="text-muted-foreground">{r.trigger === 'manual' ? 'manual' : 'agenda'}</span>
                <span className="ml-auto tabular text-muted-foreground">{duration(r.durationMs)}{r.tokensIn != null ? ` · ${compact((r.tokensIn ?? 0) + (r.tokensOut ?? 0))} tokens` : ''}</span>
              </button>
              {open?.id === r.id && (
                <div className="space-y-3 border-t bg-background p-4">
                  <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saída</div>{open.output ? <Prose text={open.output} /> : <div className="text-sm text-muted-foreground">Sem saída.</div>}</div>
                  <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Log</div><pre className="whitespace-pre-wrap break-words font-mono text-xs text-muted-foreground">{open.log || '—'}</pre></div>
                  <div className="text-xs text-muted-foreground">Motor {open.engine || '—'} · modelo {open.model || '—'}{open.costUsd ? ` · US$ ${Number(open.costUsd).toFixed(4)}` : ''}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}

function DiscoverSheet({ open, onClose, agents }: { open: boolean; onClose: () => void; agents: any[] }) {
  const { toast } = useApp();
  const { data, loading } = useData<any>(open ? '/routines/discover' : null);
  const [pick, setPick] = React.useState<number[]>([]);
  const [agentId, setAgentId] = React.useState('none');
  const SRC = { crontab: 'crontab', systemd: 'timer do systemd', 'claude-code': 'Claude Code' } as Record<string, string>;
  const imp = async () => {
    const r = await api('/routines/import', { body: { items: pick.map((i) => data.found[i]), agentId: agentId === 'none' ? null : Number(agentId) } });
    toast(`${r.created} rotina(s) importadas, pausadas.`); setPick([]); onClose();
  };
  return (
    <Sheet wide open={open} onClose={onClose} title="Importar rotinas que já existem" hint="Só leitura: nada muda no crontab, nos timers ou no Claude Code. As rotinas entram pausadas, para você reescrever a instrução."
      footer={<><Select value={agentId} onValueChange={setAgentId}><SelectTrigger className="mr-auto w-56"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem agente por enquanto</SelectItem>{agents.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.emoji} {a.name}</SelectItem>)}</SelectContent></Select><Button onClick={imp} disabled={!pick.length}>Importar {pick.length || ''}</Button></>}>
      {loading && <Loading label="Procurando no servidor" />}
      {data?.warnings.map((w: string) => <p key={w} className="text-sm text-muted-foreground">{w}</p>)}
      {data && !data.found.length && <Empty icon={FolderSearch} title="Nada encontrado" hint="Este usuário não tem crontab, timers nem tarefas agendadas." />}
      <div className="divide-y rounded-lg border empty:hidden">
        {(data?.found ?? []).map((f: any, i: number) => (
          <label key={i} className="flex cursor-pointer items-start gap-3 px-4 py-3">
            <Checkbox className="mt-0.5" checked={pick.includes(i)} onCheckedChange={(v) => setPick(v ? [...pick, i] : pick.filter((x) => x !== i))} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">{f.name}<Badge variant="outline">{SRC[f.source]}</Badge></span>
              <span className={cn('mt-0.5 block text-xs', f.cronOk ? 'text-muted-foreground' : 'text-warn')}>{f.cronOk ? describeCron(f.cron) : 'Agenda não convertida: ajuste depois de importar'}</span>
              <span className="mt-1 block truncate font-mono text-xs text-muted-foreground">{f.command}</span>
              {f.note && <span className="mt-0.5 block text-xs text-muted-foreground">{f.note}</span>}
            </span>
          </label>
        ))}
      </div>
    </Sheet>
  );
}

export default function Routines() {
  const { me, toast } = useApp();
  const [params, setParams] = useSearchParams();
  const { data: routines, reload, loading } = useData<any[]>('/routines', 30_000);
  const { data: agents } = useData<any[]>('/agents');
  const { data: projects } = useData<any[]>('/projects');
  const { data: tools } = useData<any[]>('/tools');
  const [edit, setEdit] = React.useState<any | null>(null);
  const [del, setDel] = React.useState<any | null>(null);
  const [runs, setRuns] = React.useState<any | null>(null);
  const [disc, setDisc] = React.useState(false);

  // "Agendar este relatório" on the Reports page lands here with ?relatorio=kind
  React.useEffect(() => {
    const kind = params.get('relatorio');
    if (!kind) return;
    const rep = me.reports.find((r) => r.kind === kind);
    setEdit({ name: `Resumo semanal: ${rep?.title ?? kind}`, agentId: null, projectId: null, prompt: 'Com os dados do relatório abaixo, escreva um resumo em até 8 linhas: 3 destaques, 1 ponto de atenção e o próximo passo.', cron: '0 9 * * 1', enabled: false, requiredTools: [], source: 'relatório', report: { kind, days: 7 } });
    setParams({}, { replace: true });
  }, [params, setParams, me.reports]);

  const save = async () => {
    try { await api(edit.id ? `/routines/${edit.id}` : '/routines', { method: edit.id ? 'PATCH' : 'POST', body: edit }); toast('Rotina salva.'); setEdit(null); reload(); }
    catch (e) { toast((e as Error).message, 'crit'); }
  };
  const toggle = async (r: any) => { await api(`/routines/${r.id}`, { method: 'PATCH', body: { enabled: !r.enabled } }); reload(); };
  const runNow = async (r: any) => { try { await api(`/routines/${r.id}/run`, { method: 'POST' }); toast('Na fila. Acompanhe nas execuções.'); setRuns(r); } catch (e) { toast((e as Error).message, 'crit'); } };
  const agent = (id: number | null) => agents?.find((a) => a.id === id);
  const list = [...(routines ?? [])].sort((a, b) => Number(b.enabled) - Number(a.enabled) || (a.nextRunAt ?? 'z').localeCompare(b.nextRunAt ?? 'z'));

  return (
    <>
      <PageHeader title="Tarefas recorrentes" hint="Rotinas que os agentes rodam sozinhos, na hora marcada. O agendador é do próprio TeamOps.">
        <Button variant="outline" onClick={() => setDisc(true)}><FolderSearch />Importar do ambiente</Button>
        <Button onClick={() => setEdit({ name: '', agentId: null, projectId: null, prompt: '', cron: '30 8 * * 1-5', enabled: true, requiredTools: [], source: 'manual', report: null })}><Plus />Nova rotina</Button>
      </PageHeader>
      {loading && <Loading />}
      {routines && !routines.length && <Empty icon={CalendarClock} title="Nenhuma rotina" hint="Crie uma rotina ou importe as que já rodam no servidor." />}
      <div className="space-y-3">
        {list.map((r) => {
          const a = agent(r.agentId);
          const st = r.lastStatus ? RUN[r.lastStatus as keyof typeof RUN] : null;
          const StIcon = st?.[2];
          return (
            <Card key={r.id} className={cn('p-4 sm:p-5', !r.enabled && 'opacity-70')}>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <Avatar emoji={a?.emoji ?? '❔'} />
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{r.name}</h3>{r.report && <Badge variant="info">relatório</Badge>}{r.source !== 'manual' && r.source !== 'relatório' && <Badge variant="outline">de {r.source}</Badge>}</div>
                  <div className="mt-0.5 truncate text-sm text-muted-foreground">{a ? a.name : 'Sem agente'}{a?.engine === 'mock' ? ' (simulado)' : ''} · {describeCron(r.cron)}</div>
                </div>
                <div className="flex basis-full items-center gap-4 text-sm sm:basis-auto">
                  <div><div className="text-xs text-muted-foreground">Próxima</div><div className="tabular">{r.enabled && r.nextRunAt ? weekdayTime(r.nextRunAt) : 'pausada'}</div></div>
                  <div><div className="text-xs text-muted-foreground">Última</div><div className="flex items-center gap-1.5">{st && StIcon ? <><StIcon className={cn('size-3.5', st[1] === 'ok' ? 'text-ok' : st[1] === 'crit' ? 'text-crit' : 'text-muted-foreground')} />{relative(r.lastRunAt)}</> : 'nunca'}</div></div>
                </div>
                <div className="flex items-center gap-1 sm:ml-auto">
                  <Switch checked={r.enabled} onCheckedChange={() => toggle(r)} aria-label={r.enabled ? 'Pausar' : 'Ativar'} />
                  <Button size="sm" variant="secondary" className="ml-2" onClick={() => runNow(r)}><Play />Rodar agora</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRuns(r)}>Execuções</Button>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setEdit(r)} aria-label="Editar"><Pencil /></Button>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setDel(r)} aria-label="Remover"><Trash2 /></Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      <Sheet wide open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar rotina' : 'Nova rotina'} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button><Button onClick={save} disabled={!edit?.name || !isValidCron(edit?.cron ?? '')}>Salvar</Button></>}>
        {edit && (
          <>
            <Field label="Nome"><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Triagem da manhã" /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Agente responsável"><Select value={String(edit.agentId ?? 'none')} onValueChange={(v) => setEdit({ ...edit, agentId: v === 'none' ? null : Number(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Escolher depois</SelectItem>{(agents ?? []).filter((a) => a.status !== 'draft').map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.emoji} {a.name}{a.engine === 'mock' ? ' (simulado)' : ''}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="Projeto"><Select value={String(edit.projectId ?? 'none')} onValueChange={(v) => setEdit({ ...edit, projectId: v === 'none' ? null : Number(v) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Nenhum</SelectItem>{(projects ?? []).map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent></Select></Field>
            </div>
            <Field label="Quando roda"><ScheduleEditor cron={edit.cron} onChange={(cron) => setEdit({ ...edit, cron })} /></Field>
            <Field label="Instrução" hint="O que o agente deve fazer a cada execução."><Textarea rows={6} value={edit.prompt} onChange={(e) => setEdit({ ...edit, prompt: e.target.value })} /></Field>
            {edit.report && <div className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"><span>Anexa os dados do relatório <span className="font-medium">{me.reports.find((r) => r.kind === edit.report.kind)?.title}</span> dos últimos {edit.report.days} dias.</span><Button size="sm" variant="ghost" onClick={() => setEdit({ ...edit, report: null })}>Tirar</Button></div>}
            <Field label="Ferramentas necessárias" hint="Opcional. Se o agente não tiver alguma, a rotina aparece em Conflitos.">
              <div className="flex flex-wrap gap-1.5">{(tools ?? []).map((t) => { const on = edit.requiredTools.includes(t.key); return <button key={t.id} type="button" aria-pressed={on} onClick={() => setEdit({ ...edit, requiredTools: on ? edit.requiredTools.filter((k: string) => k !== t.key) : [...edit.requiredTools, t.key] })} className={cn('rounded-md border px-2 py-1 text-xs transition-colors cursor-pointer', on ? 'border-brand-ink/50 bg-brand-soft text-brand-ink' : 'text-muted-foreground hover:border-input')}>{t.label}</button>; })}</div>
            </Field>
            <label className="flex items-center justify-between text-sm"><span>Rotina ativa</span><Switch checked={edit.enabled} onCheckedChange={(v) => setEdit({ ...edit, enabled: v })} /></label>
          </>
        )}
      </Sheet>
      <RunsSheet routine={runs} onClose={() => { setRuns(null); reload(); }} />
      <DiscoverSheet open={disc} onClose={() => { setDisc(false); reload(); }} agents={(agents ?? []).filter((a) => a.status !== 'draft')} />
      <Confirm open={!!del} title="Remover rotina?" text={`"${del?.name}" para de rodar. As execuções antigas ficam nos relatórios.`} onClose={() => setDel(null)} onConfirm={async () => { await api(`/routines/${del.id}`, { method: 'DELETE' }); reload(); }} />
    </>
  );
}
