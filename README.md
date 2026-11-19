# TeamOps

**Design, govern and run a team of AI agents from one place.**

TeamOps is the home of an AI team: who the agents are, what each one may do, which tools and connectors they use, which routines they run, and what changed over time. It is engine-agnostic: the database is the source of truth, and adapters generate the files each engine reads (Claude Code today; OpenCode and others next).

> **Resumo em português.** O TeamOps é a casa de um time de agentes de IA: agentes, grupos, guardrails (pode / com aprovação / nunca), ferramentas, braços (MCP), rotinas agendadas, conflitos, relatórios e histórico de versões. O banco é a fonte da verdade e os adaptadores geram os arquivos de cada motor (`.claude/agents/*.md`, `CLAUDE.md`, `.mcp.json`). A IA roda pelo motor local (`claude -p`), sem API paga. Os dados da instância ficam fora do repositório. Para testar: `npm install && npm run build && TEAMOPS_DEMO=1 npm start` e entre com `demo` / `demo`. Licença AGPL-3.0.

Status: **alpha** (phase 1). The interface is in Brazilian Portuguese for now.

## What it does

| Screen | What you get |
|---|---|
| Home | Overview, alerts, productivity charts, upcoming runs, recent failures |
| Capacity | Team load, engine usage (subscription window / tokens) and server headroom, from pluggable metric sources |
| Problems | Zabbix problems as cards, live, with filters, manual acknowledge and "send to an agent" for a diagnosis |
| Corporation | Team name, system users (no permission levels) and projects |
| General rules | Working norms shared by every agent; they become each project's `CLAUDE.md` |
| Tools | Catalog with friendly names and risk levels, plus the tool x agent map |
| Arms | MCP servers and connectors, with test and tool discovery through `tools/list` (official SDK) |
| Groups | Areas of the team, tied to their agents |
| Agents | Draft + **Generate profile** (the AI fills every field and explains why), guardrails, tool checklist, engine and model, suggest/review prompt |
| Recurring tasks | Routines with a friendly schedule editor, internal scheduler, run log, "run now", read-only import from crontab / systemd timers / Claude Code |
| Conflicts | Deterministic checks: guardrail vs tool, rule vs agent, routine vs agent, and more; optional AI audit |
| Reports | Productivity, routines, changes, conflicts, tools and risk, AI usage; filters, CSV and PDF |
| History | Every change is a version: diff and restore, including removed items |

## Quick start

Requirements: Node.js 22+. For the AI features, the [Claude Code](https://claude.com/claude-code) CLI signed in on the same machine (`claude -p` must work). Without it everything else still works and "Generate profile" falls back to a rule-based draft.

```bash
git clone https://github.com/eduwutzl/teamops.git
cd teamops
npm install
npm run build              # builds the web UI
TEAMOPS_DEMO=1 npm start   # first run creates fictional demo data
```

Open <http://127.0.0.1:8140> and sign in with `demo` / `demo`.

Without `TEAMOPS_DEMO=1`, the first run creates an `admin` user and prints a random password in the console.

## Configuration

Everything is set by environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `TEAMOPS_INSTANCE` | `../instance` | Folder with the SQLite database, secrets and project workspaces. **Never inside the repository.** |
| `TEAMOPS_HOST` / `TEAMOPS_PORT` | `127.0.0.1` / `8140` | Where the server listens |
| `TEAMOPS_DEMO` | unset | `1` seeds demo data on first run and shows the demo login |
| `TEAMOPS_CLAUDE_CMD` | `claude` | Claude Code executable |
| `TEAMOPS_AI_MODEL` | `sonnet` | Model used by the AI assists |
| `TEAMOPS_SCHEDULER` | on | `0` turns the internal scheduler off |
| `TEAMOPS_RUN_FULL_TOOLS` | unset | `1` lets scheduled work use every built-in tool the agent has. By default runs only get low-risk tools |
| `TEAMOPS_RUN_TIMEOUT_S` | `600` | Time limit of one run |
| `TEAMOPS_TOKEN_BUDGET_DAY` | unset | Daily token budget for the local capacity source |

TeamOps has no permission levels and is meant for a trusted network (localhost, VPN, tailnet). Do not expose it to the internet.

## Architecture

```
packages/
  core/      domain model, tool catalog, cron, diff, conflict analyzer (no I/O)
  adapters/  one adapter per engine + the Claude Code importer (read-only)
  server/    Fastify API, SQLite through Drizzle, scheduler, metric sources
  web/       React + Vite, shadcn/ui-style components (Radix + Tailwind), Recharts
examples/    demo MCP server
```

- **Database:** SQLite in WAL mode with `busy_timeout`. The Drizzle schema sticks to portable types (text, integer, JSON as text, ISO timestamps), so a PostgreSQL port is a driver change.
- **History:** every write stores a full snapshot in `revisions`. Diff and restore read from there; removing an item only hides it.
- **Adapters:** `claude-code` writes `.claude/agents/*.md`, `CLAUDE.md` and `.mcp.json` into `<instance>/workspaces/<project>/`. Secret values never leave the instance: generated files only carry `${VAR}` references.
- **Importer:** reads an existing Claude Code environment (`agents/*.md`, `CLAUDE.md`, `.mcp.json`) and creates drafts. It only reads; env values of MCP servers are discarded.
- **AI:** shells out to the local engine (`claude -p`). No API key, no paid API.
- **Metric sources:** `local` (this host + the usage TeamOps recorded) is the fallback. A Zabbix connection marked "use for capacity" replaces it; item keys for engine usage are configured per connection.
- **Secrets by reference:** a connection URL or token can be `file:/path/file.json#a.b.c`, so an instance reuses a credential that already lives elsewhere without copying it.

## Theme

All colours, radii and fonts live in [`packages/web/src/theme.css`](packages/web/src/theme.css): flat design, dark graphite + lime by default, with a secondary light theme.

## Development

```bash
npm run dev        # API with reload on :8140
npm run dev:web    # Vite dev server, proxies /api
npm test           # unit tests (node:test)
npm run typecheck
npm run db:generate   # after changing packages/server/src/db/schema.ts
```

## Roadmap

- OpenCode and Hermes adapters and runners
- MCP tools inside scheduled runs
- English interface (i18n)
- Skills and memory as managed entities
- PostgreSQL option

## License

[AGPL-3.0-only](LICENSE). If you run a modified TeamOps as a network service, you must offer its source to the users of that service. Dependencies are under permissive licenses (MIT, ISC, BSD, Apache-2.0 and similar), all compatible with the AGPL.
