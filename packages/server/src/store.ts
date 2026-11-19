/** Entity registry: one generic CRUD with version history for every managed table. */
import { and, desc, eq, isNull } from 'drizzle-orm';
import type { SQLiteTableWithColumns } from 'drizzle-orm/sqlite-core';
import { isValidCron, nextRun, slugify, type TeamState } from '@teamops/core';
import { schema, type Db } from './db/index.ts';

export const now = () => new Date().toISOString();
export interface Actor { id: number | null; name: string }

interface EntityDef {
  table: SQLiteTableWithColumns<any>;
  label: string;
  /** Fields a client may write. */
  fields: string[];
  /** Fields left out of API answers and snapshots. */
  secret?: string[];
  name: (row: any) => string;
  prepare?: (data: any, current: any | null) => void;
}

export const ENTITIES: Record<string, EntityDef> = {
  users: { table: schema.users, label: 'Usuário', fields: ['username', 'name', 'email', 'active'], secret: ['passwordHash'], name: (r) => r.name || r.username },
  projects: {
    table: schema.projects, label: 'Projeto', fields: ['name', 'slug', 'description', 'engine', 'active'], name: (r) => r.name,
    prepare: (d, cur) => { if (d.name && !d.slug && !cur) d.slug = slugify(d.name); if (d.slug) d.slug = slugify(d.slug); },
  },
  rules: { table: schema.rules, label: 'Regra', fields: ['title', 'body', 'category', 'projectId', 'position', 'active'], name: (r) => r.title },
  mcps: {
    table: schema.mcps, label: 'Braço', fields: ['name', 'label', 'description', 'transport', 'command', 'args', 'url', 'env', 'enabled'], name: (r) => r.label || r.name,
    prepare: (d) => { if (d.name) d.name = slugify(d.name); },
  },
  tools: { table: schema.tools, label: 'Ferramenta', fields: ['key', 'label', 'description', 'risk', 'category', 'capabilities', 'source', 'mcpId'], name: (r) => r.label || r.key },
  groups: { table: schema.groups, label: 'Grupo', fields: ['name', 'description', 'color', 'emoji'], name: (r) => r.name },
  agents: {
    table: schema.agents, label: 'Agente', name: (r) => r.name,
    fields: ['name', 'slug', 'emoji', 'title', 'description', 'status', 'groupId', 'projectIds', 'engine', 'model', 'draft', 'prompt', 'guardrails', 'tools', 'extras', 'why', 'weeklyCapacity'],
    prepare: (d, cur) => { if (d.name && !d.slug && !cur) d.slug = slugify(d.name); if (d.slug) d.slug = slugify(d.slug); },
  },
  routines: {
    table: schema.routines, label: 'Rotina', fields: ['name', 'agentId', 'projectId', 'prompt', 'cron', 'enabled', 'requiredTools', 'source', 'report'], name: (r) => r.name,
    prepare: (d, cur) => {
      const cron = d.cron ?? cur?.cron, enabled = d.enabled ?? cur?.enabled;
      if (d.cron !== undefined || d.enabled !== undefined) d.nextRunAt = enabled && cron && isValidCron(cron) ? nextRun(cron)?.toISOString() ?? null : null;
    },
  },
  monitors: { table: schema.monitors, label: 'Conexão Zabbix', fields: ['name', 'kind', 'url', 'token', 'enabled', 'useForCapacity', 'hosts', 'usageHost', 'usageKeys'], secret: ['token'], name: (r) => r.name },
};

const SKIP_DIFF = ['id', 'createdAt', 'updatedAt', 'deletedAt', 'nextRunAt', 'lastRunAt', 'lastStatus', 'lastTestAt', 'lastTestOk', 'lastTestMessage'];

export class Store {
  constructor(public db: Db) {}

  private def(entity: string): EntityDef {
    const d = ENTITIES[entity];
    if (!d) throw Object.assign(new Error('Entidade desconhecida.'), { statusCode: 404 });
    return d;
  }

  /** Row as the API shows it: secrets become a boolean "is set" flag. */
  public(entity: string, row: any): any {
    if (!row) return row;
    const out = { ...row };
    for (const s of this.def(entity).secret ?? []) { out[`${s}Set`] = !!out[s]; delete out[s]; }
    return out;
  }

  list(entity: string, includeDeleted = false): any[] {
    const { table } = this.def(entity);
    const rows = includeDeleted ? this.db.select().from(table).all() : this.db.select().from(table).where(isNull(table.deletedAt)).all();
    return rows as any[];
  }

