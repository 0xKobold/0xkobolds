import { Command } from "commander";
import { spawn, exec } from "node:child_process";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { promisify } from "node:util";

const execAsync = promisify(exec);
const KOBOLD_DIR = join(homedir(), ".0xkobold");
const PID_FILE = join(KOBOLD_DIR, "daemon.pid");
const LOG_FILE = join(KOBOLD_DIR, "daemon.log");

async function isDaemonRunning(): Promise<boolean> {
  try {
    if (!existsSync(PID_FILE)) return false;
    const pid = parseInt(await readFile(PID_FILE, "utf-8"));
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function getDaemonPid(): Promise<number | null> {
  try {
    if (!existsSync(PID_FILE)) return null;
    return parseInt(await readFile(PID_FILE, "utf-8"));
  } catch {
    return null;
  }
}

const startCommand = new Command("start")
  .description("Start the 0xKobold daemon")
  .option("-d, --detach", "Run daemon in background (default: true)")
  .option("-p, --port <port>", "Port to listen on", "3456")
  .action(async (options) => {
    try {
      if (await isDaemonRunning()) {
        const pid = await getDaemonPid();
        console.log(`⚠️  Daemon is already running (PID: ${pid})`);
        return;
      }

      console.log("🚀 Starting 0xKobold daemon...");

      // Use TypeScript file directly with Bun (no build required)
      const daemonScript = join(process.cwd(), "daemon/index.ts");
      
      if (!existsSync(daemonScript)) {
        console.error("❌ Daemon script not found: daemon/index.ts");
        process.exit(1);
      }

      const env = {
        ...process.env,
        KOBOLD_PORT: options.port,
        KOBOLD_DIR
      };

      if (options.detach !== false) {
        const child = spawn("bun", ["run", daemonScript], {
          detached: true,
          stdio: ["ignore", "ignore", "ignore"],
          env
        });

        child.unref();
        if (child.pid) {
          await writeFile(PID_FILE, child.pid.toString());
        }
        
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        if (await isDaemonRunning()) {
          console.log(`✓ Daemon started (PID: ${child.pid}, Port: ${options.port})`);
        } else {
          console.error("❌ Failed to start daemon");
          process.exit(1);
        }
      } else {
        const child = spawn("bun", ["run", daemonScript], {
          stdio: "inherit",
          env
        });

        if (child.pid) {
          await writeFile(PID_FILE, child.pid.toString());
        }
        
        child.on("exit", async (code) => {
          if (existsSync(PID_FILE)) {
            await unlink(PID_FILE);
          }
          process.exit(code || 0);
        });
      }
    } catch (error) {
      console.error("❌ Failed to start daemon:", error);
      process.exit(1);
    }
  });

const stopCommand = new Command("stop")
  .description("Stop the 0xKobold daemon")
  .action(async () => {
    try {
      const pid = await getDaemonPid();
      
      if (!pid) {
        console.log("⚠️  Daemon is not running");
        return;
      }

      console.log("🛑 Stopping daemon...");
      
      try {
        process.kill(pid, "SIGTERM");
        
        let attempts = 0;
        while (await isDaemonRunning() && attempts < 10) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          attempts++;
        }
        
        if (await isDaemonRunning()) {
          process.kill(pid, "SIGKILL");
          console.log("✓ Daemon force stopped");
        } else {
          console.log("✓ Daemon stopped gracefully");
        }
      } catch (error) {
        console.log("⚠️  Daemon process not found, cleaning up...");
      }

      if (existsSync(PID_FILE)) {
        await unlink(PID_FILE);
      }
    } catch (error) {
      console.error("❌ Failed to stop daemon:", error);
      process.exit(1);
    }
  });

const statusCommand = new Command("status")
  .description("Check daemon status")
  .action(async () => {
    try {
      const running = await isDaemonRunning();
      const pid = await getDaemonPid();
      
      if (running && pid) {
        console.log(`✓ Daemon is running (PID: ${pid})`);
        
        try {
          const { stdout } = await execAsync(`ps -p ${pid} -o pid,ppid,cmd,%mem,%cpu`);
          console.log("\nProcess details:");
          console.log(stdout);
        } catch {
          console.log("   Memory/CPU info unavailable");
        }
      } else {
        console.log("✗ Daemon is not running");
        
        if (existsSync(PID_FILE)) {
          console.log("   (stale PID file detected, cleaning up...)");
          await unlink(PID_FILE);
        }
      }
    } catch (error) {
      console.error("❌ Failed to check status:", error);
      process.exit(1);
    }
  });

const restartCommand = new Command("restart")
  .description("Restart the daemon")
  .action(async () => {
    console.log("🔄 Restarting daemon...");
    await stopCommand.parseAsync([]);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await startCommand.parseAsync([]);
  });

const logsCommand = new Command("logs")
  .description("View daemon logs")
  .option("-f, --follow", "Follow log output")
  .option("-n, --lines <number>", "Number of lines to show", "50")
  .action(async (options) => {
    try {
      if (!existsSync(LOG_FILE)) {
        console.log("No log file found");
        return;
      }

      if (options.follow) {
        const tail = spawn("tail", ["-f", LOG_FILE], { stdio: "inherit" });
        tail.on("exit", (code) => process.exit(code || 0));
      } else {
        const { stdout } = await execAsync(`tail -n ${options.lines} "${LOG_FILE}"`);
        console.log(stdout);
      }
    } catch (error) {
      console.error("❌ Failed to read logs:", error);
      process.exit(1);
    }
  });

export const daemonCommand = new Command("daemon")
  .description("Manage the 0xKobold daemon")
  .addCommand(startCommand)
  .addCommand(stopCommand)
  .addCommand(statusCommand)
  .addCommand(restartCommand)
  .addCommand(logsCommand);
