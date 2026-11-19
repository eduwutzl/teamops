/**
 * Capacity = team load + engine usage + servers.
 * Metrics come from pluggable sources: Zabbix when a connection is marked for it, the local host otherwise.
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { promisify } from 'node:util';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { isValidCron, nextRun } from '@teamops/core';
import { INSTANCE, schema } from './db/index.ts';
import type { Store } from './store.ts';
import { zbx, type Monitor } from './zabbix.ts';

const sh = promisify(execFile);
export type Level = 'ok' | 'warn' | 'crit' | 'unknown';
export const level = (pct: number | null | undefined, warn = 70, crit = 85): Level => (pct == null || Number.isNaN(pct) ? 'unknown' : pct >= crit ? 'crit' : pct >= warn ? 'warn' : 'ok');
const worst = (ls: Level[]): Level => (ls.includes('crit') ? 'crit' : ls.includes('warn') ? 'warn' : ls.includes('ok') ? 'ok' : 'unknown');

export interface HostMetrics {
  name: string; source: string; level: Level; cpuPct: number | null; load1: number | null; cpus: number | null; memPct: number | null;
  disks: { mount: string; pct: number; usedBytes: number | null; totalBytes: number | null }[]; containers: { running: number; total: number } | null; uptimeSec: number | null; error?: string;
}
export interface EngineUsage {
  engine: string; label: string; source: string; level: Level; windows: { label: string; pct: number; resetsAt: string | null; level: Level }[];
  tokensToday: number | null; byModel: { model: string; tokens: number }[]; note: string;
}
export interface MetricSource { id: string; label: string; servers(): Promise<HostMetrics[]>; engines(): Promise<EngineUsage[]> }

function finishHost(h: Omit<HostMetrics, 'level'>): HostMetrics {
  const loadPct = h.load1 != null && h.cpus ? (h.load1 / h.cpus) * 100 : null;
  return { ...h, level: worst([level(h.cpuPct), level(h.memPct, 80, 92), level(loadPct, 100, 150), ...h.disks.map((d) => level(d.pct, 80, 90))]) };
}

// ---------- local source: the host TeamOps runs on + the engine usage TeamOps itself recorded ----------

function cpuSample(): { idle: number; total: number } {
  let idle = 0, total = 0;
  for (const c of os.cpus()) { idle += c.times.idle; total += c.times.user + c.times.nice + c.times.sys + c.times.irq + c.times.idle; }
  return { idle, total };
}

export function localSource(store: Store): MetricSource {
  return {
    id: 'local', label: 'Este servidor',
    async servers() {
      const a = cpuSample();
      await new Promise((r) => setTimeout(r, 250));
      const b = cpuSample();
      const cpuPct = b.total > a.total ? (1 - (b.idle - a.idle) / (b.total - a.total)) * 100 : null;
      let memPct: number | null = (1 - os.freemem() / os.totalmem()) * 100;
      try {
        const mi = readFileSync('/proc/meminfo', 'utf8');
        const tot = Number(/MemTotal:\s+(\d+)/.exec(mi)?.[1]), av = Number(/MemAvailable:\s+(\d+)/.exec(mi)?.[1]);
        if (tot && av) memPct = (1 - av / tot) * 100;
      } catch { /* not Linux */ }
      const disks: HostMetrics['disks'] = [];
      try {
        const { stdout } = await sh('df', ['-kP', '/', INSTANCE], { timeout: 4000 });
        for (const line of stdout.trim().split('\n').slice(1)) {
          const f = line.trim().split(/\s+/);
          const mount = f[5];
          if (!disks.some((d) => d.mount === mount)) disks.push({ mount, pct: Number(f[4].replace('%', '')), usedBytes: Number(f[2]) * 1024, totalBytes: Number(f[1]) * 1024 });
        }
      } catch { /* no df */ }
      let containers: HostMetrics['containers'] = null;
      try {
        const { stdout } = await sh('docker', ['ps', '-a', '--format', '{{.State}}'], { timeout: 4000 });
        const states = stdout.trim().split('\n').filter(Boolean);
        containers = { running: states.filter((s) => s === 'running').length, total: states.length };
      } catch { /* no docker */ }
      return [finishHost({ name: os.hostname(), source: 'local', cpuPct, load1: os.loadavg()[0], cpus: os.cpus().length, memPct, disks, containers, uptimeSec: os.uptime() })];
    },
    async engines() {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const rows = store.db.select().from(schema.runs).where(gte(schema.runs.createdAt, since.toISOString())).all();
      const by = new Map<string, { tokens: number; models: Map<string, number> }>();
      for (const r of rows) {
        if (!r.engine || r.engine === 'mock') continue;
        const e = by.get(r.engine) ?? { tokens: 0, models: new Map() };
        const t = (r.tokensIn ?? 0) + (r.tokensOut ?? 0);
        e.tokens += t; e.models.set(r.model || '—', (e.models.get(r.model || '—') ?? 0) + t);
        by.set(r.engine, e);
      }
      const budget = Number(process.env.TEAMOPS_TOKEN_BUDGET_DAY ?? 0);
      const list = [...by.entries()].map(([engine, e]): EngineUsage => {
        const pct = budget ? Math.min(100, (e.tokens / budget) * 100) : null;
        const reset = new Date(since.getTime() + 86400_000).toISOString();
        return {
          engine, label: engine, source: 'local', level: level(pct), tokensToday: e.tokens, byModel: [...e.models].map(([model, tokens]) => ({ model, tokens })),
          windows: pct == null ? [] : [{ label: 'Orçamento do dia', pct, resetsAt: reset, level: level(pct) }],
          note: budget ? '' : 'O motor não informa o limite da assinatura. Defina TEAMOPS_TOKEN_BUDGET_DAY ou ligue uma fonte Zabbix.',
        };
      });
      return list.length ? list : [{ engine: 'claude-code', label: 'claude-code', source: 'local', level: 'unknown', windows: [], tokensToday: 0, byModel: [], note: 'Sem uso registrado hoje pelo TeamOps.' }];
    },
  };
}

