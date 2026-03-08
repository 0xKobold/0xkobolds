#!/usr/bin/env node
/**
 * Post-install welcome message
 * Shows when users install 0xKobold via npm
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";

const isCiEnvironment = () => {
  return process.env.CI || 
         process.env.CONTINUOUS_INTEGRATION ||
         process.env.NODE_ENV === "test";
};

const showWelcome = () => {
  const configPath = join(homedir(), ".0xkobold", "config.json");
  const isConfigured = existsSync(configPath);

  console.log(`
╔════════════════════════════════════════════════════════╗
║                  🐲 0xKobold Installed                 ║
╚════════════════════════════════════════════════════════╝

   Your personal AI assistant with multi-agent capabilities

`);

  if (!isConfigured) {
    console.log(`   Quick start:
   ────────────
   1. Configure 0xKobold:
      0xkobold setup

   2. Start the TUI:
      0xkobold

   3. Or start in specific mode:
      0xkobold --mode plan    # For planning/research
      0xkobold --mode build   # For implementation

   Requirements:
   ─────────────
   • Bun runtime required (0xKobold will check for it)
   • Install Bun: curl -fsSL https://bun.sh/install | bash

   Documentation:
   ──────────────
   • GitHub: https://github.com/kobolds/0xKobolds
   • Usage:  0xkobold --help
   • VPS:    https://github.com/kobolds/0xKobolds/blob/main/docs/VPS-DEPLOYMENT.md

`);
  } else {
    console.log(`   Your 0xKobold is configured.
   
   Start with: 0xkobold
   Gateway:    0xkobold gateway start
   Status:     0xkobold status

`);
  }

  if (isCiEnvironment()) {
    process.exit(0);
  }
};

// Only show in actual install, not CI
showWelcome();
