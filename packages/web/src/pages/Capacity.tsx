import { Container, Cpu, HardDrive, MemoryStick, RefreshCw, Timer } from 'lucide-react';
import { Bars, HBars } from '@/components/charts';
import { Avatar, ErrorNote, LevelBadge, LevelIcon, Loading, PageHeader, type Level } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/controls';
import { useData } from '@/lib/api';
import { bytes, compact, pct, relative } from '@/lib/utils';

const tone = (lv: Level) => (lv === 'unknown' ? 'unknown' : lv === 'ok' ? 'brand' : lv);
const lvl = (v: number | null, warn = 70, crit = 85): Level => (v == null ? 'unknown' : v >= crit ? 'crit' : v >= warn ? 'warn' : 'ok');
const STATE = { idle: ['Ocioso', 'info'], ok: ['Normal', 'ok'], busy: ['Carregado', 'warn'], overloaded: ['Sobrecarregado', 'crit'] } as const;

function Meter({ icon: Icon, label, value, level, detail }: { icon: any; label: string; value: number | null; level: Level; detail?: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground"><Icon className="size-4" />{label}</span>
        <span className="flex items-center gap-1.5"><span className="tabular font-medium">{pct(value)}</span>{level !== 'ok' && level !== 'unknown' && <LevelIcon level={level} className="size-3.5" />}</span>
      </div>
      <Progress value={value ?? 0} tone={tone(level)} />
      {detail && <div className="mt-1 text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}

function Block({ n, title, level, hint, children }: { n: number; title: string; level: Level; hint: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex size-6 items-center justify-center rounded-md bg-muted text-xs font-semibold">{n}</span>
        <h2 className="text-lg font-semibold">{title}</h2>
        <LevelBadge level={level} />
        <span className="text-sm text-muted-foreground">{hint}</span>
      </div>
      {children}
    </section>
  );
}

export default function Capacity() {
  const { data: c, error, loading, reload } = useData<any>('/capacity', 60_000);
  if (loading) return <Loading label="Lendo as fontes de métricas" />;
  if (error || !c) return <ErrorNote>{error}</ErrorNote>;
  const t = c.team;
  const idle = t.agents.filter((a: any) => a.state === 'idle'), over = t.agents.filter((a: any) => a.state === 'overloaded');
  return (
    <>
      <PageHeader title="Capacidade" hint={`Carga do time, uso da IA e folga dos servidores. Fonte: ${c.sources.map((s: any) => s.label).join(', ')}.`}>
        <Button variant="outline" onClick={reload}><RefreshCw />Atualizar</Button>
      </PageHeader>
      {c.errors.map((e: string) => <div key={e} className="mb-4"><ErrorNote>{e}</ErrorNote></div>)}

      <Block n={1} title="Time" level={c.teamLevel} hint={over.length ? `${over.length} acima da capacidade` : idle.length ? `${idle.length} sem nada agendado` : 'Carga distribuída'}>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Carga por agente</CardTitle><div className="text-sm text-muted-foreground">Rotinas dos próximos 7 dias + tarefas em andamento, contra a capacidade semanal</div></CardHeader>
            <CardContent className="space-y-4">
              {t.agents.filter((a: any) => a.status !== 'draft').map((a: any) => {
                const [label, variant] = STATE[a.state as keyof typeof STATE];
                return (
                  <div key={a.agentId} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[auto_minmax(0,11rem)_1fr_auto]">
                    <Avatar emoji={a.emoji} className="size-9 text-lg" />
                    <div className="min-w-0"><div className="truncate text-sm font-medium">{a.name}</div><div className="truncate text-xs text-muted-foreground">{a.group}{a.status === 'paused' ? ' · pausado' : ''}</div></div>
                    <div className="col-span-2 sm:col-span-1">
                      <Progress value={a.pct} tone={a.state === 'overloaded' ? 'crit' : a.state === 'busy' ? 'warn' : 'brand'} />
                      <div className="mt-1 text-xs text-muted-foreground tabular">{a.scheduledWeek} agendadas · {a.running} rodando · {a.queued} na fila · capacidade {a.capacity}/sem</div>
                    </div>
                    <div className="col-span-2 flex items-center justify-between gap-2 sm:col-span-1 sm:justify-end"><span className="tabular w-12 text-right text-sm font-medium">{a.pct}%</span><Badge variant={variant}>{label}</Badge></div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle>Previsão da semana</CardTitle><div className="text-sm text-muted-foreground">Execuções agendadas por dia</div></CardHeader>
              <CardContent><Bars height={150} categories={t.forecast.map((f: any) => new Date(f.day).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''))} series={[{ name: 'Execuções', tone: 'brand', values: t.forecast.map((f: any) => f.total) }]} /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Por grupo</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {t.groups.filter((g: any) => g.agents).map((g: any) => (
                  <div key={g.groupId}>
                    <div className="mb-1 flex justify-between text-sm"><span>{g.emoji} {g.name}</span><span className="tabular text-muted-foreground">{g.load}/{g.capacity} · {g.pct}%</span></div>
                    <Progress value={g.pct} tone={g.pct > 100 ? 'crit' : g.pct >= 75 ? 'warn' : 'brand'} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </Block>

      <Block n={2} title="IA (motor)" level={c.engineLevel} hint="Quanto da assinatura ou dos tokens já foi usado">
        <div className="grid gap-4 lg:grid-cols-3">
          {c.engines.map((e: any) => (
            <Card key={e.engine + e.source} className="lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between"><CardTitle>{e.label}</CardTitle><Badge variant="outline">fonte: {e.source}</Badge></CardHeader>
              <CardContent className="space-y-5">
                {e.windows.length > 0 && (
                  <div className="grid gap-5 sm:grid-cols-2">
                    {e.windows.map((w: any) => (
                      <div key={w.label}>
                        <div className="flex items-baseline justify-between"><span className="text-sm text-muted-foreground">{w.label}</span><span className="flex items-center gap-1.5"><LevelIcon level={w.level} className="size-3.5" /><span className="tabular text-2xl font-semibold">{pct(w.pct)}</span></span></div>
                        <Progress className="mt-2 h-2.5" value={w.pct} tone={tone(w.level)} />
                        <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground"><Timer className="size-3.5" />Falta {pct(100 - w.pct)}{w.resetsAt ? ` · renova ${relative(w.resetsAt)}` : ''}</div>
                      </div>
                    ))}
                  </div>
                )}
                {e.note && <p className="text-sm text-muted-foreground">{e.note}</p>}
                <div className="grid gap-5 sm:grid-cols-[auto_1fr]">
                  <div><div className="text-sm text-muted-foreground">Tokens hoje</div><div className="tabular text-2xl font-semibold">{compact(e.tokensToday)}</div></div>
                  {e.byModel.length > 0 && <HBars categories={e.byModel.map((m: any) => m.model)} series={[{ name: 'Tokens', tone: 'brand', values: e.byModel.map((m: any) => m.tokens) }]} />}
                </div>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardHeader><CardTitle>Consumo por agente</CardTitle><div className="text-sm text-muted-foreground">Tokens em tarefas do TeamOps, 7 dias</div></CardHeader>
            <CardContent><HBars categories={t.agents.filter((a: any) => a.tokensWeek).slice(0, 8).map((a: any) => a.name)} series={[{ name: 'Tokens', tone: 'brand', values: t.agents.filter((a: any) => a.tokensWeek).slice(0, 8).map((a: any) => a.tokensWeek) }]} /></CardContent>
          </Card>
        </div>
      </Block>

      <Block n={3} title="Servidores" level={c.serverLevel} hint="Onde os agentes rodam">
        {!c.servers.length && <div className="text-sm text-muted-foreground">Nenhum host configurado na fonte.</div>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {c.servers.map((h: any) => {
            const loadPct = h.load1 != null && h.cpus ? (h.load1 / h.cpus) * 100 : null;
            return (
              <Card key={h.name}>
                <CardHeader className="flex-row items-start justify-between gap-2">
                  <div className="min-w-0"><CardTitle className="truncate">{h.name}</CardTitle><div className="mt-1 text-xs text-muted-foreground">{h.cpus ?? '—'} CPUs · no ar há {h.uptimeSec ? `${Math.floor(h.uptimeSec / 86400)} d` : '—'} · {h.source}</div></div>
                  <LevelBadge level={h.level} />
                </CardHeader>
                <CardContent className="space-y-4">
                  <Meter icon={Cpu} label="CPU" value={h.cpuPct} level={lvl(h.cpuPct)} detail={h.load1 != null ? `load ${h.load1.toFixed(2)}${loadPct != null ? ` (${Math.round(loadPct)}% dos núcleos)` : ''}` : undefined} />
                  <Meter icon={MemoryStick} label="Memória" value={h.memPct} level={lvl(h.memPct, 80, 92)} />
                  {h.disks.map((d: any) => <Meter key={d.mount} icon={HardDrive} label={`Disco ${d.mount}`} value={d.pct} level={lvl(d.pct, 80, 90)} detail={d.totalBytes ? `${bytes(d.usedBytes)} de ${bytes(d.totalBytes)}` : undefined} />)}
                  {h.containers && <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-1.5 text-muted-foreground"><Container className="size-4" />Contêineres</span><span className="flex items-center gap-1.5 tabular font-medium">{h.containers.running} de {h.containers.total} rodando{h.containers.running < h.containers.total && <LevelIcon level="warn" className="size-3.5" />}</span></div>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </Block>
    </>
  );
}
