import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import type { TeamState } from '@teamops/core';
import { generateClaudeCode, scanClaudeCode } from '../src/index.ts';

const state: TeamState = {
  corp: { name: 'Acme', tagline: '' }, groups: [{ id: 1, name: 'Ops', description: '', color: '', emoji: '' }], projects: [{ id: 1, name: 'Shop', slug: 'shop', description: 'Demo', engine: 'claude-code', active: true }],
  tools: [{ id: 1, key: 'mcp__desk__list', label: 'List', description: '', risk: 'low', category: '', capabilities: ['read'], source: 'mcp', mcpId: 1 }],
  mcps: [{ id: 1, name: 'desk', label: 'Desk', description: '', transport: 'stdio', command: 'npx', args: ['desk'], url: '', env: { DESK_TOKEN: 'super-secret' }, enabled: true, lastTestAt: null, lastTestOk: null, lastTestMessage: '', discovered: [] }],
  rules: [{ id: 1, title: 'Be brief', body: 'Answer first.', category: 'Style', projectId: null, position: 1, active: true }],
  agents: [{ id: 1, name: 'Vega', slug: 'vega', emoji: '', title: 'SRE', description: 'Use for alerts', status: 'active', groupId: 1, projectIds: [1], engine: 'claude-code', model: 'sonnet', draft: '', prompt: 'You are Vega.', guardrails: { can: ['Read logs'], approval: [], never: ['Delete data'] }, tools: ['Read', 'mcp__desk__list'], extras: {}, why: {} }],
  routines: [],
};

function tree(dir: string): string {
  const h = createHash('sha256');
  const walk = (d: string) => { for (const f of readdirSync(d).sort()) { const p = join(d, f); const st = statSync(p); h.update(`${p}|${st.size}|${st.mtimeMs}`); if (st.isDirectory()) walk(p); else h.update(readFileSync(p)); } };
  walk(dir);
  return h.digest('hex');
}

test('claude-code adapter: files, no secrets, and the importer reads them back without writing', () => {
  const files = generateClaudeCode(state, state.projects[0]);
  assert.deepEqual(files.map((f) => f.path).sort(), ['.claude/agents/vega.md', '.mcp.json', 'CLAUDE.md']);
  assert.ok(!files.some((f) => f.content.includes('super-secret')), 'secret leaked into a generated file');
  assert.match(files.find((f) => f.path === '.mcp.json')!.content, /\$\{DESK_TOKEN\}/);

  const dir = mkdtempSync(join(tmpdir(), 'teamops-'));
  for (const f of files) { mkdirSync(dirname(join(dir, f.path)), { recursive: true }); writeFileSync(join(dir, f.path), f.content); }
  const before = tree(dir);
  const scan = scanClaudeCode(dir);
  assert.equal(tree(dir), before, 'the importer must not touch the source folder');
  assert.equal(scan.agents.length, 1);
  assert.equal(scan.agents[0].slug, 'vega');
  assert.deepEqual(scan.agents[0].tools, ['Read', 'mcp__desk__list']);
  assert.deepEqual(scan.agents[0].guardrails.never, ['Delete data']);
  assert.deepEqual(scan.mcps[0].envKeys, ['DESK_TOKEN']);
  assert.ok(scan.rules.some((r) => r.body.includes('Answer first.')));
});
