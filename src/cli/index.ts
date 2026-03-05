#!/usr/bin/env bun

import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { daemonCommand } from "./commands/daemon.js";
import { chatCommand } from "./commands/chat.js";
import { agentCommand } from "./commands/agent.js";
import { statusCommand } from "./commands/status.js";
import { gatewayCommand } from "./commands/gateway.js";
import { updateCommand } from "./commands/update.js";
import { modeCommand } from "./commands/mode.js";
import { tuiCommand } from "./commands/tui.js";
import { startRepl } from "./repl.js";

// Dynamically get version from package.json
const packageJson = await Bun.file(new URL("../../package.json", import.meta.url)).json();
const VERSION = packageJson.version;

const program = new Command();

program
  .name("0xkobold")
  .description("Your digital familiar - a personal AI assistant that learns and evolves")
  .version(VERSION)
  .option("-v, --verbose", "Enable verbose logging")
  .option("-c, --config <path>", "Path to config file")
  .option("-i, --interactive", "Start interactive REPL mode")
  .action(async (options) => {
    if (options.interactive) {
      await startRepl();
    }
  });

program.addCommand(initCommand);
program.addCommand(daemonCommand);
program.addCommand(gatewayCommand);
program.addCommand(chatCommand);
program.addCommand(agentCommand);
program.addCommand(statusCommand);
program.addCommand(modeCommand);
program.addCommand(updateCommand);
program.addCommand(tuiCommand);

program.parse();
