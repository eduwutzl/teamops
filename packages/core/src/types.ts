/** Domain model shared by server, adapters and web. No I/O here. */

export type Risk = 'low' | 'medium' | 'high' | 'critical';
export type Capability = 'read' | 'write' | 'exec' | 'web' | 'delete' | 'send' | 'delegate';
export type AgentStatus = 'draft' | 'active' | 'paused';
export type Severity = 'high' | 'medium' | 'low';

export interface Guardrails {
  /** The agent may do this on its own. */
  can: string[];
  /** The agent must ask a human first. */
  approval: string[];
  /** The agent must never do this. */
  never: string[];
}

export interface Tool {
  id: number;
  key: string;
  label: string;
  description: string;
  risk: Risk;
  category: string;
  capabilities: Capability[];
  source: 'builtin' | 'mcp' | 'custom';
  mcpId: number | null;
}

export interface Mcp {
  id: number;
  name: string;
  label: string;
  description: string;
  transport: 'stdio' | 'http' | 'sse';
  command: string;
  args: string[];
  url: string;
  env: Record<string, string>;
  enabled: boolean;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestMessage: string;
  discovered: { name: string; description: string }[];
}

export interface Group {
  id: number;
  name: string;
  description: string;
  color: string;
  emoji: string;
}

export interface Project {
  id: number;
  name: string;
  slug: string;
  description: string;
  engine: string;
  active: boolean;
}

export interface Rule {
  id: number;
  title: string;
  body: string;
  category: string;
  projectId: number | null;
  position: number;
  active: boolean;
}

export interface Agent {
  id: number;
  name: string;
  slug: string;
  emoji: string;
  title: string;
  description: string;
  status: AgentStatus;
  groupId: number | null;
  projectIds: number[];
  engine: string;
  model: string;
  draft: string;
  prompt: string;
  guardrails: Guardrails;
  tools: string[];
  extras: Record<string, string>;
  /** "💡 why" notes written by the AI, keyed by field name. */
  why: Record<string, string>;
}

export interface Routine {
  id: number;
  name: string;
  agentId: number | null;
  projectId: number | null;
  prompt: string;
  cron: string;
  enabled: boolean;
  requiredTools: string[];
  source: string;
  report: { kind: string; days: number } | null;
}

export interface TeamState {
  corp: { name: string; tagline: string };
  tools: Tool[];
  mcps: Mcp[];
  groups: Group[];
  projects: Project[];
  rules: Rule[];
  agents: Agent[];
  routines: Routine[];
}

export interface EngineInfo {
  id: string;
  label: string;
  hint: string;
  models: { id: string; label: string }[];
  ready: boolean;
}

export const ENGINES: EngineInfo[] = [
  {
    id: 'claude-code', label: 'Claude Code', hint: 'Roda com `claude -p` na máquina. Gera .claude/agents, CLAUDE.md e .mcp.json.', ready: true,
    models: [
      { id: 'opus', label: 'Opus · o mais capaz' },
      { id: 'sonnet', label: 'Sonnet · equilíbrio' },
      { id: 'haiku', label: 'Haiku · rápido e leve' },
      { id: 'inherit', label: 'Herdar da sessão' },
    ],
  },
  { id: 'opencode', label: 'OpenCode', hint: 'Adaptador previsto para a fase 2.', ready: false, models: [{ id: 'default', label: 'Padrão do OpenCode' }] },
  { id: 'hermes', label: 'Hermes Agent', hint: 'Adaptador previsto para a fase 2.', ready: false, models: [{ id: 'default', label: 'Padrão do Hermes' }] },
  { id: 'mock', label: 'Simulado', hint: 'Não chama IA. Serve para testar rotinas e telas.', ready: true, models: [{ id: 'mock', label: 'Simulado' }] },
];

export const RISK_ORDER: Risk[] = ['low', 'medium', 'high', 'critical'];
export const RISK_LABEL: Record<Risk, string> = { low: 'Baixo', medium: 'Médio', high: 'Alto', critical: 'Crítico' };

export function slugify(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'item';
}

export function emptyGuardrails(): Guardrails {
  return { can: [], approval: [], never: [] };
}