// ---------- Zabbix source: standard "Linux by Zabbix agent" and "Docker" item keys ----------

/** Logical metric -> item key holding it. Instances override these per connection (usageKeys). */
export const DEFAULT_USAGE_KEYS: Record<string, string> = {
  windowPct: 'teamops.engine.window.pct', windowReset: 'teamops.engine.window.reset', weekPct: 'teamops.engine.week.pct', weekReset: 'teamops.engine.week.reset',
  tokensToday: 'teamops.engine.tokens.today', 'model:opus': 'teamops.engine.tokens.opus', 'model:sonnet': 'teamops.engine.tokens.sonnet', 'model:haiku': 'teamops.engine.tokens.haiku',
};

export function zabbixSource(m: Monitor): MetricSource {
  const num = (v: unknown) => (v === undefined || v === '' ? null : Number(v));
  return {
    id: `zabbix:${m.id}`, label: `Zabbix · ${m.name}`,
    async servers() {
      if (!m.hosts.length) return [];
      const hosts = await zbx<any[]>(m, 'host.get', { output: ['hostid', 'host', 'name'], filter: { host: m.hosts } });
      if (!hosts.length) return [];
      const items = await zbx<any[]>(m, 'item.get', {
        output: ['hostid', 'key_', 'lastvalue'], hostids: hosts.map((h) => h.hostid), searchByAny: true,
        search: { key_: ['system.cpu.util', 'system.cpu.load[all,avg1]', 'system.cpu.num', 'vm.memory.utilization', 'vm.memory.size[pavailable]', 'vfs.fs.dependent.size', 'vfs.fs.size', 'docker.containers.running', 'docker.containers.total', 'system.uptime'] },
      });
      return hosts.map((h) => {
        const mine = new Map<string, string>(items.filter((i) => i.hostid === h.hostid).map((i) => [i.key_, i.lastvalue]));
        const disks: HostMetrics['disks'] = [];
        for (const [k, v] of mine) {
          const d = /^vfs\.fs(?:\.dependent)?\.size\[(.+),pused\]$/.exec(k);
          if (!d) continue;
          const pre = k.slice(0, k.lastIndexOf(','));
          disks.push({ mount: d[1], pct: Number(v), usedBytes: num(mine.get(`${pre},used]`)), totalBytes: num(mine.get(`${pre},total]`)) });
        }
        const pav = num(mine.get('vm.memory.size[pavailable]'));
        const run = num(mine.get('docker.containers.running')), tot = num(mine.get('docker.containers.total'));
        return finishHost({
          name: h.name || h.host, source: m.name, cpuPct: num(mine.get('system.cpu.util')), load1: num(mine.get('system.cpu.load[all,avg1]')), cpus: num(mine.get('system.cpu.num')),
          memPct: num(mine.get('vm.memory.utilization')) ?? (pav == null ? null : 100 - pav), disks: disks.sort((a, b) => a.mount.localeCompare(b.mount)),
          containers: run != null && tot != null ? { running: run, total: tot } : null, uptimeSec: num(mine.get('system.uptime')),
        });
      });
    },
    async engines() {
      if (!m.usageHost) return [];
      const keys = { ...DEFAULT_USAGE_KEYS, ...m.usageKeys };
      const items = await zbx<any[]>(m, 'item.get', { output: ['key_', 'lastvalue'], host: m.usageHost, filter: { key_: Object.values(keys) } });
      const val = (logical: string) => { const v = items.find((i) => i.key_ === keys[logical])?.lastvalue; return v === undefined || v === '' ? null : Number(v); };
      const win = (label: string, p: string, r: string) => {
        const pct = val(p), reset = val(r);
        return pct == null ? [] : [{ label, pct, resetsAt: reset ? new Date(reset * 1000).toISOString() : null, level: level(pct, 70, 90) }];
      };
      const windows = [...win('Janela atual', 'windowPct', 'windowReset'), ...win('Semana', 'weekPct', 'weekReset')];
      const byModel = Object.keys(keys).filter((k) => k.startsWith('model:')).map((k) => ({ model: k.slice(6), tokens: val(k) ?? 0 })).filter((x) => x.tokens > 0);
      return [{ engine: 'claude-code', label: 'Claude Code', source: m.name, level: worst(windows.map((w) => w.level)), windows, tokensToday: val('tokensToday'), byModel, note: windows.length ? '' : 'Nenhum item de uso encontrado neste host.' }];
    },
  };
}

