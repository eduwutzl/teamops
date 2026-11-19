/** Ready-made reports. Each returns cards + charts + a table, so the web renders them all the same way. */
import { and, desc, gte, lte } from 'drizzle-orm';
import { analyze, RISK_LABEL } from '@teamops/core';
import { schema } from './db/index.ts';
import { ENTITIES, type Store } from './store.ts';

export interface ReportFilter { from?: string; to?: string; agentId?: number; groupId?: number; projectId?: number }
export interface ReportChart { type: 'stacked' | 'bars' | 'hbar'; title: string; categories: string[]; series: { name: string; tone: 'brand' | 'bad' | 'warn' | 'muted' | 'info'; values: number[] }[]; unit?: string }
export interface Report { kind: string; title: string; subtitle: string; cards: { label: string; value: string; hint?: string }[]; charts: ReportChart[]; columns: { key: string; label: string; align?: 'right' }[]; rows: Record<string, string | number>[] }

export const REPORTS = [
  { kind: 'productivity', title: 'Produtividade', hint: 'Tarefas por agente e grupo' },
  { kind: 'routines', title: 'Rotinas', hint: 'Execuções, falhas e atrasos' },
  { kind: 'changes', title: 'Mudanças', hint: 'O que mudou, quem e quando' },
  { kind: 'conflicts', title: 'Conflitos', hint: 'Abertos e resolvidos, por tipo' },
  { kind: 'risk', title: 'Ferramentas e risco', hint: 'Quem tem ferramenta de risco alto' },
  { kind: 'usage', title: 'Uso de IA', hint: 'Tokens e custo por agente' },
];

