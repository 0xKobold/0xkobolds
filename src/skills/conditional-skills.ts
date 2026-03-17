/**
 * Conditional Skills - Skills Hub Integration
 * 
 * Implements the Agent Skills specification from agentskills.io with
 * conditional activation based on:
 * - Available toolsets (fallback_for_toolsets, requires_toolsets)
 * - Platform compatibility
 * - Metadata-based filtering
 * 
 * @see https://agentskills.io/specification
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Agent Skills Specification (agentskills.io)
 */
export interface SkillFrontmatter {
  name: string;                           // Required: 1-64 chars, lowercase + hyphens
  description: string;                   // Required: 1-1024 chars
  license?: string;                       // Optional: license name or file
  compatibility?: string;                  // Optional: environment requirements
  metadata?: Record<string, string | number | boolean | string[]>;  // Optional: arbitrary metadata
  allowed_tools?: string;                 // Optional: space-delimited pre-approved tools
}

/**
 * Hermes-style conditional activation metadata
 */
export interface HermesMetadata {
  tags?: string[];
  fallback_for_toolsets?: string[];       // Show when these toolsets are unavailable
  requires_toolsets?: string[];           // Show only when these toolsets ARE available
  platforms?: ("macos" | "linux" | "windows")[];
}

/**
 * Parsed skill with metadata
 */
export interface ParsedSkill {
  path: string;
  frontmatter: SkillFrontmatter;
  hermes?: HermesMetadata;
  body: string;
  references?: string[];                 // Files in references/
  scripts?: string[];                     // Files in scripts/
  assets?: string[];                      // Files in assets/
}

/**
 * Skill registry options
 */
export interface SkillRegistryOptions {
  skillsDir?: string;                      // Override default skills directory
  loadBundled?: boolean;                  // Load bundled skills (default: true)
  validateOnLoad?: boolean;                // Validate skills on load (default: true)
}

/**
 * Filter options for conditional activation
 */
export interface SkillFilterOptions {
  availableToolsets: Set<string>;          // Toolsets currently available
  unavailableToolsets?: Set<string>;       // Toolsets currently unavailable
  platform?: "macos" | "linux" | "windows";
  tags?: string[];
}

// ============================================================================
// SKILL REGISTRY
// ============================================================================

const DEFAULT_SKILLS_DIR = path.join(homedir(), ".0xkobold", "skills");

export class ConditionalSkillRegistry {
  private skills: Map<string, ParsedSkill> = new Map();
  private skillsDir: string;
  private loadBundled: boolean;

  constructor(options: SkillRegistryOptions = {}) {
    this.skillsDir = options.skillsDir || DEFAULT_SKILLS_DIR;
    this.loadBundled = options.loadBundled !== false;
  }

