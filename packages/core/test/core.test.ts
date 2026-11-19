import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze, cronToSchedule, describeCron, diffLines, diffSnapshots, extractGuardrails, guardrailsMarkdown, isValidCron, nextRun, parseFrontmatter, scheduleToCron, writeFrontmatter, type TeamState } from '../src/index.ts';

test('cron: validation, next run and friendly text', () => {
  assert.ok(isValidCron('30 8 * * 1-5'));
  assert.ok(!isValidCron('61 8 * * *'));
  assert.ok(!isValidCron('8 * *'));
  const next = nextRun('30 8 * * 1-5', new Date(2026, 0, 2, 9, 0))!; // Friday 09:00 -> Monday 08:30
  assert.equal(next.getDay(), 1);
  assert.equal(`${next.getHours()}:${next.getMinutes()}`, '8:30');
  assert.equal(describeCron('30 8 * * 1-5'), 'Dias úteis às 08:30');
  assert.equal(describeCron('0 */2 * * *'), 'A cada 2 horas');
  for (const expr of ['30 8 * * 1-5', '0 17 * * 5', '*/15 * * * *', '5 * * * *', '0 9 1 * *', '0 6 * * *']) assert.equal(scheduleToCron(cronToSchedule(expr)), expr);
});

test('diff: lines and snapshots', () => {
  assert.deepEqual(diffLines('a\nb', 'a\nc').map((l) => l.op).join(''), ' -+');
  const ch = diffSnapshots({ name: 'x', tools: ['Read'] }, { name: 'x', tools: ['Read', 'Bash'] });
  assert.equal(ch.length, 1);
  assert.equal(ch[0].field, 'tools');
});

test('front matter and guardrails round-trip', () => {
  const g = { can: ['Ler'], approval: ['Reiniciar'], never: ['Apagar dados'] };
  const md = writeFrontmatter({ name: 'vega', description: 'Use: para alertas', tools: 'Read, Grep' }, `Você é Vega.\n\n${guardrailsMarkdown(g)}`);
  const { meta, body } = parseFrontmatter(md);
  assert.equal(meta.description, 'Use: para alertas');
  const back = extractGuardrails(body.trim());
  assert.deepEqual(back.guardrails, g);
  assert.equal(back.rest, 'Você é Vega.');
});

test('analyzer finds the contradictions and nothing else', () => {
  const tool = (id: number, key: string, risk: any, capabilities: any[]) => ({ id, key, label: key, description: '', risk, category: '', capabilities, source: 'builtin' as const, mcpId: null });
  const agent = (id: number, over: any) => ({ id, name: `A${id}`, slug: `a${id}`, emoji: '', title: 't', description: 'd', status: 'active' as const, groupId: 1, projectIds: [1], engine: 'mock', model: 'm', draft: '', prompt: 'p', guardrails: { can: [], approval: ['x'], never: [] }, tools: ['Read'], extras: {}, why: {}, ...over });
  const state: TeamState = {
    corp: { name: 'T', tagline: '' }, mcps: [], groups: [{ id: 1, name: 'G', description: '', color: '', emoji: '' }], projects: [{ id: 1, name: 'P', slug: 'p', description: '', engine: 'mock', active: true }],
    tools: [tool(1, 'Read', 'low', ['read']), tool(2, 'Bash', 'high', ['exec'])],
    rules: [{ id: 1, title: 'R', body: '- Nunca enviar mensagens sem aprovação.', category: '', projectId: null, position: 1, active: true }],
    agents: [agent(1, {}), agent(2, { tools: ['Read', 'Bash'], guardrails: { can: ['Enviar mensagens ao cliente'], approval: [], never: ['Executar comandos'] } })],
    routines: [{ id: 1, name: 'Rot', agentId: 1, projectId: 1, prompt: 'Leia e resuma.', cron: '0 9 * * *', enabled: true, requiredTools: ['Bash'], source: 'manual', report: null }],
  };
  const types = analyze(state).map((c) => c.type).sort();
  assert.deepEqual(types, ['guardrail-tool', 'routine-tool', 'rule-agent']);
  assert.equal(analyze({ ...state, agents: [state.agents[0]], routines: [] }).length, 0);
});
