/**
 * Skill Manage Tool - v0.1.0
 * 
 * Hermes-style skill self-improvement:
 * - create: New skill from scratch
 * - patch: Targeted fixes (preferred)
 * - edit: Major structural rewrites
 * - write_file: Add/update supporting files
 * - remove_file: Remove supporting files
 * 
 * Based on Hermes skill_manage tool
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

/**
 * Skill manage actions
 */
export type SkillManageAction = 
  | "create"
  | "patch"
  | "edit"
  | "write_file"
  | "remove_file"
  | "delete"
  | "view";

/**
 * Skill manage parameters
 */
export interface SkillManageParams {
  action: SkillManageAction;
  name: string;
  content?: string;
  old_string?: string;
  new_string?: string;
  file_path?: string;
  file_content?: string;
  category?: string;
}

/**
 * Skill manage result
 */
export interface SkillManageResult {
  success: boolean;
  message: string;
  skill_path?: string;
  file_path?: string;
  error?: string;
}

/**
 * Skill frontmatter
 */
export interface SkillFrontmatter {
  name: string;
  description: string;
  version?: string;
  author?: string;
  tags?: string[];
  platforms?: string[];
  metadata?: Record<string, unknown>;
  setup?: {
    help?: string;
    collect_secrets?: Array<{
      env_var: string;
      prompt: string;
      secret?: boolean;
      provider_url?: string;
    }>;
  };
  required_environment_variables?: string[];
  fallback_for_toolsets?: string[];
  requires_toolsets?: string[];
}

const SKILLS_DIR = path.join(homedir(), ".0xkobold", "skills");

/**
 * Get skill directory path
 */
function getSkillPath(name: string): string {
  return path.join(SKILLS_DIR, name);
}

/**
 * Get SKILL.md path
 */
function getSkillFilePath(name: string): string {
  return path.join(getSkillPath(name), "SKILL.md");
}

/**
 * Ensure skills directory exists
 */
async function ensureSkillsDir(): Promise<void> {
  if (!existsSync(SKILLS_DIR)) {
    await fs.mkdir(SKILLS_DIR, { recursive: true });
  }
}

/**
 * Parse YAML frontmatter from SKILL.md
 */
function parseFrontmatter(content: string): { frontmatter: SkillFrontmatter; body: string } {
  const frontmatter: SkillFrontmatter = {
    name: "",
    description: "",
  };
  let body = content;

  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (match) {
    const [, yaml, contentBody] = match;
    body = contentBody;

    // Parse YAML
    for (const line of yaml.split("\n")) {
      const colonIndex = line.indexOf(":");
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      // Handle different value types
      if (value.startsWith("[") && value.endsWith("]")) {
        // Array
        frontmatter[key] = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""));
      } else if (value === "true" || value === "false") {
        frontmatter[key] = value === "true";
      } else {
        frontmatter[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  }

  return { frontmatter, body };
}

/**
 * Create YAML frontmatter
 */
function createFrontmatter(frontmatter: SkillFrontmatter): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`name: ${frontmatter.name}`);
  lines.push(`description: ${frontmatter.description}`);
  
  if (frontmatter.version) {
    lines.push(`version: ${frontmatter.version}`);
  }
  if (frontmatter.author) {
    lines.push(`author: ${frontmatter.author}`);
  }
  if (frontmatter.tags && frontmatter.tags.length > 0) {
    lines.push(`tags: [${frontmatter.tags.join(", ")}]`);
  }
  if (frontmatter.platforms && frontmatter.platforms.length > 0) {
    lines.push(`platforms: [${frontmatter.platforms.join(", ")}]`);
  }
  if (frontmatter.metadata) {
    lines.push("metadata:");
    for (const [key, value] of Object.entries(frontmatter.metadata)) {
      if (typeof value === "object") {
        lines.push(`  ${key}:`);
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          lines.push(`    ${k}: ${v}`);
        }
      } else {
        lines.push(`  ${key}: ${value}`);
      }
    }
  }
  
  lines.push("---");
  return lines.join("\n");
}

