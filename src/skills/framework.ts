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
   * List all loaded skills
   */
  listSkills(): Skill[] {
    return Array.from(this.skills.values());
  }

  /**
   * Check if skill exists
   */
  hasSkill(skillId: string): boolean {
    return this.skills.has(skillId) || this.builtinSkills.has(skillId);
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

    // TODO: Clone from git, extract from tarball, etc.
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
      id: "web-research",
      name: "Web Research",
      description: "Advanced web scraping with Playwright",
      author: "0xKobold",
      tags: ["research", "web", "scraping"],
    },
    {
      id: "git-operations",
      name: "Git Operations",
      description: "Advanced git workflows and analysis",
      author: "0xKobold",
      tags: ["git", "version-control"],
    },
    {
      id: "test-generation",
      name: "Test Generation",
      description: "Auto-generate tests from code",
      author: "0xKobold",
      tags: ["testing", "automation"],
    },
    {
      id: "doc-generation",
      name: "Documentation",
      description: "Generate documentation from code",
      author: "0xKobold",
      tags: ["docs", "documentation"],
    },
  ];
}

export default getSkillRegistry;