const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const dayLabel = (k: string) => `${k.slice(8, 10)}/${k.slice(5, 7)}`;
const secs = (ms: number) => (ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : `${(ms / 1000).toFixed(1)} s`);
const compact = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${(n / 1e3).toFixed(1)}K` : String(Math.round(n)));
const pctOf = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');

function days(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  const end = new Date(to);
  while (d <= end && out.length < 92) { out.push(dayKey(d.toISOString())); d.setDate(d.getDate() + 1); }
  return out;
}

export function buildReport(store: Store, kind: string, f: ReportFilter): Report {
  const to = f.to ?? new Date().toISOString();
  const from = f.from ?? new Date(Date.now() - 14 * 86400_000).toISOString();
  const agents = store.list('agents'), groups = store.list('groups'), tools = store.list('tools');
  const aName = (id: number | null) => agents.find((a) => a.id === id)?.name ?? '—';
  const gOf = (id: number | null) => groups.find((g) => g.id === agents.find((a) => a.id === id)?.groupId)?.name ?? 'Sem grupo';
  const agentOk = (id: number | null) => {
    if (f.agentId && id !== f.agentId) return false;
    const a = agents.find((x) => x.id === id);
    if (f.groupId && a?.groupId !== f.groupId) return false;
    if (f.projectId && !(a?.projectIds ?? []).includes(f.projectId)) return false;
    return true;
  };
  const runs = store.db.select().from(schema.runs).where(and(gte(schema.runs.createdAt, from), lte(schema.runs.createdAt, to))).orderBy(desc(schema.runs.id)).all()
    .filter((r) => agentOk(r.agentId) && (!f.projectId || r.projectId === f.projectId || r.projectId === null));
  const done = runs.filter((r) => r.status !== 'queued' && r.status !== 'running');
  const cats = days(from, to);
  const perDay = (list: typeof runs, pred: (r: (typeof runs)[number]) => boolean) => cats.map((k) => list.filter((r) => dayKey(r.createdAt) === k && pred(r)).length);
  const isOk = (r: (typeof runs)[number]) => r.status === 'ok';
  const period = `${dayLabel(cats[0] ?? dayKey(from))} a ${dayLabel(cats.at(-1) ?? dayKey(to))}`;

  if (kind === 'productivity' || kind === 'usage') {
    const ids = [...new Set(done.map((r) => r.agentId))];
    const rows = ids.map((id) => {
      const mine = done.filter((r) => r.agentId === id), ok = mine.filter(isOk).length;
      const tin = mine.reduce((s, r) => s + (r.tokensIn ?? 0), 0), tout = mine.reduce((s, r) => s + (r.tokensOut ?? 0), 0), cost = mine.reduce((s, r) => s + Number(r.costUsd ?? 0), 0);
      return { agente: aName(id), grupo: gOf(id), tarefas: mine.length, sucesso: ok, falhas: mine.length - ok, taxa: pctOf(ok, mine.length), duracao_media: secs(mine.reduce((s, r) => s + (r.durationMs ?? 0), 0) / (mine.length || 1)), tokens_entrada: tin, tokens_saida: tout, custo_usd: Number(cost.toFixed(4)) };
    }).sort((a, b) => (kind === 'usage' ? b.tokens_entrada + b.tokens_saida - a.tokens_entrada - a.tokens_saida : b.tarefas - a.tarefas));
    const okN = done.filter(isOk).length;
    if (kind === 'usage') {
      const total = rows.reduce((s, r) => s + r.tokens_entrada + r.tokens_saida, 0), cost = rows.reduce((s, r) => s + r.custo_usd, 0);
      const exposed = done.some((r) => r.tokensIn != null);
      return {
        kind, title: 'Uso de IA', subtitle: exposed ? period : `${period} · o motor não informou tokens neste período`,
        cards: [{ label: 'Tokens no período', value: compact(total) }, { label: 'Custo estimado', value: `US$ ${cost.toFixed(2)}`, hint: 'Preço de lista; assinatura não cobra por token' }, { label: 'Tarefas com IA', value: String(done.filter((r) => r.engine !== 'mock').length) }],
        charts: [
          { type: 'hbar', title: 'Tokens por agente', categories: rows.slice(0, 10).map((r) => r.agente), series: [{ name: 'Tokens', tone: 'brand', values: rows.slice(0, 10).map((r) => r.tokens_entrada + r.tokens_saida) }] },
          { type: 'bars', title: 'Tokens por dia', categories: cats.map(dayLabel), series: [{ name: 'Tokens', tone: 'brand', values: cats.map((k) => done.filter((r) => dayKey(r.createdAt) === k).reduce((s, r) => s + (r.tokensIn ?? 0) + (r.tokensOut ?? 0), 0)) }] },
        ],
        columns: [{ key: 'agente', label: 'Agente' }, { key: 'grupo', label: 'Grupo' }, { key: 'tarefas', label: 'Tarefas', align: 'right' }, { key: 'tokens_entrada', label: 'Tokens entrada', align: 'right' }, { key: 'tokens_saida', label: 'Tokens saída', align: 'right' }, { key: 'custo_usd', label: 'Custo (US$)', align: 'right' }],
        rows,
      };
    }
    const gnames = [...new Set(rows.map((r) => r.grupo))];
    return {
      kind, title: 'Produtividade', subtitle: period,
      cards: [{ label: 'Tarefas executadas', value: String(done.length) }, { label: 'Taxa de sucesso', value: pctOf(okN, done.length) }, { label: 'Falhas', value: String(done.length - okN) }, { label: 'Duração média', value: secs(done.reduce((s, r) => s + (r.durationMs ?? 0), 0) / (done.length || 1)) }],
      charts: [
        { type: 'stacked', title: 'Tarefas por dia', categories: cats.map(dayLabel), series: [{ name: 'Sucesso', tone: 'brand', values: perDay(done, isOk) }, { name: 'Falha', tone: 'bad', values: perDay(done, (r) => !isOk(r)) }] },
        { type: 'hbar', title: 'Tarefas por grupo', categories: gnames, series: [{ name: 'Tarefas', tone: 'brand', values: gnames.map((g) => rows.filter((r) => r.grupo === g).reduce((s, r) => s + r.tarefas, 0)) }] },
      ],
      columns: [{ key: 'agente', label: 'Agente' }, { key: 'grupo', label: 'Grupo' }, { key: 'tarefas', label: 'Tarefas', align: 'right' }, { key: 'sucesso', label: 'Sucesso', align: 'right' }, { key: 'falhas', label: 'Falhas', align: 'right' }, { key: 'taxa', label: 'Taxa', align: 'right' }, { key: 'duracao_media', label: 'Duração média', align: 'right' }],
      rows,
    };
  }

  if (kind === 'routines') {
    const rr = done.filter((r) => r.kind === 'routine');
    const delay = (r: (typeof runs)[number]) => (r.trigger === 'schedule' && r.scheduledFor && r.startedAt ? Math.max(0, new Date(r.startedAt).getTime() - new Date(r.scheduledFor).getTime()) : 0);
    const late = rr.filter((r) => delay(r) > 120_000);
    const ids = [...new Set(rr.map((r) => r.routineId))];
    const rows = ids.map((id) => {
      const mine = rr.filter((r) => r.routineId === id), ok = mine.filter(isOk).length;
      return { rotina: mine[0].title, agente: aName(mine[0].agentId), execucoes: mine.length, falhas: mine.length - ok, taxa: pctOf(ok, mine.length), atrasos: mine.filter((r) => delay(r) > 120_000).length, duracao_media: secs(mine.reduce((s, r) => s + (r.durationMs ?? 0), 0) / mine.length), ultima: mine[0].createdAt.slice(0, 16).replace('T', ' ') };
    }).sort((a, b) => b.falhas - a.falhas || b.execucoes - a.execucoes);
    return {
      kind, title: 'Rotinas', subtitle: period,
      cards: [{ label: 'Execuções', value: String(rr.length) }, { label: 'Falhas', value: String(rr.filter((r) => !isOk(r)).length) }, { label: 'Atrasos', value: String(late.length), hint: 'Começaram mais de 2 min depois da hora' }, { label: 'Rotinas ativas', value: String(store.list('routines').filter((r) => r.enabled).length) }],
      charts: [
        { type: 'stacked', title: 'Execuções por dia', categories: cats.map(dayLabel), series: [{ name: 'Sucesso', tone: 'brand', values: perDay(rr, isOk) }, { name: 'Falha', tone: 'bad', values: perDay(rr, (r) => !isOk(r)) }] },
        { type: 'hbar', title: 'Falhas por rotina', categories: rows.filter((r) => r.falhas).slice(0, 8).map((r) => r.rotina), series: [{ name: 'Falhas', tone: 'bad', values: rows.filter((r) => r.falhas).slice(0, 8).map((r) => r.falhas) }] },
      ],
      columns: [{ key: 'rotina', label: 'Rotina' }, { key: 'agente', label: 'Agente' }, { key: 'execucoes', label: 'Execuções', align: 'right' }, { key: 'falhas', label: 'Falhas', align: 'right' }, { key: 'taxa', label: 'Taxa', align: 'right' }, { key: 'atrasos', label: 'Atrasos', align: 'right' }, { key: 'duracao_media', label: 'Duração média', align: 'right' }, { key: 'ultima', label: 'Última' }],
      rows,
    };
  }

  if (kind === 'changes') {
    const revs = store.db.select().from(schema.revisions).where(and(gte(schema.revisions.createdAt, from), lte(schema.revisions.createdAt, to))).orderBy(desc(schema.revisions.id)).all()
      .filter((r) => !f.agentId || (r.entity === 'agents' && r.entityId === f.agentId));
    const ACT: Record<string, string> = { create: 'Criou', update: 'Alterou', delete: 'Removeu', restore: 'Restaurou', import: 'Importou' };
    const ents = [...new Set(revs.map((r) => r.entity))];
    const people = [...new Set(revs.map((r) => r.userName || 'sistema'))];
    return {
      kind, title: 'Mudanças', subtitle: period,
      cards: [{ label: 'Mudanças', value: String(revs.length) }, { label: 'Pessoas', value: String(people.length) }, { label: 'Remoções', value: String(revs.filter((r) => r.action === 'delete').length) }, { label: 'Restaurações', value: String(revs.filter((r) => r.action === 'restore').length) }],
      charts: [
        { type: 'bars', title: 'Mudanças por dia', categories: cats.map(dayLabel), series: [{ name: 'Mudanças', tone: 'brand', values: cats.map((k) => revs.filter((r) => dayKey(r.createdAt) === k).length) }] },
        { type: 'hbar', title: 'Por tipo de cadastro', categories: ents.map((e) => ENTITIES[e]?.label ?? e), series: [{ name: 'Mudanças', tone: 'brand', values: ents.map((e) => revs.filter((r) => r.entity === e).length) }] },
      ],
      columns: [{ key: 'quando', label: 'Quando' }, { key: 'quem', label: 'Quem' }, { key: 'acao', label: 'Ação' }, { key: 'tipo', label: 'Tipo' }, { key: 'item', label: 'Item' }, { key: 'campos', label: 'Campos' }],
      rows: revs.slice(0, 500).map((r) => ({ quando: r.createdAt.slice(0, 16).replace('T', ' '), quem: r.userName || 'sistema', acao: ACT[r.action] ?? r.action, tipo: ENTITIES[r.entity]?.label ?? r.entity, item: r.label, campos: r.changed.join(', ') })),
    };
  }

  if (kind === 'conflicts') {
    const all = analyze(store.state()).filter((c) => !f.agentId || c.refs.some((r) => r.type === 'agent' && r.id === f.agentId));
    const marks = store.db.select().from(schema.conflictMarks).all();
    const marked = new Map(marks.map((m) => [m.fingerprint, m]));
    const open = all.filter((c) => !marked.has(c.id));
    const types = [...new Set(all.map((c) => c.typeLabel))];
    const SEV = { high: 'Alta', medium: 'Média', low: 'Baixa' };
    return {
      kind, title: 'Conflitos', subtitle: 'Situação de agora',
      cards: [{ label: 'Abertos', value: String(open.length) }, { label: 'Graves abertos', value: String(open.filter((c) => c.severity === 'high').length) }, { label: 'Aceitos ou resolvidos', value: String(marks.length) }],
      charts: [{ type: 'stacked', title: 'Por tipo', categories: types, series: [{ name: 'Abertos', tone: 'bad', values: types.map((t) => open.filter((c) => c.typeLabel === t).length) }, { name: 'Aceitos', tone: 'muted', values: types.map((t) => all.filter((c) => c.typeLabel === t && marked.has(c.id)).length) }] }],
      columns: [{ key: 'situacao', label: 'Situação' }, { key: 'gravidade', label: 'Gravidade' }, { key: 'tipo', label: 'Tipo' }, { key: 'conflito', label: 'Conflito' }, { key: 'envolvidos', label: 'Envolvidos' }],
      rows: [
        ...all.map((c) => ({ situacao: marked.has(c.id) ? 'Aceito' : 'Aberto', gravidade: SEV[c.severity], tipo: c.typeLabel, conflito: c.title, envolvidos: c.refs.map((r) => r.name).join(', ') })),
        ...marks.filter((m) => !all.some((c) => c.id === m.fingerprint)).map((m) => ({ situacao: 'Resolvido', gravidade: '—', tipo: m.type, conflito: m.title, envolvidos: '' })),
      ],
    };
  }

  // risk
  const rank = { low: 0, medium: 1, high: 2, critical: 3 } as const;
  const list = agents.filter((a) => agentOk(a.id));
  const rows = list.map((a) => {
    const mine = (a.tools as string[]).map((k) => tools.find((t) => t.key === k)).filter(Boolean) as any[];
    const risky = mine.filter((t) => rank[t.risk as keyof typeof rank] >= 2);
    return { agente: a.name, grupo: gOf(a.id), ferramentas: mine.length, risco_alto: risky.filter((t) => t.risk === 'high').length, risco_critico: risky.filter((t) => t.risk === 'critical').length, quais: risky.map((t) => t.label).join(', '), limites: a.guardrails.approval.length + a.guardrails.never.length };
  }).sort((a, b) => b.risco_critico - a.risco_critico || b.risco_alto - a.risco_alto);
  const levels = ['low', 'medium', 'high', 'critical'] as const;
  return {
    kind: 'risk', title: 'Ferramentas e risco', subtitle: 'Situação de agora',
    cards: [{ label: 'Agentes com risco alto', value: String(rows.filter((r) => r.risco_alto + r.risco_critico > 0).length) }, { label: 'Sem nenhum limite', value: String(rows.filter((r) => r.risco_alto + r.risco_critico > 0 && !r.limites).length), hint: 'Risco alto e nenhum guardrail' }, { label: 'Ferramentas no catálogo', value: String(tools.length) }],
    charts: [
      { type: 'hbar', title: 'Ferramentas de risco alto por agente', categories: rows.filter((r) => r.risco_alto + r.risco_critico).slice(0, 10).map((r) => r.agente), series: [{ name: 'Alto', tone: 'warn', values: rows.filter((r) => r.risco_alto + r.risco_critico).slice(0, 10).map((r) => r.risco_alto) }, { name: 'Crítico', tone: 'bad', values: rows.filter((r) => r.risco_alto + r.risco_critico).slice(0, 10).map((r) => r.risco_critico) }] },
      { type: 'bars', title: 'Catálogo por risco', categories: levels.map((l) => RISK_LABEL[l]), series: [{ name: 'Ferramentas', tone: 'brand', values: levels.map((l) => tools.filter((t) => t.risk === l).length) }] },
    ],
    columns: [{ key: 'agente', label: 'Agente' }, { key: 'grupo', label: 'Grupo' }, { key: 'ferramentas', label: 'Ferramentas', align: 'right' }, { key: 'risco_alto', label: 'Alto', align: 'right' }, { key: 'risco_critico', label: 'Crítico', align: 'right' }, { key: 'limites', label: 'Guardrails', align: 'right' }, { key: 'quais', label: 'Quais' }],
    rows,
  };
}

export function reportAsCsv(r: Report): string {
  const esc = (v: unknown) => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return '﻿' + [r.columns.map((c) => esc(c.label)).join(';'), ...r.rows.map((row) => r.columns.map((c) => esc(row[c.key])).join(';'))].join('\r\n') + '\r\n';
}

export function reportAsText(r: Report): string {
  return [`# ${r.title} (${r.subtitle})`, ...r.cards.map((c) => `- ${c.label}: ${c.value}`), '', r.columns.map((c) => c.label).join(' | '), ...r.rows.slice(0, 60).map((row) => r.columns.map((c) => row[c.key]).join(' | '))].join('\n');
}
