#!/usr/bin/env bun
/**
 * 0xKobold Setup Command
 * 
 * Interactive setup wizard for first-time users.
 * Guides through configuration and first run.
 */

import { Command } from "commander";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { Database } from "bun:sqlite";

const KOBOLD_DIR = join(homedir(), ".0xkobold");
const CONFIG_PATH = join(KOBOLD_DIR, "config.json");

const DEFAULT_CONFIG = {
  version: "0.0.4",
  llm: {
    provider: "ollama",
    model: "qwen2.5-coder:14b",
    maxTokens: 4000,
    temperature: 0.7,
    cloud: {
      enabled: false,
      endpoint: "",
      apiKey: "",
      model: "kimi-k2.5"
    }
  },
  gateway: {
    port: 18789,
    host: "127.0.0.1",
    enabled: false
  },
  discord: {
    enabled: false,
    token: "",
    channelId: ""
  },
  extensions: [
    "core/mcp-extension",
    "core/mode-manager-extension",
    "core/websearch-extension",
    "core/heartbeat-extension",
    "core/ollama-router-extension",
    "core/ollama-cloud-extension",
    "core/discord-bridge-extension"
  ]
};

function checkBun(): boolean {
  try {
    const result = Bun.spawnSync(["bun", "--version"]);
    return result.success;
  } catch {
    return false;
  }
}

function getBunInstallCommand(): string {
  const platform = process.platform;
  if (platform === "darwin" || platform === "linux") {
    return "curl -fsSL https://bun.sh/install | bash";
  }
  if (platform === "win32") {
    return "powershell -c \"irm bun.sh/install.ps1 | iex\"";
  }
  return "# Install Bun: https://bun.sh/docs/installation";
}

export const setupCommand = new Command("setup")
  .description("Interactive setup wizard for 0xKobold")
  .option("-q, --quick", "Quick setup (accept defaults)")
  .action(async (options) => {
    console.log("🐲 Welcome to 0xKobold Setup\n");

    // Check for Bun
    if (!checkBun()) {
      console.log("❌ Bun is required but not installed.");
      console.log("\nInstall Bun with:\n");
      console.log(`   ${getBunInstallCommand()}`);
      console.log("\nThen restart your terminal and run: 0xkobold setup");
      process.exit(1);
    }

    console.log("✓ Bun detected\n");

    // Check if already initialized
    if (existsSync(CONFIG_PATH) && !options.quick) {
      console.log(`⚠️  0xKobold is already configured at ${CONFIG_PATH}`);
      console.log("\nTo reconfigure, run: 0xkobold setup --force");
      console.log("To check status: 0xkobold status");
      console.log("To start TUI: 0xkobold\n");
      return;
    }

    // Create directory
    await mkdir(KOBOLD_DIR, { recursive: true });

    if (options.quick) {
      console.log("⚡ Quick setup mode (using defaults)...\n");
      
      // Write default config
      await writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
      
      // Create database
      const db = new Database(join(KOBOLD_DIR, "kobold.db"));
      db.exec(`
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          metadata TEXT
        );
        CREATE TABLE IF NOT EXISTS memory (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT UNIQUE NOT NULL,
          value TEXT NOT NULL,
          category TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      db.close();

      console.log("✓ Configuration created");
      console.log(`✓ Database initialized at ${join(KOBOLD_DIR, "kobold.db")}`);
    } else {
      console.log("📋 Configuration Options:\n");
      console.log("   LLM Provider: Ollama (local)");
      console.log("   Default Model: qwen2.5-coder:14b");
      console.log("   Gateway: Disabled (run '0xkobold gateway start' to enable)");
      console.log("   Discord: Disabled (configure in config.json to enable)\n");
      
      // Write config
      await writeFile(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
      console.log("✓ Configuration saved");
    }

    // Success message
    console.log("\n🎉 0xKobold is ready!\n");
    console.log("Next steps:\n");
    console.log("   1. Start the TUI:");
    console.log("      0xkobold\n");
    console.log("   2. Or start with a specific mode:");
    console.log("      0xkobold --mode plan   # For planning/research");
    console.log("      0xkobold --mode build  # For implementation\n");
    console.log("   3. Edit config:");
    console.log(`      ${CONFIG_PATH}\n`);
    console.log("   4. Start WebSocket gateway:");
    console.log("      0xkobold gateway start\n");
    console.log("Documentation: https://github.com/kobolds/0xKobolds#readme");
  });
