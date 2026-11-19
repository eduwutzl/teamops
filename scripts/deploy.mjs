#!/usr/bin/env node
// TeamOps deploy: one command, every setup.
//   teamops-deploy ["commit message"]   test, commit, scan, push, then update each target in order
//   teamops-deploy --status             version running on each setup
//   teamops-deploy --rollback           put the targets of the last deploy back on the previous version
// Targets and the list of forbidden terms live OUTSIDE the repository, in a JSON config:
//   $TEAMOPS_DEPLOY_CONFIG or ~/.config/teamops/deploy.json   (see scripts/deploy.example.json)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith('--')));
const message = argv.find((a) => !a.startsWith('--')) ?? '';
const home = (p) => (p?.startsWith('~/') ? join(homedir(), p.slice(2)) : p);
const CONFIG = home(process.env.TEAMOPS_DEPLOY_CONFIG ?? '~/.config/teamops/deploy.json');
const STATE = join(dirname(CONFIG), 'deploy-last.json');
const LOCK = join(dirname(CONFIG), 'deploy.lock');

const OK = '✅', BAD = '❌';
const secs = (ms) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`);
const say = (s = '') => console.log(s);
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const tail = (text, n = 12) => text.trim().split('\n').slice(-n).map((l) => `      ${l}`).join('\n');

class Stop extends Error {}
/** Ends the run with a clear message. Nothing after this point is executed. */
function stop(what, detail = '', after = '') {
  say(`  ${BAD} ${what}`);
  if (detail.trim()) say(tail(detail));
  if (after) say(`\n${after}`);
  throw new Stop(what);
}

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}`, stdout: (r.stdout ?? '').trim() };
}

function loadConfig() {
  if (!existsSync(CONFIG)) {
    say(`${BAD} Falta a configuração do deploy: ${CONFIG}`);
    say('   Copie scripts/deploy.example.json para lá e ajuste os alvos. Nada foi feito.');
    process.exit(2);
  }
  const c = JSON.parse(readFileSync(CONFIG, 'utf8'));
  c.branch ??= 'main'; c.remote ??= 'origin';
  c.author ??= { name: 'TeamOps', email: 'teamops@localhost' };
  c.checks ??= [{ name: 'typecheck', cmd: 'npm run -s typecheck' }, { name: 'testes', cmd: 'npm test' }];
  if (!c.dev || !Array.isArray(c.targets) || !c.targets.length) { say(`${BAD} ${CONFIG}: faltam "dev" e "targets".`); process.exit(2); }
  for (const t of c.targets) for (const k of ['name', 'app', 'instance', 'service', 'health']) if (!t[k]) { say(`${BAD} ${CONFIG}: alvo sem "${k}".`); process.exit(2); }
  return c;
}

// ---------- scan for internal data ----------
// Generic rules that hold for any project. Project-specific words come from the terms file (outside git).
const BUILTIN = [
  ['IP privado', /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01])|100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\.\d{1,3}\.\d{1,3}\b/],
  ['chave privada', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['token', /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,}|AKIA[0-9A-Z]{16}|xox[abpr]-[A-Za-z0-9-]{10,}|glpat-[A-Za-z0-9_-]{20,})/],
];
function loadRules(c) {
  const rules = BUILTIN.map(([name, re]) => ({ name, re }));
  const file = home(c.forbiddenTerms ?? join(dirname(CONFIG), 'forbidden-terms.txt'));
  if (!existsSync(file)) return { rules, file: null };
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    rules.push(line.startsWith('re:') ? { name: 'termo proibido', re: new RegExp(line.slice(3), 'i') } : { name: 'termo proibido', re: new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });
  }
  return { rules, file };
}
function scanText(rules, text, where, hits) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length && hits.length < 20; i++) for (const r of rules) if (r.re.test(lines[i])) { hits.push(`${where}:${i + 1} (${r.name})`); break; }
}
/** Scans everything that would be published: the staged tree, plus the diff and messages of unpushed commits. */
function scan(c, git, extraMessage) {
  const { rules, file } = loadRules(c);
  const hits = [];
  const files = git(['ls-files', '-z', '--cached']).stdout.split('\0').filter(Boolean);
  for (const f of files) {
    const r = spawnSync('git', ['-C', c.dev, 'show', `:${f}`], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0 || r.stdout.subarray(0, 8000).includes(0)) continue; // unreadable or binary
    scanText(rules, f, `${f} (nome do arquivo)`, hits);
    scanText(rules, r.stdout.toString('utf8'), f, hits);
  }
  const range = `${c.remote}/${c.branch}..HEAD`;
  scanText(rules, git(['log', '-p', '--format=%an <%ae>%n%cn <%ce>%n%B', range]).stdout, 'commits ainda não publicados', hits);
  if (extraMessage) scanText(rules, extraMessage, 'mensagem do commit', hits);
  return { hits, files: files.length, terms: rules.length - BUILTIN.length, file };
}

