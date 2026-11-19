import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CalendarClock, ChevronRight, Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import { Bars, HBars, Spark } from '@/components/charts';
import { Avatar, ErrorNote, LevelIcon, Loading, PageHeader, useApp, type Level } from '@/components/common';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/controls';
import { useData } from '@/lib/api';
import { cn, pct, relative, weekdayTime } from '@/lib/utils';

const SEV_SHORT = ['N/C', 'Info', 'Atenção', 'Média', 'Alta', 'Desastre'];

function Stat({ label, value, to, delta, deltaGood, spark }: { label: string; value: string | number; to: string; delta?: number | null; deltaGood?: boolean; spark?: number[] }) {
  return (
    <Link to={to} className="group rounded-xl border bg-card p-5 transition-colors hover:border-input">
      <div className="flex items-center justify-between text-sm text-muted-foreground">{label}<ArrowUpRight className="size-4 opacity-0 transition-opacity group-hover:opacity-100" /></div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="tabular text-3xl font-semibold leading-none">{value}</div>
        {spark && <Spark values={spark} />}
      </div>
      <div className={cn('mt-2 truncate text-xs', delta ? (deltaGood ? 'text-ok' : 'text-crit') : 'text-muted-foreground')}>{delta == null ? '\u00a0' : delta === 0 ? 'igual à semana anterior' : `${delta > 0 ? '+' : ''}${delta} vs. semana anterior`}</div>
    </Link>
  );
}

const ALERT = { crit: { icon: OctagonAlert, cls: 'text-crit' }, warn: { icon: TriangleAlert, cls: 'text-warn' }, info: { icon: Info, cls: 'text-info' } };

