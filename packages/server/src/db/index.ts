import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = resolve(here, '../../../..');
/** Instance data lives outside the repository: database, workspaces, secrets. */
export const INSTANCE = resolve(process.env.TEAMOPS_INSTANCE ?? join(APP_ROOT, '..', 'instance'));

export function openDb(file = join(INSTANCE, 'teamops.sqlite')) {
  mkdirSync(dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: resolve(here, '../../drizzle') });
  return db;
}

export type Db = ReturnType<typeof openDb>;
export { schema };
