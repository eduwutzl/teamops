import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { BUILTIN_TOOLS } from '@teamops/core';
import { buildApp, hashPassword } from './app.ts';
import { INSTANCE, openDb, schema } from './db/index.ts';
import { Runner } from './runner.ts';
import { seedDemo } from './seed.ts';
import { Store } from './store.ts';
import { COMMIT, VERSION } from './version.ts';

const store = new Store(openDb());

if (!store.list('users', true).length) {
  if (process.env.TEAMOPS_DEMO === '1') {
    seedDemo(store);
    console.log('Demo data created. Sign in with demo / demo.');
  } else {
    // First user: TEAMOPS_ADMIN_USER / TEAMOPS_ADMIN_NAME, password read from TEAMOPS_ADMIN_PASSWORD_FILE
    // (never printed). Without a password file a random one is printed once.
    const username = (process.env.TEAMOPS_ADMIN_USER ?? 'admin').trim() || 'admin';
    const file = process.env.TEAMOPS_ADMIN_PASSWORD_FILE;
    const fromFile = file ? readFileSync(file, 'utf8').trim() : '';
    if (file && fromFile.length < 12) throw new Error('TEAMOPS_ADMIN_PASSWORD_FILE must hold a password of at least 12 characters.');
    const password = fromFile || randomBytes(9).toString('base64url');
    const sys = { id: null, name: 'sistema' };
    const u = store.create('users', { username, name: process.env.TEAMOPS_ADMIN_NAME ?? (username === 'admin' ? 'Admin' : username), active: true }, sys);
    store.db.update(schema.users).set({ passwordHash: hashPassword(password) }).where(eq(schema.users.id, u.id)).run();
    for (const t of BUILTIN_TOOLS) store.create('tools', { ...t, source: 'builtin' }, sys);
    console.log(fromFile ? `First run. User ${username} created with the password from the password file.` : `First run. Sign in with ${username} / ${password} and change the password.`);
  }
}

const runner = new Runner(store);
const app = buildApp(store, runner);
const host = process.env.TEAMOPS_HOST ?? '127.0.0.1';
const port = Number(process.env.TEAMOPS_PORT ?? 8140);
await app.listen({ host, port });
if (process.env.TEAMOPS_SCHEDULER !== '0') runner.start();
console.log(`TeamOps ${VERSION} (${COMMIT}) on http://${host}:${port} · instance ${INSTANCE}`);

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { runner.stop(); app.close().finally(() => process.exit(0)); });
