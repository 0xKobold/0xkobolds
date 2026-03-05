import { Command } from "commander";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const KOBOLD_DIR = join(homedir(), ".0xkobold");
const PID_FILE = join(KOBOLD_DIR, "daemon.pid");

export const statusCommand = new Command("status")
  .description("Show 0xKobold status")
  .action(async () => {
    try {
      console.log("🐲 0xKobold Status\n");
      
      // Check if initialized
      if (!existsSync(KOBOLD_DIR)) {
        console.log("❌ Not initialized");
        console.log("   Run: 0xkobold init");
        return;
      }
      
      console.log("✅ Initialized");
      console.log(`   Config: ${KOBOLD_DIR}`);
      
      // Check daemon status
      if (existsSync(PID_FILE)) {
        const pid = await readFile(PID_FILE, "utf-8");
        console.log(`✅ Daemon running (PID: ${pid.trim()})`);
      } else {
        console.log("⭕ Daemon stopped");
        console.log("   Run: 0xkobold daemon start");
      }
      
      // Check local workspace
      if (existsSync(".0xkobold")) {
        console.log("✅ Local workspace: .0xkobold/");
      } else {
        console.log("⭕ No local workspace");
      }
      
    } catch (error) {
      console.error("❌ Error checking status:", error);
    }
  });
