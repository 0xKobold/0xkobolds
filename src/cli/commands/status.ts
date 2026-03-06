/**
 * Status Command
 * 
 * Consolidated status view from all components
 */

import { Command } from "commander";
import { spawn } from "child_process";

export function createStatusCommand(): Command {
  return new Command("status")
    .description("Show consolidated system status")
    .option("--json", "Output as JSON")
    .option("--watch", "Continuously monitor")
    .action(async (opts) => {
      if (opts.watch) {
        await watchStatus();
      } else {
        await showStatus(opts.json);
      }
    });
}

async function showStatus(json: boolean): Promise<void> {
  const status = await gatherStatus();
  
  if (json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  
  // Pretty print
  console.log("0xKobold Status");
  console.log("═══════════════════════════════════════════\n");
  
  // Service status
  const serviceEmoji = status.service.running ? "🟢" : "🔴";
  console.log(`${serviceEmoji} Service: ${status.service.running ? "running" : "stopped"} ${status.service.running ? `(pid ${status.service.pid})` : ""}`);
  console.log(`   Uptime: ${status.service.uptime}\n`);
  
  // Health
  console.log("Health:");
  status.health.metrics.forEach((m: any) => {
    const emoji = m.status === "healthy" ? "✅" : m.status === "warning" ? "⚠️" : "❌";
    const value = typeof m.value === "number" ? `${m.value}${m.unit || ""}` : m.value;
    console.log(`  ${emoji} ${m.name}: ${value} (${m.status})`);
  });
  console.log();
  
  // Discord
  console.log(`Discord:`);
  console.log(`  Status: ${status.discord.connected ? "🟢" : "🔴"} ${status.discord.connected ? "connected" : "disconnected"}`);
  if (status.discord.botName) {
    console.log(`  Bot: ${status.discord.botName}`);
  }
  console.log();
  
  // Environment
  console.log(`Environment:`);
  console.log(`  Config: ${status.env.configLoaded ? "✅" : "❌"} loaded`);
  console.log(`  Secrets: ${status.env.secretsEncrypted ? "✅ encrypted" : "⚠️ plain"}`);
  console.log(`  Discord: ${status.env.discordConfigured ? "✅" : "❌"} configured\n`);
  
  // Mode
  console.log(`Mode: ${status.mode === "build" ? "🔨 Build" : "🔍 Plan"} Mode`);
}

async function watchStatus(): Promise<void> {
  console.log("Watching status (Ctrl+C to exit)...\n");
  
  const show = async () => {
    console.clear();
    await showStatus(false);
    console.log("\n───────────────────────────────────────────");
    console.log(`Last updated: ${new Date().toLocaleTimeString()}`);
  };
  
  await show();
  setInterval(show, 5000);
}

async function gatherStatus(): Promise<any> {
  // Gather status from various sources
  const status: any = {
    service: { running: false, pid: null, uptime: "unknown" },
    health: { metrics: [] },
    discord: { connected: false },
    env: { configLoaded: false, secretsEncrypted: false, discordConfigured: false },
    mode: "build",
    timestamp: Date.now(),
  };
  
  // Check systemd status
  try {
    const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
      const proc = spawn("systemctl", ["--user", "status", "0xkobold", "--no-pager"], {
        stdio: ["ignore", "pipe", "ignore"],
      });
      let stdout = "";
      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      proc.on("close", (code) => {
        resolve({ stdout });
      });
    });
    
    const activeMatch = stdout.match(/Active:\s+(\w+)/);
    const pidMatch = stdout.match(/Main PID:\s+(\d+)/);
    
    if (activeMatch) {
      status.service.running = activeMatch[1] === "active";
    }
    if (pidMatch) {
      status.service.pid = parseInt(pidMatch[1]);
    }
  } catch {
    // Ignore errors
  }
  
  // Check basic health metrics
  const memUsage = process.memoryUsage();
  status.health.metrics.push({
    name: "memory_usage",
    status: "healthy",
    value: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
    unit: "%",
  });
  
  // Check environment
  status.env.discordConfigured = !!process.env.DISCORD_BOT_TOKEN;
  
  return status;
}