/**
 * Escape regex special characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Skill manage tool implementation
 */
export async function skillManage(params: SkillManageParams): Promise<SkillManageResult> {
  const { action, name } = params;

  // Validate skill name
  if (!name || !/^[a-z0-9_-]+$/i.test(name)) {
    return {
      success: false,
      message: `Invalid skill name: ${name}. Use alphanumeric characters, hyphens, and underscores.`,
    };
  }

  await ensureSkillsDir();

  const skillPath = getSkillPath(name);
  const skillFile = getSkillFilePath(name);

  switch (action) {
    case "create":
      return await createSkill(params, skillPath, skillFile);

    case "patch":
      return await patchSkill(params, skillFile);

    case "edit":
      return await editSkill(params, skillFile);

    case "write_file":
      return await writeSkillFile(params, skillPath);

    case "remove_file":
      return await removeSkillFile(params, skillPath);

    case "delete":
      return await deleteSkill(skillPath);

    case "view":
      return await viewSkill(skillFile);

    default:
      return {
        success: false,
        message: `Unknown action: ${action}`,
      };
  }
}

/**
 * Create a new skill
 */
async function createSkill(
  params: SkillManageParams,
  skillPath: string,
  skillFile: string
): Promise<SkillManageResult> {
  const { name, content, category } = params;

  // Check if skill already exists
  if (existsSync(skillPath)) {
    return {
      success: false,
      message: `Skill ${name} already exists. Use 'patch' or 'edit' to modify.`,
    };
  }

  // Create skill directory
  await fs.mkdir(skillPath, { recursive: true });

  // Create SKILL.md
  const frontmatter: SkillFrontmatter = {
    name,
    description: content?.split("\n")[0]?.slice(0, 1024) || `Skill: ${name}`,
    version: "1.0.0",
  };

  const body = content || `# ${name}\n\nInstructions for this skill...\n`;
  const skillContent = createFrontmatter(frontmatter) + "\n" + body;

  await fs.writeFile(skillFile, skillContent, "utf-8");

  return {
    success: true,
    message: `Created skill ${name}`,
    skill_path: skillPath,
  };
}

/**
 * Patch skill with targeted fix
 */
async function patchSkill(
  params: SkillManageParams,
  skillFile: string
): Promise<SkillManageResult> {
  const { name, old_string, new_string } = params;

  if (!old_string || !new_string) {
    return {
      success: false,
      message: "patch requires old_string and new_string",
    };
  }

  if (!existsSync(skillFile)) {
    return {
      success: false,
      message: `Skill ${name} not found. Use 'create' first.`,
    };
  }

  const content = await fs.readFile(skillFile, "utf-8");

  // Use regex for more flexible matching
  const regex = new RegExp(escapeRegex(old_string), "g");
  
  if (!regex.test(content)) {
    return {
      success: false,
      message: `old_string not found in ${name}`,
    };
  }

  const newContent = content.replace(regex, new_string);
  await fs.writeFile(skillFile, newContent, "utf-8");

  return {
    success: true,
    message: `Patched skill ${name}`,
    skill_path: skillFile,
  };
}

/**
 * Edit skill (full replacement)
 */
async function editSkill(
  params: SkillManageParams,
  skillFile: string
): Promise<SkillManageResult> {
  const { name, content } = params;

  if (!content) {
    return {
      success: false,
      message: "edit requires content",
    };
  }

  if (!existsSync(skillFile)) {
    return {
      success: false,
      message: `Skill ${name} not found. Use 'create' first.`,
    };
  }

  await fs.writeFile(skillFile, content, "utf-8");

  return {
    success: true,
    message: `Edited skill ${name}`,
    skill_path: skillFile,
  };
}

/**
 * Write supporting file to skill
 */
