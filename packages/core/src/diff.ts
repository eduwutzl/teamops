export interface DiffLine { op: ' ' | '+' | '-'; text: string }

/** Line diff by longest common subsequence. Inputs are capped to keep it cheap. */
export function diffLines(a: string, b: string): DiffLine[] {
  const A = a.split('\n').slice(0, 1500), B = b.split('\n').slice(0, 1500);
  const n = A.length, m = B.length;
  const t: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) t[i][j] = A[i] === B[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ op: ' ', text: A[i] }); i++; j++; }
    else if (t[i + 1][j] >= t[i][j + 1]) out.push({ op: '-', text: A[i++] });
    else out.push({ op: '+', text: B[j++] });
  }
  while (i < n) out.push({ op: '-', text: A[i++] });
  while (j < m) out.push({ op: '+', text: B[j++] });
  return out;
}

export interface FieldChange { field: string; before: string; after: string; lines: DiffLine[] }

function show(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && v.every((x) => typeof x === 'string' || typeof x === 'number')) return v.join('\n');
  if (typeof v === 'object') return JSON.stringify(v, null, 2);
  return String(v);
}

/** Field-by-field diff between two snapshots of the same entity. */
export function diffSnapshots(before: Record<string, unknown> | null, after: Record<string, unknown> | null, skip: string[] = []): FieldChange[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const out: FieldChange[] = [];
  for (const k of keys) {
    if (skip.includes(k)) continue;
    const x = show(before?.[k]), y = show(after?.[k]);
    if (x !== y) out.push({ field: k, before: x, after: y, lines: diffLines(x, y) });
  }
  return out;
}
