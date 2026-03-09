/**
 * 0xKobold CLI Program
 * 
 * Main CLI program using Commander.js
 * Based on OpenClaw CLI patterns
 */

import { Command } from "commander";
import { version } from "../../package.json" assert { type: "json" };

// Core commands
import { createStartCommand } from "./commands/start.js";
import { createStopCommand } from "./commands/stop.js";
import { createStatusCommand } from "./commands/status.js";
import { createLogsCommand } from "./commands/logs.js";

// System commands
import { createSystemCommand } from "./commands/system.js";
import { setupCommand } from "./commands/setup.js";

// Extension CLI registrations
import { registerDiscordCli } from "./extensions/discord.js";
import { registerHeartbeatCli } from "./extensions/heartbeat.js";
import { registerEnvCli } from "./extensions/env.js";

// v0.2.0: Embedded mode
import { createEmbeddedCommand } from "./commands/embedded.js";

export function createCli(): Command {
  const program = new Command("0xkobold")
    .version(version || "1.0.0")
    .description("0xKobold - Multi-Agent Automation Platform")
    .configureOutput({
      writeOut: (str) => process.stdout.write(str),
      writeErr: (str) => process.stderr.write(str),
    })
    .showHelpAfterError("\nUse --help for more information.");

  // Core service commands
  program.addCommand(createStartCommand());
  program.addCommand(createStopCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createLogsCommand());
  
  // System management (install/uninstall)
  const systemCmd = createSystemCommand();
  program.addCommand(systemCmd);

  // Setup wizard
  program.addCommand(setupCommand);

  // Extension CLIs
  registerDiscordCli(program);
  program.addCommand(createEmbeddedCommand());
  registerHeartbeatCli(program);
  registerEnvCli(program);

  // Default: TUI mode
  program
    .command("tui", { isDefault: true })
    .description("Start interactive TUI (default)")
    .option("--mode <mode>", "Start in specific mode (plan|build)")
    .option("--local", "Run in local project mode (uses CWD settings)")
    .action(async (opts) => {
      // Set local mode if flag is present
      if (opts.local) {
        process.env.KOBOLD_LOCAL_MODE = 'true';
        process.argv.push('--local');
      }
      // Launch TUI
      const { main } = await import("../index.js");
      await main();
    });

  // Local mode command (explicit)
  program
    .command("local")
    .description("Start TUI in local project mode (uses CWD for settings)")
    .option("--mode <mode>", "Start in specific mode (plan|build)")
    .action(async (opts) => {
      process.env.KOBOLD_LOCAL_MODE = 'true';
      process.argv.push('--local');
      const { main } = await import("../index.js");
      await main();
    });

  return program;
}
