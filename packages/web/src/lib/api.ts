import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'), credentials: 'same-origin',
    headers: opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401 && !path.startsWith('/auth') && !path.startsWith('/me')) { window.dispatchEvent(new Event('teamops:logout')); }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError((data as any)?.error ?? 'Algo deu errado.', res.status);
  return data as T;
}

/** Loads a resource; `reload` refetches without flashing the loading state. `every` polls. */
export function useData<T = any>(path: string | null, every?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const alive = useRef(true);
  const reload = useCallback(async () => {
    if (!path) return;
    try { const d = await api<T>(path); if (alive.current) { setData(d); setError(null); } }
    catch (e) { if (alive.current) setError((e as Error).message); }
    finally { if (alive.current) setLoading(false); }
  }, [path]);
  useEffect(() => {
    alive.current = true;
    setLoading(!!path);
    reload();
    const t = every ? setInterval(() => { if (!document.hidden) reload(); }, every) : null;
    return () => { alive.current = false; if (t) clearInterval(t); };
  }, [reload, every, path]);
  return { data, error, loading, reload, setData };
}
