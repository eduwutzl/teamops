/** Tiny YAML front matter reader/writer: flat `key: value` pairs and simple lists. */

export function parseFrontmatter(src: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(src);
  if (!m) return { meta: {}, body: src };
  const meta: Record<string, string> = {};
  let last = '';
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) {
      last = kv[1];
      meta[last] = kv[2].trim().replace(/^(["'])([\s\S]*)\1$/, '$2');
    } else if (last && /^\s+-\s+/.test(line)) {
      meta[last] = (meta[last] ? meta[last] + ', ' : '') + line.replace(/^\s+-\s+/, '').trim();
    } else if (last && /^\s+\S/.test(line)) {
      meta[last] = (meta[last] + ' ' + line.trim()).trim();
    }
  }
  return { meta, body: m[2] };
}

function scalar(v: string): string {
  return /[:#\n"']|^\s|\s$|^[\[{>|*&!%@`-]/.test(v) ? JSON.stringify(v) : v;
}

export function writeFrontmatter(meta: Record<string, string | undefined>, body: string): string {
  const lines = Object.entries(meta).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}: ${scalar(String(v).replace(/\s*\n\s*/g, ' '))}`);
  return `---\n${lines.join('\n')}\n---\n\n${body.trim()}\n`;
}
