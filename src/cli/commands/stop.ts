/**
 * Stop Command
 * 
 * Stop the 0xKobold gateway service
 */

import { Command } from "commander";
import { spawn } from "child_process";

export function createStopCommand(): Command {
  return new Command("stop")
    .description("Stop the 0xKobold gateway")
    .action(async () => {
      console.log("🛑 Stopping 0xKobold service...");
      
      const proc = spawn("systemctl", ["--user", "stop", "0xkobold"], {
        stdio: "inherit",
      });
      
      proc.on("close", (code) => {
        if (code === 0) {
          console.log("✅ Service stopped");
        } else {
          console.error("❌ Failed to stop service");
          process.exit(1);
        }
      });
    });
}
