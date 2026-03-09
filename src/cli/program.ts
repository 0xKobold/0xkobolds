/**
 * 0xKobold CLI Program
 * 
 * Main CLI program using Commander.js
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

// v0.2.0: Gateway command
import { createGatewayCommand } from "./commands/gateway.js";

// v0.2.0: Embedded mode
import { createEmbeddedCommand } from "./commands/embedded.js";

export function createCli(): Command {
  const program = new Command("0xkobold")
    .version(version || "1.0.0")
    .description("0xKobold - Multi-Agent Automation Platform")
    .showHelpAfterError("\nUse --help for more information.");

  // Core service commands
  program.addCommand(createStartCommand());
  program.addCommand(createStopCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createLogsCommand());
  
  // System management
  program.addCommand(createSystemCommand());
  program.addCommand(setupCommand);

  // v0.2.0: Gateway server
  program.addCommand(createGatewayCommand());
  program.addCommand(createEmbeddedCommand());

  // Extension CLIs
  registerDiscordCli(program);
  registerHeartbeatCli(program);
  registerEnvCli(program);

  // Default: TUI mode
  program
    .command("tui", { isDefault: true })
    .description("Start interactive TUI (default)")
    .action(async () => {
      const { main } = await import("../index.js");
      await main();
    });

  return program;
}
