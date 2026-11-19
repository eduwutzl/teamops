/** Demo data: a fictional company. Nothing here refers to a real team. */
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { BUILTIN_TOOLS, nextRun } from '@teamops/core';
import { hashPassword } from './app.ts';
import { APP_ROOT, schema } from './db/index.ts';
import type { Store } from './store.ts';

/** Deterministic PRNG so the demo looks the same on every install. */
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }

export function seedDemo(store: Store): void {
  const db = store.db;
  const sys = { id: null, name: 'sistema' };
  const rand = rng(42);
  const ago = (days: number, h = 10, m = 0) => { const d = new Date(Date.now() - days * 86400_000); d.setHours(h, m, 0, 0); return d.toISOString(); };

  store.setSetting('corp', { name: 'Aurora Labs', tagline: 'Empresa fictícia de software, tocada por um time de agentes', mission: 'Atender bem, entregar com segurança e manter tudo documentado.' });

  const demo = store.create('users', { username: 'demo', name: 'Dana Demo', email: 'demo@example.com', active: true }, sys);
  db.update(schema.users).set({ passwordHash: hashPassword('demo') }).where(eq(schema.users.id, demo.id)).run();
  store.create('users', { username: 'rafa', name: 'Rafa Lima', email: 'rafa@example.com', active: true }, sys);
  const me = { id: demo.id, name: 'Dana Demo' };

  for (const t of BUILTIN_TOOLS) store.create('tools', { ...t, source: 'builtin' }, sys);

  const helpdesk = store.create('mcps', { name: 'helpdesk', label: 'Central de chamados', description: 'Lê e responde chamados dos clientes. Braço de demonstração, com dados falsos.', transport: 'stdio', command: 'npx', args: ['tsx', resolve(APP_ROOT, 'examples/demo-mcp.ts')], env: {}, enabled: true }, me);
  const crm = store.create('mcps', { name: 'crm', label: 'CRM de vendas', description: 'Consulta clientes e oportunidades. Exemplo de braço fora do ar.', transport: 'http', url: 'http://127.0.0.1:9/mcp', env: { CRM_TOKEN: '' }, enabled: true }, me);
  db.update(schema.mcps).set({ lastTestAt: ago(0, 8), lastTestOk: false, lastTestMessage: 'Ninguém respondeu nesse endereço.' }).where(eq(schema.mcps.id, crm.id)).run();
  const mt = (mcp: any, name: string, label: string, description: string, risk: string, capabilities: string[]) => store.create('tools', { key: `mcp__${mcp.name}__${name}`, label, description, risk, capabilities, category: mcp.label, source: 'mcp', mcpId: mcp.id }, me);
  mt(helpdesk, 'list_tickets', 'Listar chamados', 'Lista os chamados, por situação.', 'low', ['read']);
  mt(helpdesk, 'get_ticket', 'Ler chamado', 'Abre um chamado pelo número.', 'low', ['read']);
  mt(helpdesk, 'send_reply', 'Responder cliente', 'Envia uma resposta ao cliente do chamado.', 'high', ['send']);
  mt(crm, 'search_customers', 'Buscar clientes', 'Procura clientes pelo nome.', 'low', ['read']);

  const g = (name: string, emoji: string, color: string, description: string) => store.create('groups', { name, emoji, color, description }, me);
  const gSup = g('Atendimento', '💬', '#3987e5', 'Fala com clientes e cuida dos chamados.');
  const gEng = g('Engenharia', '🛠️', '#b6ff3b', 'Constrói e revisa o produto.');
  const gOps = g('Operações', '📡', '#d95926', 'Mantém os serviços no ar.');
  const gCon = g('Conteúdo', '✍️', '#d55181', 'Escreve relatórios e comunicados.');
  g('Financeiro', '💰', '#c98500', 'Ainda sem agentes.');

  const pSite = store.create('projects', { name: 'Loja online', description: 'Site e API da loja da Aurora.', engine: 'claude-code', active: true }, me);
  const pApp = store.create('projects', { name: 'App do cliente', description: 'Aplicativo móvel de pedidos.', engine: 'claude-code', active: true }, me);
  store.create('projects', { name: 'Intranet', description: 'Portal interno. Ainda sem agentes.', engine: 'claude-code', active: true }, me);

  const rule = (title: string, body: string, category: string, position: number, projectId: number | null = null) => store.create('rules', { title, body, category, position, projectId, active: true }, me);
  rule('Conclusão primeiro', 'Toda resposta começa pela conclusão, em até 5 linhas.\nDetalhe só se pedirem.', 'Comunicação', 1);
  rule('Uma pergunta por vez', 'Se faltar informação, faça uma pergunta só e espere a resposta.', 'Comunicação', 2);
  rule('Nada sai para clientes sem revisão', '- Nunca enviar mensagens a clientes sem aprovação de uma pessoa.\n- Rascunhe a resposta e peça a revisão.', 'Segurança', 3);
  rule('Nada se apaga', '- Nunca apagar dados ou arquivos. Mova para a lixeira e anote onde ficou.\n- Mudança em produção só com plano de volta.', 'Segurança', 4);
  rule('Segredos ficam fora do texto', 'Proibido colar senhas, tokens ou chaves em respostas, arquivos ou registros.', 'Segurança', 5);
  rule('Padrão de commits', 'Mensagens de commit curtas, no imperativo, citando o número da tarefa.', 'Engenharia', 6, pSite.id);

  const agent = (a: any) => store.create('agents', { engine: 'claude-code', model: 'sonnet', status: 'active', extras: {}, why: {}, weeklyCapacity: 40, ...a }, me);
  const luna = agent({
    name: 'Luna', emoji: '🌙', title: 'Triagem de chamados', description: 'Use para ler, classificar e rascunhar respostas dos chamados de clientes.', groupId: gSup.id, projectIds: [pSite.id, pApp.id], model: 'haiku', engine: 'mock', weeklyCapacity: 30,
    tools: ['Read', 'Grep', 'mcp__helpdesk__list_tickets', 'mcp__helpdesk__get_ticket', 'mcp__helpdesk__send_reply'],
    guardrails: { can: ['Ler e classificar chamados', 'Enviar respostas a clientes em casos simples'], approval: ['Oferecer reembolso ou desconto'], never: ['Prometer prazo de entrega', 'Compartilhar dados de um cliente com outro'] },
    prompt: 'Você é Luna, da triagem de chamados da Aurora Labs.\n\n## Papel\nLer cada chamado novo, classificar por urgência e rascunhar a resposta.\n\n## Como trabalhar\n- Leia o chamado inteiro antes de responder.\n- Classifique: urgente, normal ou dúvida.\n- Resposta curta, educada e sem jargão.\n\n## Formato\nClassificação, resumo em 1 linha e rascunho da resposta.',
  });
  const atlas = agent({
    name: 'Atlas', emoji: '🧭', title: 'Engenheiro de plataforma', description: 'Use para mudanças de código e infraestrutura da loja.', groupId: gEng.id, projectIds: [pSite.id], model: 'opus',
    tools: ['Read', 'Glob', 'Grep', 'Edit', 'Write', 'Bash', 'WebSearch'],
    guardrails: { can: ['Ler todo o código do projeto', 'Rodar testes'], approval: ['Rodar comandos que mudam o servidor', 'Alterar o esquema do banco'], never: ['Apagar arquivos ou dados', 'Fazer deploy na sexta depois das 16h'] },
    prompt: 'Você é Atlas, engenheiro de plataforma da Aurora Labs.\n\n## Papel\nPlanejar e executar mudanças de código e infraestrutura com segurança.\n\n## Como trabalhar\n- Prove que o problema existe antes de corrigir.\n- Mudança pequena, testada e com plano de volta.\n- Diga o que fez e como conferir.',
  });
  const vega = agent({
    name: 'Vega', emoji: '🛰️', title: 'SRE de plantão', description: 'Use para diagnosticar alertas e problemas dos serviços.', groupId: gOps.id, projectIds: [pSite.id, pApp.id], model: 'sonnet', weeklyCapacity: 60,
    tools: ['Read', 'Grep', 'Glob', 'WebSearch'],
    guardrails: { can: ['Ler métricas, logs e configurações', 'Sugerir a causa provável'], approval: ['Reiniciar um serviço'], never: ['Reconhecer alertas sozinha', 'Alterar configuração em produção'] },
    prompt: 'Você é Vega, SRE de plantão da Aurora Labs.\n\n## Papel\nLer alertas de monitoramento e dar um diagnóstico curto e útil.\n\n## Como trabalhar\n- Parta do dado: valor atual, limite e há quanto tempo.\n- Liste causas da mais provável para a menos.\n- Diga como verificar cada uma.\n\n## Formato\nLeitura, causas prováveis, como verificar e urgência.',
  });
  const iris = agent({
    name: 'Íris', emoji: '🌈', title: 'Redatora de relatórios', description: 'Use para resumos semanais e comunicados internos.', groupId: gCon.id, projectIds: [pSite.id], model: 'haiku', engine: 'mock', weeklyCapacity: 10,
    tools: ['Read', 'Grep'], guardrails: { can: ['Ler relatórios e resumir'], approval: ['Publicar comunicado para toda a empresa'], never: ['Inventar números'] },
    prompt: 'Você é Íris, redatora da Aurora Labs.\n\n## Papel\nTransformar dados em resumos curtos que qualquer pessoa entende.\n\n## Formato\nTrês destaques, um ponto de atenção e o próximo passo.',
  });
  const orion = agent({
    name: 'Orion', emoji: '🔭', title: 'Vigia dos serviços', description: 'Use para checagens recorrentes de saúde dos serviços.', groupId: gOps.id, projectIds: [pSite.id, pApp.id], model: 'haiku', engine: 'mock', weeklyCapacity: 150,
    tools: ['Read', 'Bash'], guardrails: { can: ['Rodar checagens de leitura'], approval: [], never: [] },
    prompt: 'Você é Orion. Rode as checagens de saúde e diga só o que saiu do normal.',
  });
  agent({
    name: 'Sol', emoji: '☀️', title: 'Revisor de código', description: 'Use para revisar mudanças antes do merge.', groupId: gEng.id, projectIds: [pSite.id, pApp.id], status: 'paused', tools: ['Read', 'Glob', 'Grep'],
    guardrails: { can: ['Comentar no código'], approval: [], never: ['Alterar arquivos'] }, prompt: 'Você é Sol, revisor de código. Aponte riscos reais, não gosto pessoal.',
  });
  agent({ name: 'Nico', emoji: '🧪', title: '', description: '', status: 'draft', groupId: null, projectIds: [], tools: [], guardrails: { can: [], approval: [], never: [] }, prompt: '', draft: 'Quero um agente que teste o app do cliente toda noite, rode os testes automáticos e avise quando algo quebrar. Ele pode ler o código e rodar os testes, mas não pode alterar nada.' });

  const routine = (r: any) => {
    const row = store.create('routines', { enabled: true, requiredTools: [], source: 'manual', report: null, ...r }, me);
    if (row.enabled) db.update(schema.routines).set({ nextRunAt: nextRun(row.cron)?.toISOString() ?? null }).where(eq(schema.routines.id, row.id)).run();
    return row;
  };
  const routines = [
    routine({ name: 'Triagem da manhã', agentId: luna.id, projectId: pSite.id, cron: '30 8 * * 1-5', prompt: 'Leia os chamados abertos desde ontem, classifique e rascunhe as respostas.', requiredTools: ['mcp__helpdesk__list_tickets'] }),
    routine({ name: 'Checagem de saúde', agentId: orion.id, projectId: pSite.id, cron: '0 */2 * * *', prompt: 'Rode as checagens de saúde da loja e diga só o que saiu do normal.' }),
    routine({ name: 'Resumo semanal', agentId: iris.id, projectId: pSite.id, cron: '0 17 * * 5', prompt: 'Escreva o resumo da semana do time em linguagem simples.', report: { kind: 'productivity', days: 7 } }),
    routine({ name: 'Pesquisa de concorrentes', agentId: iris.id, projectId: pSite.id, cron: '0 9 * * 1', prompt: 'Pesquise na web as novidades dos concorrentes e resuma em 5 linhas.', requiredTools: ['WebSearch'] }),
    routine({ name: 'Limpeza de arquivos temporários', agentId: atlas.id, projectId: pSite.id, cron: '0 3 * * 0', prompt: 'Apague os arquivos temporários com mais de 30 dias da pasta de uploads.', enabled: true }),
    routine({ name: 'Backup do banco', agentId: orion.id, projectId: pApp.id, cron: '15 2 * * *', prompt: 'Confira se o backup da noite terminou e registre o tamanho. [falhar]', enabled: false }),
  ];

  // two weeks of history so charts and reports have something to show
  const plan: [any, number, number, number][] = [[routines[0], 1, 0.94, 5200], [routines[1], 9, 0.97, 1800], [routines[2], 0.15, 1, 9400], [routines[3], 0.15, 0.6, 12800], [routines[5], 1, 0.72, 3100]];
  for (let d = 13; d >= 0; d--) {
    const weekend = [0, 6].includes(new Date(Date.now() - d * 86400_000).getDay());
    for (const [r, perDay, okRate, ms] of plan) {
      const n = perDay >= 1 ? Math.round(perDay * (weekend && r === routines[0] ? 0 : 1)) : rand() < perDay * (weekend ? 0.3 : 1.6) ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const at = ago(d, 7 + Math.floor((i * 14) / Math.max(1, n)), Math.floor(rand() * 50));
        if (new Date(at) > new Date()) continue;
        const ok = rand() < okRate, dur = Math.round(ms * (0.6 + rand() * 0.9));
        const a = [luna, atlas, vega, iris, orion].find((x) => x.id === r.agentId)!;
        db.insert(schema.runs).values({
          kind: 'routine', routineId: r.id, agentId: r.agentId, projectId: r.projectId, title: r.name, trigger: 'schedule', status: ok ? 'ok' : rand() < 0.25 ? 'timeout' : 'failed', scheduledFor: at,
          startedAt: new Date(new Date(at).getTime() + (rand() < 0.08 ? 400_000 : 2000)).toISOString(), finishedAt: new Date(new Date(at).getTime() + dur).toISOString(), durationMs: dur, engine: 'mock', model: a.model,
          output: ok ? 'Execução de demonstração concluída sem novidades.' : '', log: ok ? 'Histórico de demonstração.' : 'Falha de demonstração: o serviço consultado não respondeu.', tokensIn: Math.round(2000 + rand() * 9000), tokensOut: Math.round(200 + rand() * 1500), costUsd: (0.002 + rand() * 0.02).toFixed(4), createdAt: at,
        }).run();
      }
    }
  }
  for (const r of routines) {
    const last = db.select().from(schema.runs).where(eq(schema.runs.routineId, r.id)).all().at(-1);
    if (last) db.update(schema.routines).set({ lastRunAt: last.finishedAt, lastStatus: last.status }).where(eq(schema.routines.id, r.id)).run();
  }

  // a little edit history, spread over the last days
  store.update('agents', atlas.id, { model: 'sonnet' }, me);
  store.update('agents', atlas.id, { model: 'opus', guardrails: { ...atlas.guardrails, approval: [...atlas.guardrails.approval, 'Instalar dependência nova'] } }, { id: null, name: 'Rafa Lima' });
  store.update('agents', luna.id, { prompt: luna.prompt + '\n\n## Quando parar\nSe o cliente estiver irritado ou citar cancelamento, passe para uma pessoa.' }, me);
  store.update('rules', 1, { body: 'Toda resposta começa pela conclusão, em até 5 linhas.\nDetalhe só se pedirem.\nTermine dizendo o que espera da pessoa.' }, me);
  store.update('agents', vega.id, { weeklyCapacity: 50 }, me);
  const revs = db.select().from(schema.revisions).all();
  revs.forEach((r, i) => db.update(schema.revisions).set({ createdAt: ago(Math.max(0, 13 - Math.floor((i / revs.length) * 14)), 9 + (i % 8), (i * 7) % 60) }).where(eq(schema.revisions.id, r.id)).run());
}
