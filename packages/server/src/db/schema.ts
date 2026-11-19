/**
 * Portable schema: only text, integer and JSON-as-text columns, ISO-8601
 * timestamps and integer booleans, so the same model maps 1:1 to PostgreSQL later.
 */
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const id = () => integer('id').primaryKey({ autoIncrement: true });
const json = <T>(name: string, dflt: T) => text(name, { mode: 'json' }).$type<T>().notNull().default(dflt as never);
const bool = (name: string, dflt = true) => integer(name, { mode: 'boolean' }).notNull().default(dflt);
const stamps = {
  createdAt: text('created_at').notNull().default(''),
  updatedAt: text('updated_at').notNull().default(''),
  deletedAt: text('deleted_at'),
};

export const settings = sqliteTable('settings', { key: text('key').primaryKey(), value: text('value', { mode: 'json' }).$type<unknown>() });

export const users = sqliteTable('users', {
  id: id(), username: text('username').notNull(), name: text('name').notNull().default(''), email: text('email').notNull().default(''),
  passwordHash: text('password_hash').notNull().default(''), active: bool('active'), ...stamps,
});

export const sessions = sqliteTable('sessions', { token: text('token').primaryKey(), userId: integer('user_id').notNull(), expiresAt: text('expires_at').notNull() });

export const projects = sqliteTable('projects', {
  id: id(), name: text('name').notNull(), slug: text('slug').notNull(), description: text('description').notNull().default(''),
  engine: text('engine').notNull().default('claude-code'), active: bool('active'), ...stamps,
});

export const rules = sqliteTable('rules', {
  id: id(), title: text('title').notNull(), body: text('body').notNull().default(''), category: text('category').notNull().default('Regras gerais'),
  projectId: integer('project_id'), position: integer('position').notNull().default(0), active: bool('active'), ...stamps,
});

export const mcps = sqliteTable('mcps', {
  id: id(), name: text('name').notNull(), label: text('label').notNull().default(''), description: text('description').notNull().default(''),
  transport: text('transport').$type<'stdio' | 'http' | 'sse'>().notNull().default('stdio'), command: text('command').notNull().default(''),
  args: json<string[]>('args', []), url: text('url').notNull().default(''), env: json<Record<string, string>>('env', {}), enabled: bool('enabled'),
  lastTestAt: text('last_test_at'), lastTestOk: integer('last_test_ok', { mode: 'boolean' }), lastTestMessage: text('last_test_message').notNull().default(''),
  discovered: json<{ name: string; description: string }[]>('discovered', []), ...stamps,
});

export const tools = sqliteTable('tools', {
  id: id(), key: text('key').notNull(), label: text('label').notNull().default(''), description: text('description').notNull().default(''),
  risk: text('risk').$type<'low' | 'medium' | 'high' | 'critical'>().notNull().default('medium'), category: text('category').notNull().default('Geral'),
  capabilities: json<string[]>('capabilities', []), source: text('source').$type<'builtin' | 'mcp' | 'custom'>().notNull().default('custom'),
  mcpId: integer('mcp_id'), ...stamps,
});

export const groups = sqliteTable('groups', {
  id: id(), name: text('name').notNull(), description: text('description').notNull().default(''), color: text('color').notNull().default('#b6ff3b'),
  emoji: text('emoji').notNull().default('🧩'), ...stamps,
});

export const agents = sqliteTable('agents', {
  id: id(), name: text('name').notNull(), slug: text('slug').notNull(), emoji: text('emoji').notNull().default('🤖'), title: text('title').notNull().default(''),
  description: text('description').notNull().default(''), status: text('status').$type<'draft' | 'active' | 'paused'>().notNull().default('draft'),
  groupId: integer('group_id'), projectIds: json<number[]>('project_ids', []), engine: text('engine').notNull().default('claude-code'),
  model: text('model').notNull().default('sonnet'), draft: text('draft').notNull().default(''), prompt: text('prompt').notNull().default(''),
  guardrails: json<{ can: string[]; approval: string[]; never: string[] }>('guardrails', { can: [], approval: [], never: [] }),
  tools: json<string[]>('tools', []), extras: json<Record<string, string>>('extras', {}), why: json<Record<string, string>>('why', {}),
  weeklyCapacity: integer('weekly_capacity').notNull().default(40), ...stamps,
});

