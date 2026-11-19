/** Finds routines that already exist on this machine. READ-ONLY: only lists; never edits crontab, timers or files. */
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { isValidCron } from '@teamops/core';

const sh = promisify(execFile);
export interface FoundRoutine { source: 'crontab' | 'systemd' | 'claude-code'; name: string; cron: string; cronOk: boolean; command: string; note: string }

/** Hide anything that looks like a credential before it reaches the screen or the database. */
export const mask = (s: string) => s
  .replace(/((?:token|secret|senha|password|passwd|api[_-]?key|authorization|bearer)\w*["']?\s*[=: ]\s*["']?)[^\s"']+/gi, '$1••••')
  .replace(/\b[A-Za-z0-9_\-]{32,}\b/g, '••••');

const DOW: Record<string, string> = { mon: '1', tue: '2', wed: '3', thu: '4', fri: '5', sat: '6', sun: '0' };

/** Best effort: systemd OnCalendar -> cron. Unknown shapes stay as a note for the user to adjust. */
export function calendarToCron(cal: string): string | null {
  const c = cal.trim().toLowerCase();
  const simple: Record<string, string> = { hourly: '0 * * * *', daily: '0 0 * * *', weekly: '0 0 * * 1', monthly: '0 0 1 * *', minutely: '* * * * *' };
  if (simple[c]) return simple[c];
  const m = /^(?:([a-z,.\-]+)\s+)?(?:(\*|\d{4})-(\*|\d{1,2})-(\*|\d{1,2})\s+)?(\*|\d{1,2}(?:,\d{1,2})*)(?::(\*|\d{1,2}(?:[,/]\d{1,2})*))(?::\d{1,2})?$/.exec(c);
  if (!m) return null;
  const dow = m[1] ? m[1].replace(/\.\./g, '-').replace(/[a-z]{3}/g, (d) => DOW[d] ?? d) : '*';
  const min = (m[6] ?? '0').replace(/^(\d+|\*)\/(\d+)$/, (_, a, b) => (a === '*' || a === '0' || a === '00' ? `*/${b}` : `${Number(a)}/${b}`)).split(',').map((x) => (/^\d+$/.test(x) ? String(Number(x)) : x)).join(',');
  const hour = m[5].split(',').map((x) => (x === '*' ? x : String(Number(x)))).join(',');
  const expr = `${min} ${hour} ${m[4] && m[4] !== '*' ? Number(m[4]) : '*'} ${m[3] && m[3] !== '*' ? Number(m[3]) : '*'} ${dow}`;
  return isValidCron(expr) ? expr : null;
}

export async function discoverRoutines(): Promise<{ found: FoundRoutine[]; warnings: string[] }> {
  const found: FoundRoutine[] = [], warnings: string[] = [];

  try {
    const { stdout } = await sh('crontab', ['-l'], { timeout: 5000 });
    for (const line of stdout.split('\n')) {
      const m = /^\s*((?:\S+\s+){4}\S+)\s+(.+)$/.exec(line);
      if (!m || line.trim().startsWith('#') || /^\s*\w+=/.test(line)) continue;
      const cmd = mask(m[2]);
      found.push({ source: 'crontab', name: (cmd.split(/\s+/).find((w) => w.includes('/'))?.split('/').pop() ?? cmd).slice(0, 60), cron: m[1].replace(/\s+/g, ' '), cronOk: isValidCron(m[1]), command: cmd.slice(0, 300), note: '' });
    }
  } catch { warnings.push('Sem crontab para este usuário.'); }

  try {
    const { stdout } = await sh('systemctl', ['--user', 'list-timers', '--all', '--no-pager', '--output=json'], { timeout: 5000 });
    for (const t of JSON.parse(stdout) as { unit: string; activates: string }[]) {
      let cal = '', desc = '';
      try {
        const show = (await sh('systemctl', ['--user', 'show', t.unit, '-p', 'TimersCalendar', '-p', 'TimersMonotonic', '-p', 'Description'], { timeout: 5000 })).stdout;
        cal = /TimersCalendar=\{ OnCalendar=([^;]+);/.exec(show)?.[1]?.trim() ?? '';
        desc = /Description=(.*)/.exec(show)?.[1] ?? '';
        if (!cal) cal = /TimersMonotonic=\{ (\w+=[^;]+);/.exec(show)?.[1] ?? '';
      } catch { /* keep going */ }
      const cron = calendarToCron(cal.replace(/^\*-\*-\*\s+/, ''));
      found.push({ source: 'systemd', name: t.unit.replace(/\.timer$/, ''), cron: cron ?? '', cronOk: !!cron, command: t.activates ?? '', note: [mask(desc), cron ? '' : `Agenda do systemd: ${cal || 'desconhecida'} (ajuste à mão)`].filter(Boolean).join(' · ') });
    }
  } catch { warnings.push('Sem timers do systemd para este usuário.'); }

  // Claude Code scheduled tasks: one folder or JSON file per task, depending on the version
  const base = process.env.TEAMOPS_CLAUDE_HOME ?? join(os.homedir(), '.claude');
  for (const dir of ['scheduled-tasks', 'scheduled_tasks', 'jobs']) {
    const p = join(base, dir);
    if (!existsSync(p)) continue;
    for (const f of readdirSync(p).slice(0, 200)) {
      try {
        const file = f.endsWith('.json') ? join(p, f) : ['task.json', 'job.json', 'config.json'].map((n) => join(p, f, n)).find(existsSync);
        if (!file) continue;
        const j = JSON.parse(readFileSync(file, 'utf8'));
        const cron = String(j.cron ?? j.cronExpression ?? j.schedule?.cron ?? j.schedule ?? '');
        if (!cron && !j.prompt) continue;
        found.push({ source: 'claude-code', name: String(j.name ?? j.title ?? j.taskId ?? f).slice(0, 60), cron, cronOk: isValidCron(cron), command: mask(String(j.prompt ?? j.description ?? '')).slice(0, 300), note: j.enabled === false ? 'Desligada na origem' : '' });
      } catch { /* not a task file */ }
    }
  }
  if (!found.some((f) => f.source === 'claude-code')) warnings.push('Nenhuma tarefa agendada do Claude Code encontrada.');
  return { found, warnings };
}
