/** Zabbix JSON-RPC client. Read-only, except the manual acknowledge the user clicks. */
import { readFileSync } from 'node:fs';

export interface Monitor { id: number; name: string; url: string; token: string; enabled: boolean; useForCapacity: boolean; hosts: string[]; usageHost: string; usageKeys: Record<string, string> }

/**
 * A secret is either a literal or a reference `file:/path/file.json#a.b.c`.
 * `{key}` inside the path is replaced by the top-level value of that key, so
 * `#instances.{default}.token` follows the file's own "default" pointer.
 * References let an instance reuse a credential that already lives elsewhere, without copying it.
 */
export function resolveSecret(value: string): string {
  if (!value.startsWith('file:')) return value;
  const [path, jsonPath] = value.slice(5).split('#');
  const raw = readFileSync(path, 'utf8');
  if (!jsonPath) return raw.trim();
  const root = JSON.parse(raw);
  let cur: any = root;
  for (const part of jsonPath.split('.')) {
    const key = part.replace(/^\{(.+)\}$/, (_, k) => String(root[k]));
    cur = cur?.[key];
  }
  if (typeof cur !== 'string') throw new Error('referência de segredo não encontrada');
  return cur;
}

const apiUrl = (base: string) => (base.endsWith('api_jsonrpc.php') ? base : base.replace(/\/+$/, '') + '/api_jsonrpc.php');
export const uiUrl = (m: Monitor) => resolveSecret(m.url).replace(/\/api_jsonrpc\.php$/, '').replace(/\/+$/, '');

export async function zbx<T = any>(m: Monitor, method: string, params: unknown = {}): Promise<T> {
  let url: string, token: string;
  try { url = apiUrl(resolveSecret(m.url)); token = resolveSecret(m.token); }
  catch { throw new Error('Não consegui ler a URL ou o token desta conexão.'); }
  const headers: Record<string, string> = { 'Content-Type': 'application/json-rpc' };
  if (method !== 'apiinfo.version') headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try { res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }), signal: AbortSignal.timeout(15_000) }); }
  catch { throw new Error('Zabbix fora de alcance (rede ou endereço).'); }
  const j = (await res.json().catch(() => null)) as { result?: T; error?: { message?: string; data?: string } } | null;
  if (!j) throw new Error(`Zabbix respondeu HTTP ${res.status} sem JSON.`);
  if (j.error) throw new Error(`Zabbix: ${j.error.data ?? j.error.message ?? 'erro'}`);
  return j.result as T;
}

export interface Problem {
  key: string; monitorId: number; monitorName: string; eventId: string; triggerId: string; name: string; severity: number; since: number;
  acknowledged: boolean; suppressed: boolean; host: string; hostId: string; groups: string[]; tags: { tag: string; value: string }[];
  items: { name: string; value: string; units: string }[]; opdata: string; link: string;
}

export const SEVERITIES = ['Não classificado', 'Informação', 'Atenção', 'Média', 'Alta', 'Desastre'];

export async function listProblems(m: Monitor): Promise<Problem[]> {
  const problems = await zbx<any[]>(m, 'problem.get', { output: ['eventid', 'objectid', 'name', 'severity', 'clock', 'acknowledged', 'suppressed', 'opdata'], selectTags: ['tag', 'value'], source: 0, object: 0, sortfield: ['eventid'], sortorder: 'DESC', limit: 300 });
  const ids = [...new Set(problems.map((p) => p.objectid))];
  const triggers = ids.length
    ? await zbx<any[]>(m, 'trigger.get', { triggerids: ids, output: ['triggerid'], selectHosts: ['hostid', 'name'], selectHostGroups: ['name'], selectItems: ['name', 'lastvalue', 'units', 'value_type'], preservekeys: false })
    : [];
  const byId = new Map(triggers.map((t) => [t.triggerid, t]));
  const ui = uiUrl(m);
  return problems.map((p) => {
    const t = byId.get(p.objectid);
    return {
      key: `zbx:${m.id}:${p.eventid}`, monitorId: m.id, monitorName: m.name, eventId: p.eventid, triggerId: p.objectid, name: p.name, severity: Number(p.severity), since: Number(p.clock),
      acknowledged: p.acknowledged === '1', suppressed: p.suppressed === '1', host: t?.hosts?.[0]?.name ?? '—', hostId: t?.hosts?.[0]?.hostid ?? '',
      groups: (t?.hostgroups ?? t?.groups ?? []).map((g: any) => g.name), tags: p.tags ?? [],
      items: (t?.items ?? []).slice(0, 4).map((i: any) => ({ name: i.name, value: String(i.lastvalue ?? '').slice(0, 200), units: i.units ?? '' })),
      opdata: p.opdata ?? '', link: `${ui}/tr_events.php?triggerid=${p.objectid}&eventid=${p.eventid}`,
    };
  });
}

/** Manual acknowledge. Called only from the button the user clicks. */
export async function acknowledge(m: Monitor, eventId: string, message: string): Promise<void> {
  await zbx(m, 'event.acknowledge', { eventids: [eventId], action: message ? 6 : 2, ...(message ? { message } : {}) });
}

export async function testMonitor(m: Monitor): Promise<{ ok: boolean; message: string }> {
  try {
    const version = await zbx<string>(m, 'apiinfo.version');
    const hosts = await zbx<string>(m, 'host.get', { countOutput: true });
    return { ok: true, message: `Zabbix ${version} · ${hosts} hosts visíveis` };
  } catch (e) { return { ok: false, message: (e as Error).message }; }
}