export const routines = sqliteTable('routines', {
  id: id(), name: text('name').notNull(), agentId: integer('agent_id'), projectId: integer('project_id'), prompt: text('prompt').notNull().default(''),
  cron: text('cron').notNull().default('0 9 * * 1-5'), enabled: bool('enabled', false), requiredTools: json<string[]>('required_tools', []),
  source: text('source').notNull().default('manual'), report: text('report', { mode: 'json' }).$type<{ kind: string; days: number } | null>(),
  nextRunAt: text('next_run_at'), lastRunAt: text('last_run_at'), lastStatus: text('last_status'), ...stamps,
});

/** One row per piece of work an agent did: a routine run, a diagnosis, an AI assist. */
export const runs = sqliteTable('runs', {
  id: id(), kind: text('kind').$type<'routine' | 'problem' | 'assist'>().notNull().default('routine'), routineId: integer('routine_id'),
  agentId: integer('agent_id'), projectId: integer('project_id'), title: text('title').notNull().default(''),
  trigger: text('trigger').$type<'schedule' | 'manual'>().notNull().default('schedule'),
  status: text('status').$type<'queued' | 'running' | 'ok' | 'failed' | 'timeout'>().notNull().default('queued'),
  scheduledFor: text('scheduled_for'), startedAt: text('started_at'), finishedAt: text('finished_at'), durationMs: integer('duration_ms'),
  engine: text('engine').notNull().default(''), model: text('model').notNull().default(''), output: text('output').notNull().default(''), log: text('log').notNull().default(''),
  tokensIn: integer('tokens_in'), tokensOut: integer('tokens_out'), costUsd: text('cost_usd'), ref: text('ref'), createdAt: text('created_at').notNull().default(''),
}, (t) => [index('runs_created').on(t.createdAt), index('runs_routine').on(t.routineId), index('runs_ref').on(t.ref)]);

/** Version history of every entity: full snapshot per change, so diff and restore are trivial. */
export const revisions = sqliteTable('revisions', {
  id: id(), entity: text('entity').notNull(), entityId: integer('entity_id').notNull(), version: integer('version').notNull(),
  action: text('action').$type<'create' | 'update' | 'delete' | 'restore' | 'import'>().notNull(), label: text('label').notNull().default(''),
  snapshot: text('snapshot', { mode: 'json' }).$type<Record<string, unknown>>().notNull(), changed: json<string[]>('changed', []),
  userId: integer('user_id'), userName: text('user_name').notNull().default(''), createdAt: text('created_at').notNull(),
}, (t) => [index('rev_entity').on(t.entity, t.entityId), index('rev_created').on(t.createdAt)]);

export const conflictMarks = sqliteTable('conflict_marks', {
  fingerprint: text('fingerprint').primaryKey(), status: text('status').$type<'accepted' | 'resolved'>().notNull(), note: text('note').notNull().default(''),
  title: text('title').notNull().default(''), type: text('type').notNull().default(''), userName: text('user_name').notNull().default(''), createdAt: text('created_at').notNull(),
});

/** Monitoring connections (Zabbix). The token may be a literal or a `file:/path#json.path` reference; it never leaves the server. */
export const monitors = sqliteTable('monitors', {
  id: id(), name: text('name').notNull(), kind: text('kind').notNull().default('zabbix'), url: text('url').notNull().default(''), token: text('token').notNull().default(''),
  enabled: bool('enabled'), useForCapacity: bool('use_for_capacity'), hosts: json<string[]>('hosts', []), usageHost: text('usage_host').notNull().default(''), usageKeys: json<Record<string, string>>('usage_keys', {}), ...stamps,
});
