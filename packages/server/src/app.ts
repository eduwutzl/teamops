import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { and, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { ADAPTERS, scanClaudeCode } from '@teamops/adapters';
import { analyze, BUILTIN_TOOLS, describeCron, diffLines, diffSnapshots, ENGINES, friendlyName, guessTool, isValidCron, mcpToolKey, nextRun, slugify } from '@teamops/core';
import { auditConflicts, generateProfile, reviewPrompt, suggestPrompt } from './ai.ts';
import { capacity, capacityCached } from './capacity.ts';
import { APP_ROOT, INSTANCE, schema } from './db/index.ts';
import { discoverRoutines } from './discover.ts';
import { DEFAULT_AI } from './engine.ts';
import { testMcp } from './mcp.ts';
import { buildReport, reportAsCsv, REPORTS } from './reports.ts';
import type { Runner } from './runner.ts';
import { DIFF_SKIP, ENTITIES, now, type Actor, type Store } from './store.ts';
import { acknowledge, listProblems, SEVERITIES, testMonitor, type Monitor, type Problem } from './zabbix.ts';

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${scryptSync(pw, salt, 32).toString('hex')}`;
}
function checkPassword(pw: string, hash: string): boolean {
  const [, salt, key] = hash.split('$');
  if (!salt || !key) return false;
  const got = scryptSync(pw, Buffer.from(salt, 'hex'), 32);
  return got.length === key.length / 2 && timingSafeEqual(got, Buffer.from(key, 'hex'));
}

const bad = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const DEMO = process.env.TEAMOPS_DEMO === '1';

export function buildApp(store: Store, runner: Runner): FastifyInstance {
  const app = Fastify({ logger: { level: process.env.TEAMOPS_LOG ?? 'warn' }, bodyLimit: 2_000_000 });
  app.register(cookie);
  const db = store.db;

  app.setErrorHandler((err: any, _req, reply) => {
    const code = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (code >= 500) app.log.error(err);
    reply.code(code).send({ error: code >= 500 ? 'Erro interno. Veja o log do servidor.' : err.message });
  });

  // ---------- auth ----------
  const actors = new WeakMap<FastifyRequest, Actor>();
  const actor = (req: FastifyRequest): Actor => actors.get(req) ?? { id: null, name: 'sistema' };

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/') || req.url.startsWith('/api/auth/login') || req.url.startsWith('/api/public')) return;
    const token = req.cookies.teamops_session;
    const s = token ? db.select().from(schema.sessions).where(eq(schema.sessions.token, token)).get() : null;
    const u = s && s.expiresAt > now() ? store.get('users', s.userId) : null;
    if (!u || !u.active || u.deletedAt) return reply.code(401).send({ error: 'Entre para continuar.' });
    actors.set(req, { id: u.id, name: u.name || u.username });
  });

  app.get('/api/public', async () => ({ corp: store.corp().name, demo: DEMO ? { username: 'demo', password: 'demo' } : null }));

  app.post('/api/auth/login', async (req, reply) => {
    const { username = '', password = '' } = (req.body ?? {}) as { username?: string; password?: string };
    const u = store.list('users').find((x) => x.username.toLowerCase() === username.trim().toLowerCase());
    if (!u || !u.active || !checkPassword(password, u.passwordHash)) throw bad('Usuário ou senha incorretos.', 401);
    const token = randomBytes(32).toString('hex');
    db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, now())).run();
    db.insert(schema.sessions).values({ token, userId: u.id, expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString() }).run();
    reply.setCookie('teamops_session', token, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 30 * 86400 });
    return { user: store.public('users', u) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.cookies.teamops_session) db.delete(schema.sessions).where(eq(schema.sessions.token, req.cookies.teamops_session)).run();
    reply.clearCookie('teamops_session', { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', async (req) => ({
    user: store.public('users', store.get('users', actor(req).id!)), corp: store.corp(), engines: ENGINES, adapters: ADAPTERS.map((a) => ({ id: a.id, label: a.label })),
    reports: REPORTS, ai: DEFAULT_AI, severities: SEVERITIES, version: '2.0.0-alpha.1',
  }));

  // ---------- corporation ----------
  app.put('/api/corp', async (req) => {
    const b = req.body as { name?: string; tagline?: string; mission?: string };
    const corp = { name: String(b.name ?? '').slice(0, 80) || 'Meu time', tagline: String(b.tagline ?? '').slice(0, 160), mission: String(b.mission ?? '').slice(0, 2000) };
    store.setSetting('corp', corp);
    return corp;
  });

  app.post('/api/users/:id/password', async (req) => {
    const id = Number((req.params as any).id);
    const { password = '' } = req.body as { password?: string };
    if (password.length < 4) throw bad('A senha precisa de pelo menos 4 caracteres.');
    if (!store.get('users', id)) throw bad('Usuário não encontrado.', 404);
    db.update(schema.users).set({ passwordHash: hashPassword(password) }).where(eq(schema.users.id, id)).run();
    return { ok: true };
  });

  // ---------- special routes that must win over the generic CRUD ----------
  app.get('/api/routines/discover', async () => discoverRoutines());

  app.post('/api/routines/import', async (req) => {
    const { items = [], agentId = null, projectId = null } = req.body as { items?: { name: string; cron: string; command: string; source: string; note?: string }[]; agentId?: number | null; projectId?: number | null };
    const made = items.slice(0, 100).map((it) => store.create('routines', {
      name: it.name, cron: isValidCron(it.cron) ? it.cron : '0 9 * * 1-5', agentId, projectId, enabled: false, source: it.source,
      prompt: `Rotina importada de ${it.source}. Hoje ela roda este comando:\n\n${it.command}\n\nReescreva como instrução para o agente antes de ativar.${it.note ? `\n\nObservação: ${it.note}` : ''}`,
    }, actor(req), 'import'));
    return { created: made.length };
  });

  // ---------- generic CRUD with history ----------
  for (const entity of Object.keys(ENTITIES)) {
    app.get(`/api/${entity}`, async () => store.list(entity).map((r) => store.public(entity, r)));
    app.get(`/api/${entity}/:id`, async (req) => {
      const row = store.get(entity, Number((req.params as any).id));
      if (!row) throw bad('Não encontrado.', 404);
      return store.public(entity, row);
    });
    app.post(`/api/${entity}`, async (req) => {
      const body = { ...(req.body as any) };
      if (entity === 'users') {
        if (!body.username?.trim()) throw bad('Informe o nome de usuário.');
        if (store.list('users').some((u) => u.username.toLowerCase() === body.username.trim().toLowerCase())) throw bad('Já existe um usuário com esse nome.');
      }
      const first = ENTITIES[entity].fields[0];
      if (!String(body[first] ?? '').trim()) throw bad('Preencha o nome.');
      if (entity === 'monitors') probCache = null;
      const row = store.create(entity, body, actor(req));
      if (entity === 'users' && body.password) db.update(schema.users).set({ passwordHash: hashPassword(body.password) }).where(eq(schema.users.id, row.id)).run();
      return store.public(entity, row);
    });
    app.patch(`/api/${entity}/:id`, async (req) => { if (entity === 'monitors') probCache = null; return store.public(entity, store.update(entity, Number((req.params as any).id), req.body, actor(req))); });
    app.delete(`/api/${entity}/:id`, async (req) => {
      const id = Number((req.params as any).id);
      if (entity === 'users' && id === actor(req).id) throw bad('Você não pode remover o próprio usuário.');
      store.remove(entity, id, actor(req));
      return { ok: true };
    });
  }

  // ---------- arms (MCP) ----------
  app.post('/api/mcps/:id/test', async (req) => {
    const m = store.get('mcps', Number((req.params as any).id));
    if (!m) throw bad('Braço não encontrado.', 404);
    const res = await testMcp(m);
    db.update(schema.mcps).set({ lastTestAt: now(), lastTestOk: res.ok, lastTestMessage: res.message, ...(res.ok ? { discovered: res.tools } : {}) }).where(eq(schema.mcps.id, m.id)).run();
    const known = new Set(store.list('tools').map((t) => t.key));
    return { ...res, tools: res.tools.map((t) => ({ ...t, key: mcpToolKey(m.name, t.name), inCatalog: known.has(mcpToolKey(m.name, t.name)), ...guessTool(t.name, t.description) })) };
  });

  app.post('/api/mcps/:id/adopt', async (req) => {
    const m = store.get('mcps', Number((req.params as any).id));
    if (!m) throw bad('Braço não encontrado.', 404);
    const { names } = req.body as { names?: string[] };
    const known = new Set(store.list('tools').map((t) => t.key));
    let created = 0;
    for (const t of m.discovered as { name: string; description: string }[]) {
      const key = mcpToolKey(m.name, t.name);
      if (known.has(key) || (names && !names.includes(t.name))) continue;
      const g = guessTool(t.name, t.description);
      store.create('tools', { key, label: friendlyName(t.name), description: t.description, risk: g.risk, capabilities: g.capabilities, category: m.label || m.name, source: 'mcp', mcpId: m.id }, actor(req));
      created++;
    }
    return { created };
  });

  app.post('/api/tools/builtin', async (req) => {
    const known = new Set(store.list('tools').map((t) => t.key));
    let created = 0;
    for (const t of BUILTIN_TOOLS) if (!known.has(t.key)) { store.create('tools', { ...t, source: 'builtin' }, actor(req)); created++; }
    return { created };
  });

  // ---------- AI ----------
  app.post('/api/ai/profile', async (req) => {
    const { draft = '', name = '' } = req.body as { draft?: string; name?: string };
    if (draft.trim().length < 10) throw bad('Escreva um rascunho de pelo menos uma frase.');
    return generateProfile(store, draft, name);
  });
  app.post('/api/ai/prompt/suggest', async (req) => { const { agent = {}, hint = '' } = req.body as any; return suggestPrompt(store, agent, hint); });
  app.post('/api/ai/prompt/review', async (req) => {
    const { agent = {} } = req.body as any;
    if (!String(agent.prompt ?? '').trim()) throw bad('Não há prompt para revisar.');
    const r = await reviewPrompt(store, agent);
    return { ...r, diff: r.improved ? diffLines(agent.prompt, r.improved) : [] };
  });
  app.post('/api/ai/audit', async () => auditConflicts(store));

  // ---------- conflicts ----------
  const conflicts = () => {
    const all = analyze(store.state());
    const marks = new Map(db.select().from(schema.conflictMarks).all().map((m) => [m.fingerprint, m]));
    return all.map((c) => ({ ...c, mark: marks.get(c.id) ?? null }));
  };
  app.get('/api/conflicts', async () => {
    const list = conflicts();
    const live = new Set(list.map((c) => c.id));
    const resolved = db.select().from(schema.conflictMarks).all().filter((m) => !live.has(m.fingerprint));
    return { open: list.filter((c) => !c.mark), accepted: list.filter((c) => c.mark), resolved };
  });
  app.post('/api/conflicts/:id/mark', async (req) => {
    const id = (req.params as any).id as string;
    const { note = '', accepted = true } = req.body as { note?: string; accepted?: boolean };
    if (!accepted) { db.delete(schema.conflictMarks).where(eq(schema.conflictMarks.fingerprint, id)).run(); return { ok: true }; }
    const c = conflicts().find((x) => x.id === id);
    if (!c) throw bad('Conflito não encontrado.', 404);
    const v = { status: 'accepted' as const, note: note.slice(0, 500), title: c.title, type: c.typeLabel, userName: actor(req).name, createdAt: now() };
    db.insert(schema.conflictMarks).values({ fingerprint: id, ...v }).onConflictDoUpdate({ target: schema.conflictMarks.fingerprint, set: v }).run();
    return { ok: true };
  });

  // ---------- history ----------
  app.get('/api/revisions', async (req) => {
    const q = req.query as { entity?: string; entityId?: string; limit?: string };
    const conds = [q.entity ? eq(schema.revisions.entity, q.entity) : undefined, q.entityId ? eq(schema.revisions.entityId, Number(q.entityId)) : undefined].filter(Boolean) as any[];
    const rows = db.select().from(schema.revisions).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.revisions.id)).limit(Math.min(500, Number(q.limit ?? 200))).all();
    return rows.map(({ snapshot, ...r }) => ({ ...r, entityLabel: ENTITIES[r.entity]?.label ?? r.entity, deleted: !!snapshot.deletedAt }));
  });
  app.get('/api/revisions/:id', async (req) => {
    const rev = db.select().from(schema.revisions).where(eq(schema.revisions.id, Number((req.params as any).id))).get();
    if (!rev) throw bad('Versão não encontrada.', 404);
    const prev = db.select().from(schema.revisions).where(and(eq(schema.revisions.entity, rev.entity), eq(schema.revisions.entityId, rev.entityId), lt(schema.revisions.version, rev.version))).orderBy(desc(schema.revisions.version)).limit(1).get();
    const current = store.get(rev.entity, rev.entityId);
    const curSnap = current ? Object.fromEntries(Object.entries(current).filter(([k]) => !(ENTITIES[rev.entity]?.secret ?? []).includes(k))) : null;
    return {
      ...rev, entityLabel: ENTITIES[rev.entity]?.label ?? rev.entity,
      changes: diffSnapshots(prev?.snapshot ?? null, rev.snapshot, DIFF_SKIP), vsCurrent: diffSnapshots(curSnap, rev.snapshot, DIFF_SKIP), isCurrent: !!current && !current.deletedAt && diffSnapshots(curSnap, rev.snapshot, DIFF_SKIP).length === 0,
    };
  });
  app.post('/api/revisions/:id/restore', async (req) => { store.restore(Number((req.params as any).id), actor(req)); return { ok: true }; });

  // ---------- adapters: preview and write the files each engine reads ----------
  const workspace = (slug: string) => join(INSTANCE, 'workspaces', slug);
  const generate = (projectId: number, adapterId: string) => {
    const project = store.get('projects', projectId);
    if (!project) throw bad('Projeto não encontrado.', 404);
    const adapter = ADAPTERS.find((a) => a.id === adapterId) ?? ADAPTERS[0];
    const dir = workspace(project.slug);
    const files = adapter.generate(store.state(), project).map((f) => {
      const p = join(dir, f.path);
      const old = existsSync(p) ? readFileSync(p, 'utf8') : null;
      return { ...f, status: old === null ? 'new' : old === f.content ? 'same' : 'changed', diff: old !== null && old !== f.content ? diffLines(old, f.content) : [] };
    });
    return { project, dir, adapter: adapter.id, files };
  };
  app.get('/api/projects/:id/export', async (req) => generate(Number((req.params as any).id), (req.query as any).adapter ?? 'claude-code'));
  app.post('/api/projects/:id/export', async (req) => {
    const g = generate(Number((req.params as any).id), (req.body as any)?.adapter ?? 'claude-code');
    for (const f of g.files) {
      const p = resolve(g.dir, f.path);
      if (!p.startsWith(g.dir + '/')) throw bad('Caminho inválido.');
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, f.content);
    }
    return { written: g.files.length, dir: g.dir };
  });

  // ---------- importer (reads a Claude Code environment; writes only to the TeamOps database) ----------
  app.post('/api/import/claude-code/scan', async (req) => {
    const { path = '' } = req.body as { path?: string };
    if (!path.startsWith('/')) throw bad('Informe o caminho completo da pasta.');
    const scan = scanClaudeCode(resolve(path));
    const have = new Set(store.list('agents').map((a) => a.slug));
    return { ...scan, agents: scan.agents.map((a) => ({ ...a, exists: have.has(a.slug), prompt: a.prompt.slice(0, 600) })), rules: scan.rules.map((r) => ({ ...r, body: r.body.slice(0, 300) })) };
  });
  app.post('/api/import/claude-code/apply', async (req) => {
    const { path = '', agents: pick = [], rules = false, mcps = false, projectId = null } = req.body as { path?: string; agents?: string[]; rules?: boolean; mcps?: boolean; projectId?: number | null };
    const scan = scanClaudeCode(resolve(path));
    const who = actor(req);
    const have = new Set(store.list('agents').map((a) => a.slug));
    const out = { agents: 0, rules: 0, mcps: 0, tools: 0 };
    const knownTools = new Set(store.list('tools').map((t) => t.key));
    for (const a of scan.agents) {
      if (!pick.includes(a.slug) || have.has(a.slug)) continue;
      for (const k of a.tools) if (!knownTools.has(k)) { const g = guessTool(k); store.create('tools', { key: k, label: friendlyName(k), risk: g.risk, capabilities: g.capabilities, category: 'Importadas', source: k.startsWith('mcp__') ? 'mcp' : 'custom' }, who, 'import'); knownTools.add(k); out.tools++; }
      store.create('agents', { name: a.name, slug: a.slug, description: a.description, title: a.description.split(/[.—:]/)[0].slice(0, 80), model: a.model, engine: 'claude-code', tools: a.tools, prompt: a.prompt, guardrails: a.guardrails, status: 'draft', projectIds: projectId ? [projectId] : [], extras: { origem: a.file } }, who, 'import');
      out.agents++;
    }
    if (rules) for (const [i, r] of scan.rules.entries()) { store.create('rules', { title: r.title, body: r.body, category: 'Importadas', projectId, position: 100 + i, active: true }, who, 'import'); out.rules++; }
    if (mcps) {
      const haveM = new Set(store.list('mcps').map((m) => m.name));
      for (const m of scan.mcps) {
        if (haveM.has(slugify(m.name))) continue;
        store.create('mcps', { name: m.name, label: m.name, transport: m.transport, command: m.command, args: m.args, url: m.url, env: Object.fromEntries(m.envKeys.map((k) => [k, ''])), enabled: false, description: 'Importado. Preencha as variáveis e teste antes de ligar.' }, who, 'import');
        out.mcps++;
      }
    }
    return out;
  });

  // ---------- routines and runs ----------
  app.post('/api/routines/:id/run', async (req) => ({ runId: runner.enqueueRoutine(Number((req.params as any).id), 'manual') }));
  app.get('/api/runs', async (req) => {
    const q = req.query as { routineId?: string; ref?: string; kind?: string; limit?: string };
    const conds = [q.routineId ? eq(schema.runs.routineId, Number(q.routineId)) : undefined, q.ref ? eq(schema.runs.ref, q.ref) : undefined, q.kind ? eq(schema.runs.kind, q.kind as any) : undefined].filter(Boolean) as any[];
    return db.select().from(schema.runs).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.runs.id)).limit(Math.min(300, Number(q.limit ?? 50))).all()
      .map((r) => ({ ...r, output: r.output.slice(0, 400), log: r.kind === 'routine' ? r.log.slice(0, 400) : '' }));
  });
  app.get('/api/runs/:id', async (req) => {
    const r = db.select().from(schema.runs).where(eq(schema.runs.id, Number((req.params as any).id))).get();
    if (!r) throw bad('Execução não encontrada.', 404);
    return r;
  });

  // ---------- monitoring: problems ----------
  let probCache: { at: number; data: { problems: Problem[]; errors: string[] } } | null = null;
  const problems = async (fresh = false) => {
    if (!fresh && probCache && Date.now() - probCache.at < 15_000) return probCache.data;
    const mons = (store.list('monitors') as Monitor[]).filter((m) => m.enabled);
    const out: Problem[] = [], errors: string[] = [];
    await Promise.all(mons.map(async (m) => { try { out.push(...(await listProblems(m))); } catch (e) { errors.push(`${m.name}: ${(e as Error).message}`); } }));
    out.sort((a, b) => b.severity - a.severity || b.since - a.since);
    probCache = { at: Date.now(), data: { problems: out, errors } };
    return probCache.data;
  };
  app.get('/api/problems', async (req) => {
    const { problems: list, errors } = await problems((req.query as any).fresh === '1');
    const refs = list.map((p) => p.key);
    const diag = refs.length ? db.select().from(schema.runs).where(and(eq(schema.runs.kind, 'problem'), inArray(schema.runs.ref, refs.slice(0, 400)))).orderBy(desc(schema.runs.id)).all() : [];
    const agentsById = new Map(store.list('agents').map((a) => [a.id, a]));
    return {
      monitors: store.list('monitors').filter((m) => m.enabled).length, errors, at: new Date(probCache!.at).toISOString(),
      problems: list.map((p) => ({ ...p, diagnoses: diag.filter((d) => d.ref === p.key).map((d) => ({ id: d.id, status: d.status, agent: agentsById.get(d.agentId!)?.name ?? '—', emoji: agentsById.get(d.agentId!)?.emoji ?? '🤖', output: d.output, log: d.status === 'failed' || d.status === 'timeout' ? d.log.slice(0, 300) : '', createdAt: d.createdAt, durationMs: d.durationMs })) })),
    };
  });
  app.post('/api/problems/diagnose', async (req) => {
    const { key = '', agentId } = req.body as { key?: string; agentId?: number };
    const p = (await problems()).problems.find((x) => x.key === key);
    if (!p) throw bad('Problema não está mais aberto.', 404);
    if (!agentId) throw bad('Escolha um agente.');
    const mins = Math.round((Date.now() / 1000 - p.since) / 60);
    const prompt = `Um problema de monitoramento está aberto. Faça um diagnóstico curto em português do Brasil.

Problema: ${p.name}
Gravidade: ${SEVERITIES[p.severity]}
Host: ${p.host}${p.groups.length ? ` (grupos: ${p.groups.join(', ')})` : ''}
Aberto há: ${mins} min
Reconhecido: ${p.acknowledged ? 'sim' : 'não'}
Tags: ${p.tags.map((t) => `${t.tag}${t.value ? '=' + t.value : ''}`).join(', ') || 'nenhuma'}
Últimos valores dos itens do trigger:
${p.items.map((i) => `- ${i.name}: ${i.value} ${i.units}`).join('\n') || '- (sem itens)'}
${p.opdata ? `Dados operacionais: ${p.opdata}` : ''}

Responda neste formato, em até 12 linhas:
**Leitura:** o que o alerta indica.
**Causas prováveis:** 2 ou 3, da mais provável para a menos.
**Como verificar:** comandos ou checagens objetivas.
**Urgência:** agora, hoje ou pode esperar, e por quê.
Não execute nada e não reconheça o alerta: só analise.`;
    return { runId: runner.enqueueTask({ kind: 'problem', agentId, title: `Diagnóstico: ${p.name}`.slice(0, 160), prompt, ref: p.key }) };
  });
  app.post('/api/problems/ack', async (req) => {
    const { key = '', message = '' } = req.body as { key?: string; message?: string };
    const p = (await problems()).problems.find((x) => x.key === key);
    if (!p) throw bad('Problema não está mais aberto.', 404);
    const m = store.get('monitors', p.monitorId) as Monitor;
    await acknowledge(m, p.eventId, `${message || 'Reconhecido'} (via TeamOps, por ${actor(req).name})`.slice(0, 2000)).catch((e) => { throw bad((e as Error).message, 502); });
    probCache = null;
    return { ok: true };
  });
  app.post('/api/monitors/:id/test', async (req) => {
    const m = store.get('monitors', Number((req.params as any).id));
    if (!m) throw bad('Conexão não encontrada.', 404);
    return testMonitor(m);
  });

  // ---------- capacity, reports, home ----------
  app.get('/api/capacity', async () => capacity(store));
  app.get('/api/reports/:kind', async (req, reply) => {
    const raw = (req.params as any).kind as string, q = req.query as Record<string, string>;
    const csv = raw.endsWith('.csv'), kind = raw.replace(/\.csv$/, '');
    if (!REPORTS.some((r) => r.kind === kind)) throw bad('Relatório desconhecido.', 404);
    const rep = buildReport(store, kind, { from: q.from || undefined, to: q.to || undefined, agentId: Number(q.agentId) || undefined, groupId: Number(q.groupId) || undefined, projectId: Number(q.projectId) || undefined });
    if (!csv) return rep;
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="teamops-${kind}-${now().slice(0, 10)}.csv"`);
    return reportAsCsv(rep);
  });

  app.get('/api/home', async () => {
    const s = store.state();
    const since = new Date(Date.now() - 13 * 86400_000); since.setHours(0, 0, 0, 0);
    const runs = db.select().from(schema.runs).where(gte(schema.runs.createdAt, since.toISOString())).all();
    const revs = db.select().from(schema.revisions).where(gte(schema.revisions.createdAt, since.toISOString())).all();
    const dk = (iso: string) => new Date(iso).toLocaleDateString('sv');
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(since); d.setDate(d.getDate() + i); return dk(d.toISOString()); });
    const open = conflicts().filter((c) => !c.mark);
    const done = runs.filter((r) => r.status !== 'queued' && r.status !== 'running');
    const week = (list: typeof done, offset: number) => list.filter((r) => { const age = (Date.now() - new Date(r.createdAt).getTime()) / 86400_000; return age >= offset && age < offset + 7; });
    const agentsById = new Map(s.agents.map((a) => [a.id, a]));
    const upcoming = s.routines.filter((r) => r.enabled && isValidCron(r.cron)).map((r) => ({ id: r.id, name: r.name, agent: agentsById.get(r.agentId!)?.name ?? '—', emoji: agentsById.get(r.agentId!)?.emoji ?? '🤖', at: nextRun(r.cron)?.toISOString() ?? null, schedule: describeCron(r.cron) }))
      .filter((r) => r.at).sort((a, b) => a.at!.localeCompare(b.at!)).slice(0, 5);
    const failures = done.filter((r) => r.status !== 'ok').sort((a, b) => b.id - a.id).slice(0, 5).map((r) => ({ id: r.id, title: r.title, status: r.status, at: r.createdAt, agent: agentsById.get(r.agentId!)?.name ?? '—', log: r.log.slice(0, 160), routineId: r.routineId }));
    const [cap, prob] = await Promise.all([capacityCached(store).catch(() => null), problems().catch(() => ({ problems: [] as Problem[], errors: ['fonte indisponível'] }))]);
    const sev = [0, 0, 0, 0, 0, 0];
    for (const p of prob.problems) sev[p.severity]++;
    const alerts: { level: 'crit' | 'warn' | 'info'; text: string; to: string }[] = [];
    const high = open.filter((c) => c.severity === 'high').length;
    if (high) alerts.push({ level: 'crit', text: `${high} conflito${high > 1 ? 's' : ''} grave${high > 1 ? 's' : ''} em aberto`, to: '/conflitos' });
    const disaster = sev[5] + sev[4];
    if (disaster) alerts.push({ level: 'crit', text: `${disaster} problema${disaster > 1 ? 's' : ''} de gravidade alta no monitoramento`, to: '/problemas' });
    const f24 = done.filter((r) => r.status !== 'ok' && Date.now() - new Date(r.createdAt).getTime() < 86400_000).length;
    if (f24) alerts.push({ level: 'warn', text: `${f24} execuç${f24 > 1 ? 'ões falharam' : 'ão falhou'} nas últimas 24 h`, to: '/rotinas' });
    const overloaded = cap?.team.agents.filter((a) => a.state === 'overloaded') ?? [];
    if (overloaded.length) alerts.push({ level: 'warn', text: `${overloaded.map((a) => a.name).join(', ')} acima da capacidade`, to: '/capacidade' });
    if (cap && cap.serverLevel === 'crit') alerts.push({ level: 'crit', text: 'Servidor no limite de recursos', to: '/capacidade' });
    if (cap && cap.engineLevel !== 'ok' && cap.engineLevel !== 'unknown') alerts.push({ level: cap.engineLevel === 'crit' ? 'crit' : 'warn', text: 'Uso do motor de IA perto do limite', to: '/capacidade' });
    const down = s.mcps.filter((m) => m.enabled && m.lastTestOk === false);
    if (down.length) alerts.push({ level: 'warn', text: `Braço fora: ${down.map((m) => m.label || m.name).join(', ')}`, to: '/bracos' });
    const drafts = s.agents.filter((a) => a.status === 'draft').length;
    if (drafts) alerts.push({ level: 'info', text: `${drafts} agente${drafts > 1 ? 's' : ''} em rascunho esperando perfil`, to: '/agentes' });
    const thisW = week(done, 0), lastW = week(done, 7);
    return {
      corp: s.corp,
      stats: {
        agents: s.agents.filter((a) => a.status === 'active').length, drafts, groups: s.groups.length, routines: s.routines.filter((r) => r.enabled).length, conflicts: open.length, conflictsHigh: high,
        runsWeek: thisW.length, runsLastWeek: lastW.length, successWeek: thisW.length ? Math.round((thisW.filter((r) => r.status === 'ok').length / thisW.length) * 100) : null,
        successLastWeek: lastW.length ? Math.round((lastW.filter((r) => r.status === 'ok').length / lastW.length) * 100) : null, changesWeek: revs.filter((r) => Date.now() - new Date(r.createdAt).getTime() < 7 * 86400_000).length,
      },
      alerts,
      series: days.map((d) => ({ day: d, ok: done.filter((r) => dk(r.createdAt) === d && r.status === 'ok').length, failed: done.filter((r) => dk(r.createdAt) === d && r.status !== 'ok').length, changes: revs.filter((r) => dk(r.createdAt) === d).length })),
      byGroup: s.groups.map((g) => ({ name: g.name, emoji: g.emoji, runs: thisW.filter((r) => agentsById.get(r.agentId!)?.groupId === g.id).length })).sort((a, b) => b.runs - a.runs),
      upcoming, failures,
      capacity: cap ? { team: cap.teamLevel, engine: cap.engineLevel, server: cap.serverLevel, idle: cap.team.agents.filter((a) => a.state === 'idle').length, overloaded: overloaded.length, window: cap.engines[0]?.windows[0] ?? null, servers: cap.servers.map((h) => ({ name: h.name, level: h.level, cpuPct: h.cpuPct, memPct: h.memPct })) } : null,
      problems: { monitors: store.list('monitors').filter((m) => m.enabled).length, total: prob.problems.length, bySeverity: sev, unacked: prob.problems.filter((p) => !p.acknowledged).length },
      activity: revs.sort((a, b) => b.id - a.id).slice(0, 6).map((r) => ({ id: r.id, action: r.action, label: r.label, entityLabel: ENTITIES[r.entity]?.label ?? r.entity, userName: r.userName, createdAt: r.createdAt })),
    };
  });

  // ---------- web ----------
  const dist = join(APP_ROOT, 'packages/web/dist');
  if (existsSync(dist)) {
    app.register(fastifyStatic, { root: dist });
    app.setNotFoundHandler((req, reply) => (req.url.startsWith('/api/') ? reply.code(404).send({ error: 'Rota não encontrada.' }) : reply.sendFile('index.html')));
  }
  return app;
}
