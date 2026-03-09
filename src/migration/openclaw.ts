/**
 * OpenClaw to 0xKobold Migration Tool - v0.3.0
 *
 * Full-featured migration supporting OpenClaw folder structure.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "os";

export interface MigrationConfig {
  sourcePath: string;
  targetPath: string;
  dryRun?: boolean;
  backup?: boolean;
  verbose?: boolean;
}

export interface MigrationResult {
  success: boolean;
  migrated: string[];
  warnings: string[];
  errors: string[];
  skipped: string[];
}

// OpenClaw config structure
interface OpenClawConfig {
  meta?: {
    lastTouchedVersion?: string;
    lastTouchedAt?: string;
  };
  wizard?: {
    lastRunAt?: string;
    lastRunVersion?: string;
    lastRunCommand?: string;
    lastRunMode?: string;
  };
  auth?: {
    profiles?: Record<string, {
      provider: string;
      mode: string;
      token?: string;
    }>;
  };
  agents?: {
    defaults?: {
      workspace?: string;
      maxConcurrent?: number;
      subagents?: {
        maxConcurrent?: number;
      };
      compaction?: {
        mode?: string;
      };
    };
  };
  channels?: {
    discord?: {
      enabled?: boolean;
      token?: string;
      dm?: { enabled?: boolean };
    };
  };
  gateway?: {
    port?: number;
    mode?: string;
    auth?: { token?: string };
    tailscale?: { mode?: string };
    remote?: { url?: string; token?: string };
  };
  llm?: {
    provider?: string;
    model?: string;
  };
  tools?: {
    allowed?: string[];
  };
  hooks?: {
    internal?: {
      enabled?: boolean;
      entries?: Record<string, { enabled?: boolean }>;
    };
  };
}

class OpenClawMigration {
  private config: Required<MigrationConfig>;
  private result: MigrationResult;

  constructor(config: MigrationConfig) {
    this.config = {
      sourcePath: config.sourcePath,
      targetPath: config.targetPath,
      dryRun: config.dryRun ?? false,
      backup: config.backup ?? true,
      verbose: config.verbose ?? true,
    };
    
    this.result = {
      success: false,
      migrated: [],
      warnings: [],
      errors: [],
      skipped: [],
    };
  }

  async migrate(): Promise<MigrationResult> {
    console.log("🔄 OpenClaw → 0xKobold Migration\n");
    console.log(`Source: ${this.config.sourcePath}`);
    console.log(`Target: ${this.config.targetPath}`);
    console.log(`Mode: ${this.config.dryRun ? "DRY RUN" : "LIVE"}\n`);

    try {
      await this.validateSource();

      if (this.config.backup && !this.config.dryRun) {
        await this.backupTarget();
      }

      // Create same folder structure as OpenClaw
      await this.createFolderStructure();

      // Migrate each component
      await this.migrateConfig();
      await this.migrateDatabase();
      await this.migrateAgents();
      await this.migrateIdentity();
      await this.migrateChannels();
      await this.migrateBrowser();
      await this.migrateCanvas();
      await this.migrateCredentials();
      await this.migrateMedia();
      await this.migrateCron();
      await this.migrateWorkspace();

      this.result.success = this.result.errors.length === 0;
      this.logSummary();
      
      return this.result;
    } catch (error) {
      this.result.errors.push(String(error));
      this.result.success = false;
      return this.result;
    }
  }

  private async validateSource(): Promise<void> {
    if (!existsSync(this.config.sourcePath)) {
      throw new Error(`Source directory not found: ${this.config.sourcePath}`);
    }

    const configPath = path.join(this.config.sourcePath, "openclaw.json");
    if (!existsSync(configPath)) {
      throw new Error(`No openclaw.json found - is this an OpenClaw installation?`);
    }

    this.log("✅", "OpenClaw installation validated");
  }

  private async backupTarget(): Promise<void> {
    if (existsSync(this.config.targetPath)) {
      const backupPath = `${this.config.targetPath}.backup.${Date.now()}`;
      this.log("📦", `Creating backup: ${backupPath}`);
      await fs.cp(this.config.targetPath, backupPath, { recursive: true });
    }
  }

  private async createFolderStructure(): Promise<void> {
    this.log("📁", "Creating folder structure...");

    const folders = [
      "agents",
      "browser",
      "canvas",
      "credentials",
      "cron",
      "devices",
      "identity",
      "media",
      "workspace",
      "skills",
    ];

    if (!this.config.dryRun) {
      await fs.mkdir(this.config.targetPath, { recursive: true });
      
      for (const folder of folders) {
        await fs.mkdir(path.join(this.config.targetPath, folder), { recursive: true });
      }
    }

    this.log("✅", "Folder structure created");
  }

  private async migrateConfig(): Promise<void> {
    this.log("📝", "Migrating configuration...");

    try {
      const sourceConfig = await this.readOpenClawConfig();
      const targetConfig = this.convertConfig(sourceConfig);

      // Save main config
      if (!this.config.dryRun) {
        const configPath = path.join(this.config.targetPath, "config.json");
        await fs.writeFile(configPath, JSON.stringify(targetConfig, null, 2), "utf-8");
        await fs.chmod(configPath, 0o600);

        // Create backup (OpenClaw style)
        const configBakPath = path.join(this.config.targetPath, "config.json.bak");
        await fs.writeFile(configBakPath, JSON.stringify(targetConfig, null, 2), "utf-8");
      }

      this.result.migrated.push("config");
      this.log("✅", "Configuration migrated with backup");
    } catch (error) {
      this.result.errors.push(`Config migration failed: ${error}`);
    }
  }

  private async migrateDatabase(): Promise<void> {
    this.log("💾", "Migrating database...");

    try {
      const sourceDbDir = path.join(this.config.sourcePath, "workspace");
      const targetDbDir = path.join(this.config.targetPath, "workspace");

      if (!existsSync(sourceDbDir)) {
        this.result.skipped.push("database");
        this.log("⚠️", "No workspace data found");
        return;
      }

      const files = await fs.readdir(sourceDbDir);
      const dbFiles = files.filter(f => f.endsWith(".db"));

      if (dbFiles.length === 0) {
        this.result.skipped.push("database");
        this.log("⚠️", "No database files found");
        return;
      }

      // Copy all databases (preserve OpenClaw structure)
      if (!this.config.dryRun) {
        for (const dbFile of dbFiles) {
          const sourceDb = path.join(sourceDbDir, dbFile);
          const targetDb = path.join(targetDbDir, dbFile);
          await fs.cp(sourceDb, targetDb);
          
          // Create backup
          await fs.cp(sourceDb, `${targetDb}.bak`);
        }

        // Also create unified kobold.db symlink or copy
        const mainDb = dbFiles.find(f => f.includes("default") || f.includes("main")) || dbFiles[0];
        if (mainDb) {
          await fs.copyFile(
            path.join(targetDbDir, mainDb),
            path.join(this.config.targetPath, "kobold.db")
          );
        }
      }

      this.result.migrated.push("database");
      this.log("✅", `Migrated ${dbFiles.length} database(s) with backups`);
    } catch (error) {
      this.result.errors.push(`Database migration failed: ${error}`);
    }
  }

  private async migrateAgents(): Promise<void> {
    this.log("🤖", "Migrating agents...");

    try {
      const sourceAgentsDir = path.join(this.config.sourcePath, "agents");
      const targetAgentsDir = path.join(this.config.targetPath, "agents");

      if (!existsSync(sourceAgentsDir)) {
        this.result.skipped.push("agents");
        return;
      }

      if (!this.config.dryRun) {
        await fs.cp(sourceAgentsDir, targetAgentsDir, { recursive: true });
      }

      this.result.migrated.push("agents");
      this.log("✅", "Agents migrated");
    } catch (error) {
      this.result.warnings.push(`Agent migration incomplete: ${error}`);
    }
  }

  private async migrateIdentity(): Promise<void> {
    this.log("🔐", "Migrating identity...");

    try {
      const identityDir = path.join(this.config.sourcePath, "identity");
      const targetIdentityDir = path.join(this.config.targetPath, "identity");
      const targetDevicesDir = path.join(this.config.targetPath, "devices");

      if (!existsSync(identityDir)) {
        this.result.skipped.push("identity");
        return;
      }

      if (!this.config.dryRun) {
        // Copy identity folder
        await fs.cp(identityDir, targetIdentityDir, { recursive: true });
        
        // Also convert to 0xKobold format in devices/
        const deviceJson = path.join(identityDir, "device.json");
        if (existsSync(deviceJson)) {
          const device = JSON.parse(await fs.readFile(deviceJson, "utf-8"));
          await fs.writeFile(
            path.join(targetDevicesDir, `${device.id || "device"}.json`),
            JSON.stringify(device, null, 2),
            "utf-8"
          );
        }

        // Migrate tokens
        const tokenFile = path.join(identityDir, "tokens.json");
        if (existsSync(tokenFile)) {
          await fs.cp(tokenFile, path.join(this.config.targetPath, ".device-token"));
        }
      }

      this.result.migrated.push("identity");
      this.result.migrated.push("device-identity");
      this.log("✅", "Identity migrated (both formats)");
    } catch (error) {
      this.result.warnings.push(`Identity migration incomplete: ${error}`);
    }
  }

  private async migrateChannels(): Promise<void> {
    this.log("📱", "Migrating channels...");

    try {
      // Devices folder in OpenClaw may have channel data
      const devicesDir = path.join(this.config.sourcePath, "devices");
      
      if (existsSync(devicesDir)) {
        const files = await fs.readdir(devicesDir);
        
        for (const file of files) {
          if (file.includes("whatsapp") || file.includes("baileys") || file.includes("telegram")) {
            if (!this.config.dryRun) {
              const wsDir = path.join(this.config.targetPath, file.replace("device-", ""));
              await fs.mkdir(wsDir, { recursive: true });
              await fs.cp(
                path.join(devicesDir, file),
                path.join(wsDir, path.basename(file))
              );
            }
            this.result.migrated.push(`channel-${file}`);
          }
        }
      }

      this.log("✅", "Channels migrated");
    } catch (error) {
      this.result.warnings.push(`Channel migration incomplete: ${error}`);
    }
  }

  private async migrateBrowser(): Promise<void> {
    this.log("🌐", "Migrating browser data...");

    try {
      const sourceDir = path.join(this.config.sourcePath, "browser");
      const targetDir = path.join(this.config.targetPath, "browser");

      if (!existsSync(sourceDir)) {
        this.result.skipped.push("browser");
        return;
      }

      if (!this.config.dryRun) {
        await fs.cp(sourceDir, targetDir, { recursive: true });
      }

      this.result.migrated.push("browser");
      this.log("✅", "Browser data migrated");
    } catch (error) {
      this.result.warnings.push(`Browser migration incomplete: ${error}`);
    }
  }

  private async migrateCanvas(): Promise<void> {
    this.log("🎨", "Migrating canvas data...");

    try {
      const sourceDir = path.join(this.config.sourcePath, "canvas");
      const targetDir = path.join(this.config.targetPath, "canvas");

      if (!existsSync(sourceDir)) {
        this.result.skipped.push("canvas");
        return;
      }

      if (!this.config.dryRun) {
        await fs.cp(sourceDir, targetDir, { recursive: true });
      }

      this.result.migrated.push("canvas");
      this.log("✅", "Canvas data migrated");
    } catch (error) {
      this.result.warnings.push(`Canvas migration incomplete: ${error}`);
    }
  }

  private async migrateCredentials(): Promise<void> {
    this.log("🔑", "Migrating credentials...");

    try {
      const sourceDir = path.join(this.config.sourcePath, "credentials");
      const targetDir = path.join(this.config.targetPath, "credentials");

      if (!existsSync(sourceDir)) {
        this.result.skipped.push("credentials");
        return;
      }

      if (!this.config.dryRun) {
        await fs.cp(sourceDir, targetDir, { recursive: true });
        // Secure permissions
        await fs.chmod(targetDir, 0o700);
      }

      this.result.migrated.push("credentials");
      this.log("✅", "Credentials migrated (secure)");
    } catch (error) {
      this.result.warnings.push(`Credentials migration incomplete: ${error}`);
    }
  }

  private async migrateMedia(): Promise<void> {
    this.log("🎵", "Migrating media...");

    try {
      const sourceDir = path.join(this.config.sourcePath, "media");
      const targetDir = path.join(this.config.targetPath, "media");

      if (!existsSync(sourceDir)) {
        this.result.skipped.push("media");
        return;
      }

      if (!this.config.dryRun) {
        await fs.cp(sourceDir, targetDir, { recursive: true });
      }

      this.result.migrated.push("media");
      this.log("✅", "Media migrated");
    } catch (error) {
      this.result.warnings.push(`Media migration incomplete: ${error}`);
    }
  }

  private async migrateCron(): Promise<void> {
    this.log("⏰", "Migrating cron jobs...");

    try {
      const sourceDir = path.join(this.config.sourcePath, "cron");
      const targetDir = path.join(this.config.targetPath, "cron");

      if (!existsSync(sourceDir)) {
        this.result.skipped.push("cron");
        return;
      }

      if (!this.config.dryRun) {
        await fs.cp(sourceDir, targetDir, { recursive: true });
      }

      this.result.migrated.push("cron");
      this.log("✅", "Cron jobs migrated");
    } catch (error) {
      this.result.warnings.push(`Cron migration incomplete: ${error}`);
    }
  }

  private async migrateWorkspace(): Promise<void> {
    this.log("💼", "Migrating workspace...");

    try {
      const sourceDir = path.join(this.config.sourcePath, "workspace");
      const targetDir = path.join(this.config.targetPath, "workspace");

      if (!existsSync(sourceDir)) {
        this.result.skipped.push("workspace");
        return;
      }

      // Copy non-DB files (DBs handled separately)
      const files = await fs.readdir(sourceDir);
      
      if (!this.config.dryRun) {
        for (const file of files) {
          if (!file.endsWith(".db")) {
            await fs.cp(
              path.join(sourceDir, file),
              path.join(targetDir, file),
              { recursive: true }
            );
          }
        }
      }

      this.result.migrated.push("workspace-files");
      this.log("✅", "Workspace files migrated");
    } catch (error) {
      this.result.warnings.push(`Workspace migration incomplete: ${error}`);
    }
  }

  private async readOpenClawConfig(): Promise<OpenClawConfig> {
    const configPath = path.join(this.config.sourcePath, "openclaw.json");
    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content);
  }

  private convertConfig(source: OpenClawConfig): Record<string, unknown> {
    const target: Record<string, unknown> = {
      version: "0.3.0-migrated",
      _migratedFrom: {
        tool: "OpenClaw",
        version: source.meta?.lastTouchedVersion || "unknown",
        date: new Date().toISOString(),
      },
      
      persona: {
        name: "0xKobold",
        emoji: "🐉",
        description: "Migrated from OpenClaw",
      },

      llm: Object.fromEntries(
        Object.entries({
          provider: source.auth?.profiles?.["anthropic:claude"] ? "claude" : "ollama",
          model: "claude-3-sonnet-20240229",
          maxTokens: 4000,
          temperature: 0.7,
        }).filter(([, v]) => v !== undefined)
      ),

      gateway: {
        enabled: true,
        port: source.gateway?.port || 18789,
        host: source.gateway?.mode === "remote" ? "0.0.0.0" : "localhost",
        cors: ["*"],
        remote: source.gateway?.remote?.url ? {
          enabled: true,
          url: source.gateway.remote.url,
          token: source.gateway.remote.token,
          autoReconnect: true,
          reconnectDelay: 1000,
        } : {
          enabled: false,
        },
        tailscale: {
          enabled: source.gateway?.tailscale?.mode === "on",
          autoConnect: true,
        },
      },

      channels: {
        discord: {
          enabled: source.channels?.discord?.enabled || false,
          token: source.channels?.discord?.token,
          dm: {
            enabled: source.channels?.discord?.dm?.enabled || false,
          },
        },
      },

      agents: {
        maxConcurrent: source.agents?.defaults?.maxConcurrent || 4,
        subagents: {
          maxConcurrent: source.agents?.defaults?.subagents?.maxConcurrent || 8,
        },
        compaction: {
          mode: source.agents?.defaults?.compaction?.mode || "safeguard",
        },
      },

      hooks: source.hooks?.internal || { enabled: true },

      tools: {
        allowed: source.tools?.allowed || [],
      },

      _migrationNotes: [
        "Review LLM API keys in config.json",
        "Verify Discord token if enabled",
        "Check remote gateway URL if configured",
        "Database converted on first run",
        "All OpenClaw folders migrated",
      ],
    };

    return target;
  }

  private log(level: string, message: string): void {
    if (this.config.verbose) {
      console.log(`${level} ${message}`);
    }
  }

  private logSummary(): void {
    console.log("\n" + "=".repeat(60));
    console.log("MIGRATION SUMMARY");
    console.log("=".repeat(60));

    if (this.result.success) {
      console.log("\n✅ Status: SUCCESS");
    } else {
      console.log("\n❌ Status: FAILED");
    }

    console.log(`\nMigrated (${this.result.migrated.length}):`);
    this.result.migrated.forEach(item => {
      console.log(`  ✅ ${item}`);
    });

    if (this.result.warnings.length > 0) {
      console.log(`\nWarnings (${this.result.warnings.length}):`);
      this.result.warnings.forEach(w => {
        console.log(`  ⚠️  ${w}`);
      });
    }

    if (this.result.errors.length > 0) {
      console.log(`\nErrors (${this.result.errors.length}):`);
      this.result.errors.forEach(e => {
        console.log(`  ❌ ${e}`);
      });
    }

    if (this.result.skipped.length > 0) {
      console.log(`\nSkipped (${this.result.skipped.length}):`);
      this.result.skipped.forEach(s => {
        console.log(`  ⏭️  ${s}`);
      });
    }

    console.log("\n" + "=".repeat(60));
    
    if (this.config.dryRun) {
      console.log("\n🔍 This was a DRY RUN. No changes were made.");
      console.log("   To migrate: 0xkobold migrate --live");
    } else {
      console.log("\n✅ Migration complete!");
      console.log("   Review ~/.0xkobold/config.json and the _migrationNotes.");
    }
  }
}

// CLI command
export async function runMigration(options: {
  source?: string;
  target?: string;
  dryRun?: boolean;
  force?: boolean;
}): Promise<void> {
  const sourcePath = options.source || path.join(homedir(), ".openclaw");
  const targetPath = options.target || path.join(homedir(), ".0xkobold");

  const migration = new OpenClawMigration({
    sourcePath,
    targetPath,
    dryRun: options.dryRun ?? !options.force,
    verbose: true,
  });

  const result = await migration.migrate();
  process.exit(result.success ? 0 : 1);
}

export { OpenClawMigration };
export default OpenClawMigration;
