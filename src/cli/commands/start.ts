/**
 * Start Command
 * 
 * Start the 0xKobold gateway service
 */

import { Command } from "commander";
import { spawn } from "child_process";
import { homedir } from "os";
import { join } from "path";

export function createStartCommand(): Command {
  const cmd = new Command("start")
    .description("Start the 0xKobold gateway")
    .option("-d, --daemon", "Run as systemd service (default)")
    .option("-f, --foreground", "Run in foreground (no systemd)")
    .option("--port <port>", "Gateway port", "18789")
    .action(async (opts) => {
      if (opts.foreground) {
        await startForeground(opts.port);
      } else {
        await startSystemd();
      }
    });

  return cmd;
}

async function startForeground(port: string): Promise<void> {
  console.log(`🐉 Starting 0xKobold gateway in foreground on port ${port}...`);
  
  const proc = spawn("bun", ["run", "src/index.ts"], {
    cwd: process.cwd(),
    stdio: "inherit",
    env: {
      ...process.env,
      GATEWAY_PORT: port,
    },
  });

  proc.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

async function startSystemd(): Promise<void> {
  console.log("🐉 Starting 0xKobold systemd service...");
  
  const serviceName = "0xkobold";
  const userServicePath = join(homedir(), ".config/systemd/user", `${serviceName}.service`);
  
  // Check if service exists
  const fs = await import("fs");
  if (!fs.existsSync(userServicePath)) {
    console.error("❌ Service not installed. Run: 0xkobold system install");
    process.exit(1);
  }
  
  // Start service
  const proc = spawn("systemctl", ["--user", "start", serviceName], {
    stdio: "inherit",
  });
  
  proc.on("close", (code) => {
    if (code === 0) {
      console.log("✅ Service started successfully");
      console.log("📊 Check status: 0xkobold status");
      console.log("📜 View logs: 0xkobold logs");
    } else {
      console.error("❌ Failed to start service");
      process.exit(1);
    }
  });
}
