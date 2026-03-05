/**
 * Skills Module
 *
 * Hot-reload skill system with built-in skills.
 */

// Re-export types separately to avoid conflicts
export type { Skill, SkillEntry, SkillModule, RiskLevel, ToolDefinition } from './types';
export { skillRegistry, getSkillRegistry, initSkills, reloadSkills } from './loader';

// Built-in skills
export { subagentSkill } from './builtin/subagent';
export { shellSkill } from './builtin/shell';
export { readFileSkill, writeFileSkill, listFilesSkill } from './builtin/file';