  /**
   * Load all skills from the skills directory
   */
  async loadSkills(): Promise<void> {
    this.skills.clear();

    try {
      const entries = await fs.readdir(this.skillsDir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const skill = await this.loadSkill(path.join(this.skillsDir, entry.name));
          if (skill) {
            this.skills.set(skill.frontmatter.name, skill);
          }
        }
      }
    } catch (error) {
      // Skills directory doesn't exist yet
      await fs.mkdir(this.skillsDir, { recursive: true });
    }
  }

  /**
   * Load a single skill from its directory
   */
  private async loadSkill(skillPath: string): Promise<ParsedSkill | null> {
    const skillFile = path.join(skillPath, "SKILL.md");
    
    try {
      const content = await fs.readFile(skillFile, "utf-8");
      const parsed = this.parseSkill(content);
      
      return {
        path: skillPath,
        frontmatter: parsed.frontmatter,
        hermes: parsed.hermes,
        body: parsed.body,
        references: await this.listFiles(skillPath, "references"),
        scripts: await this.listFiles(skillPath, "scripts"),
        assets: await this.listFiles(skillPath, "assets"),
      };
    } catch {
      return null;
    }
  }

  /**
   * Parse skill frontmatter and body
   */
  private parseSkill(content: string): { frontmatter: SkillFrontmatter; hermes?: HermesMetadata; body: string } {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    
    if (!frontmatterMatch) {
      // No frontmatter - return minimal
      return {
        frontmatter: { name: "", description: "" },
        body: content,
      };
    }

    const frontmatterText = frontmatterMatch[1];
    const body = frontmatterMatch[2];

    // Parse YAML frontmatter
    const frontmatter: Record<string, any> = {};
    const hermes: Record<string, any> = {};
    
    const lines = frontmatterText.split("\n");
    let inMetadata = false;
    let inHermes = false;
    let currentKey = "";
    let currentArray: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith("metadata:")) {
        inMetadata = true;
        continue;
      }
      
      if (trimmed.startsWith("hermes:") || trimmed.startsWith("metadata:") && trimmed.includes("hermes")) {
        inHermes = true;
        inMetadata = true;
        continue;
      }

      if (inMetadata && trimmed.startsWith("-")) {
        // Array item
        if (currentKey) {
          currentArray.push(trimmed.slice(1).trim());
        }
        continue;
      }

      if (trimmed === "" && inMetadata) {
        // End of nested section
        if (currentArray.length > 0 && currentKey) {
          if (inHermes) {
            hermes[currentKey] = currentArray;
          } else {
            frontmatter[currentKey] = currentArray;
          }
          currentArray = [];
        }
        continue;
      }

      if (trimmed.includes(":")) {
        // Reset array tracking for new key
        if (currentArray.length > 0 && currentKey) {
          if (inHermes) {
            hermes[currentKey] = currentArray;
          } else {
            frontmatter[currentKey] = currentArray;
          }
          currentArray = [];
        }

        const colonIdx = trimmed.indexOf(":");
        currentKey = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();
        
        if (value && !value.startsWith("\n")) {
          frontmatter[currentKey] = value.replace(/^["']|["']$/g, "");
        }
        
        inHermes = currentKey === "hermes" || (inMetadata && currentKey !== "metadata");
      }
    }

    // Handle final array
    if (currentArray.length > 0 && currentKey) {
      if (inHermes) {
        hermes[currentKey] = currentArray;
      } else {
        frontmatter[currentKey] = currentArray;
      }
    }

    // Extract hermes metadata
    if (frontmatter.metadata && typeof frontmatter.metadata === "object") {
      const meta = frontmatter.metadata as Record<string, any>;
      if (meta.hermes) {
        Object.assign(hermes, meta.hermes);
      }
    }

    return {
      frontmatter: {
        name: frontmatter.name || "",
        description: frontmatter.description || "",
        license: frontmatter.license,
        compatibility: frontmatter.compatibility,
        metadata: frontmatter.metadata,
        allowed_tools: frontmatter.allowed_tools,
      },
      hermes: Object.keys(hermes).length > 0 ? hermes : undefined,
      body,
    };
  }

  /**
   * List files in a skill subdirectory
   */
  private async listFiles(skillPath: string, subdir: string): Promise<string[]> {
    try {
      const dir = path.join(skillPath, subdir);
      const files = await fs.readdir(dir);
      return files.map(f => path.join(subdir, f));
    } catch {
      return [];
    }
  }

  /**
   * Get all skills (Level 0: metadata only)
   */
  listSkills(): Array<{ name: string; description: string }> {
    return Array.from(this.skills.values()).map(skill => ({
      name: skill.frontmatter.name,
      description: skill.frontmatter.description,
    }));
  }

  /**
   * Get skill full content (Level 1: full content)
   */
  getSkill(name: string): ParsedSkill | undefined {
    return this.skills.get(name);
  }

  /**
   * Get specific file from skill (Level 2: file reference)
   */
  async getSkillFile(name: string, relativePath: string): Promise<string | null> {
    const skill = this.skills.get(name);
    if (!skill) return null;

    const filePath = path.join(skill.path, relativePath);
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  /**
   * Filter skills by conditional activation rules
   */
  filterSkills(options: SkillFilterOptions): ParsedSkill[] {
    return Array.from(this.skills.values()).filter(skill => {
      // Platform check
      if (skill.hermes?.platforms && options.platform) {
        if (!skill.hermes.platforms.includes(options.platform)) {
          return false;
        }
      }

      // Tags check
      if (options.tags && skill.hermes?.tags) {
        const hasTag = options.tags.some(tag => skill.hermes?.tags?.includes(tag));
        if (!hasTag) {
          return false;
        }
      }

      // Requires toolsets - skill is only shown when these ARE available
      if (skill.hermes?.requires_toolsets) {
        const hasAllRequired = skill.hermes.requires_toolsets.every(
          toolset => options.availableToolsets.has(toolset)
        );
        if (!hasAllRequired) {
          return false;
        }
      }

      // Fallback for toolsets - skill is only shown when these are NOT available
      if (skill.hermes?.fallback_for_toolsets) {
        const hasAnyFallback = skill.hermes.fallback_for_toolsets.some(
          toolset => options.unavailableToolsets?.has(toolset) ?? 
                     !options.availableToolsets.has(toolset)
        );
        if (!hasAnyFallback) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Get skills categorized by their conditional activation
   */
  categorizeSkills(options: SkillFilterOptions): {
    available: ParsedSkill[];
    fallback: ParsedSkill[];
    requires: ParsedSkill[];
  } {
    const available: ParsedSkill[] = [];
    const fallback: ParsedSkill[] = [];
    const requires: ParsedSkill[] = [];

    for (const skill of this.skills.values()) {
      // Has fallback_for_toolsets? -> fallback category
      if (skill.hermes?.fallback_for_toolsets) {
        fallback.push(skill);
        continue;
      }

      // Has requires_toolsets? -> requires category
      if (skill.hermes?.requires_toolsets) {
        requires.push(skill);
        continue;
      }

      // Otherwise -> available category
      available.push(skill);
    }

    return { available, fallback, requires };
  }

  /**
   * Validate skill follows agentskills.io spec
   */
  validateSkill(skill: ParsedSkill): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Name validation
    if (!skill.frontmatter.name) {
      errors.push("Skill name is required");
    } else {
      if (skill.frontmatter.name.length > 64) {
        errors.push("Skill name must be 64 characters or less");
      }
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skill.frontmatter.name)) {
        errors.push("Skill name must be lowercase, alphanumeric, and hyphens only");
      }
    }

    // Description validation
    if (!skill.frontmatter.description) {
      errors.push("Skill description is required");
    } else if (skill.frontmatter.description.length > 1024) {
      errors.push("Skill description must be 1024 characters or less");
    }

    // Directory name must match skill name
    const dirName = path.basename(skill.path);
    if (dirName !== skill.frontmatter.name) {
      errors.push(`Skill directory name "${dirName}" must match skill name "${skill.frontmatter.name}"`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let registry: ConditionalSkillRegistry | null = null;

export function getConditionalSkillRegistry(options?: SkillRegistryOptions): ConditionalSkillRegistry {
  if (!registry) {
    registry = new ConditionalSkillRegistry(options);
  }
  return registry;
}

export async function loadSkillsHub(options?: SkillRegistryOptions): Promise<void> {
  const reg = getConditionalSkillRegistry(options);
  await reg.loadSkills();
}

// ============================================================================
// STANDALONE EXPORTS (for testing)
// ============================================================================

/**
 * Parse skill frontmatter from SKILL.md content
 */
export function parseSkillFrontmatter(content: string): ParsedSkill {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    return {
      path: "",
      frontmatter: { name: "", description: "" },
      body: content,
    };
  }

  const frontmatterText = frontmatterMatch[1];
  const body = frontmatterMatch[2];

  // Parse YAML frontmatter
  const fm: Record<string, any> = {};
  const hermes: Record<string, any> = {};
  
  const lines = frontmatterText.split("\n");
  let inMetadata = false;
  let inHermes = false;
  let currentKey = "";
  let currentArray: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    
    if (trimmed.startsWith("metadata:")) {
      inMetadata = true;
      continue;
    }
    
    if (trimmed.startsWith("hermes:") || (inMetadata && trimmed.startsWith("hermes:"))) {
      inHermes = true;
      inMetadata = true;
      continue;
    }

    if (inMetadata && trimmed.startsWith("-")) {
      if (currentKey) {
        currentArray.push(trimmed.slice(1).trim());
      }
      continue;
    }

    if (trimmed === "" && inMetadata) {
      if (currentArray.length > 0 && currentKey) {
        if (inHermes) {
          hermes[currentKey] = currentArray;
        } else {
          fm[currentKey] = currentArray;
        }
      }
      currentArray = [];
      continue;
    }

    if (trimmed.includes(":")) {
      if (currentArray.length > 0 && currentKey) {
        if (inHermes) {
          hermes[currentKey] = currentArray;
        } else {
          fm[currentKey] = currentArray;
        }
        currentArray = [];
      }

      const colonIdx = trimmed.indexOf(":");
      currentKey = trimmed.slice(0, colonIdx).trim();
      const value = trimmed.slice(colonIdx + 1).trim();
      
      if (value && !value.startsWith("\n")) {
        fm[currentKey] = value.replace(/^["']|["']$/g, "");
      }
    }
  }

  // Handle final array
  if (currentArray.length > 0 && currentKey) {
    if (inHermes) {
      hermes[currentKey] = currentArray;
    } else {
      fm[currentKey] = currentArray;
    }
  }

  // Extract hermes metadata from nested structure
  if (fm.metadata && typeof fm.metadata === "object") {
    const meta = fm.metadata as Record<string, any>;
    if (meta.hermes) {
      Object.assign(hermes, meta.hermes);
    }
  }

  return {
    path: "",
    frontmatter: {
      name: fm.name || "",
      description: fm.description || "",
      license: fm.license,
      compatibility: fm.compatibility,
      metadata: fm.metadata,
      allowed_tools: fm.allowed_tools,
    },
    hermes: Object.keys(hermes).length > 0 ? hermes : undefined,
    body,
  };
}

/**
 * Validate skill frontmatter against agentskills.io spec
 */
export function validateSkillFrontmatter(skill: ParsedSkill): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Name is required
  if (!skill.frontmatter.name) {
    errors.push("name is required");
  }

  // Description is required
  if (!skill.frontmatter.description) {
    errors.push("description is required");
  }

  // Name length (max 64 chars)
  if (skill.frontmatter.name && skill.frontmatter.name.length > 64) {
    errors.push("name must be 64 characters or less");
  }

  // Description length (max 1024 chars)
  if (skill.frontmatter.description && skill.frontmatter.description.length > 1024) {
    errors.push("description must be 1024 characters or less");
  }

  // Name format (lowercase + hyphens only)
  if (skill.frontmatter.name && !/^[a-z][a-z0-9-]*$/.test(skill.frontmatter.name)) {
    warnings.push("name should be lowercase with hyphens (e.g., my-skill)");
  }

  // Check directory name matches skill name (if path provided)
  if (skill.path) {
    const dirName = path.basename(skill.path);
    if (dirName !== skill.frontmatter.name) {
      warnings.push(`directory name "${dirName}" should match skill name "${skill.frontmatter.name}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}