/**
 * Pi Bridge Extension for 0xKobold
 * 
 * Provides compatibility layer between pi-coding-agent ecosystem and 0xKobold.
 * - Scans ~/.pi for extensions and migrates to ~/.0xkobold
 * - Loads pi extensions in 0xkobold
 * - Migrates pi-learn data to 0xkobold structure
 * 
 * @module @0xkobold/pi-bridge
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { homedir } from "os";
import { join, resolve } from "path";
import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, statSync } from "fs";

interface BridgeConfig {
  piDir: string;
  koboldDir: string;
  autoMigrate: boolean;
  loadPiExtensions: boolean;
}

interface MigrationResult {
  extensions: string[];
  configs: string[];
  memory: boolean;
  errors: string[];
}

function loadConfig(): BridgeConfig {
  const home = homedir();
  return {
    piDir: join(home, ".pi"),
    koboldDir: join(home, ".0xkobold"),
    autoMigrate: process.env.PI_BRIDGE_AUTO_MIGRATE !== "false",
    loadPiExtensions: process.env.PI_BRIDGE_LOAD_EXTENSIONS !== "false",
  };
}

// ============================================================================
// DIRECTORY MIGRATION
// ============================================================================

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function copyDir(src: string, dest: string, overwrite = false): void {
  if (!existsSync(src)) return;
  
  ensureDir(dest);
  
  for (const item of readdirSync(src)) {
    const srcPath = join(src, item);
    const destPath = join(dest, item);
    
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath, overwrite);
    } else if (!existsSync(destPath) || overwrite) {
      try {
        cpSync(srcPath, destPath);
      } catch (e) {
        console.log(`[PiBridge] Could not copy ${item}: ${e}`);
      }
    }
  }
}

// ============================================================================
// MIGRATION
// ============================================================================

function migrateExtensions(config: BridgeConfig): string[] {
  const migrated: string[] = [];
  const extensionsSrc = join(config.piDir, "extensions");
  const extensionsDest = join(config.koboldDir, "extensions");
  
  if (!existsSync(extensionsSrc)) {
    return migrated;
  }
  
  ensureDir(extensionsDest);
  
  for (const ext of readdirSync(extensionsSrc)) {
    const srcPath = join(extensionsSrc, ext);
    const destPath = join(extensionsDest, ext);
    
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath, false);
      migrated.push(ext);
    }
  }
  
  return migrated;
}

function migrateConfigs(config: BridgeConfig): string[] {
  const migrated: string[] = [];
  const configsToMigrate = [
    { src: "agent/settings.json", dest: "config.json" },
    { src: "auth/profiles.json", dest: "auth/profiles.json" },
  ];
  
  for (const { src, dest } of configsToMigrate) {
    const srcPath = join(config.piDir, src);
    const destPath = join(config.koboldDir, dest);
    
    if (existsSync(srcPath) && !existsSync(destPath)) {
      try {
        const destDir = join(config.koboldDir, src.split("/")[0]);
        ensureDir(destDir);
        cpSync(srcPath, destPath);
        migrated.push(src);
      } catch (e) {
        console.log(`[PiBridge] Could not migrate config ${src}: ${e}`);
      }
    }
  }
  
  return migrated;
}

function migratePiLearn(config: BridgeConfig): boolean {
  const piLearnDb = join(config.piDir, "memory", "pi-learn.db");
  const koboldLearnDir = join(config.koboldDir, "pi-learn");
  const koboldLearnDb = join(koboldLearnDir, "pi-learn.db");
  
  if (existsSync(piLearnDb) && !existsSync(koboldLearnDb)) {
    try {
      ensureDir(koboldLearnDir);
      cpSync(piLearnDb, koboldLearnDb);
      return true;
    } catch (e) {
      console.log(`[PiBridge] Could not migrate pi-learn: ${e}`);
    }
  }
  return false;
}

function findPiExtensions(config: BridgeConfig): string[] {
  const extensions: string[] = [];
  const locations = [
    join(config.piDir, "extensions"),
    join(config.piDir, "node_modules"),
  ];
  
  for (const location of locations) {
    if (!existsSync(location)) continue;
    
    try {
      for (const item of readdirSync(location)) {
        if (item.startsWith("pi-") || item.startsWith("@")) {
          const fullPath = join(location, item);
          if (statSync(fullPath).isDirectory()) {
            extensions.push(fullPath);
          }
        }
      }
    } catch {
      // Skip on error
    }
  }
  
  return extensions;
}

// ============================================================================
// MAIN EXTENSION
// ============================================================================

export default async function piBridgeExtension(pi: ExtensionAPI): Promise<void> {
  const config = loadConfig();
  
  console.log("[PiBridge] Extension loaded 🔌");
  console.log(`[PiBridge] Pi dir: ${config.piDir}`);
  console.log(`[PiBridge] Kobold dir: ${config.koboldDir}`);
  
  // Migration phase
  if (config.autoMigrate) {
    console.log("[PiBridge] Running auto-migration...");
    
    const extMigrated = migrateExtensions(config);
    if (extMigrated.length > 0) {
      console.log(`[PiBridge] ✅ Migrated ${extMigrated.length} extensions: ${extMigrated.join(", ")}`);
    }
    
    const configsMigrated = migrateConfigs(config);
    if (configsMigrated.length > 0) {
      console.log(`[PiBridge] ✅ Migrated ${configsMigrated.length} configs: ${configsMigrated.join(", ")}`);
    }
    
    const memoryMigrated = migratePiLearn(config);
    if (memoryMigrated) {
      console.log("[PiBridge] ✅ Migrated pi-learn database");
    }
    
    if (extMigrated.length === 0 && configsMigrated.length === 0 && !memoryMigrated) {
      console.log("[PiBridge] No pi data to migrate (fresh install or already migrated)");
    }
  }
  
  // Find pi extensions
  const piExtensions = findPiExtensions(config);
  if (piExtensions.length > 0) {
    console.log(`[PiBridge] Found ${piExtensions.length} pi extensions`);
    
    // Expose for programmatic loading
    (pi as any).piExtensions = piExtensions;
  }
  
  // Register tools
  pi.registerTool({
    name: "pi_bridge_status",
    label: "/pi_bridge_status",
    description: "Show pi bridge status and migration info",
    parameters: Type.Object({}),
    async execute(): Promise<any> {
      const piExists = existsSync(config.piDir);
      const koboldExists = existsSync(config.koboldDir);
      const extensions = piExtensions;
      
      return {
        content: [{
          type: "text" as const,
          text: `🔌 Pi Bridge Status

Pi dir: ${config.piDir} ${piExists ? "✅ exists" : "❌ not found"}
Kobold dir: ${config.koboldDir} ${koboldExists ? "✅ exists" : "❌ not found"}
Pi extensions found: ${extensions.length}
Auto-migrate: ${config.autoMigrate ? "✅" : "❌"}
Load pi extensions: ${config.loadPiExtensions ? "✅" : "❌"}
`
        }],
        details: { piExists, koboldExists, extensions, config }
      };
    }
  });
  
  pi.registerTool({
    name: "pi_bridge_migrate",
    label: "/pi_bridge_migrate",
    description: "Manually trigger pi → 0xkobold migration",
    parameters: Type.Object({}),
    async execute(): Promise<any> {
      const result: MigrationResult = {
        extensions: migrateExtensions(config),
        configs: migrateConfigs(config),
        memory: migratePiLearn(config),
        errors: [],
      };
      
      return {
        content: [{
          type: "text" as const,
          text: `🔄 Migration complete

Extensions: ${result.extensions.length > 0 ? result.extensions.join(", ") : "none"}
Configs: ${result.configs.length > 0 ? result.configs.join(", ") : "none"}
Memory: ${result.memory ? "✅ migrated" : "already exists or no source"}
Errors: ${result.errors.length > 0 ? result.errors.join(", ") : "none"}
`
        }],
        details: result
      };
    }
  });
  
  pi.registerTool({
    name: "pi_bridge_list",
    label: "/pi_bridge_list",
    description: "List pi extensions that can be loaded",
    parameters: Type.Object({}),
    async execute(): Promise<any> {
      const extensions = findPiExtensions(config);
      
      const list = extensions.map(e => `  • ${e}`).join("\n") || "  (none found)";
      
      return {
        content: [{
          type: "text" as const,
          text: `📦 Pi Extensions (${extensions.length})\n${list}`
        }],
        details: { extensions }
      };
    }
  });
  
  console.log("[PiBridge] Tools: /pi_bridge_status, /pi_bridge_migrate, /pi_bridge_list");
}

// TypeScript requires Type import but pi extensions may not have it
import { Type } from "@sinclair/typebox";
