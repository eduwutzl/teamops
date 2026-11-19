#!/usr/bin/env node
// Consistent copy of the instance database (SQLite online backup), with retention.
//   node scripts/backup-db.mjs [--instance DIR] [--label daily] [--keep 14]
//   node scripts/backup-db.mjs --restore FILE [--instance DIR]     (service must be stopped)
// Backups go to <instance>/backups/<label>-YYYYMMDD-HHMMSS.sqlite. Prints the file path on the last line.
import Database from 'better-sqlite3';
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const instance = resolve(opt('instance', process.env.TEAMOPS_INSTANCE ?? join(root, '..', 'instance')));
const dbFile = join(instance, 'teamops.sqlite');
const dir = join(instance, 'backups');
const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
const check = (file) => { const db = new Database(file, { readonly: true }); try { const r = db.pragma('integrity_check', { simple: true }); if (r !== 'ok') throw new Error(`integrity_check: ${r}`); } finally { db.close(); } };

mkdirSync(dir, { recursive: true, mode: 0o700 });

const restore = opt('restore', null);
if (restore) {
  const src = resolve(restore);
  check(src);
  if (existsSync(dbFile)) {
    // Nothing is deleted: the database being replaced is kept next to the backups.
    const keep = join(dir, `prerestore-${stamp()}.sqlite`);
    const live = new Database(dbFile);
    try { await live.backup(keep); } finally { live.close(); }
    for (const ext of ['', '-wal', '-shm']) if (existsSync(dbFile + ext)) rmSync(dbFile + ext);
    console.log(`Kept the replaced database at ${keep}`);
  }
  copyFileSync(src, dbFile);
  console.log(`Restored ${src}`);
  process.exit(0);
}

if (!existsSync(dbFile)) { console.log('No database yet, nothing to back up.'); process.exit(0); }
const label = opt('label', 'daily').replace(/[^a-z0-9_-]/gi, '') || 'daily';
const keep = Math.max(1, Number(opt('keep', 14)) || 14);
const out = join(dir, `${label}-${stamp()}.sqlite`);
const tmp = `${out}.tmp`;
const db = new Database(dbFile, { fileMustExist: true });
try { db.pragma('busy_timeout = 5000'); await db.backup(tmp); } finally { db.close(); }
// The copy inherits WAL mode: turn it into a single self-contained file before publishing it.
const copy = new Database(tmp);
try { copy.pragma('journal_mode = DELETE'); } finally { copy.close(); }
check(tmp);
for (const ext of ['-wal', '-shm']) rmSync(tmp + ext, { force: true });
renameSync(tmp, out);

const mine = readdirSync(dir).filter((f) => f.startsWith(`${label}-`) && f.endsWith('.sqlite')).sort();
for (const old of mine.slice(0, Math.max(0, mine.length - keep))) rmSync(join(dir, old));
console.log(`Backup ok · ${statSync(out).size} bytes · kept ${Math.min(mine.length, keep)} "${label}"`);
console.log(out);