export function sources(store: Store): MetricSource[] {
  const mons = (store.list('monitors') as Monitor[]).filter((m) => m.enabled && m.useForCapacity);
  return mons.length ? mons.map(zabbixSource) : [localSource(store)];
}

// ---------- team load ----------

export interface AgentLoad { agentId: number; name: string; emoji: string; groupId: number | null; group: string; status: string; running: number; queued: number; scheduledWeek: number; capacity: number; pct: number; state: 'idle' | 'ok' | 'busy' | 'overloaded'; tokensWeek: number; runsWeek: number }

export function teamLoad(store: Store) {
  const agents = store.list('agents'), groups = store.list('groups'), routines = store.list('routines');
  const start = new Date(), end = new Date(start.getTime() + 7 * 86400_000);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i); return d; });
  const perAgent = new Map<number, number>();
  const forecast = days.map((d) => ({ day: d.toISOString(), total: 0, byGroup: {} as Record<string, number> }));
  const gname = (id: number | null) => groups.find((g) => g.id === id)?.name ?? 'Sem grupo';
  for (const r of routines) {
    if (!r.enabled || !r.agentId || !isValidCron(r.cron)) continue;
    const agent = agents.find((a) => a.id === r.agentId);
    let cur: Date | null = start, n = 0;
    while (n < 700 && (cur = nextRun(r.cron, cur)) && cur < end) {
      n++;
      const idx = Math.floor((new Date(cur).setHours(0, 0, 0, 0) - days[0].getTime()) / 86400_000);
      if (forecast[idx]) { forecast[idx].total++; const g = gname(agent?.groupId ?? null); forecast[idx].byGroup[g] = (forecast[idx].byGroup[g] ?? 0) + 1; }
    }
    perAgent.set(r.agentId, (perAgent.get(r.agentId) ?? 0) + n);
  }
  const live = store.db.select().from(schema.runs).where(inArray(schema.runs.status, ['queued', 'running'])).all();
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const recent = store.db.select().from(schema.runs).where(gte(schema.runs.createdAt, weekAgo)).all();
  const list: AgentLoad[] = agents.map((a) => {
    const scheduledWeek = perAgent.get(a.id) ?? 0, capacity = a.weeklyCapacity || 40;
    const running = live.filter((r) => r.agentId === a.id && r.status === 'running').length, queued = live.filter((r) => r.agentId === a.id && r.status === 'queued').length;
    const pct = Math.round(((scheduledWeek + running + queued) / capacity) * 100);
    const mine = recent.filter((r) => r.agentId === a.id);
    return {
      agentId: a.id, name: a.name, emoji: a.emoji, groupId: a.groupId, group: gname(a.groupId), status: a.status, running, queued, scheduledWeek, capacity, pct,
      state: (pct > 100 ? 'overloaded' : pct >= 75 ? 'busy' : pct === 0 && a.status === 'active' ? 'idle' : 'ok') as AgentLoad['state'],
      tokensWeek: mine.reduce((s, r) => s + (r.tokensIn ?? 0) + (r.tokensOut ?? 0), 0), runsWeek: mine.length,
    };
  }).sort((x, y) => y.pct - x.pct);
  const byGroup = groups.map((g) => {
    const mine = list.filter((a) => a.groupId === g.id);
    const cap = mine.reduce((s, a) => s + a.capacity, 0), load = mine.reduce((s, a) => s + a.scheduledWeek + a.running + a.queued, 0);
    return { groupId: g.id, name: g.name, emoji: g.emoji, agents: mine.length, load, capacity: cap, pct: cap ? Math.round((load / cap) * 100) : 0 };
  });
  return { agents: list, groups: byGroup, forecast, groupNames: [...new Set(list.map((a) => a.group))] };
}

