/** Runs a prompt through a local engine. No paid API: it shells out to the CLI the user already has. */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { INSTANCE } from './db/index.ts';

export interface EngineRequest {
  engine: string;
  model?: string;
  prompt: string;
  /** Appended to the engine's system prompt (the agent's own prompt and guardrails). */
  system?: string;
  /** Built-in tools the run may use. Empty = pure text, no tools. */
  tools?: string[];
  cwd?: string;
  timeoutMs?: number;
}

export interface EngineResult {
  ok: boolean;
  text: string;
  log: string;
  durationMs: number;
  timedOut: boolean;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  model: string;
}

const CLAUDE_CMD = process.env.TEAMOPS_CLAUDE_CMD ?? 'claude';
const OPENCODE_CMD = process.env.TEAMOPS_OPENCODE_CMD ?? 'opencode';
export const DEFAULT_AI = { engine: process.env.TEAMOPS_AI_ENGINE ?? 'claude-code', model: process.env.TEAMOPS_AI_MODEL ?? 'sonnet' };

function exec(cmd: string, args: string[], input: string, cwd: string, timeoutMs: number): Promise<{ code: number | null; out: string; err: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    let out = '', err = '', timedOut = false, done = false;
    const finish = (code: number | null) => { if (done) return; done = true; clearTimeout(timer); resolve({ code, out, err, timedOut }); };
    let child: ReturnType<typeof spawn>;
    try { child = spawn(cmd, args, { cwd, env: { ...process.env, NO_COLOR: '1' }, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch (e) { resolve({ code: -1, out: '', err: (e as Error).message, timedOut: false }); return; }
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout!.on('data', (d) => { if (out.length < 2_000_000) out += d; });
    child.stderr!.on('data', (d) => { if (err.length < 200_000) err += d; });
    child.on('error', (e) => { err += e.message; finish(-1); });
    child.on('close', finish);
    child.stdin!.on('error', () => {});
    child.stdin!.end(input);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runEngine(req: EngineRequest): Promise<EngineResult> {
  const started = Date.now();
  const cwd = req.cwd ?? join(INSTANCE, 'tmp');
  mkdirSync(cwd, { recursive: true });
  const timeoutMs = req.timeoutMs ?? 180_000;
  const base = { tokensIn: null, tokensOut: null, costUsd: null, model: req.model ?? '', timedOut: false };

  if (req.engine === 'mock') {
    await sleep(300 + Math.floor(Math.random() * 900));
    const fail = /\[falhar\]/i.test(req.prompt);
    return { ...base, ok: !fail, text: fail ? '' : `Execução simulada concluída.\n\nInstrução recebida:\n${req.prompt.slice(0, 400)}`, log: fail ? 'Falha simulada pela marca [falhar].' : 'Motor simulado: nenhuma IA foi chamada.', durationMs: Date.now() - started, model: 'mock' };
  }

  if (req.engine === 'claude-code') {
    const args = ['-p', '--output-format', 'json', '--no-session-persistence', '--strict-mcp-config', '--setting-sources', '', '--tools', (req.tools ?? []).join(',')];
    if (req.model && req.model !== 'inherit') args.push('--model', req.model);
    if (req.system) args.push('--append-system-prompt', req.system);
    const r = await exec(CLAUDE_CMD, args, req.prompt, cwd, timeoutMs);
    const durationMs = Date.now() - started;
    if (r.timedOut) return { ...base, ok: false, text: '', log: `Tempo esgotado após ${Math.round(timeoutMs / 1000)} s.`, durationMs, timedOut: true };
    try {
      const j = JSON.parse(r.out);
      const u = j.usage ?? {};
      return {
        ok: !j.is_error && r.code === 0, text: String(j.result ?? ''), log: [`exit ${r.code}`, j.subtype, r.err.trim().slice(0, 2000)].filter(Boolean).join(' · '), durationMs, timedOut: false,
        tokensIn: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), tokensOut: u.output_tokens ?? 0,
        costUsd: typeof j.total_cost_usd === 'number' ? j.total_cost_usd : null, model: Object.keys(j.modelUsage ?? {})[0] ?? req.model ?? '',
      };
    } catch {
      return { ...base, ok: false, text: r.out.trim().slice(0, 4000), log: `exit ${r.code} · ${r.err.trim().slice(0, 2000) || 'sem saída válida do motor'}`, durationMs };
    }
  }

  if (req.engine === 'opencode') {
    const r = await exec(OPENCODE_CMD, ['run', ...(req.model && req.model !== 'default' ? ['--model', req.model] : [])], `${req.system ? req.system + '\n\n' : ''}${req.prompt}`, cwd, timeoutMs);
    return { ...base, ok: r.code === 0 && !r.timedOut && !!r.out.trim(), text: r.out.trim(), log: `exit ${r.code} · ${r.err.trim().slice(0, 2000)}`, durationMs: Date.now() - started, timedOut: r.timedOut };
  }

  return { ...base, ok: false, text: '', log: `Motor "${req.engine}" ainda não tem executor.`, durationMs: Date.now() - started };
}

/** Pulls the first JSON object out of a model answer (handles code fences and chatter). */
export function extractJson<T>(text: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const src = fenced ? fenced[1] : text;
  const a = src.indexOf('{'), b = src.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(src.slice(a, b + 1)) as T; } catch { return null; }
}
