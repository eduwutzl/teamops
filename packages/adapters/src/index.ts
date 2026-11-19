import type { Project, TeamState } from '@teamops/core';
import { generateClaudeCode, type GeneratedFile } from './claude-code.ts';
import { generateGeneric } from './generic.ts';

export * from './claude-code.ts';
export * from './generic.ts';
export * from './importer.ts';

export interface Adapter { id: string; label: string; generate(state: TeamState, project: Project): GeneratedFile[] }

export const ADAPTERS: Adapter[] = [
  { id: 'claude-code', label: 'Claude Code', generate: generateClaudeCode },
  { id: 'generic', label: 'JSON genérico', generate: generateGeneric },
];
