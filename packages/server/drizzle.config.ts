import { defineConfig } from 'drizzle-kit';

export default defineConfig({ dialect: 'sqlite', schema: './packages/server/src/db/schema.ts', out: './packages/server/drizzle' });
