/**
 * Skill Types
 *
 * Core skill interface for the hot-reload skill system.
 * Skills are plain .ts files that export a Skill object.
 */

/**
 * Risk level for a skill
 * - safe: No approval needed (e.g., math, string manipulation)
 * - medium: Confirmation for write operations (e.g., file write, web requests)
 * - high: Explicit approval for dangerous operations (e.g., shell, delete)
 */
export type RiskLevel = 'safe' | 'medium' | 'high';

/**
 * Tool definition in OpenAI-compatible format
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/**
 * Skill interface - plain object that can be exported from a .ts file
 */
export interface Skill {
  /** Unique name for the skill (used as tool name) */
  name: string;

  /** Human-readable description (shown to LLM) */
  description: string;

  /** Tool definition for LLM function calling */
  toolDefinition: ToolDefinition;

  /** Risk level for approval queue */
  risk: RiskLevel;

  /** Execute the skill */
  execute(args: Record<string, unknown>): Promise<unknown>;
}

/**
 * Skill module - what's exported from a skill file
 */
export interface SkillModule {
  default?: Skill | Skill[];
  skill?: Skill | Skill[];
  [key: string]: Skill | Skill[] | undefined;
}

/**
 * Skill registry entry
 */
export interface SkillEntry {
  name: string;
  skill: Skill;
  source: string; // file path
  loadedAt: Date;
  hotReload: boolean;
}
