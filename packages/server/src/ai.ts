/** AI assists: fill an agent profile from a draft, suggest/review a prompt, audit conflicts. Uses the local engine. */
import { capabilitiesIn, type Agent, type Capability } from '@teamops/core';
import { DEFAULT_AI, extractJson, runEngine, type EngineResult } from './engine.ts';
import { schema } from './db/index.ts';
import { now, type Store } from './store.ts';

export interface ProfileSuggestion {
  fields: Partial<Pick<Agent, 'name' | 'emoji' | 'title' | 'description' | 'groupId' | 'engine' | 'model' | 'tools' | 'guardrails' | 'prompt'>>;
  why: Record<string, string>;
  /** false = the engine did not answer and a rule-based draft was used instead. */
  byAi: boolean;
  note: string;
}

function log(store: Store, title: string, agentId: number | null, res: EngineResult): void {
  store.db.insert(schema.runs).values({
    kind: 'assist', agentId, title, trigger: 'manual', status: res.timedOut ? 'timeout' : res.ok ? 'ok' : 'failed', scheduledFor: now(), startedAt: now(), finishedAt: now(), durationMs: res.durationMs,
    engine: DEFAULT_AI.engine, model: res.model, log: res.log.slice(0, 2000), tokensIn: res.tokensIn, tokensOut: res.tokensOut, costUsd: res.costUsd == null ? null : String(res.costUsd), createdAt: now(),
  }).run();
}

async function ask(store: Store, title: string, prompt: string, agentId: number | null = null): Promise<EngineResult> {
  const res = await runEngine({ engine: DEFAULT_AI.engine, model: DEFAULT_AI.model, prompt, timeoutMs: 150_000 });
  log(store, title, agentId, res);
  return res;
}

const NEED: Record<Capability, string[]> = { read: ['Read', 'Glob', 'Grep'], write: ['Edit', 'Write'], exec: ['Bash'], web: ['WebSearch', 'WebFetch'], delete: [], send: [], delegate: ['Agent'] };

/** Rule-based fallback so the screen always answers, even with no engine available. */
function fallbackProfile(store: Store, draft: string, name: string): ProfileSuggestion {
  const caps = capabilitiesIn(draft);
  const keys = new Set(['Read', 'Glob', 'Grep', ...caps.flatMap((c) => NEED[c])]);
  const tools = store.list('tools').filter((t) => keys.has(t.key)).map((t) => t.key as string);
  const first = draft.split(/[.\n]/)[0].trim();
  const risky = caps.includes('exec') || caps.includes('write');
  return {
    byAi: false, note: 'O motor de IA não respondeu. Preenchi com regras simples; revise antes de salvar.',
    fields: {
      name: name || 'Novo agente', title: first.slice(0, 80), description: `Use quando precisar de: ${first.toLowerCase().slice(0, 140)}.`, engine: 'claude-code', model: risky ? 'sonnet' : 'haiku', tools,
      guardrails: { can: ['Ler arquivos e consultar o que for preciso para a tarefa'], approval: risky ? ['Alterar arquivos ou rodar comandos que mudem algo'] : [], never: ['Apagar dados', 'Expor senhas ou tokens'] },
      prompt: `Você é ${name || 'um agente'} do time.\n\n## Papel\n${draft.trim()}\n\n## Como responder\n- Conclusão primeiro, em poucas linhas.\n- Diga o que fez e como conferir.\n- Na dúvida, pergunte antes de agir.`,
    },
    why: { tools: 'Escolhidas pelas ações citadas no rascunho.', model: risky ? 'Tarefas que alteram coisas pedem um modelo mais cuidadoso.' : 'Tarefa de leitura: um modelo leve basta.', guardrails: 'Limites padrão de segurança.' },
  };
}

export async function generateProfile(store: Store, draft: string, name: string): Promise<ProfileSuggestion> {
  const tools = store.list('tools'), groups = store.list('groups');
  const prompt = `Você monta o perfil de um agente de IA para um time. Escreva em português do Brasil, com frases curtas.

Rascunho do gestor${name ? ` (nome sugerido: ${name})` : ''}:
<<<
${draft.slice(0, 6000)}
>>>

Grupos existentes (id: nome): ${groups.map((g) => `${g.id}: ${g.name}`).join('; ') || 'nenhum'}
Ferramentas do catálogo (chave | nome | risco):
${tools.map((t) => `${t.key} | ${t.label} | ${t.risk}`).join('\n')}
Motores: claude-code (modelos: opus, sonnet, haiku). Use opus só para decisão difícil; haiku para leitura simples.

Regras:
- Dê só as ferramentas necessárias (menor privilégio). Use apenas chaves do catálogo.
- Guardrails: frases curtas e verificáveis, 2 a 5 por coluna.
- "prompt": Markdown com papel, escopo, como trabalhar e formato de resposta. Não repita os guardrails.
- "why": uma frase curta por campo explicando a escolha, para um gestor leigo.

Responda SOMENTE com um JSON neste formato:
{"name":"","emoji":"","title":"função em até 8 palavras","description":"quando usar este agente, 1 frase","groupId":null,"engine":"claude-code","model":"sonnet","tools":[],"guardrails":{"can":[],"approval":[],"never":[]},"prompt":"","why":{"name":"","title":"","description":"","groupId":"","model":"","tools":"","guardrails":"","prompt":""}}`;
  const res = await ask(store, 'Gerar perfil', prompt);
  const j = res.ok ? extractJson<any>(res.text) : null;
  if (!j || typeof j !== 'object') return fallbackProfile(store, draft, name);
  const known = new Set(tools.map((t) => t.key));
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 12) : []);
  const { why = {}, ...f } = j;
  return {
    byAi: true, note: '',
    fields: {
      name: String(f.name || name || '').slice(0, 60), emoji: String(f.emoji || '🤖').slice(0, 4), title: String(f.title ?? '').slice(0, 120), description: String(f.description ?? '').slice(0, 400),
      groupId: groups.some((g) => g.id === Number(f.groupId)) ? Number(f.groupId) : null, engine: 'claude-code', model: ['opus', 'sonnet', 'haiku'].includes(f.model) ? f.model : 'sonnet',
      tools: arr(f.tools).filter((k) => known.has(k)), guardrails: { can: arr(f.guardrails?.can), approval: arr(f.guardrails?.approval), never: arr(f.guardrails?.never) }, prompt: String(f.prompt ?? ''),
    },
    why: Object.fromEntries(Object.entries(why).filter(([, v]) => typeof v === 'string' && v).map(([k, v]) => [k, String(v).slice(0, 240)])),
  };
}

