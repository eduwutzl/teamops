/** Work queue + internal scheduler. Every piece of agent work becomes a row in `runs`. */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { guardrailsMarkdown, isValidCron, nextRun } from '@teamops/core';
import { INSTANCE, schema } from './db/index.ts';
import { runEngine } from './engine.ts';
import { buildReport, reportAsText } from './reports.ts';
import { now, type Store } from './store.ts';

const MAX_PARALLEL = Number(process.env.TEAMOPS_MAX_PARALLEL ?? 2);
const RUN_TIMEOUT_MS = Number(process.env.TEAMOPS_RUN_TIMEOUT_S ?? 600) * 1000;
/** Phase 1 safety: scheduled work only gets low-risk built-in tools unless the instance opts in. */
const FULL_TOOLS = process.env.TEAMOPS_RUN_FULL_TOOLS === '1';

export class Runner {
  private active = 0;
  private timer: NodeJS.Timeout | null = null;
  constructor(private store: Store) {}

  start(): void {
    // whatever was running when the server stopped did not finish
    this.store.db.update(schema.runs).set({ status: 'failed', log: 'Interrompida: o servidor reiniciou durante a execução.', finishedAt: now() }).where(eq(schema.runs.status, 'running')).run();
    for (const r of this.store.list('routines')) {
      if (r.enabled && isValidCron(r.cron) && (!r.nextRunAt || new Date(r.nextRunAt) < new Date())) this.store.db.update(schema.routines).set({ nextRunAt: nextRun(r.cron)?.toISOString() ?? null }).where(eq(schema.routines.id, r.id)).run();
    }
    this.timer = setInterval(() => this.tick(), 20_000);
    this.timer.unref();
    this.tick();
  }

  stop(): void { if (this.timer) clearInterval(this.timer); }

  tick(): void {
    const due = this.store.db.select().from(schema.routines)
      .where(and(eq(schema.routines.enabled, true), isNull(schema.routines.deletedAt), lte(schema.routines.nextRunAt, now()))).all();
    for (const r of due) {
      this.enqueueRoutine(r.id, 'schedule', r.nextRunAt);
      this.store.db.update(schema.routines).set({ nextRunAt: isValidCron(r.cron) ? nextRun(r.cron)?.toISOString() ?? null : null }).where(eq(schema.routines.id, r.id)).run();
    }
    this.pump();
  }

  enqueueRoutine(routineId: number, trigger: 'schedule' | 'manual', scheduledFor: string | null = null): number {
    const r = this.store.get('routines', routineId);
    if (!r) throw Object.assign(new Error('Rotina não encontrada.'), { statusCode: 404 });
    const agent = r.agentId ? this.store.get('agents', r.agentId) : null;
    const row = this.store.db.insert(schema.runs).values({
      kind: 'routine', routineId, agentId: r.agentId, projectId: r.projectId, title: r.name, trigger, status: 'queued', scheduledFor: scheduledFor ?? now(),
      engine: agent?.engine ?? '', model: agent?.model ?? '', createdAt: now(),
    }).returning().get();
    queueMicrotask(() => this.pump());
    return row.id;
  }

  /** Ad-hoc work for an agent (e.g. diagnosing a monitoring problem). */
  enqueueTask(opts: { kind: 'problem' | 'assist'; agentId: number; title: string; prompt: string; ref?: string }): number {
    const agent = this.store.get('agents', opts.agentId);
    if (!agent) throw Object.assign(new Error('Agente não encontrado.'), { statusCode: 404 });
    const row = this.store.db.insert(schema.runs).values({
      kind: opts.kind, agentId: agent.id, title: opts.title, trigger: 'manual', status: 'queued', scheduledFor: now(), engine: agent.engine, model: agent.model,
      log: opts.prompt, ref: opts.ref ?? null, createdAt: now(),
    }).returning().get();
    queueMicrotask(() => this.pump());
    return row.id;
  }

  private pump(): void {
    while (this.active < MAX_PARALLEL) {
      const next = this.store.db.select().from(schema.runs).where(eq(schema.runs.status, 'queued')).orderBy(asc(schema.runs.id)).limit(1).get();
      if (!next) return;
      this.store.db.update(schema.runs).set({ status: 'running', startedAt: now() }).where(eq(schema.runs.id, next.id)).run();
      this.active++;
      this.execute(next.id).catch(() => {}).finally(() => { this.active--; this.pump(); });
    }
  }

  private async execute(runId: number): Promise<void> {
    const run = this.store.db.select().from(schema.runs).where(eq(schema.runs.id, runId)).get()!;
    const finish = (patch: Partial<typeof schema.runs.$inferInsert>) => {
      const finishedAt = now();
      const durationMs = patch.durationMs ?? (run.startedAt ? Date.now() - new Date(run.startedAt).getTime() : 0);
      this.store.db.update(schema.runs).set({ ...patch, finishedAt, durationMs }).where(eq(schema.runs.id, runId)).run();
      if (run.routineId) this.store.db.update(schema.routines).set({ lastRunAt: finishedAt, lastStatus: patch.status ?? 'failed' }).where(eq(schema.routines.id, run.routineId)).run();
    };
    const agent = run.agentId ? this.store.get('agents', run.agentId) : null;
    if (!agent || agent.deletedAt) return finish({ status: 'failed', log: 'Sem agente responsável.' });
    if (agent.status !== 'active') return finish({ status: 'failed', log: `O agente ${agent.name} não está ativo.` });

    let prompt = run.log; // ad-hoc tasks carry their prompt in `log` until they start
    if (run.kind === 'routine') {
      const routine = this.store.get('routines', run.routineId!);
      prompt = routine?.prompt ?? '';
      if (routine?.report) prompt += `\n\nDados do relatório (${routine.report.kind}, últimos ${routine.report.days} dias):\n` + reportAsText(buildReport(this.store, routine.report.kind, { from: new Date(Date.now() - routine.report.days * 86400_000).toISOString() }));
    }
    const project = run.projectId ? this.store.get('projects', run.projectId) : null;
    const cwd = join(INSTANCE, 'workspaces', project?.slug ?? '_team');
    mkdirSync(cwd, { recursive: true });
    const catalog = this.store.list('tools');
    const tools = (agent.tools as string[]).filter((k) => { const t = catalog.find((c) => c.key === k); return t?.source === 'builtin' && (FULL_TOOLS || t.risk === 'low'); });
    const system = [agent.prompt, guardrailsMarkdown(agent.guardrails)].filter(Boolean).join('\n\n');
    const res = await runEngine({ engine: agent.engine, model: agent.model, prompt, system, tools, cwd, timeoutMs: RUN_TIMEOUT_MS });
    finish({
      status: res.timedOut ? 'timeout' : res.ok ? 'ok' : 'failed', output: res.text.slice(0, 60_000), log: res.log, durationMs: res.durationMs, engine: agent.engine, model: res.model || agent.model,
      tokensIn: res.tokensIn, tokensOut: res.tokensOut, costUsd: res.costUsd == null ? null : String(res.costUsd),
    });
  }
}
void inArray;
