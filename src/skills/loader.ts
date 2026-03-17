/**
 * Skill Loader
 *
 * Hot-reload skill system using Bun's file watcher.
 * Skills are plain .ts/.md files in the skills directories.
 * 
 * Conditional activation via agentskills.io spec:
 * - fallback_for_toolsets: Show when toolsets are unavailable
 * - requires_toolsets: Show only when toolsets ARE available
 * - platforms: OS restrictions
 */

import { watch } from 'fs';
import { readdir, stat, readFile } from 'fs/promises';
import { join, basename, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { homedir } from 'os';
import type { Skill, SkillEntry, SkillModule } from './types';
import { eventBus, createEventEmitter } from '../event-bus';
import { getConditionalSkillRegistry, type SkillFilterOptions } from './conditional-skills.js';

const emit = createEventEmitter('skills');

// Get __dirname equivalent in ESM
const getDirname = () => {
  return dirname(fileURLToPath(import.meta.url));
};

// Built-in skills path - relative to project root (for dev)
const PROJECT_ROOT = join(getDirname(), '..', '..');
const DEV_BUILTIN_SKILLS_DIR = join(PROJECT_ROOT, 'src', 'skills', 'builtin');

// Production built-in skills path (in dist/)
const PROD_BUILTIN_SKILLS_DIR = join(PROJECT_ROOT, '..', 'skills', 'builtin');

// User skills directories
function getGlobalSkillsDir(): string {
  // Use ~/.0xkobold/skills instead of .agents/skills for better organization
  return join(homedir(), '.0xkobold', 'skills');
}

function getLocalSkillsDir(): string {
  return join(process.cwd(), 'skills');
}

function getAgentSkillsDir(): string {
  // Support skills installed via 'skills' CLI to .agents/skills
  const agentSkills = join(homedir(), '.agents', 'skills');
  if (existsSync(agentSkills)) {
    return agentSkills;
  }
  return getGlobalSkillsDir();
}

/**
 * Get bundled skills directory (shipped with npm package)
 */
function getBundledSkillsDir(): string {
  // In dev: use .agents/skills from project root
  // In prod: use .agents/skills from package root (next to dist/)
  const devPath = join(PROJECT_ROOT, '.agents', 'skills');
  const prodPath = join(PROJECT_ROOT, '..', '.agents', 'skills');
  
  if (existsSync(devPath)) {
    return devPath;
  }
  return prodPath;
}

/**
 * Get built-in skills directory (handles both dev and prod)
 */
function getBuiltInSkillsDir(): string {
  // Prefer dev path if it exists
  if (existsSync(DEV_BUILTIN_SKILLS_DIR)) {
    return DEV_BUILTIN_SKILLS_DIR;
  }
  // Fall back to production path
  return PROD_BUILTIN_SKILLS_DIR;
}

/**
 * Skill Registry
 */
class SkillRegistry {
  private skills = new Map<string, SkillEntry>();
  private watchers = new Map<string, ReturnType<typeof watch>>();

  /**
   * Register a skill
   */
  register(entry: SkillEntry): void {
    this.skills.set(entry.name, entry);
    // @ts-ignore EventEmitter type
    emit('skill.registered', {
      name: entry.name,
      source: entry.source,
      risk: entry.skill.risk,
    });
  }

  /**
   * Unregister a skill
   */
  unregister(name: string): void {
    const entry = this.skills.get(name);
    if (entry) {
      this.skills.delete(name);
      // @ts-ignore EventEmitter type
      emit('skill.unregistered', { name });
    }
  }

  /**
   * Get a skill by name
   */
  get(name: string): Skill | undefined {
    return this.skills.get(name)?.skill;
  }

  /**
   * Get all skills
   */
  getAll(): Skill[] {
    return Array.from(this.skills.values()).map(e => e.skill);
  }

  /**
   * List all registered skills
   */
  list(): SkillEntry[] {
    return Array.from(this.skills.values());
  }

  /**
   * Check if skill exists
   */
  has(name: string): boolean {
    return this.skills.has(name);
  }

  /**
   * Clear all skills
   */
  clear(): void {
    this.skills.clear();
  }

  /**
   * Watch a file for hot-reload
   */
  watchFile(path: string, loadFn: () => Promise<void>): void {
    // Stop existing watcher
    this.stopWatching(path);

    const watcher = watch(path, async (eventType) => {
      if (eventType === 'change') {
        console.log(`[Skills] Hot-reloading: ${basename(path)}`);
        try {
          await loadFn();
          console.log(`[Skills] Reloaded: ${basename(path)}`);
        } catch (err) {
          console.error(`[Skills] Failed to reload ${basename(path)}:`, err);
        }
      }
    });

    this.watchers.set(path, watcher);
  }

  /**
   * Stop watching a file
   */
  stopWatching(path: string): void {
    const watcher = this.watchers.get(path);
    if (watcher) {
      watcher.close();
      this.watchers.delete(path);
    }
  }

  /**
   * Stop all watchers
   */
  stopAllWatchers(): void {
    for (const [path, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
  }
}

// Global registry instance
export const skillRegistry = new SkillRegistry();

/**
 * Load a skill from a file
 */
async function loadSkillFile(path: string): Promise<Skill[]> {
  try {
    // Handle .md skills (from skills CLI)
    if (path.endsWith('.md')) {
      const content = await readFile(path, 'utf-8');
      // Parse SKILL.md format - extract frontmatter and create skill
      const skill = parseSkillMarkdown(content, path);
      return skill ? [skill] : [];
    }

    // Handle .ts/.js skills (dynamic import)
    const module = (await import(path)) as SkillModule;

    // Try to get skill(s) from default export or named export
    let skills = module.default || module.skill;

    if (!skills) {
      // Try to find first Skill-like export
      for (const key of Object.keys(module)) {
        const exported = module[key];
        if (isSkill(exported)) {
          skills = exported;
          break;
        }
      }
    }

    if (!skills) {
      return [];
    }

    // Handle both single skill and array of skills
    return Array.isArray(skills) ? skills : [skills];
  } catch (err) {
    console.error(`[Skills] Failed to load ${path}:`, err);
    return [];
  }
}

/**
 * Parse SKILL.md format into Skill object
 */
function parseSkillMarkdown(content: string, sourcePath: string): Skill | null {
  try {
    // Extract frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!frontmatterMatch) {
      console.warn(`[Skills] No frontmatter found in ${sourcePath}`);
      return null;
    }

    const [_, frontmatter, body] = frontmatterMatch;
    
    // Parse YAML-like frontmatter
    const meta: Record<string, string> = {};
    for (const line of frontmatter.split('\n')) {
      const match = line.match(/^([^:]+):\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        meta[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
      }
    }

    const name = meta.name || basename(dirname(sourcePath));
    const description = meta.description || `Skill: ${name}`;
    const risk = (meta.risk as 'safe' | 'medium' | 'high') || 'medium';

    // Create a skill that returns the markdown content as context
    return {
      name,
      description,
      risk,
      toolDefinition: {
        type: 'function',
        function: {
          name,
          description,
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      execute: async () => {
        return {
          content: body,
          source: sourcePath,
          meta,
        };
      },
    };
  } catch (err) {
    console.error(`[Skills] Failed to parse ${sourcePath}:`, err);
    return null;
  }
}

/**
 * Check if object is a valid Skill
 */
function isSkill(obj: unknown): obj is Skill {
  if (!obj || typeof obj !== 'object') return false;

  const skill = obj as Record<string, unknown>;

  return (
    typeof skill.name === 'string' &&
    typeof skill.description === 'string' &&
    typeof skill.toolDefinition === 'object' &&
    skill.toolDefinition !== null &&
    typeof (skill.toolDefinition as Record<string, unknown>).type === 'string' &&
    ['safe', 'medium', 'high'].includes(skill.risk as string) &&
    typeof skill.execute === 'function'
  );
}

/**
 * Load and register a skill from file
 */
async function registerSkillFile(path: string, hotReload = true): Promise<void> {
  const fileName = basename(path, extname(path));

  // Unregister existing
  if (skillRegistry.has(fileName)) {
    skillRegistry.unregister(fileName);
  }

  // Load new (can be single skill or array)
  const skills = await loadSkillFile(path);
  if (skills.length === 0) {
    console.warn(`[Skills] No valid skill found in ${path}`);
    return;
  }

  // Register each skill
  for (const skill of skills) {
    // Validate name - warn if doesn't match filename
    if (skill.name !== fileName) {
      console.warn(`[Skills] Skill name "${skill.name}" doesn't match filename "${fileName}"`);
    }

    skillRegistry.register({
      name: skill.name,
      skill,
      source: path,
      loadedAt: new Date(),
      hotReload,
    });
  }

  // Set up hot-reload watcher
  if (hotReload) {
    skillRegistry.watchFile(path, () => registerSkillFile(path, hotReload));
  }
}

/**
 * Load all skills from a directory
 */
async function loadSkillsFromDir(dir: string, hotReload = true): Promise<number> {
  // Check if directory exists first
  if (!existsSync(dir)) {
    console.log(`[Skills] Directory not found: ${dir}`);
    return 0;
  }

  let count = 0;
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(dir, entry.name);
      
      if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.md'))) {
        await registerSkillFile(path, hotReload);
        count++;
      } else if (entry.isDirectory()) {
        // Check for SKILL.md in subdirectory
        const skillMdPath = join(path, 'SKILL.md');
        if (existsSync(skillMdPath)) {
          await registerSkillFile(skillMdPath, hotReload);
          count++;
        }
      }
    }

    console.log(`[Skills] Loaded ${count} skills from ${dir}`);
    return count;
  } catch (err) {
    console.error(`[Skills] Error loading skills from ${dir}:`, err);
    return 0;
  }
}

/**
 * Initialize the skill system
 */
export async function initSkills(): Promise<void> {
  console.log('[Skills] Initializing...');

  // Load built-in skills (from src/skills/builtin)
  await loadSkillsFromDir(getBuiltInSkillsDir(), false);

  // Load bundled skills (shipped with npm package at .agents/skills)
  const bundledSkillsDir = getBundledSkillsDir();
  if (existsSync(bundledSkillsDir)) {
    await loadSkillsFromDir(bundledSkillsDir, false); // no hot-reload for bundled
    console.log(`[Skills] Loaded bundled skills from ${bundledSkillsDir}`);
  }

  // Load agent-installed skills (from 'skills' CLI at ~/.agents/skills)
  const agentSkillsDir = getAgentSkillsDir();
  await loadSkillsFromDir(agentSkillsDir, true);

  // Load global user skills (at ~/.0xkobold/skills)
  await loadSkillsFromDir(getGlobalSkillsDir(), true);

  // Load local project skills (if they exist at ./skills)
  const localSkillsDir = getLocalSkillsDir();
  if (existsSync(localSkillsDir)) {
    await loadSkillsFromDir(localSkillsDir, true);
  }

  console.log(`[Skills] Total skills loaded: ${skillRegistry.list().length}`);
}

/**
 * Reload all skills
 */
export async function reloadSkills(): Promise<void> {
  skillRegistry.clear();
  skillRegistry.stopAllWatchers();
  await initSkills();
}

/**
 * Get skill registry
 */
export function getSkillRegistry(): SkillRegistry {
  return skillRegistry;
}

/**
 * Get skills filtered by conditional activation rules
 * 
 * Uses agentskills.io spec with Hermes metadata:
 * - fallback_for_toolsets: Show when toolsets are unavailable
 * - requires_toolsets: Show only when toolsets ARE available
 * - platforms: OS restrictions
 */
export function getFilteredSkills(
  availableToolsets: Set<string>,
  platform?: "macos" | "linux" | "windows",
  tags?: string[]
): SkillEntry[] {
  const allEntries = skillRegistry.list(); // Returns SkillEntry[]
  const conditionalRegistry = getConditionalSkillRegistry();
  const options: SkillFilterOptions = {
    availableToolsets,
    unavailableToolsets: new Set(),
    platform,
    tags,
  };
  
  // Get names of skills that pass conditional filter
  const filteredNames = new Set(
    conditionalRegistry.filterSkills(options).map(s => s.frontmatter.name)
  );
  
  // Include skills that pass the conditional check
  const result: SkillEntry[] = [];
  for (const entry of allEntries) {
    if (filteredNames.has(entry.name)) {
      result.push(entry);
    }
  }
  
  return result;
}

/**
 * Get available toolsets from registered skills
 * 
 * Scans all skills for toolset dependencies
 */
export function getAvailableToolsets(): Set<string> {
  const toolsets = new Set<string>();
  
  // Known toolsets based on available tools
  // These should match the tool definitions
  const knownToolsets = [
    "terminal",      // Bash, shell access
    "filesystem",    // Read, write, edit files
    "web",           // web_fetch, web_search
    "memory",        // perennial_save, perennial_search
    "dialectic",     // Reasoning about users
    "skills",        // skill_manage, skills_list
    "cron",          // Scheduling
    "gateway",       // Queue modes, messaging
  ];
  
  knownToolsets.forEach(t => toolsets.add(t));
  
  return toolsets;
}

// Re-export
export { SkillRegistry };
export type { Skill, SkillEntry, SkillModule };
