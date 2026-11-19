import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_ROOT } from './db/index.ts';

function readCommit(): string {
  if (process.env.TEAMOPS_COMMIT) return process.env.TEAMOPS_COMMIT.slice(0, 12);
  try {
    return execFileSync('git', ['-C', APP_ROOT, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim() || 'unknown';
  } catch { return 'unknown'; }
}
function readVersion(): string {
  try { return JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf8')).version ?? '0.0.0'; } catch { return '0.0.0'; }
}

/** Read once at startup: the code that is running, not the code on disk. */
export const VERSION = readVersion();
export const COMMIT = readCommit();
export const STARTED_AT = new Date().toISOString();
