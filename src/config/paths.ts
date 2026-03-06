/**
 * Config paths and utilities for Kobold
 * 
 * Similar to koclaw/openclaw's config-path.ts
 */

import * as path from "node:path";
import * as os from "node:os";

const KOBOLD_DIR = process.env.KOBOLD_HOME || path.join(os.homedir(), ".config", "kobold");

export function getConfigDir(): string {
  return KOBOLD_DIR;
}

export function getConfigPath(): string {
  // Priority: KOBOLD_CONFIG_PATH > ./kobold.json > ~/.config/kobold/kobold.json
  if (process.env.KOBOLD_CONFIG_PATH) {
    return path.resolve(process.env.KOBOLD_CONFIG_PATH);
  }
  
  const localConfig = path.join(process.cwd(), "kobold.json");
  try {
    // Check if local config exists by accessing it
    // This will throw if not found
    return localConfig;
  } catch {
    return path.join(KOBOLD_DIR, "kobold.json");
  }
}

export function getDefaultConfigPath(): string {
  return path.join(KOBOLD_DIR, "kobold.json");
}

export function getLocalConfigPath(): string {
  return path.join(process.cwd(), "kobold.json");
}

export function getSessionDir(): string {
  return path.join(KOBOLD_DIR, "sessions");
}

export function getMemoryDbPath(): string {
  return path.join(KOBOLD_DIR, "memory.db");
}

export function getSkillsDir(): string {
  return path.join(KOBOLD_DIR, "skills");
}

export function getTempDir(): string {
  const tempDir = path.join(KOBOLD_DIR, "tmp");
  return tempDir;
}

export function resolveUserPath(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  if (input.startsWith("./") || input.startsWith("../")) {
    return path.resolve(input);
  }
  if (path.isAbsolute(input)) {
    return input;
  }
  // Relative to KOBOLD_DIR
  return path.join(KOBOLD_DIR, input);
}
