#!/usr/bin/env bun

import { Command } from "commander";
import { spawn, exec } from "node:child_process";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const KOBOLD_DIR = join(homedir(), ".0xkobold");
const GATEWAY_PID_FILE = join(KOBOLD_DIR, "gateway.pid");

async function isGatewayRunning(): Promise<boolean> {
  try {
    if (!existsSync(GATEWAY_PID_FILE)) return false;
    const pid = parseInt(await readFile(GATEWAY_PID_FILE, "utf-8"));
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function getGatewayPid(): Promise<number | null> {
  try {
    if (!existsSync(GATEWAY_PID_FILE)) return null;
    return parseInt(await readFile(GATEWAY_PID_FILE, "utf-8"));
  } catch {
    return null;
  }
}

const startCommand = new Command("start")
  .description("Start the 0xKobold WebSocket gateway")
  .option("-p, --port <port>", "Port to listen on", "18789")
  .option("-h, --host <host>", "Host to bind to", "127.0.0.1")
  .option("-d, --detach", "Run in background", true)
  .action(async (options) => {
    try {
      if (await isGatewayRunning()) {
        const pid = await getGatewayPid();
        console.log(`⚠️  Gateway is already running (PID: ${pid})`);
        return;
      }

      console.log("🚀 Starting 0xKobold gateway...");

      // Use the new extension-based gateway via pi-coding-agent
      const mainScript = join(process.cwd(), "src/index.ts");

      if (!existsSync(mainScript)) {
        console.error("❌ Main script not found: src/index.ts");
        process.exit(1);
      }

      const env = {
        ...process.env,
        KOBOLD_GATEWAY_PORT: options.port,
        KOBOLD_GATEWAY_HOST: options.host,
      };

      if (options.detach) {
        const child = spawn("bun", ["run", mainScript, "--command", "gateway:start", "--", `--port=${options.port}`], {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
          env,
        });

        child.unref();
        if (child.pid) {
          await writeFile(GATEWAY_PID_FILE, child.pid.toString());
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));

        if (await isGatewayRunning()) {
          console.log(`✓ Gateway started (PID: ${child.pid}, ${options.host}:${options.port})`);
        } else {
          console.error("❌ Failed to start gateway");
          process.exit(1);
        }
      } else {
        const child = spawn("bun", ["run", mainScript, "--command", "gateway:start", "--", `--port=${options.port}`], {
          stdio: "inherit",
          env,
        });

        if (child.pid) {
          await writeFile(GATEWAY_PID_FILE, child.pid.toString());
        }

        child.on("exit", async (code) => {
          if (existsSync(GATEWAY_PID_FILE)) {
            await unlink(GATEWAY_PID_FILE);
          }
          process.exit(code || 0);
        });
      }
    } catch (error) {
      console.error("❌ Failed to start gateway:", error);
      process.exit(1);
    }
  });

const stopCommand = new Command("stop")
  .description("Stop the 0xKobold gateway")
  .action(async () => {
    try {
      const pid = await getGatewayPid();

      if (!pid) {
        console.log("⚠️  Gateway is not running");
        return;
      }

      console.log("🛑 Stopping gateway...");

      try {
        process.kill(pid, "SIGTERM");

        let attempts = 0;
        while ((await isGatewayRunning()) && attempts < 10) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          attempts++;
        }

        if (await isGatewayRunning()) {
          process.kill(pid, "SIGKILL");
          console.log("✓ Gateway force stopped");
        } else {
          console.log("✓ Gateway stopped gracefully");
        }
      } catch (error) {
        console.log("⚠️  Gateway process not found, cleaning up...");
      }

      if (existsSync(GATEWAY_PID_FILE)) {
        await unlink(GATEWAY_PID_FILE);
      }
    } catch (error) {
      console.error("❌ Failed to stop gateway:", error);
      process.exit(1);
    }
  });

const statusCommand = new Command("status")
  .description("Check gateway status")
  .action(async () => {
    try {
      const running = await isGatewayRunning();
      const pid = await getGatewayPid();

      if (running && pid) {
        console.log(`✓ Gateway is running (PID: ${pid})`);

        // Also check HTTP endpoint
        try {
          const response = await fetch("http://127.0.0.1:18789/health");
          if (response.ok) {
            const data = await response.json();
            console.log(`  WebSocket: ws://127.0.0.1:18789`);
            console.log(`  Agents: ${data.agents || 0}`);
            console.log(`  Clients: ${data.clients || 0}`);
          }
        } catch {
          console.log("  (HTTP health check failed)");
        }
      } else {
        console.log("✗ Gateway is not running");

        if (existsSync(GATEWAY_PID_FILE)) {
          console.log("   (stale PID file detected, cleaning up...)");
          await unlink(GATEWAY_PID_FILE);
        }
      }
    } catch (error) {
      console.error("❌ Failed to check status:", error);
      process.exit(1);
    }
  });

const restartCommand = new Command("restart")
  .description("Restart the gateway")
  .action(async () => {
    console.log("🔄 Restarting gateway...");
    await stopCommand.parseAsync([]);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await startCommand.parseAsync([]);
  });

export const gatewayCommand = new Command("gateway")
  .description("Manage the 0xKobold WebSocket gateway")
  .addCommand(startCommand)
  .addCommand(stopCommand)
  .addCommand(statusCommand)
  .addCommand(restartCommand);
