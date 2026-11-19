import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { extractGuardrails, parseFrontmatter, slugify, type Guardrails } from '@teamops/core';

export interface ImportedAgent { name: string; slug: string; description: string; model: string; tools: string[]; prompt: string; guardrails: Guardrails; file: string }
export interface ImportedMcp { name: string; transport: 'stdio' | 'http' | 'sse'; command: string; args: string[]; url: string; envKeys: string[] }
export interface ImportedRule { title: string; body: string; file: string }
export interface ImportScan { root: string; agents: ImportedAgent[]; mcps: ImportedMcp[]; rules: ImportedRule[]; skills: string[]; warnings: string[] }

const read = (p: string) => readFileSync(p, 'utf8');
const isDir = (p: string) => existsSync(p) && statSync(p).isDirectory();

function splitRules(md: string, file: string): ImportedRule[] {
  const parts = md.split(/^(?=## (?!#))/m).map((s) => s.trim()).filter(Boolean);
  return parts.map((p, i) => {
    const h = /^#{1,2}\s+(.+)$/m.exec(p);
    return { title: (h?.[1] ?? `Trecho ${i + 1}`).trim().slice(0, 120), body: p.replace(/^#{1,2}\s+.+\n?/, '').trim(), file };
  }).filter((r) => r.body);
}

/**
 * Reads a Claude Code environment. READ-ONLY: this module only calls
 * existsSync/statSync/readdirSync/readFileSync. Env values of MCP servers are
 * discarded on purpose; only their names are kept.
 */
export function scanClaudeCode(root: string): ImportScan {
  const out: ImportScan = { root, agents: [], mcps: [], rules: [], skills: [], warnings: [] };
  if (!isDir(root)) { out.warnings.push('Pasta não encontrada.'); return out; }
  const home = isDir(join(root, '.claude')) ? join(root, '.claude') : root;

  const agentsDir = join(home, 'agents');
  if (isDir(agentsDir)) {
    for (const f of readdirSync(agentsDir).filter((x) => x.endsWith('.md')).sort()) {
      try {
        const { meta, body } = parseFrontmatter(read(join(agentsDir, f)));
        const name = meta.name || f.replace(/\.md$/, '');
        const { guardrails, rest } = extractGuardrails(body.trim());
        out.agents.push({
          name, slug: slugify(name), description: meta.description ?? '', model: meta.model || 'inherit',
          tools: (meta.tools ?? '').split(',').map((t) => t.trim()).filter(Boolean), prompt: rest, guardrails, file: `agents/${f}`,
        });
      } catch (e) { out.warnings.push(`Não li agents/${f}: ${(e as Error).message}`); }
    }
  } else out.warnings.push('Sem pasta agents/.');

  for (const p of [join(root, 'CLAUDE.md'), join(home, 'CLAUDE.md')]) {
    if (existsSync(p) && !out.rules.some((r) => r.file === p)) out.rules.push(...splitRules(read(p), p.slice(root.length + 1) || 'CLAUDE.md'));
  }

  for (const p of [join(root, '.mcp.json'), join(home, '.mcp.json')]) {
    if (!existsSync(p)) continue;
    try {
      const servers = (JSON.parse(read(p)).mcpServers ?? {}) as Record<string, { command?: string; args?: string[]; url?: string; type?: string; env?: Record<string, string> }>;
      for (const [name, s] of Object.entries(servers)) {
        if (out.mcps.some((m) => m.name === name)) continue;
        out.mcps.push({ name, transport: s.url ? (s.type === 'sse' ? 'sse' : 'http') : 'stdio', command: s.command ?? '', args: Array.isArray(s.args) ? s.args.map(String) : [], url: s.url ?? '', envKeys: Object.keys(s.env ?? {}) });
      }
    } catch { out.warnings.push('.mcp.json inválido.'); }
  }

  const skillsDir = join(home, 'skills');
  if (isDir(skillsDir)) out.skills = readdirSync(skillsDir).filter((d) => isDir(join(skillsDir, d))).sort();
  return out;
}