export async function suggestPrompt(store: Store, agent: Partial<Agent>, hint: string): Promise<{ ok: boolean; text: string }> {
  const res = await ask(store, 'Sugerir prompt', `Você é especialista em prompts para agentes de IA. Escreva em português do Brasil o prompt de sistema deste agente.
Nome: ${agent.name ?? ''}
Função: ${agent.title ?? ''}
Quando usar: ${agent.description ?? ''}
Pedido do gestor: ${hint || '(nenhum; deduza do rascunho)'}
Rascunho atual (pode estar vazio):
<<<
${(agent.prompt || agent.draft || '').slice(0, 8000)}
>>>
Regras: objetivo; seções Papel, Escopo, Como trabalhar, Formato de resposta, Quando parar e pedir ajuda. Não inclua guardrails (eles são cadastrados à parte).
Responda SOMENTE com o texto final em Markdown.`, agent.id ?? null);
  return { ok: res.ok && !!res.text.trim(), text: res.ok ? res.text.trim().replace(/^```(?:markdown)?\n?|\n?```$/g, '') : 'O motor de IA não respondeu. Tente de novo em instantes.' };
}

export async function reviewPrompt(store: Store, agent: Partial<Agent>): Promise<{ ok: boolean; issues: string[]; improved: string }> {
  const res = await ask(store, 'Revisar prompt', `Você revisa prompts de agentes de IA. Em português do Brasil, revise o prompt abaixo.
Agente: ${agent.name ?? ''} · ${agent.title ?? ''}
Guardrails cadastrados: pode=${JSON.stringify(agent.guardrails?.can ?? [])} aprovação=${JSON.stringify(agent.guardrails?.approval ?? [])} nunca=${JSON.stringify(agent.guardrails?.never ?? [])}
Aponte ambiguidades, contradições (inclusive com os guardrails), instruções que dependem de contexto ausente e excesso de tamanho.
Responda SOMENTE com JSON: {"issues":["problema em 1 frase curta", "... no máximo 6"],"improved":"versão melhorada completa em Markdown"}
Prompt:
<<<
${(agent.prompt ?? '').slice(0, 10000)}
>>>`, agent.id ?? null);
  const j = res.ok ? extractJson<{ issues?: string[]; improved?: string }>(res.text) : null;
  if (!j) return { ok: false, issues: ['O motor de IA não respondeu. Tente de novo em instantes.'], improved: '' };
  return { ok: true, issues: (j.issues ?? []).map(String).slice(0, 8), improved: String(j.improved ?? '') };
}

export async function auditConflicts(store: Store): Promise<{ ok: boolean; findings: { title: string; detail: string; severity: string }[] }> {
  const s = store.state();
  const parts = [
    ...s.rules.filter((r) => r.active).map((r) => `### REGRA: ${r.title}\n${r.body.slice(0, 1500)}`),
    ...s.agents.filter((a) => a.status !== 'draft').map((a) => `### AGENTE ${a.name}\nPode: ${a.guardrails.can.join('; ')}\nCom aprovação: ${a.guardrails.approval.join('; ')}\nNunca: ${a.guardrails.never.join('; ')}\nPrompt:\n${a.prompt.slice(0, 2500)}`),
  ];
  const res = await ask(store, 'Auditoria de conflitos', `Você audita a gestão de um time de agentes de IA. Em português do Brasil, encontre conflitos de SENTIDO entre regras gerais, prompts e guardrails (ex.: uma fonte manda agir sozinho e outra exige aprovação), regras duplicadas e ordens ambíguas. Ignore o que estiver coerente.
Responda SOMENTE com JSON: {"findings":[{"title":"até 12 palavras","detail":"as duas fontes e o que deve prevalecer, 2 frases","severity":"high|medium|low"}]} com no máximo 8 achados.

${parts.join('\n\n').slice(0, 40000)}`);
  const j = res.ok ? extractJson<{ findings?: any[] }>(res.text) : null;
  if (!j) return { ok: false, findings: [] };
  return { ok: true, findings: (j.findings ?? []).slice(0, 8).map((f) => ({ title: String(f.title ?? ''), detail: String(f.detail ?? ''), severity: ['high', 'medium', 'low'].includes(f.severity) ? f.severity : 'medium' })) };
}
