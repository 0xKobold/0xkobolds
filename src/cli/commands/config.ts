/**
 * Config CLI command for Kobold
 *
 * Similar to koclaw/openclaw's `openclaw config`
 * Usage: kobold config [get|set|unset|file|validate|init] [args]
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadConfig,
  getConfig,
  writeConfig,
  getConfigValue,
  setConfigValue,
} from "../../config/loader.js";
import { getConfigPath, getDefaultConfigPath, getLocalConfigPath } from "../../config/paths.js";
import type { KoboldConfig } from "../../config/types.js";

function formatValue(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function parseSetValue(raw: string): unknown {
  // Try JSON first
  try {
    return JSON.parse(raw);
  } catch {
    // Treat as string
    return raw;
  }
}

async function ensureConfigDir(): Promise<void> {
  const configPath = getDefaultConfigPath();
  const configDir = path.dirname(configPath);
  try {
    await fs.mkdir(configDir, { recursive: true });
  } catch {
    // Directory might already exist
  }
}

async function showHelp(): Promise<void> {
  console.log(`Kobold Config - Manage kobold.json configuration

Usage:
  kobold config                           # Show help
  kobold config file                      # Show current config file path
  kobold config get <path>                # Get config value
  kobold config set <path> <value>        # Set config value (JSON or string)
  kobold config unset <path>              # Remove config value (sets to undefined)
  kobold config validate                  # Validate current config
  kobold config init                      # Create default config file
  kobold config edit                      # Open config in $EDITOR

Examples:
  kobold config get agents.defaults.heartbeat.every
  kobold config set agents.defaults.heartbeat.every "1h"
  kobold config set gateway.port 19001
  kobold config unset agents.list[0].skills

Config file locations (in order of priority):
  1. $KOBOLD_CONFIG_PATH (env var)
  2. ./kobold.json (current directory)
  3. ~/.config/kobold/kobold.json (default)`
  );
}

export async function handleConfigCommand(args: string[]): Promise<void> {
  const subcommand = args[0];

  if (!subcommand || subcommand === "help" || subcommand === "--help") {
    await showHelp();
    return;
  }

  switch (subcommand) {
    case "file": {
      const currentPath = getConfigPath();
      const exists = await fs.access(currentPath).then(() => true).catch(() => false);
      console.log(exists ? `"${currentPath}"` : `"${currentPath}" (not yet created)`);
      break;
    }

    case "get": {
      const pathArg = args[1];
      if (!pathArg) {
        console.error("Error: path required. Usage: kobold config get <path>");
        process.exit(1);
      }

      const config = await loadConfig();
      const value = getConfigValue<unknown>(pathArg);

      if (value === undefined) {
        console.error(`No value at path: ${pathArg}`);
        process.exit(1);
      }

      console.log(formatValue(value));
      break;
    }

    case "set": {
      const pathArg = args[1];
      const valueArg = args.slice(2).join(" ");

      if (!pathArg || !valueArg) {
        console.error("Error: path and value required. Usage: kobold config set <path> <value>");
        process.exit(1);
      }

      const snapshot = await loadConfig();
      const value = parseSetValue(valueArg);
      const newConfig = setConfigValue(snapshot.config, pathArg, value);

      // Determine where to write
      const configPath = getConfigPath();
      const targetPath = configPath === getDefaultConfigPath() &&
        !(await fs.access(getLocalConfigPath()).then(() => true).catch(() => false))
        ? getDefaultConfigPath()
        : configPath;

      await ensureConfigDir();
      await writeConfig(newConfig, targetPath);
      console.log(`Set ${pathArg} = ${formatValue(value)}`);
      break;
    }

    case "unset": {
      const pathArg = args[1];
      if (!pathArg) {
        console.error("Error: path required. Usage: kobold config unset <path>");
        process.exit(1);
      }

      const snapshot = await loadConfig();
      const newConfig = setConfigValue(snapshot.config, pathArg, undefined);

      const configPath = getConfigPath();
      await writeConfig(newConfig, configPath);
      console.log(`Unset ${pathArg}`);
      break;
    }

    case "validate": {
      const snapshot = await loadConfig();

      if (!snapshot.valid) {
        console.error("Config validation failed:");
        for (const issue of snapshot.issues) {
          console.error(`  ${issue.path}: ${issue.message}`);
        }
        process.exit(1);
      }

      if (snapshot.exists) {
        console.log(`✓ Config at "${snapshot.path}" is valid`);
      } else {
        console.log(`✓ Using defaults (no config file at "${snapshot.path}")`);
      }

      if (snapshot.issues.length > 0) {
        console.log("\nWarnings:");
        for (const issue of snapshot.issues) {
          console.log(`  ${issue.path}: ${issue.message}`);
        }
      }
      break;
    }

    case "init": {
      const configPath = getConfigPath();

      try {
        await fs.access(configPath);
        console.error(`Config file already exists at "${configPath}"`);
        
        // Check if --force flag is present
        if (!args.includes("--force")) {
          console.log("Use --force to overwrite");
          process.exit(1);
        }
      } catch {
        // File doesn't exist, safe to create
      }

      const defaultConfig = getConfig();
      await ensureConfigDir();
      await writeConfig(defaultConfig, configPath);
      console.log(`✓ Created config at "${configPath}"`);
      break;
    }

    case "edit": {
      const editor = process.env.EDITOR || "nano";
      const configPath = getConfigPath();

      // Create file if it doesn't exist
      try {
        await fs.access(configPath);
      } catch {
        console.log(`Config file doesn't exist. Creating default config...`);
        const defaultConfig = getConfig();
        await ensureConfigDir();
        await writeConfig(defaultConfig, configPath);
      }

      const { spawn } = await import("node:child_process");
      spawn(editor, [configPath], { stdio: "inherit" });
      break;
    }

    default:
      console.error(`Unknown subcommand: ${subcommand}`);
      await showHelp();
      process.exit(1);
  }
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  handleConfigCommand(args).catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}
