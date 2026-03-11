/**
 * Skills Framework - v0.2.0
 * 
 * Dynamic skill loading and execution system.
 * Part of Phase 4: Skills System
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  author?: string;
  tags: string[];
  entryPoint: string;
  config?: Record<string, unknown>;
  dependencies?: string[];
}

export interface SkillContext {
  workspace: string;
  userProfile?: Record<string, unknown>;
  memory?: Record<string, unknown>;
}

export interface SkillResult {
  success: boolean;
  output?: string;
  error?: string;
  artifacts?: string[];
}

export type SkillHandler = (args: Record<string, unknown>, context: SkillContext) => Promise<SkillResult>;

interface LoadedSkill extends Skill {
  handler?: SkillHandler;
  loaded: boolean;
  loadError?: string;
}

const SKILL_DIRS = [
  path.join(process.cwd(), ".0xkobold", "skills"),
  path.join(process.env.HOME || "~", ".0xkobold", "skills"),
];

class SkillRegistry {
  private skills: Map<string, LoadedSkill> = new Map();
  private builtinSkills: Map<string, SkillHandler> = new Map();

  constructor() {
    // Auto-register built-in skills from real-workers.ts
    this.registerBuiltinSkills();
  }

  /**
   * Register built-in worker skills
   */
  private async registerBuiltinSkills(): Promise<void> {
    const { 
      nextjsWorkerSkill,
      sqlWorkerSkill,
      apiWorkerSkill,
      testWorkerSkill,
      webResearchSkill
    } = await import("./builtin/real-workers.js");

    this.builtinSkills.set("nextjs-worker", nextjsWorkerSkill);
    this.builtinSkills.set("sql-worker", sqlWorkerSkill);
    this.builtinSkills.set("api-worker", apiWorkerSkill);
    this.builtinSkills.set("test-worker", testWorkerSkill);
    this.builtinSkills.set("web-research", webResearchSkill);

    console.log("[Skills] Registered 5 built-in worker skills");
  }

  /**
   * Register a built-in skill
   */
  registerBuiltin(skillId: string, handler: SkillHandler): void {
    this.builtinSkills.set(skillId, handler);
  }

  /**
   * Load skill from directory
   */
  async loadSkill(skillPath: string): Promise<LoadedSkill | null> {
    const manifestPath = path.join(skillPath, "skill.json");
    
    if (!existsSync(manifestPath)) {
      return null;
    }

    try {
      const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
      const skill: LoadedSkill = {
        ...manifest,
        loaded: false,
      };

      // Load entry point
      const entryPath = path.join(skillPath, skill.entryPoint);
      if (existsSync(entryPath)) {
        try {
          const module = await import(entryPath);
          skill.handler = module.default || module.execute;
          skill.loaded = true;
        } catch (error) {
          skill.loadError = `Failed to load entry point: ${error}`;
        }
      }

      this.skills.set(skill.id, skill);
      return skill;
    } catch (error) {
      console.error(`[Skills] Failed to load skill from ${skillPath}:`, error);
      return null;
    }
  }

  /**
   * Discover all available skills
   */
  async discoverSkills(): Promise<Skill[]> {
    const discovered: Skill[] = [];

    for (const dir of SKILL_DIRS) {
      if (!existsSync(dir)) continue;

      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillPath = path.join(dir, entry.name);
            const skill = await this.loadSkill(skillPath);
            if (skill) {
              discovered.push(skill);
            }
          }
        }
      } catch {
        // Directory doesn't exist or not readable
      }
    }

    return discovered;
  }

  /**
   * Execute a skill
   */
  async execute(
    skillId: string,
    args: Record<string, unknown> = {},
    context: SkillContext
  ): Promise<SkillResult> {
    // Check built-in skills first
    const builtin = this.builtinSkills.get(skillId);
    if (builtin) {
      return builtin(args, context);
    }

    // Check loaded skills
    const skill = this.skills.get(skillId);
    if (!skill) {
      return {
        success: false,
        error: `Skill not found: ${skillId}`,
      };
    }

    if (!skill.loaded || !skill.handler) {
      return {
        success: false,
        error: `Skill not loaded: ${skillId}${skill.loadError ? ` (${skill.loadError})` : ""}`,
      };
    }

    try {
      return await skill.handler(args, context);
    } catch (error) {
      return {
        success: false,
        error: `Skill execution failed: ${error}`,
      };
    }
  }

  /**
   * Get loaded skill info
   */
  getSkill(skillId: string): Skill | undefined {
    return this.skills.get(skillId);
  }

  /**
   * List all loaded skills (including built-ins)
   */
  listSkills(): Array<Skill & { builtin?: boolean }> {
    const loaded = Array.from(this.skills.values());
    const builtins = Array.from(this.builtinSkills.keys()).map(id => ({
      id,
      name: id,
      description: "Built-in skill",
      version: "0.2.0",
      tags: ["builtin"],
      entryPoint: "builtin",
      builtin: true,
    }));
    return [...loaded, ...builtins as unknown as Skill[]];
  }

  /**
   * Check if skill exists
   */
  hasSkill(skillId: string): boolean {
    return this.skills.has(skillId) || this.builtinSkills.has(skillId);
  }

  /**
   * Get built-in skill names
   */
  getBuiltinSkills(): string[] {
    return Array.from(this.builtinSkills.keys());
  }
}

