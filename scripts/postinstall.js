#!/usr/bin/env node
/**
 * Post-install script
 * - Shows welcome message
 * - Copies default agents to ~/.0xkobold/agents/
 */

import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { mkdir, copyFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const isCiEnvironment = () => {
  return process.env.CI || 
         process.env.CONTINUOUS_INTEGRATION ||
         process.env.NODE_ENV === "test";
};

async function copyDefaultAgents() {
  const agentsDir = join(homedir(), ".0xkobold", "agents");
  const sourceDir = join(__dirname, "..", "src", "extensions", "agents");
  
  try {
    // Create agents directory
    await mkdir(agentsDir, { recursive: true });
    
    // Check if source exists (development mode)
    if (!existsSync(sourceDir)) {
      return; // In production, agents are bundled differently
    }
    
    // Copy default agents if they don't exist
    const files = await readdir(sourceDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const sourcePath = join(sourceDir, file);
        const targetPath = join(agentsDir, file);
        
        if (!existsSync(targetPath)) {
          await copyFile(sourcePath, targetPath);
        }
      }
    }
    
    console.log(`   📁 Agents installed to: ${agentsDir}`);
  } catch (error) {
    // Silently fail - not critical
  }
}

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
async function main() {
  await copyDefaultAgents();
  showWelcome();
}

main();