export async function capacity(store: Store) {
  const srcs = sources(store);
  const servers: HostMetrics[] = [], engines: EngineUsage[] = [], errors: string[] = [];
  await Promise.all(srcs.map(async (s) => {
    try { servers.push(...(await s.servers())); } catch (e) { errors.push(`${s.label}: ${(e as Error).message}`); }
    try { engines.push(...(await s.engines())); } catch (e) { errors.push(`${s.label}: ${(e as Error).message}`); }
  }));
  const team = teamLoad(store);
  const teamLevel: Level = team.agents.some((a) => a.state === 'overloaded') ? 'crit' : team.agents.some((a) => a.state === 'busy') ? 'warn' : 'ok';
  return { sources: srcs.map((s) => ({ id: s.id, label: s.label })), errors, team, teamLevel, engines, engineLevel: worst(engines.map((e) => e.level)), servers, serverLevel: worst(servers.map((s) => s.level)) };
}

let cache: { at: number; data: Awaited<ReturnType<typeof capacity>> } | null = null;
/** Home asks often; sources are polled at most every 30 s. */
export async function capacityCached(store: Store, maxAgeMs = 30_000) {
  if (cache && Date.now() - cache.at < maxAgeMs) return cache.data;
  cache = { at: Date.now(), data: await capacity(store) };
  return cache.data;
}
void and; void eq;
