#!/usr/bin/env bun
/**
 * Direct Cron Daemon Starter
 * Bypasses MemoryIntegration hang
 */

import { getCronScheduler } from "../src/cron/scheduler.js";

console.log("🔄 Starting Cron Daemon...");

const scheduler = getCronScheduler();
scheduler.start();

console.log(`✅ Cron daemon started`);
console.log(`   Jobs: ${scheduler.getStats().enabledJobs}`);
console.log(`   Check interval: 60s`);
console.log("");
console.log("Logs: /mnt/5tb/logs/cron-daemon.log");
console.log("Stop: kill $(pgrep -f 'cron-direct')");

// Keep running
setInterval(() => {}, 1000);
