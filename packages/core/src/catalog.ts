import type { Capability, Risk } from './types.ts';

export interface CatalogEntry {
  key: string;
  label: string;
  description: string;
  risk: Risk;
  category: string;
  capabilities: Capability[];
}

/** Built-in tools of the Claude Code engine, with plain-language names. */
export const BUILTIN_TOOLS: CatalogEntry[] = [
  { key: 'Read', label: 'Ler arquivos', description: 'Abre e lê arquivos do projeto.', risk: 'low', category: 'Arquivos', capabilities: ['read'] },
  { key: 'Glob', label: 'Localizar arquivos', description: 'Encontra arquivos pelo nome ou padrão.', risk: 'low', category: 'Arquivos', capabilities: ['read'] },
  { key: 'Grep', label: 'Buscar texto', description: 'Procura um texto dentro dos arquivos.', risk: 'low', category: 'Arquivos', capabilities: ['read'] },
  { key: 'Edit', label: 'Editar arquivos', description: 'Altera trechos de arquivos que já existem.', risk: 'medium', category: 'Arquivos', capabilities: ['write'] },
  { key: 'Write', label: 'Criar arquivos', description: 'Cria arquivos novos ou sobrescreve por inteiro.', risk: 'medium', category: 'Arquivos', capabilities: ['write', 'delete'] },
  { key: 'NotebookEdit', label: 'Editar notebooks', description: 'Altera células de notebooks Jupyter.', risk: 'medium', category: 'Arquivos', capabilities: ['write'] },
  { key: 'Bash', label: 'Executar comandos', description: 'Roda qualquer comando no terminal da máquina.', risk: 'high', category: 'Sistema', capabilities: ['exec', 'write', 'delete', 'web', 'send'] },
  { key: 'WebFetch', label: 'Abrir páginas da web', description: 'Baixa e lê o conteúdo de um endereço.', risk: 'medium', category: 'Internet', capabilities: ['web'] },
  { key: 'WebSearch', label: 'Pesquisar na web', description: 'Faz buscas na internet.', risk: 'low', category: 'Internet', capabilities: ['web'] },
  { key: 'Agent', label: 'Delegar a outro agente', description: 'Chama outro agente para uma subtarefa.', risk: 'medium', category: 'Time', capabilities: ['delegate'] },
  { key: 'TodoWrite', label: 'Lista de tarefas', description: 'Mantém a lista de passos da própria sessão.', risk: 'low', category: 'Time', capabilities: [] },
  { key: 'Skill', label: 'Usar skills', description: 'Carrega instruções prontas para um tipo de tarefa.', risk: 'low', category: 'Time', capabilities: ['read'] },
];

const VERB_RULES: { re: RegExp; risk: Risk; caps: Capability[] }[] = [
  { re: /(delete|remove|drop|destroy|purge|trash|apagar|excluir|wipe)/i, risk: 'critical', caps: ['delete', 'write'] },
  { re: /(exec|run|shell|command|deploy|restart|kill|reboot)/i, risk: 'high', caps: ['exec'] },
  { re: /(send|post|publish|reply|forward|email|message|notify|enviar)/i, risk: 'high', caps: ['send'] },
  { re: /(create|update|write|set|add|edit|patch|put|import|upload|move|rename|criar|atualizar)/i, risk: 'medium', caps: ['write'] },
  { re: /(get|list|read|search|find|query|fetch|describe|status|count|ler|buscar|listar)/i, risk: 'low', caps: ['read'] },
];

/** Guess risk and capabilities of a tool discovered through an MCP `tools/list`. */
export function guessTool(name: string, description = ''): { risk: Risk; capabilities: Capability[] } {
  for (const r of VERB_RULES) if (r.re.test(name)) return { risk: r.risk, capabilities: r.caps };
  for (const r of VERB_RULES) if (r.re.test(description)) return { risk: r.risk, capabilities: r.caps };
  return { risk: 'medium', capabilities: [] };
}

/** Turn `list_open_tickets` into "List open tickets". */
export function friendlyName(name: string): string {
  const s = name.replace(/^mcp__[^_]+(?:_[^_]+)*__/, '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function mcpToolKey(server: string, tool: string): string {
  return `mcp__${server}__${tool}`;
}

/** Words in a guardrail, rule or routine prompt that point to a capability. */
const CAP_WORDS: Record<Capability, RegExp> = {
  read: /\b(ler|leia|consultar|read)\b/i,
  write: /\b(escrev\w*|edit\w*|alter\w*|modific\w*|criar arquivo\w*|gravar|grave|write|edit|modify|commit\w*)\b/i,
  exec: /\b(comando\w*|shell|terminal|script\w*|execut\w*|rodar|rode|bash|deploy|reinici\w*|restart)\b/i,
  web: /\b(internet|web|site\w*|naveg\w*|pesquis\w* na web|url\w*|online)\b/i,
  delete: /\b(apag\w*|delet\w*|exclu\w*|remov\w*|drop|destru\w*|delete|remove)\b/i,
  send: /\b(envi\w*|mensage\w*|e-?mail\w*|public\w*|post\w*|notific\w*|send|whatsapp|slack)\b/i,
  delegate: /\b(deleg\w*|subagente\w*|outro agente|delegate)\b/i,
};

export function capabilitiesIn(text: string): Capability[] {
  return (Object.keys(CAP_WORDS) as Capability[]).filter((c) => CAP_WORDS[c].test(text));
}

export const CAP_LABEL: Record<Capability, string> = {
  read: 'ler', write: 'alterar arquivos', exec: 'executar comandos', web: 'acessar a internet', delete: 'apagar', send: 'enviar mensagens', delegate: 'delegar',
};
