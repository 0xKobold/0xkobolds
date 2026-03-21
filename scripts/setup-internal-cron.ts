#!/usr/bin/env bun
/**
 * Setup Internal Cron Jobs
 * Migrates system crontab → internal cron
 */

import { getCronScheduler } from "../src/cron/scheduler.js";

const scheduler = getCronScheduler();

console.log("🔄 Migrating system crontab to internal cron...\n");

const jobs = [
  {
    name: "System Healthcheck",
    cron: "*/5 * * * *",
    message: "Execute healthcheck: curl -s --max-time 10 http://127.0.0.1:7777/health",
    session: "isolated",
  },
  {
    name: "Gateway Heartbeat",
    cron: "*/30 * * * *",
    message: "Check gateway health at http://127.0.0.1:7777/health",
    session: "isolated",
  },
  {
    name: "Clawchemy Engagement",
    cron: "0 */2 * * *",
    message: "Run clawchemy engagement: /mnt/5tb/0xkobold/cron-scripts/clawchemy-engage.sh",
    session: "isolated",
  },
  {
    name: "Moltbook Engagement",
    cron: "0 */4 * * *",
    message: "Run moltbook engagement: /mnt/5tb/0xkobold/cron-scripts/molbook-engage.sh",
    session: "isolated",
  },
  {
    name: "Moltx Engagement",
    cron: "0 */6 * * *",
    message: "Run moltx engagement: /mnt/5tb/0xkobold/cron-scripts/moltx-engage.sh",
    session: "isolated",
  },
  {
    name: "Moltlaunch Check",
    cron: "0 */2 * * *",
    message: "Check moltlaunch gigs: /mnt/5tb/0xkobold/cron-scripts/moltlaunch-check.sh",
    session: "isolated",
  },
  {
    name: "Daily AI Article",
    cron: "0 14 * * *",
    message: "Generate and post daily Moltx article",
    session: "isolated",
  },
];

for (const jobConfig of jobs) {
  try {
    // Check if job already exists
    const existing = scheduler.getJobStatus().find((j: any) => j.name === jobConfig.name);
    if (existing) {
      console.log(`⚪ Skipped (exists): ${jobConfig.name}`);
      continue;
    }

    // @ts-ignore
    const job = scheduler.addJob({
      name: jobConfig.name,
      cron: jobConfig.cron,
      message: jobConfig.message,
      session: jobConfig.session,
    });

    console.log(`✅ Added: ${jobConfig.name}`);
    console.log(`   Next run: ${new Date(job.nextRunAt).toLocaleString()}`);
  } catch (e) {
    console.error(`❌ Failed: ${jobConfig.name} - ${e}`);
  }
}

console.log("\n");
console.log(scheduler.getStats());
console.log("\n✅ Migration complete!");
console.log("");
console.log("Check jobs with: bun run scripts/cron-direct.ts list");
console.log("Start daemon: bun run src/cli/program.ts cron start");