export default function Home() {
  const { me } = useApp();
  const { data: h, error, loading } = useData<any>('/home', 60_000);
  if (loading) return <Loading />;
  if (error || !h) return <ErrorNote>{error}</ErrorNote>;
  const s = h.stats;
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const days = h.series.map((d: any) => `${d.day.slice(8, 10)}/${d.day.slice(5, 7)}`);
  const cap = h.capacity;
  return (
    <>
      <PageHeader title={`${hello}, ${me.user.name.split(' ')[0]}`} hint={h.alerts.length ? `${h.alerts.length} ponto${h.alerts.length > 1 ? 's' : ''} de atenção no time ${h.corp.name}.` : `Tudo em ordem no time ${h.corp.name}.`} />

      {h.alerts.length > 0 && (
        <Card className="mb-6">
          <ul className="divide-y">
            {h.alerts.map((a: any, i: number) => {
              const A = ALERT[a.level as keyof typeof ALERT];
              return (
                <li key={i}>
                  <Link to={a.to} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-muted/60">
                    <A.icon className={cn('size-4 shrink-0', A.cls)} />
                    <span className="flex-1">{a.text}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Agentes ativos" value={s.agents} to="/agentes" />
        <Stat label="Tarefas na semana" value={s.runsWeek} to="/relatorios" delta={s.runsWeek - s.runsLastWeek} deltaGood={s.runsWeek >= s.runsLastWeek} spark={h.series.map((d: any) => d.ok + d.failed)} />
        <Stat label="Taxa de sucesso" value={pct(s.successWeek)} to="/relatorios" delta={s.successWeek != null && s.successLastWeek != null ? s.successWeek - s.successLastWeek : null} deltaGood={(s.successWeek ?? 0) >= (s.successLastWeek ?? 0)} />
        <Stat label="Conflitos abertos" value={s.conflicts} to="/conflitos" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Produtividade</CardTitle><div className="text-sm text-muted-foreground">Tarefas executadas por dia, últimos 14 dias</div></CardHeader>
          <CardContent><Bars categories={days} series={[{ name: 'Sucesso', tone: 'brand', values: h.series.map((d: any) => d.ok) }, { name: 'Falha', tone: 'bad', values: h.series.map((d: any) => d.failed) }]} height={240} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Por grupo</CardTitle><div className="text-sm text-muted-foreground">Tarefas nos últimos 7 dias</div></CardHeader>
          <CardContent><HBars categories={h.byGroup.map((g: any) => `${g.emoji} ${g.name}`)} series={[{ name: 'Tarefas', tone: 'brand', values: h.byGroup.map((g: any) => g.runs) }]} /></CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Capacidade</CardTitle><Link to="/capacidade" className="flex items-center gap-1 text-sm text-brand-ink hover:underline">Abrir<ArrowRight className="size-3.5" /></Link></CardHeader>
          <CardContent className="space-y-4">
            {!cap ? <div className="text-sm text-muted-foreground">Fonte de métricas indisponível.</div> : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  {([['Time', cap.team, cap.overloaded ? `${cap.overloaded} sobrecarregado${cap.overloaded > 1 ? 's' : ''}` : cap.idle ? `${cap.idle} ocioso${cap.idle > 1 ? 's' : ''}` : 'carga normal'], ['IA', cap.engine, cap.window ? `${pct(cap.window.pct)} da janela` : 'sem limite informado'], ['Servidor', cap.server, `${cap.servers.length} host${cap.servers.length === 1 ? '' : 's'}`]] as [string, Level, string][]).map(([name, lv, text]) => (
                    <div key={name} className="rounded-lg border p-3">
                      <div className="flex items-center gap-1.5 text-sm font-medium"><LevelIcon level={lv} />{name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{text}</div>
                    </div>
                  ))}
                </div>
                {cap.servers.slice(0, 3).map((sv: any) => (
                  <div key={sv.name} className="grid grid-cols-[minmax(0,1fr)_1fr_1fr] items-center gap-4 text-sm">
                    <span className="flex items-center gap-2 truncate"><LevelIcon level={sv.level} /><span className="truncate">{sv.name}</span></span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">CPU<Progress value={sv.cpuPct ?? 0} tone={sv.cpuPct >= 85 ? 'crit' : sv.cpuPct >= 70 ? 'warn' : 'brand'} /><span className="tabular w-9 text-right text-foreground">{pct(sv.cpuPct)}</span></span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">Mem<Progress value={sv.memPct ?? 0} tone={sv.memPct >= 92 ? 'crit' : sv.memPct >= 80 ? 'warn' : 'brand'} /><span className="tabular w-9 text-right text-foreground">{pct(sv.memPct)}</span></span>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Problemas</CardTitle><Link to="/problemas" className="flex items-center gap-1 text-sm text-brand-ink hover:underline">Abrir<ArrowRight className="size-3.5" /></Link></CardHeader>
          <CardContent>
            {!h.problems.monitors ? <div className="text-sm text-muted-foreground">Nenhum monitoramento conectado. Conecte um Zabbix na tela Problemas.</div> : (
              <>
                <div className="flex items-baseline gap-2"><span className="tabular text-3xl font-semibold">{h.problems.total}</span><span className="text-sm text-muted-foreground">abertos · {h.problems.unacked} sem reconhecimento</span></div>
                <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {[5, 4, 3, 2, 1, 0].map((sv) => (
                    <div key={sv} className="rounded-lg border p-2.5" style={{ borderLeftWidth: 3, borderLeftColor: `var(--sev-${sv})` }}>
                      <div className="tabular text-lg font-semibold leading-none">{h.problems.bySeverity[sv]}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{SEV_SHORT[sv]}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Próximas execuções</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!h.upcoming.length && <div className="text-sm text-muted-foreground">Nenhuma rotina ativa.</div>}
            {h.upcoming.map((r: any) => (
              <Link key={r.id} to="/rotinas" className="flex items-center gap-3 text-sm">
                <Avatar emoji={r.emoji} className="size-9 text-lg" />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.name}</span><span className="block truncate text-xs text-muted-foreground">{r.agent} · {r.schedule}</span></span>
                <Badge variant="outline"><CalendarClock />{weekdayTime(r.at)}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Falhas recentes</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!h.failures.length && <div className="text-sm text-muted-foreground">Nenhuma falha nos últimos 14 dias.</div>}
            {h.failures.map((f: any) => (
              <Link key={f.id} to="/rotinas" className="block text-sm">
                <div className="flex items-center gap-2"><OctagonAlert className="size-4 shrink-0 text-crit" /><span className="truncate font-medium">{f.title}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{relative(f.at)}</span></div>
                <div className="mt-0.5 truncate pl-6 text-xs text-muted-foreground">{f.agent} · {f.log || (f.status === 'timeout' ? 'tempo esgotado' : 'falhou')}</div>
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between"><CardTitle>Últimas mudanças</CardTitle><Link to="/historico" className="flex items-center gap-1 text-sm text-brand-ink hover:underline">Histórico<ArrowRight className="size-3.5" /></Link></CardHeader>
          <CardContent className="space-y-3">
            {h.activity.map((a: any) => (
              <div key={a.id} className="text-sm">
                <div className="truncate"><span className="text-muted-foreground">{{ create: 'Criou', update: 'Alterou', delete: 'Removeu', restore: 'Restaurou', import: 'Importou' }[a.action as string]} {a.entityLabel.toLowerCase()}</span> <span className="font-medium">{a.label}</span></div>
                <div className="text-xs text-muted-foreground">{a.userName || 'sistema'} · {relative(a.createdAt)}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
