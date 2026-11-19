import type { Guardrails } from './types.ts';

/** Markdown block appended to the agent prompt by the adapters. */
export function guardrailsMarkdown(g: Guardrails): string {
  const sec = (title: string, items: string[]) => (items.length ? `### ${title}\n${items.map((i) => `- ${i}`).join('\n')}\n` : '');
  const body = [sec('Pode fazer sozinho', g.can), sec('Só com aprovação humana', g.approval), sec('Nunca', g.never)].filter(Boolean).join('\n');
  return body ? `## Guardrails\n\n${body}` : '';
}

const HEADS: [keyof Guardrails, RegExp][] = [
  ['can', /^#{2,4}\s*(pode|can|allowed)/i],
  ['approval', /^#{2,4}\s*(s[oó] com aprova|com aprova|needs approval|ask first)/i],
  ['never', /^#{2,4}\s*(nunca|never|proibido)/i],
];

/** Reverse of guardrailsMarkdown: pulls the block out of an imported prompt. */
export function extractGuardrails(prompt: string): { guardrails: Guardrails; rest: string } {
  const g: Guardrails = { can: [], approval: [], never: [] };
  const m = /^## Guardrails\s*$/m.exec(prompt);
  if (!m) return { guardrails: g, rest: prompt };
  const tail = prompt.slice(m.index + m[0].length);
  const end = /^## (?!#)/m.exec(tail);
  const block = end ? tail.slice(0, end.index) : tail;
  let cur: keyof Guardrails | null = null;
  for (const line of block.split('\n')) {
    const h = HEADS.find(([, re]) => re.test(line));
    if (h) { cur = h[0]; continue; }
    const item = /^\s*[-*]\s+(.*)$/.exec(line);
    if (cur && item) g[cur].push(item[1].trim());
  }
  return { guardrails: g, rest: (prompt.slice(0, m.index) + (end ? tail.slice(end.index) : '')).trim() };
}
