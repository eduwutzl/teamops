/** Minimal 5-field cron: parse, next run and a friendly description. Local time. */

interface Parsed { min: Set<number>; hour: Set<number>; dom: Set<number>; mon: Set<number>; dow: Set<number>; domAny: boolean; dowAny: boolean }

const RANGES: [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]];
const DAY_NAMES = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const DAY_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const DOW_ALIAS: Record<string, string> = { sun: '0', mon: '1', tue: '2', wed: '3', thu: '4', fri: '5', sat: '6' };

function field(expr: string, [lo, hi]: [number, number], isDow = false): Set<number> {
  const out = new Set<number>();
  for (let part of expr.split(',')) {
    if (isDow) part = part.toLowerCase().replace(/[a-z]{3}/g, (m) => DOW_ALIAS[m] ?? m);
    const [range, stepRaw] = part.split('/');
    const step = stepRaw ? Number(stepRaw) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error('passo inválido');
    let a = lo, b = hi;
    if (range !== '*') {
      const [x, y] = range.split('-');
      a = Number(x); b = y === undefined ? (stepRaw ? hi : a) : Number(y);
    }
    if (isDow) { if (a === 7) a = 0; if (b === 7) b = range.includes('-') ? 6 : 0; }
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < lo || b > hi || a > b) throw new Error('valor fora da faixa');
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expr: string): Parsed {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) throw new Error('use 5 campos: minuto hora dia mês dia-da-semana');
  return {
    min: field(f[0], RANGES[0]), hour: field(f[1], RANGES[1]), dom: field(f[2], RANGES[2]), mon: field(f[3], RANGES[3]), dow: field(f[4], RANGES[4], true),
    domAny: f[2] === '*', dowAny: f[4] === '*',
  };
}

export function isValidCron(expr: string): boolean {
  try { parseCron(expr); return true; } catch { return false; }
}

/** Next run strictly after `from`. Returns null when nothing matches within 2 years. */
export function nextRun(expr: string, from: Date = new Date()): Date | null {
  let p: Parsed;
  try { p = parseCron(expr); } catch { return null; }
  const d = new Date(from.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const limit = from.getTime() + 2 * 366 * 86400_000;
  while (d.getTime() < limit) {
    if (!p.mon.has(d.getMonth() + 1)) { d.setMonth(d.getMonth() + 1, 1); d.setHours(0, 0, 0, 0); continue; }
    const domOk = p.dom.has(d.getDate()), dowOk = p.dow.has(d.getDay());
    const dayOk = p.domAny && p.dowAny ? true : p.domAny ? dowOk : p.dowAny ? domOk : domOk || dowOk;
    if (!dayOk) { d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); continue; }
    if (!p.hour.has(d.getHours())) { d.setHours(d.getHours() + 1, 0, 0, 0); continue; }
    if (!p.min.has(d.getMinutes())) { d.setMinutes(d.getMinutes() + 1); continue; }
    return d;
  }
  return null;
}

export function nextRuns(expr: string, n: number, from: Date = new Date()): Date[] {
  const out: Date[] = [];
  let cur = from;
  for (let i = 0; i < n; i++) { const x = nextRun(expr, cur); if (!x) break; out.push(x); cur = x; }
  return out;
}

/** Friendly schedule editor model. `custom` keeps the raw expression. */
export type Schedule =
  | { kind: 'minutes'; every: number }
  | { kind: 'hourly'; minute: number }
  | { kind: 'daily'; time: string }
  | { kind: 'weekdays'; time: string }
  | { kind: 'weekly'; days: number[]; time: string }
  | { kind: 'monthly'; day: number; time: string }
  | { kind: 'custom'; expr: string };

const hm = (time: string): [number, number] => {
  const [h, m] = time.split(':').map(Number);
  return [Math.min(23, Math.max(0, h || 0)), Math.min(59, Math.max(0, m || 0))];
};
const pad = (n: number) => String(n).padStart(2, '0');

export function scheduleToCron(s: Schedule): string {
  switch (s.kind) {
    case 'minutes': return `*/${Math.min(59, Math.max(1, s.every))} * * * *`;
    case 'hourly': return `${s.minute} * * * *`;
    case 'daily': { const [h, m] = hm(s.time); return `${m} ${h} * * *`; }
    case 'weekdays': { const [h, m] = hm(s.time); return `${m} ${h} * * 1-5`; }
    case 'weekly': { const [h, m] = hm(s.time); return `${m} ${h} * * ${[...s.days].sort().join(',') || '1'}`; }
    case 'monthly': { const [h, m] = hm(s.time); return `${m} ${h} ${s.day} * *`; }
    case 'custom': return s.expr;
  }
}

export function cronToSchedule(expr: string): Schedule {
  const f = expr.trim().split(/\s+/);
  if (f.length !== 5) return { kind: 'custom', expr };
  const [mi, h, dom, mon, dow] = f;
  const num = (x: string) => /^\d+$/.test(x);
  if (mon !== '*') return { kind: 'custom', expr };
  const every = /^\*\/(\d+)$/.exec(mi);
  if (every && h === '*' && dom === '*' && dow === '*') return { kind: 'minutes', every: Number(every[1]) };
  if (num(mi) && h === '*' && dom === '*' && dow === '*') return { kind: 'hourly', minute: Number(mi) };
  if (!num(mi) || !num(h)) return { kind: 'custom', expr };
  const time = `${pad(Number(h))}:${pad(Number(mi))}`;
  if (dom === '*' && dow === '*') return { kind: 'daily', time };
  if (dom === '*' && dow === '1-5') return { kind: 'weekdays', time };
  if (dom === '*' && /^[0-7](,[0-7])*$/.test(dow)) return { kind: 'weekly', days: dow.split(',').map((d) => Number(d) % 7), time };
  if (num(dom) && dow === '*') return { kind: 'monthly', day: Number(dom), time };
  return { kind: 'custom', expr };
}

/** "Dias úteis às 08:30" */
export function describeCron(expr: string): string {
  if (!isValidCron(expr)) return 'Agenda inválida';
  const everyH = /^(\d+) \*\/(\d+) \* \* \*$/.exec(expr.trim());
  if (everyH) return `A cada ${everyH[2]} horas${everyH[1] === '0' ? '' : `, no minuto ${pad(Number(everyH[1]))}`}`;
  const s = cronToSchedule(expr);
  switch (s.kind) {
    case 'minutes': return s.every === 1 ? 'A cada minuto' : `A cada ${s.every} minutos`;
    case 'hourly': return `Toda hora, no minuto ${pad(s.minute)}`;
    case 'daily': return `Todos os dias às ${s.time}`;
    case 'weekdays': return `Dias úteis às ${s.time}`;
    case 'weekly': return s.days.length === 1 ? `Toda ${DAY_LONG[s.days[0]]} às ${s.time}` : `${s.days.map((d) => DAY_NAMES[d]).join(', ')} às ${s.time}`;
    case 'monthly': return `Todo dia ${s.day} às ${s.time}`;
    case 'custom': return `Agenda avançada (${expr})`;
  }
}

export { DAY_NAMES };
