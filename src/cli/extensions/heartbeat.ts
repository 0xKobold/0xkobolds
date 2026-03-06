/**
 * Heartbeat CLI Extension
 * 
 * Registers Heartbeat subcommands under 0xkobold CLI
 */

import { Command } from "commander";

export function registerHeartbeatCli(program: Command): void {
  const heartbeat = program
    .command("heartbeat")
    .description("Health and monitoring");

  heartbeat
    .command("check")
    .description("Run health check")
    .action(async () => {
      console.log("🏥 Running health check...\n");
      
      const startTime = Date.now();
      const memUsage = process.memoryUsage();
      
      const health = {
        memory: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      };
      
      const status = health.memory < 85 ? "✅" : health.memory < 95 ? "⚠️" : "❌";
      
      console.log(`${status} Memory Usage: ${health.memory}%`);
      console.log(`   Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
      console.log(`   RSS: ${Math.round(memUsage.rss / 1024 / 1024)}MB`);
      console.log();
      console.log(`⏱️  Uptime: ${formatUptime(health.uptime)}`);
      console.log(`🕐 Check completed in ${Date.now() - startTime}ms`);
    });

  heartbeat
    .command("monitor")
    .description("Start continuous monitoring")
    .option("-i, --interval <seconds>", "Check interval", "60")
    .action(async (opts) => {
      const interval = parseInt(opts.interval) * 1000;
      
      console.log(`🔍 Starting monitoring (interval: ${opts.interval}s)...`);
      console.log("Press Ctrl+C to stop\n");
      
      const check = () => {
        const mem = process.memoryUsage();
        const memPercent = Math.round((mem.heapUsed / mem.heapTotal) * 100);
        const status = memPercent < 85 ? "✅" : memPercent < 95 ? "⚠️" : "❌";
        
        console.clear();
        console.log("0xKobold Health Monitor");
        console.log("════════════════════════\n");
        console.log(`${status} Memory: ${memPercent}%`);
        console.log(`   Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
        console.log(`\nUpdated: ${new Date().toLocaleTimeString()}`);
      };
      
      check();
      setInterval(check, interval);
    });

  heartbeat
    .command("status")
    .description("Show heartbeat status")
    .action(async () => {
      console.log("❤️  Heartbeat Status");
      console.log("═══════════════════\n");
      console.log("Status: ✅ Active");
      console.log("Mode: Continuous monitoring");
      console.log(`Uptime: ${formatUptime(process.uptime())}`);
      
      const mem = process.memoryUsage();
      console.log(`\nMemory: ${Math.round((mem.heapUsed / mem.heapTotal) * 100)}%`);
      console.log(`  Heap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
    });
}

function formatUptime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${Math.floor(seconds % 60)}s`;
  return `${Math.floor(seconds)}s`;
}