// ---------- targets ----------
const prelude = (t) => `set -euo pipefail
export XDG_RUNTIME_DIR="\${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
${t.path ? `export PATH=${q(t.path)}:"$PATH"` : ''}
export TEAMOPS_INSTANCE=${q(t.instance)}
step() { echo "@@STEP $*"; }
step "abrir a pasta do setup"
cd ${q(t.app)}
`;
function onTarget(t, script) {
  const full = prelude(t) + script;
  const r = t.ssh
    ? spawnSync('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', t.ssh, 'bash -s'], { input: full, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    : spawnSync('bash', ['-s'], { input: full, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  const vars = Object.fromEntries([...out.matchAll(/^@@(\w+)=(.*)$/gm)].map((m) => [m[1], m[2]]));
  const steps = [...out.matchAll(/^@@STEP (.*)$/gm)].map((m) => m[1]);
  return { ok: r.status === 0, out: out.replace(/^@@.*\n?/gm, ''), vars, step: steps.at(-1) ?? 'conexão' };
}

async function health(t, expect, waitMs = 0) {
  const until = Date.now() + waitMs;
  let last = 'sem resposta';
  for (;;) {
    try {
      const r = await fetch(t.health, { signal: AbortSignal.timeout(5000) });
      const j = await r.json();
      if (r.ok && j.status === 'ok' && (!expect || j.commit === expect)) return { ok: true, ...j };
      last = !r.ok || j.status !== 'ok' ? `respondeu ${r.status} (${j.status ?? '?'})` : `ainda na versão ${j.commit}, esperada ${expect}`;
    } catch (e) { last = `sem resposta em ${t.health}`; }
    if (Date.now() >= until) return { ok: false, why: last };
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const UPDATE = (c, t) => `
step "ler a versão atual"
old=$(git rev-parse --short HEAD); echo "@@OLD=$old"
step "baixar do repositório"
git fetch --quiet ${q(c.remote)} ${q(c.branch)}
new=$(git rev-parse --short ${q(`${c.remote}/${c.branch}`)}); echo "@@NEW=$new"
if [ "$old" = "$new" ] && [ -d node_modules ] && [ -d packages/web/dist ]; then echo "@@SAME=1"; exit 0; fi
back() { code=$?; echo "@@REVERTED=1"; git reset --hard --quiet "$old" || true; npm run -s build >/dev/null 2>&1 || true; exit $code; }
trap back ERR
lock_before=$(git rev-parse HEAD:package-lock.json 2>/dev/null || echo none)
git reset --hard --quiet ${q(`${c.remote}/${c.branch}`)}
step "instalar dependências"
if [ ! -d node_modules ] || [ "$lock_before" != "$(git rev-parse HEAD:package-lock.json)" ]; then npm ci --no-audit --no-fund 2>&1 | tail -5; fi
step "montar a interface"
npm run -s build 2>&1 | tail -15
${t.backup === false ? '' : `step "backup do banco"
b=$(node scripts/backup-db.mjs --label predeploy --keep ${Number(t.keepBackups ?? 10)} | tail -1); case "$b" in /*) echo "@@BACKUP=$b";; esac`}
step "migrar o banco"
npm run -s db:migrate
trap - ERR
step "reiniciar o serviço"
systemctl --user restart ${q(t.service)}
`;

const ROLLBACK = (t, prev, backup) => `
step "parar o serviço"
systemctl --user stop ${q(t.service)}
${backup ? `step "restaurar o banco"
node scripts/backup-db.mjs --restore ${q(backup)}` : ''}
step "voltar o código"
lock_before=$(git rev-parse HEAD:package-lock.json 2>/dev/null || echo none)
git reset --hard --quiet ${q(prev)}
step "instalar dependências"
if [ "$lock_before" != "$(git rev-parse HEAD:package-lock.json 2>/dev/null || echo none)" ]; then npm ci --no-audit --no-fund 2>&1 | tail -5; fi
step "montar a interface"
npm run -s build 2>&1 | tail -15
step "iniciar o serviço"
systemctl --user start ${q(t.service)}
`;

const label = (t) => t.label ?? t.name;
const rest = (c, i) => c.targets.slice(i + 1).map(label);
const untouched = (c, i) => (rest(c, i).length ? `Não foi tocado: ${rest(c, i).join(', ')}.` : '');

// ---------- commands ----------
async function status(c) {
  say('TeamOps · versão de cada setup');
  const git = (a) => sh('git', ['-C', c.dev, ...a]);
  git(['fetch', '--quiet', c.remote, c.branch]);
  const dirty = git(['status', '--porcelain']).stdout.split('\n').filter(Boolean).length;
  const ahead = Number(git(['rev-list', '--count', `${c.remote}/${c.branch}..HEAD`]).stdout || 0);
  const pend = [dirty ? `${dirty} arquivo(s) alterado(s)` : '', ahead ? `${ahead} commit(s) sem publicar` : ''].filter(Boolean).join(', ');
  say(`  ${pend ? '✏️ ' : OK} desenvolvimento: ${git(['rev-parse', '--short', 'HEAD']).stdout}${pend ? ` (${pend}; rode teamops-deploy)` : ' (nada a publicar)'}`);
  say(`  ${OK} repositório (${c.branch}): ${git(['rev-parse', '--short', `${c.remote}/${c.branch}`]).stdout}`);
  let bad = 0;
  for (const t of c.targets) {
    const h = await health(t);
    if (h.ok) say(`  ${OK} ${label(t)}: ${h.commit} (v${h.version}, no ar há ${secs(h.uptimeS * 1000)}) · ${t.health.replace(/\/health$/, '')}`);
    else { bad++; say(`  ${BAD} ${label(t)}: ${h.why}`); }
  }
  if (existsSync(STATE)) {
    const s = JSON.parse(readFileSync(STATE, 'utf8'));
    say(`  Último deploy: ${s.at} · ${s.result}${s.rolledBack ? ' · desfeito com --rollback' : ''}`);
  }
  return bad ? 1 : 0;
}

async function rollback(c) {
  if (!existsSync(STATE)) { say(`${BAD} Não há deploy anterior registrado. Nada foi feito.`); return 1; }
  const s = JSON.parse(readFileSync(STATE, 'utf8'));
  const done = (s.targets ?? []).filter((x) => x.updated);
  if (s.rolledBack || !done.length) { say(`${BAD} O último deploy (${s.at}) ${s.rolledBack ? 'já foi desfeito' : 'não mudou nenhum setup'}. Nada foi feito.`); return 1; }
  say(`TeamOps · rollback do deploy de ${s.at}`);
  for (const x of done.reverse()) {
    const t = c.targets.find((y) => y.name === x.name);
    if (!t) stop(`${x.name}: alvo não está mais na configuração`);
    const t0 = Date.now();
    const r = onTarget(t, ROLLBACK(t, x.previous, x.backup));
    if (!r.ok) stop(`${label(t)}: o rollback falhou em "${r.step}"`, r.out, 'Parei aqui. Veja o erro acima; o serviço deste setup pode estar parado.');
    const h = await health(t, x.previous, 90_000);
    if (!h.ok) stop(`${label(t)}: voltou o código, mas a saúde falhou (${h.why})`, '', 'Parei aqui.');
    say(`  ${OK} ${label(t)}: ${x.current} → ${x.previous}${x.backup ? ', banco restaurado do backup' : ''}, saudável (${secs(Date.now() - t0)})`);
  }
  s.rolledBack = new Date().toLocaleString('pt-BR');
  writeFileSync(STATE, JSON.stringify(s, null, 2));
  say(`\n${OK} Rollback concluído. O repositório continua na versão nova: corrija o código e rode teamops-deploy de novo.`);
  return 0;
}

async function deploy(c) {
  const started = Date.now();
  const all = c.targets.map(label).join(', ');
  const git = (a) => sh('git', ['-C', c.dev, ...a]);
  const total = c.targets.length + 1;
  say(`TeamOps · deploy · ${new Date().toLocaleString('pt-BR')}`);

  // 1. development copy: test, scan, commit, push
  say(`1/${total} Desenvolvimento → repositório`);
  const none = `Nenhum setup foi tocado (${all}).`;
  if (git(['rev-parse', '--abbrev-ref', 'HEAD']).stdout !== c.branch) stop(`a cópia de desenvolvimento não está no ramo ${c.branch}`, '', none);
  const f = git(['fetch', '--quiet', c.remote, c.branch]);
  if (!f.ok) stop('não consegui falar com o repositório', f.out, none);
  if (Number(git(['rev-list', '--count', `HEAD..${c.remote}/${c.branch}`]).stdout || 0) > 0) stop('o repositório tem commits que a cópia de desenvolvimento não tem', '', `Atualize a cópia de desenvolvimento antes. ${none}`);
  const dirty = git(['status', '--porcelain']).stdout.split('\n').filter(Boolean).length;
  const ahead = Number(git(['rev-list', '--count', `${c.remote}/${c.branch}..HEAD`]).stdout || 0);
  if (!dirty && !ahead) say(`  ${OK} sem mudança no código (${git(['rev-parse', '--short', 'HEAD']).stdout})`);
  else {
    for (const k of c.checks) {
      const t0 = Date.now();
      const r = sh('bash', ['-c', k.cmd], { cwd: c.dev });
      if (!r.ok) stop(`${k.name} falhou`, r.out, `Nada foi publicado. ${none}`);
      say(`  ${OK} ${k.name} (${secs(Date.now() - t0)})`);
    }
    const msg = message || `Update ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    if (dirty) git(['add', '-A']);
    const t0 = Date.now();
    const s = scan(c, git, msg);
    if (s.hits.length) {
      if (dirty) git(['reset', '-q']);
      stop(`varredura de dado interno: ${s.hits.length} ocorrência(s)`, s.hits.join('\n'), `Tire o dado interno do código e rode de novo. Nada foi publicado. ${none}`);
    }
    say(`  ${OK} varredura de dado interno: limpo (${s.files} arquivos, ${s.terms} termos${s.file ? '' : ', só regras genéricas: falta o arquivo de termos'}; ${secs(Date.now() - t0)})`);
    const id = ['-c', `user.name=${c.author.name}`, '-c', `user.email=${c.author.email}`];
    if (dirty) {
      const r = sh('git', ['-C', c.dev, ...id, 'commit', '-q', '-m', msg, `--author=${c.author.name} <${c.author.email}>`]);
      if (!r.ok) stop('o commit falhou', r.out, none);
    }
    const who = git(['log', '--format=%ae%n%ce', `${c.remote}/${c.branch}..HEAD`]).stdout.split('\n').filter((e) => e && e !== c.author.email);
    if (who.length) stop(`há commit com autor diferente de ${c.author.email}`, [...new Set(who)].join('\n'), `Nada foi publicado. ${none}`);
    const p = git(['push', '--quiet', c.remote, `HEAD:${c.branch}`]);
    if (!p.ok) stop('o push falhou', p.out, `O commit ficou só na cópia de desenvolvimento. ${none}`);
    say(`  ${OK} publicado: ${git(['rev-parse', '--short', 'HEAD']).stdout} "${git(['log', '-1', '--format=%s']).stdout}"`);
  }
  const want = git(['rev-parse', '--short', 'HEAD']).stdout;

  // 2..n. targets, in order; stop at the first failure
  const state = { at: new Date().toLocaleString('pt-BR'), commit: want, result: 'em andamento', targets: [] };
  const save = () => writeFileSync(STATE, JSON.stringify(state, null, 2));
  for (const [i, t] of c.targets.entries()) {
    say(`${i + 2}/${total} ${label(t)}`);
    const t0 = Date.now();
    const r = onTarget(t, UPDATE(c, t));
    const rec = { name: t.name, previous: r.vars.OLD ?? null, current: r.vars.NEW ?? null, backup: r.vars.BACKUP ?? null, updated: r.ok && !r.vars.SAME };
    state.targets.push(rec);
    if (!r.ok) {
      state.result = `falhou em ${label(t)}`; rec.updated = false; save();
      stop(`${label(t)}: falhou em "${r.step}"`, r.out, [r.vars.REVERTED ? `${label(t)} continua na versão ${r.vars.OLD} (código devolvido, serviço não reiniciado).` : '', untouched(c, i)].filter(Boolean).join(' '));
    }
    const h = await health(t, want, 90_000);
    if (!h.ok) {
      state.result = `saúde falhou em ${label(t)}`; save();
      stop(`${label(t)}: atualizou, mas a saúde falhou (${h.why})`, '', [untouched(c, i), rec.updated ? 'Para voltar à versão anterior: teamops-deploy --rollback' : ''].filter(Boolean).join(' '));
    }
    say(`  ${OK} ${label(t)}: ${r.vars.SAME ? `já estava em ${want}` : `${r.vars.OLD} → ${r.vars.NEW}${rec.backup ? ', backup do banco feito' : ''}`}, saudável (${secs(Date.now() - t0)})`);
    save();
  }
  state.result = `ok, todos em ${want}`; save();
  say(`\n${OK} Deploy concluído em ${secs(Date.now() - started)}. Todos os setups em ${want}.`);
  return 0;
}

// ---------- main ----------
if (flags.has('--help') || flags.has('-h')) {
  say('teamops-deploy ["mensagem do commit"]   testa, publica e atualiza todos os setups, em ordem');
  say('teamops-deploy --status                 mostra a versão de cada setup');
  say('teamops-deploy --rollback               volta os setups do último deploy à versão anterior (com o banco)');
  process.exit(0);
}
const unknown = [...flags].filter((x) => !['--status', '--rollback'].includes(x));
if (unknown.length) { say(`${BAD} Opção desconhecida: ${unknown.join(' ')}. Use --status, --rollback ou nada.`); process.exit(2); }
const config = loadConfig();
let code = 1, locked = false;
try {
  if (flags.has('--status')) code = await status(config);
  else {
    mkdirSync(dirname(LOCK), { recursive: true });
    try { process.kill(Number(readFileSync(LOCK, 'utf8')), 0); } catch { rmSync(LOCK, { force: true }); } // stale lock of a dead run
    try { writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); locked = true; } catch { say(`${BAD} Já existe um deploy em andamento (${LOCK}). Nada foi feito.`); process.exit(1); }
    code = flags.has('--rollback') ? await rollback(config) : await deploy(config);
  }
} catch (e) {
  if (!(e instanceof Stop)) { say(`${BAD} Erro inesperado: ${e.message}`); }
  code = 1;
} finally { if (locked) rmSync(LOCK, { force: true }); }
process.exit(code);