async function writeSkillFile(
  params: SkillManageParams,
  skillPath: string
): Promise<SkillManageResult> {
  const { name, file_path, file_content } = params;

  if (!file_path || !file_content) {
    return {
      success: false,
      message: "write_file requires file_path and file_content",
    };
  }

  if (!existsSync(skillPath)) {
    return {
      success: false,
      message: `Skill ${name} not found. Use 'create' first.`,
    };
  }

  // Resolve file path relative to skill directory
  const resolvedPath = path.join(skillPath, file_path);
  
  // Ensure directory exists
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  
  await fs.writeFile(resolvedPath, file_content, "utf-8");

  return {
    success: true,
    message: `Wrote ${file_path} to skill ${name}`,
    skill_path: skillPath,
    file_path: resolvedPath,
  };
}

/**
 * Remove supporting file from skill
 */
async function removeSkillFile(
  params: SkillManageParams,
  skillPath: string
): Promise<SkillManageResult> {
  const { name, file_path } = params;

  if (!file_path) {
    return {
      success: false,
      message: "remove_file requires file_path",
    };
  }

  if (!existsSync(skillPath)) {
    return {
      success: false,
      message: `Skill ${name} not found.`,
    };
  }

  const resolvedPath = path.join(skillPath, file_path);

  if (!existsSync(resolvedPath)) {
    return {
      success: false,
      message: `File ${file_path} not found in skill ${name}`,
    };
  }

  await fs.unlink(resolvedPath);

  return {
    success: true,
    message: `Removed ${file_path} from skill ${name}`,
  };
}

/**
 * Delete skill entirely
 */
async function deleteSkill(skillPath: string): Promise<SkillManageResult> {
  if (!existsSync(skillPath)) {
    return {
      success: false,
      message: "Skill not found",
    };
  }

  await fs.rm(skillPath, { recursive: true, force: true });

  return {
    success: true,
    message: "Skill deleted",
    skill_path: skillPath,
  };
}

/**
 * View skill content
 */
async function viewSkill(skillFile: string): Promise<SkillManageResult> {
  if (!existsSync(skillFile)) {
    return {
      success: false,
      message: "Skill not found",
    };
  }

  const content = await fs.readFile(skillFile, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);

  return {
    success: true,
    message: body,
    skill_path: skillFile,
  };
}

/**
 * Tool definition for LLM function calling
 */
export const skillManageToolDefinition = {
  name: "skill_manage",
  description: `Manage skills - create, patch, edit, or delete skills.

Skills are procedural memory - after completing a complex task (5+ tool calls), 
save the approach as a skill. If you find issues with a skill, patch it immediately.

Actions:
- create: Create new skill from scratch
- patch: Targeted fix (preferred for small changes)
- edit: Major rewrite (replaces entire SKILL.md)
- write_file: Add supporting file (references, templates)
- remove_file: Remove supporting file
- delete: Remove skill entirely
- view: View skill content

Use 'patch' for small fixes - it's more token-efficient than 'edit'.`,
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["create", "patch", "edit", "write_file", "remove_file", "delete", "view"],
        description: "Action to perform",
      },
      name: {
        type: "string",
        description: "Skill name (lowercase, hyphens, underscores)",
      },
      content: {
        type: "string",
        description: "Full skill content (for create/edit)",
      },
      old_string: {
        type: "string",
        description: "Text to find (for patch)",
      },
      new_string: {
        type: "string",
        description: "Text to replace with (for patch)",
      },
      file_path: {
        type: "string",
        description: "File path relative to skill directory (for write_file/remove_file)",
      },
      file_content: {
        type: "string",
        description: "File content (for write_file)",
      },
      category: {
        type: "string",
        description: "Skill category (optional, for organization)",
      },
    },
    required: ["action", "name"],
  },
};

/**
 * Execute skill_manage as a tool
 */
export async function executeSkillManage(
  args: Record<string, unknown>
): Promise<{ success: boolean; content: string }> {
  const result = await skillManage({
    action: args.action as SkillManageAction,
    name: args.name as string,
    content: args.content as string | undefined,
    old_string: args.old_string as string | undefined,
    new_string: args.new_string as string | undefined,
    file_path: args.file_path as string | undefined,
    file_content: args.file_content as string | undefined,
    category: args.category as string | undefined,
  });

  return {
    success: result.success,
    content: result.message,
  };
}

export default skillManage;