// Singleton registry
let registry: SkillRegistry | null = null;

export function getSkillRegistry(): SkillRegistry {
  if (!registry) {
    registry = new SkillRegistry();
  }
  return registry;
}

export function resetSkillRegistry(): void {
  registry = null;
}

/**
 * Install skill from source
 */
export async function installSkill(
  source: string,
  targetDir?: string
): Promise<{ success: boolean; message: string }> {
  const skillsDir = targetDir || SKILL_DIRS[1];
  
  try {
    // Create skills directory if needed
    await fs.mkdir(skillsDir, { recursive: true });

    // TODO(v0.5.1): Clone from git, extract from tarball, etc.
    // For now, assume source is a local path
    const skillName = path.basename(source);
    const targetPath = path.join(skillsDir, skillName);

    if (existsSync(targetPath)) {
      return { success: false, message: `Skill ${skillName} already installed` };
    }

    // Simple copy for now
    await fs.mkdir(targetPath, { recursive: true });
    const files = await fs.readdir(source);
    
    for (const file of files) {
      const src = path.join(source, file);
      const dest = path.join(targetPath, file);
      await fs.copyFile(src, dest);
    }

    return { success: true, message: `Installed ${skillName} to ${targetPath}` };
  } catch (error) {
    return { success: false, message: `Installation failed: ${error}` };
  }
}

/**
 * Get skill marketplace (curated list)
 */
export function getSkillMarketplace(): Array<{
  id: string;
  name: string;
  description: string;
  author: string;
  tags: string[];
}> {
  return [
    {
      id: "nextjs-worker",
      name: "Next.js Worker",
      description: "React/Next.js specialist (built-in)",
      author: "0xKobold",
      tags: ["frontend", "react", "nextjs", "builtin"],
    },
    {
      id: "sql-worker",
      name: "SQL Worker",
      description: "Database optimization (built-in)",
      author: "0xKobold",
      tags: ["database", "sql", "optimization", "builtin"],
    },
    {
      id: "api-worker",
      name: "API Worker",
      description: "API design specialist (built-in)",
      author: "0xKobold",
      tags: ["api", "design", "rest", "builtin"],
    },
    {
      id: "test-worker",
      name: "Test Worker",
      description: "Test generation (built-in)",
      author: "0xKobold",
      tags: ["testing", "automation", "builtin"],
    },
    {
      id: "web-research",
      name: "Web Research",
      description: "Research specialist (built-in)",
      author: "0xKobold",
      tags: ["research", "web", "builtin"],
    },
  ];
}

export default getSkillRegistry;
