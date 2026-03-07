/**
 * Config paths and utilities for Kobold
 * 
 * Similar to koclaw/openclaw's config-path.ts
 */

import * as path from "node:path";
import * as os from "node:os";
import { existsSync } from "node:fs";

const KOBOLD_DIR = process.env.KOBOLD_HOME || path.join(os.homedir(), ".config", "kobold");

export function getConfigDir(): string {
  return KOBOLD_DIR;
}

export function getConfigPath(): string {
  // Priority: KOBOLD_CONFIG_PATH > --local mode > ./kobold.json > ~/.config/kobold/kobold.json
  
  // 1. Explicit env var override
  if (process.env.KOBOLD_CONFIG_PATH) {
    return path.resolve(process.env.KOBOLD_CONFIG_PATH);
  }
  
  // 2. Local mode: always prefer CWD config
  if (process.env.KOBOLD_LOCAL_MODE === 'true') {
    const localConfig = path.join(process.cwd(), "kobold.json");
    // In local mode, return CWD config even if it doesn't exist yet
    // (allows creating new project configs)
    return localConfig;
  }
  
  // 3. Check for local config in CWD
  const localConfig = path.join(process.cwd(), "kobold.json");
  if (existsSync(localConfig)) {
    return localConfig;
  }
  
  // 4. Fall back to global config
  return path.join(KOBOLD_DIR, "kobold.json");
}

export function getDefaultConfigPath(): string {
  return path.join(KOBOLD_DIR, "kobold.json");
}

export function getLocalConfigPath(): string {
  return path.join(process.cwd(), "kobold.json");
}

export function getSessionDir(): string {
  // In local mode, store sessions in CWD
  if (process.env.KOBOLD_LOCAL_MODE === 'true') {
    return path.join(process.cwd(), ".kobold", "sessions");
  }
  return path.join(KOBOLD_DIR, "sessions");
}

export function getMemoryDbPath(): string {
  // In local mode, store memory in CWD
  if (process.env.KOBOLD_LOCAL_MODE === 'true') {
    return path.join(process.cwd(), ".kobold", "memory.db");
  }
  return path.join(KOBOLD_DIR, "memory.db");
}

export function getSkillsDir(): string {
  // Check for local skills first
  const localSkills = path.join(process.cwd(), "skills");
  if (existsSync(localSkills)) {
    return localSkills;
  }
  return path.join(KOBOLD_DIR, "skills");
}

export function getTempDir(): string {
  const tempDir = process.env.KOBOLD_LOCAL_MODE === 'true'
    ? path.join(process.cwd(), ".kobold", "tmp")
    : path.join(KOBOLD_DIR, "tmp");
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
  // Relative to CWD in local mode, or KOBOLD_DIR otherwise
  if (process.env.KOBOLD_LOCAL_MODE === 'true') {
    return path.join(process.cwd(), input);
  }
  return path.join(KOBOLD_DIR, input);
}
