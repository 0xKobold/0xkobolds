/**
 * Skill Loader
 *
 * Hot-reload skill system using Bun's file watcher.
 * Skills are plain .ts files in the skills/ directory.
 */

import { watch } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join, basename, extname, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import type { Skill, SkillEntry, SkillModule } from './types';
import { eventBus, createEventEmitter } from '../event-bus';

const emit = createEventEmitter('skills');

// Get __dirname equivalent in ESM
const getDirname = () => {
  return dirname(fileURLToPath(import.meta.url));
};

// Built-in skills path - relative to project root
const PROJECT_ROOT = join(getDirname(), '..', '..');
const BUILTIN_SKILLS_DIR = join(PROJECT_ROOT, 'src', 'skills', 'builtin');

// User skills path
const USER_SKILLS_DIR = join(PROJECT_ROOT, 'skills');

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
    // Dynamic import - Bun handles TypeScript natively
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
async function loadSkillsFromDir(dir: string, hotReload = true): Promise<void> {
  // Check if directory exists first
  if (!existsSync(dir)) {
    console.log(`[Skills] Directory not found: ${dir}`);
    return;
  }

  try {
    const entries = await readdir(dir);

    for (const entry of entries) {
      const path = join(dir, entry);
      const stats = await stat(path);

      if (stats.isFile() && (entry.endsWith('.ts') || entry.endsWith('.js'))) {
        await registerSkillFile(path, hotReload);
      }
    }

    console.log(`[Skills] Loaded ${skillRegistry.list().length} skills from ${dir}`);
  } catch (err) {
    console.error(`[Skills] Error loading skills from ${dir}:`, err);
  }
}

/**
 * Initialize the skill system
 */
export async function initSkills(): Promise<void> {
  console.log('[Skills] Initializing...');

  // Load built-in skills
  await loadSkillsFromDir(BUILTIN_SKILLS_DIR, false);

  // Load user skills with hot-reload
  await loadSkillsFromDir(USER_SKILLS_DIR, true);

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

// Re-export
export { SkillRegistry };
export type { Skill, SkillEntry, SkillModule };
