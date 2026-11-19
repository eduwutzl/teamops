import { CAP_LABEL, capabilitiesIn } from './catalog.ts';
import { isValidCron } from './cron.ts';
import type { Agent, Capability, Severity, TeamState, Tool } from './types.ts';

export interface ConflictRef { type: 'agent' | 'group' | 'rule' | 'tool' | 'mcp' | 'project' | 'routine'; id: number; name: string }

export interface Conflict {
  /** Stable fingerprint: survives reloads, so it can be marked as resolved. */
  id: string;
  type: string;
  typeLabel: string;
  severity: Severity;
  title: string;
  detail: string;
  fix: string;
  refs: ConflictRef[];
}

export const CONFLICT_TYPES: Record<string, string> = {
  'guardrail-tool': 'Guardrail x ferramenta',
  'guardrail-self': 'Guardrail contraditório',
  'rule-agent': 'Regra geral x agente',
  'risk-unguarded': 'Risco sem guardrail',
  'tool-unknown': 'Ferramenta desconhecida',
  'mcp-down': 'Braço indisponível',
  'agent-incomplete': 'Agente incompleto',
  'agent-duplicate': 'Nome repetido',
  'structure': 'Estrutura',
  'routine-agent': 'Rotina x agente',
  'routine-tool': 'Rotina sem ferramenta',
  'routine-guardrail': 'Rotina x guardrail',
  'routine-schedule': 'Agenda inválida',
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function agentCaps(agent: Agent, byKey: Map<string, Tool>): Map<Capability, Tool[]> {
  const out = new Map<Capability, Tool[]>();
  for (const key of agent.tools) {
    const t = byKey.get(key);
    if (!t) continue;
    for (const c of t.capabilities) out.set(c, [...(out.get(c) ?? []), t]);
  }
  return out;
}

const NEVER_LINE = /^\s*[-*]?\s*(nunca|jamais|proibido|é proibido|não pode|nao pode|never|do not|don't)\b/i;

/** Deterministic checks. No AI involved: same input, same answer. */
export function analyze(state: TeamState): Conflict[] {
  const out: Conflict[] = [];
  const byKey = new Map(state.tools.map((t) => [t.key, t]));
  const mcpById = new Map(state.mcps.map((m) => [m.id, m]));
  const agentById = new Map(state.agents.map((a) => [a.id, a]));
  const add = (c: Omit<Conflict, 'id' | 'typeLabel'>, key: string) =>
    out.push({ ...c, id: `${c.type}-${hash(key)}`, typeLabel: CONFLICT_TYPES[c.type] ?? c.type });

  const generalNever = state.rules
    .filter((r) => r.active)
    .flatMap((r) => r.body.split('\n').filter((l) => NEVER_LINE.test(l)).map((line) => ({ rule: r, line: line.replace(/^\s*[-*]\s*/, '').trim() })));

  const names = new Map<string, Agent[]>();
  for (const a of state.agents) names.set(norm(a.name), [...(names.get(norm(a.name)) ?? []), a]);
  for (const [, list] of names) {
    if (list.length > 1) add({ type: 'agent-duplicate', severity: 'medium', title: `Dois agentes chamados "${list[0].name}"`, detail: 'Nomes iguais confundem quem delega e quem lê o histórico.', fix: 'Renomeie um deles.', refs: list.map((a) => ({ type: 'agent', id: a.id, name: a.name })) }, list.map((a) => a.id).join(','));
  }

  for (const a of state.agents) {
    const ref: ConflictRef = { type: 'agent', id: a.id, name: a.name };
    const caps = agentCaps(a, byKey);

    // 1. "never" guardrail vs a tool that allows exactly that
    for (const line of a.guardrails.never) {
      for (const cap of capabilitiesIn(line)) {
        const tools = caps.get(cap);
        if (!tools?.length) continue;
        add({
          type: 'guardrail-tool', severity: 'high',
          title: `${a.name} nunca deve ${CAP_LABEL[cap]}, mas tem ferramenta para isso`,
          detail: `Guardrail "${line}" x ferramenta ${tools.map((t) => t.label).join(', ')}.`,
          fix: 'Tire a ferramenta do agente ou reescreva o guardrail.',
          refs: [ref, ...tools.map((t) => ({ type: 'tool' as const, id: t.id, name: t.label }))],
        }, `${a.id}|${cap}|${norm(line)}`);
      }
    }

    // 2. same sentence in two guardrail columns
    const seen = new Map<string, string>();
    for (const [col, label] of [['can', 'Pode'], ['approval', 'Com aprovação'], ['never', 'Nunca']] as const) {
      for (const line of a.guardrails[col]) {
        const k = norm(line);
        if (!k) continue;
        const prev = seen.get(k);
        if (prev && prev !== label) add({ type: 'guardrail-self', severity: 'high', title: `${a.name}: a mesma frase em "${prev}" e "${label}"`, detail: `"${line}"`, fix: 'Deixe a frase em uma coluna só.', refs: [ref] }, `${a.id}|${k}`);
        seen.set(k, label);
      }
    }

    // 3. general rule says never, agent says it can
    for (const { rule, line } of generalNever) {
      if (rule.projectId && !a.projectIds.includes(rule.projectId)) continue;
      const ruleCaps = capabilitiesIn(line);
      for (const can of a.guardrails.can) {
        const hit = capabilitiesIn(can).filter((c) => ruleCaps.includes(c) && c !== 'read');
        if (!hit.length) continue;
        add({
          type: 'rule-agent', severity: 'high',
          title: `Regra geral proíbe, ${a.name} permite`,
          detail: `Regra "${rule.title}": "${line}" x guardrail Pode: "${can}".`,
          fix: 'A regra geral vale para todos. Mova o item do agente para "Com aprovação" ou "Nunca".',
          refs: [{ type: 'rule', id: rule.id, name: rule.title }, ref],
        }, `${a.id}|${rule.id}|${norm(line)}|${norm(can)}`);
      }
    }

    // 4. risky tools with no limits written down
    const risky = a.tools.map((k) => byKey.get(k)).filter((t): t is Tool => !!t && (t.risk === 'high' || t.risk === 'critical'));
    if (risky.length && a.status !== 'draft' && a.guardrails.approval.length + a.guardrails.never.length === 0) {
      add({ type: 'risk-unguarded', severity: 'medium', title: `${a.name} tem ferramenta de risco alto e nenhum limite`, detail: `Ferramentas: ${risky.map((t) => t.label).join(', ')}.`, fix: 'Escreva ao menos um item em "Com aprovação" ou "Nunca".', refs: [ref, ...risky.map((t) => ({ type: 'tool' as const, id: t.id, name: t.label }))] }, `${a.id}|unguarded`);
    }

    // 5. tools outside the catalog, or coming from an arm that is off or failing
    const unknown = a.tools.filter((k) => !byKey.has(k));
    if (unknown.length) add({ type: 'tool-unknown', severity: 'low', title: `${a.name} usa ferramenta fora do catálogo`, detail: unknown.join(', '), fix: 'Cadastre a ferramenta no catálogo ou remova do agente.', refs: [ref] }, `${a.id}|${unknown.join(',')}`);
    const downs = new Map<number, string>();
    for (const k of a.tools) {
      const t = byKey.get(k);
      const m = t?.mcpId ? mcpById.get(t.mcpId) : undefined;
      if (m && (!m.enabled || m.lastTestOk === false)) downs.set(m.id, m.label || m.name);
    }
    for (const [id, name] of downs) add({ type: 'mcp-down', severity: 'medium', title: `${a.name} depende do braço "${name}", que está fora`, detail: 'O braço está desligado ou falhou no último teste.', fix: 'Teste o braço de novo ou tire as ferramentas dele do agente.', refs: [ref, { type: 'mcp', id, name }] }, `${a.id}|mcp|${id}`);

    // 6. active agent missing the basics
    if (a.status === 'active') {
      const missing = [!a.prompt.trim() && 'prompt', !a.description.trim() && 'descrição', !a.groupId && 'grupo', !a.tools.length && 'ferramentas'].filter(Boolean);
      if (missing.length) add({ type: 'agent-incomplete', severity: a.prompt.trim() ? 'low' : 'medium', title: `${a.name} está ativo sem ${missing.join(', ')}`, detail: 'Agente ativo com cadastro pela metade responde de forma imprevisível.', fix: 'Complete o cadastro ou volte o agente para rascunho.', refs: [ref] }, `${a.id}|${missing.join(',')}`);
    }
  }

  for (const g of state.groups) {
    if (!state.agents.some((a) => a.groupId === g.id)) add({ type: 'structure', severity: 'low', title: `Grupo "${g.name}" não tem agentes`, detail: 'Grupo vazio não aparece nos arquivos gerados.', fix: 'Amarre um agente ao grupo ou remova o grupo.', refs: [{ type: 'group', id: g.id, name: g.name }] }, `group|${g.id}`);
  }
  for (const p of state.projects) {
    if (p.active && !state.agents.some((a) => a.projectIds.includes(p.id))) add({ type: 'structure', severity: 'low', title: `Projeto "${p.name}" não tem agentes`, detail: 'Nada será gerado para este projeto.', fix: 'Marque o projeto em pelo menos um agente.', refs: [{ type: 'project', id: p.id, name: p.name }] }, `project|${p.id}`);
  }

  for (const r of state.routines) {
    const ref: ConflictRef = { type: 'routine', id: r.id, name: r.name };
    if (!isValidCron(r.cron)) add({ type: 'routine-schedule', severity: 'medium', title: `Rotina "${r.name}" tem agenda inválida`, detail: `Expressão: ${r.cron || '(vazia)'}`, fix: 'Corrija a agenda no editor.', refs: [ref] }, `${r.id}|cron|${r.cron}`);
    if (!r.enabled) continue;
    const a = r.agentId ? agentById.get(r.agentId) : undefined;
    if (!a) { add({ type: 'routine-agent', severity: 'high', title: `Rotina "${r.name}" não tem agente`, detail: 'Sem agente responsável a rotina não roda.', fix: 'Escolha um agente ou pause a rotina.', refs: [ref] }, `${r.id}|noagent`); continue; }
    const aref: ConflictRef = { type: 'agent', id: a.id, name: a.name };
    if (a.status !== 'active') add({ type: 'routine-agent', severity: 'high', title: `Rotina "${r.name}" usa um agente que não está ativo`, detail: `${a.name} está ${a.status === 'draft' ? 'em rascunho' : 'pausado'}.`, fix: 'Ative o agente ou pause a rotina.', refs: [ref, aref] }, `${r.id}|status|${a.status}`);
    if (r.projectId && !a.projectIds.includes(r.projectId)) add({ type: 'routine-agent', severity: 'medium', title: `Rotina "${r.name}" roda num projeto em que ${a.name} não está`, detail: 'O agente não faz parte do projeto da rotina.', fix: 'Marque o projeto no agente ou troque o projeto da rotina.', refs: [ref, aref] }, `${r.id}|project`);
    const missing = r.requiredTools.filter((k) => !a.tools.includes(k));
    if (missing.length) add({ type: 'routine-tool', severity: 'high', title: `Rotina "${r.name}" precisa de ferramenta que ${a.name} não tem`, detail: `Falta: ${missing.map((k) => byKey.get(k)?.label ?? k).join(', ')}.`, fix: 'Dê a ferramenta ao agente ou troque o agente da rotina.', refs: [ref, aref] }, `${r.id}|tools|${missing.join(',')}`);
    const wants = capabilitiesIn(r.prompt);
    for (const line of a.guardrails.never) {
      const hit = capabilitiesIn(line).filter((c) => wants.includes(c) && c !== 'read');
      if (hit.length) add({ type: 'routine-guardrail', severity: 'high', title: `Rotina "${r.name}" pede algo que ${a.name} nunca deve fazer`, detail: `A instrução fala em ${hit.map((c) => CAP_LABEL[c]).join(', ')}; guardrail Nunca: "${line}".`, fix: 'Reescreva a instrução da rotina ou escolha outro agente.', refs: [ref, aref] }, `${r.id}|never|${norm(line)}`);
    }
  }

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((x, y) => rank[x.severity] - rank[y.severity] || x.title.localeCompare(y.title));
}
