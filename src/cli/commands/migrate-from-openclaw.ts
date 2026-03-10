/**
 * Migrate from OpenClaw Command - v0.4.5
 * 
 * One-command complete migration from OpenClaw to 0xKobold
 */

import { Command } from "commander";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const migrateFromOpenClawCommand = new Command("from-openclaw")
  .description("Complete migration from OpenClaw to 0xKobold")
  .option("--dry-run", "Preview migration without applying")
  .option("--live", "Apply migration changes")
  .action(async (options) => {
    const mode = options.live ? "--live" : "--dry-run";
    
    // Find the script
    const scriptPath = join(__dirname, "..", "..", "scripts", "migrate-from-openclaw.sh");
    
    console.log("🐉 OpenClaw → 0xKobold Migration\n");
    
    return new Promise((resolve, reject) => {
      const child = spawn("bash", [scriptPath, mode], {
        stdio: "inherit",
        shell: false
      });
      
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Migration script exited with code ${code}`));
        }
      });
      
      child.on("error", (err) => {
        reject(err);
      });
    });
  });
