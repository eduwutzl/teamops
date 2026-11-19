import type { Project, TeamState } from '@teamops/core';
import type { GeneratedFile } from './claude-code.ts';

/** Engine-neutral export: one JSON with everything the project needs. */
export function generateGeneric(state: TeamState, project: Project): GeneratedFile[] {
  const agents = state.agents.filter((a) => a.projectIds.includes(project.id));
  const data = {
    teamops: 2,
    corp: state.corp,
    project,
    groups: state.groups.filter((g) => agents.some((a) => a.groupId === g.id)),
    agents,
    rules: state.rules.filter((r) => r.projectId === null || r.projectId === project.id),
    tools: state.tools.filter((t) => agents.some((a) => a.tools.includes(t.key))),
    mcps: state.mcps.map(({ env, ...m }) => ({ ...m, env: Object.keys(env) })),
  };
  return [{ path: 'teamops.json', content: JSON.stringify(data, null, 2) + '\n' }];
}