  get(entity: string, id: number): any | null {
    const { table } = this.def(entity);
    return (this.db.select().from(table).where(eq(table.id, id)).get() as any) ?? null;
  }

  private snapshot(entity: string, row: any): Record<string, unknown> {
    const snap = { ...row };
    for (const s of this.def(entity).secret ?? []) delete snap[s];
    return snap;
  }

  private record(entity: string, row: any, action: 'create' | 'update' | 'delete' | 'restore' | 'import', actor: Actor, changed: string[] = []) {
    const last = this.db.select({ v: schema.revisions.version }).from(schema.revisions)
      .where(and(eq(schema.revisions.entity, entity), eq(schema.revisions.entityId, row.id))).orderBy(desc(schema.revisions.version)).limit(1).get();
    this.db.insert(schema.revisions).values({
      entity, entityId: row.id, version: (last?.v ?? 0) + 1, action, label: this.def(entity).name(row), snapshot: this.snapshot(entity, row),
      changed, userId: actor.id, userName: actor.name, createdAt: now(),
    }).run();
  }

  private clean(entity: string, data: any, current: any | null): any {
    const def = this.def(entity);
    const out: any = {};
    for (const f of def.fields) if (data[f] !== undefined) out[f] = data[f];
    for (const s of def.secret ?? []) if (def.fields.includes(s) && out[s] === '') delete out[s]; // empty secret = keep the current one
    def.prepare?.(out, current);
    return out;
  }

  create(entity: string, data: any, actor: Actor, action: 'create' | 'import' = 'create'): any {
    const { table } = this.def(entity);
    const values = { ...this.clean(entity, data, null), createdAt: now(), updatedAt: now() };
    const row = this.db.insert(table).values(values).returning().get() as any;
    this.record(entity, row, action, actor, Object.keys(values).filter((k) => !SKIP_DIFF.includes(k)));
    return row;
  }

  update(entity: string, id: number, data: any, actor: Actor, action: 'update' | 'restore' = 'update'): any {
    const { table } = this.def(entity);
    const cur = this.get(entity, id);
    if (!cur) throw Object.assign(new Error('Não encontrado.'), { statusCode: 404 });
    const values = this.clean(entity, data, cur);
    const changed = Object.keys(values).filter((k) => !SKIP_DIFF.includes(k) && JSON.stringify(values[k]) !== JSON.stringify(cur[k]));
    if (!changed.length && action === 'update' && !Object.keys(values).some((k) => JSON.stringify(values[k]) !== JSON.stringify(cur[k]))) return cur;
    const row = this.db.update(table).set({ ...values, updatedAt: now(), ...(action === 'restore' ? { deletedAt: null } : {}) }).where(eq(table.id, id)).returning().get() as any;
    if (changed.length || action === 'restore') this.record(entity, row, action, actor, changed);
    return row;
  }

  /** Nothing is ever destroyed: the row is hidden and can come back from the history. */
  remove(entity: string, id: number, actor: Actor): void {
    const { table } = this.def(entity);
    const cur = this.get(entity, id);
    if (!cur || cur.deletedAt) return;
    const row = this.db.update(table).set({ deletedAt: now() }).where(eq(table.id, id)).returning().get() as any;
    this.record(entity, row, 'delete', actor);
  }

  restore(revisionId: number, actor: Actor): any {
    const rev = this.db.select().from(schema.revisions).where(eq(schema.revisions.id, revisionId)).get();
    if (!rev) throw Object.assign(new Error('Versão não encontrada.'), { statusCode: 404 });
    const def = this.def(rev.entity);
    const data: any = {};
    for (const f of def.fields) if (!(def.secret ?? []).includes(f) && rev.snapshot[f] !== undefined) data[f] = rev.snapshot[f];
    return this.update(rev.entity, rev.entityId, data, actor, 'restore');
  }

  setting<T>(key: string, dflt: T): T {
    const row = this.db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
    return row ? (row.value as T) : dflt;
  }

  setSetting(key: string, value: unknown): void {
    this.db.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } }).run();
  }

  corp(): { name: string; tagline: string; mission: string } {
    return this.setting('corp', { name: 'Meu time', tagline: '', mission: '' });
  }

  state(): TeamState {
    return {
      corp: this.corp(),
      tools: this.list('tools'), mcps: this.list('mcps'), groups: this.list('groups'), projects: this.list('projects'),
      rules: this.list('rules').sort((a, b) => a.position - b.position), agents: this.list('agents'), routines: this.list('routines'),
    } as TeamState;
  }
}

export const DIFF_SKIP = SKIP_DIFF;
