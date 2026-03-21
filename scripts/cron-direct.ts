#!/usr/bin/env bun
/**
 * Direct Cron CLI - Bypasses full system initialization
 * For when '0xkobold cron' hangs on MemoryIntegration
 */

import { getCronScheduler } from "../src/cron/scheduler.js";

const args = process.argv.slice(2);
const command = args[0] || "list";

const scheduler = getCronScheduler();

switch (command) {
  case "list":
    const jobs = scheduler.getJobStatus();
    if (jobs.length === 0) {
      console.log("No jobs scheduled.");
    } else {
      console.log(`\n📋 Scheduled Jobs (${jobs.length}):\n`);
      for (const job of jobs) {
        const statusIcon = job.status === "disabled" ? "⚪" : "🟢";
        console.log(`${statusIcon} ${job.name}`);
        console.log(`   ID: ${job.id}`);
        console.log(`   Schedule: ${job.schedule}`);
        console.log(`   Next: ${job.nextRun || "N/A"}`);
        if (job.lastRun) console.log(`   Last: ${job.lastRun}`);
        console.log();
      }
    }
    break;

  case "stats":
    console.log(scheduler.getStats());
    break;

  case "upcoming":
    const upcoming = scheduler.getUpcoming(parseInt(args[1] || "10"));
    console.log("\n⏰ Upcoming:\n");
    for (const job of upcoming) {
      console.log(`${job.name}: ${new Date(job.nextRunAt).toLocaleString()}`);
    }
    break;

  case "add":
    console.log("Use: bun run scripts/cron-direct.ts add <name> <cron> <message>");
    console.log("Or: 0xkobold cron add --name '...' --cron '...' --message '...'");
    break;

  default:
    console.log("Direct Cron CLI - available commands:");
    console.log("  list      - Show all jobs");
    console.log("  stats     - Show statistics");
    console.log("  upcoming  - Show upcoming jobs");
    console.log("");
    console.log("For add/remove, use: 0xkobold cron ...");
}
