// Applies pending database migrations and exits. Used by the deploy script before the restart.
import { INSTANCE, openDb } from './db/index.ts';

openDb();
console.log(`Migrations applied · instance ${INSTANCE}`);
