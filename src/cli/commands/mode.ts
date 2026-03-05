import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, join } from "path";
import { homedir } from "os";

const MODE_CONFIG_FILE = join(homedir(), ".0xkobold", "modes.json");

interface ModeConfig {
  currentMode: string;
  customModes: any[];
}

function loadConfig(): ModeConfig {
  try {
    if (existsSync(MODE_CONFIG_FILE)) {
      const content = readFileSync(MODE_CONFIG_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // ignore
  }
  return { currentMode: "build", customModes: [] };
}

function saveConfig(config: ModeConfig): void {
  try {
    const dir = join(homedir(), ".0xkobold");
    if (!existsSync(dir)) {
      import("fs").then((fs) => fs.mkdirSync(dir, { recursive: true }));
    }
    writeFileSync(MODE_CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Failed to save mode config:", error);
  }
}

export const modeCommand = new Command().name("mode").description("Manage 0xKobold agent modes");

modeCommand
  .command("plan")
  .description("Switch to PLAN mode (investigation and planning)")
  .action(async () => {
    const config = loadConfig();
    config.currentMode = "plan";
    saveConfig(config);
    console.log("🔍 Switched to PLAN mode");
    console.log("   Read-only tools enabled. Focus on investigation.");
    console.log("   Use /build in TUI or '0xkobold mode build' to switch back.");
  });

modeCommand
  .command("build")
  .description("Switch to BUILD mode (implementation)")
  .action(async () => {
    const config = loadConfig();
    config.currentMode = "build";
    saveConfig(config);
    console.log("🔨 Switched to BUILD mode");
    console.log("   Full tool access enabled.");
    console.log("   Use /plan in TUI or '0xkobold mode plan' to switch.");
  });

modeCommand
  .command("show")
  .description("Show current mode")
  .action(async () => {
    const config = loadConfig();
    const modeIcons: Record<string, string> = {
      plan: "🔍",
      build: "🔨",
    };
    const icon = modeIcons[config.currentMode] || "⚙️";
    console.log(`${icon} Current mode: ${config.currentMode.toUpperCase()}`);

    if (config.currentMode === "plan") {
      console.log("   Focus: Investigation, analysis, planning");
      console.log("   Tools: Read-only, web search, file reading");
    } else {
      console.log("   Focus: Implementation, execution");
      console.log("   Tools: Full access including write and shell");
    }
  });

modeCommand
  .command("list")
  .alias("ls")
  .description("List available modes")
  .action(async () => {
    console.log("Available modes:");
    console.log("  🔍 plan   - Investigation and planning mode");
    console.log("             Read-only tools, focus on research");
    console.log("  🔨 build  - Implementation mode (default)");
    console.log("             Full tool access, focus on execution");

    const config = loadConfig();
    if (config.customModes.length > 0) {
      console.log("\nCustom modes:");
      for (const mode of config.customModes) {
        console.log(`  ${mode.icon || "⚙️"} ${mode.id} - ${mode.description}`);
      }
    }
  });

modeCommand
  .command("config")
  .description("Show mode configuration file path")
  .action(async () => {
    console.log(`Mode config: ${MODE_CONFIG_FILE}`);
    const config = loadConfig();
    console.log("\nCurrent configuration:");
    console.log(JSON.stringify(config, null, 2));
  });
