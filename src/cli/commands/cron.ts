/**
 * 0xKobold Cron CLI Command
 *
 * CLI commands for managing cron jobs.
 * Follows OpenClaw cron command structure.
 */

import {Command} from "commander";
import {getCronScheduler} from "../../cron/scheduler.js";
import {parseAt} from "../../cron/parser.js";
import type {AddJobOptions} from "../../cron/types.js";

export const cronCommand = new Command("cron").description(
  "Manage scheduled cron jobs"
);

// List all jobs
cronCommand
  .command("list")
  .alias("ls")
  .description("List all jobs")
  .option("-a, --all", "Show disabled jobs too")
  .action(async () => {
    const scheduler = getCronScheduler();
    const jobs = scheduler.getJobStatus();

    if (jobs.length === 0) {
      console.log("No jobs scheduled.");
      console.log("Run: 0xkobold cron add --name '...' --cron '...' --message '...'");
      return;
    }

    console.log(`\n📋 Scheduled Jobs (${jobs.length}):\n`);

    for (const job of jobs) {
      const statusIcon = job.status === "disabled" ? "⚪" : "🟢";
      const sessionIcon = job.session === "main" ? "🔗" : "🏝️";

      console.log(`${statusIcon} ${sessionIcon} ${job.name}`);
      console.log(`   ID: ${job.id}`);
      console.log(`   Schedule: ${job.schedule}`);
      console.log(`   Session: ${job.session}`);

      if (job.nextRun) {
        console.log(`   Next Run: ${job.nextRun}`);
      }
      if (job.lastRun) {
        console.log(`   Last Run: ${job.lastRun}`);
      }

      console.log(`   Status: ${job.status}`);
      console.log(`   Runs: ${job.runCount}`);
      console.log("");
    }
  });

// Add a job
cronCommand
  .command("add")
  .description("Add a new job")
  .requiredOption("-n, --name <name>", "Job name")
  .option("-c, --cron <expression>", "Cron expression (e.g., '0 9 * * *')")
  .option("-a, --at <time>", "One-shot: duration (e.g., '20m') or absolute time")
  .option("-t, --timezone <timezone>", "Timezone (default: system)")
  .option(
    "-s, --session <type>",
    "Session type: main | isolated",
    "isolated"
  )
  .option("-m, --message <msg>", "Message/prompt for the job")
  .option("--model <model>", "Model override")
  .option(
    "--thinking <level>",
    "Thinking level: fast | normal | deep"
  )
  .option(
    "-d, --delete",
    "Delete after run (one-shots)"
  )
  .option("-w, --wake", "Wake main session after completion")
  .option("--working-dir <dir>", "Working directory")
  .action(async (options) => {
    if (!options.cron && !options.at) {
      console.error("❌ Error: Either --cron or --at is required");
      console.error("   --cron '0 9 * * *'   (recurring)");
      console.error("   --at '20m'             (one-shot in 20 minutes)");
      process.exit(1);
    }

    if (!options.message) {
      console.error("❌ Error: --message is required");
      process.exit(1);
    }

    const scheduler = getCronScheduler();

    try {
      const job = scheduler.addJob({
        name: options.name,
        cron: options.cron,
        at: options.at,
        timezone: options.timezone,
        session: options.session,
        message: options.message,
        model: options.model,
        thinkingLevel: options.thinking,
        deleteAfterRun: options.delete,
        wake: options.wake,
        workingDir: options.workingDir,
      });

      console.log(`\n✅ Job created: ${job.name}`);
      console.log(`   ID: ${job.id}`);
      console.log(`   Session: ${job.session}`);

      if (job.cronExpression) {
        console.log(`   Schedule: ${job.cronExpression}`);
      } else if (job.at) {
        const date = new Date(job.at);
        console.log(`   At: ${date.toLocaleString()}`);
      }

      console.log(`   Next Run: ${new Date(job.nextRunAt).toLocaleString()}`);

      if (job.model) {
        console.log(`   Model: ${job.model}`);
      }

      if (job.deleteAfterRun) {
        console.log("   ⚠️ Will delete after run");
      }

      if (job.wakeAfterRun) {
        console.log("   🔔 Will wake main session");
      }

      console.log("\nUse: 0xkobold cron list  (to see all jobs)");
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to create job: ${msg}`);
      process.exit(1);
    }
  });

// Remove a job
cronCommand
  .command("remove <id>")
  .alias("rm")
  .description("Remove a job by ID")
  .action(async (id: string) => {
    const scheduler = getCronScheduler();
    const success = scheduler.removeJob(id);

    if (success) {
      console.log(`✅ Job removed: ${id}`);
    } else {
      console.error(`❌ Job not found: ${id}`);
      process.exit(1);
    }
  });

// Enable a job
cronCommand
  .command("enable <id>")
  .description("Enable a disabled job")
  .action(async (id: string) => {
    const scheduler = getCronScheduler();
    const success = scheduler.enableJob(id);

    if (success) {
      console.log(`✅ Job enabled: ${id}`);
    } else {
      console.error(`❌ Job not found: ${id}`);
      process.exit(1);
    }
  });

// Disable a job
cronCommand
  .command("disable <id>")
  .description("Disable a job (without removing)")
  .action(async (id: string) => {
    const scheduler = getCronScheduler();
    const success = scheduler.disableJob(id);

    if (success) {
      console.log(`✅ Job disabled: ${id}`);
    } else {
      console.error(`❌ Job not found: ${id}`);
      process.exit(1);
    }
  });

// Show upcoming jobs
cronCommand
  .command("upcoming")
  .description("Show upcoming jobs")
  .option("-n, --limit <n>", "Number of jobs to show", "10")
  .action(async (options) => {
    const scheduler = getCronScheduler();
    const jobs = scheduler.getUpcoming(parseInt(options.limit, 10));

    if (jobs.length === 0) {
      console.log("No upcoming jobs.");
      return;
    }

    console.log(`\n⏰ Upcoming Jobs (${jobs.length}):\n`);

    for (const job of jobs) {
      const sessionIcon = job.session === "main" ? "🔗" : "🏝️";
      const nextRun = new Date(job.nextRunAt).toLocaleString();

      console.log(`${sessionIcon} ${job.name}`);
      console.log(`   Next: ${nextRun}`);

      if (job.cronExpression) {
        console.log(`   Cron: ${job.cronExpression}`);
      }

      console.log("");
    }
  });

// Show job details
cronCommand
  .command("show <id>")
  .description("Show job details and recent history")
  .option("-n, --history <n>", "Number of history entries", "5")
  .action(async (id: string, options) => {
    const scheduler = getCronScheduler();
    const job = scheduler.getJob(id);

    if (!job) {
      console.error(`❌ Job not found: ${id}`);
      process.exit(1);
    }

    console.log(`\n📄 Job Details: ${job.name}\n`);
    console.log(`ID: ${job.id}`);
    console.log(`Name: ${job.name}`);
    console.log(`Status: ${job.enabled ? "🟢 enabled" : "⚪ disabled"}`);
    console.log(`Session: ${job.session}`);

    if (job.cronExpression) {
      console.log(`Schedule: ${job.cronExpression}`);
    }

    if (job.at) {
      console.log(`One-shot: ${new Date(job.at).toLocaleString()}`);
    }

    console.log(`Timezone: ${job.timezone}`);
    console.log(`Next Run: ${new Date(job.nextRunAt).toLocaleString()}`);
    console.log(`\nMessage:\n${job.message.substring(0, 200)}${job.message.length > 200 ? "..." : ""}`);

    if (job.model) {
      console.log(`\nModel: ${job.model}`);
    }

    console.log(`\nStats:`);
    console.log(`  Runs: ${job.runCount}`);
    console.log(`  Errors: ${job.errorCount}`);

    if (job.lastRunAt) {
      console.log(`  Last Run: ${new Date(job.lastRunAt).toLocaleString()}`);
    }

    // Show recent history
    const history = scheduler.getJobHistory(id, parseInt(options.history, 10));

    if (history.length > 0) {
      console.log(`\n📜 Recent History:`);

      for (const run of history) {
        const icon = run.success ? "✅" : "❌";
        const date = new Date(run.startedAt).toLocaleString();
        console.log(`\n  ${icon} ${date}`);
        console.log(`     Tokens: ${run.tokensUsed}`);

        if (run.error) {
          console.log(`     Error: ${run.error.substring(0, 100)}...`);
        }
      }
    }

    console.log("");
  });

// Show statistics
cronCommand
  .command("stats")
  .description("Show scheduler statistics")
  .action(async () => {
    const scheduler = getCronScheduler();
    const stats = scheduler.getStats();

    console.log("\n📊 Cron Scheduler Statistics\n");
    console.log(`Total Jobs: ${stats.totalJobs}`);
    console.log(`Enabled Jobs: ${stats.enabledJobs}`);
    console.log(`Active Jobs: ${stats.activeJobs}`);
    console.log(`Total Runs: ${stats.totalRuns}`);

    if (stats.totalRuns > 0) {
      console.log(`Successful Runs: ${stats.successfulRuns}`);
      console.log(`Failed Runs: ${stats.failedRuns}`);
      console.log(
        `Success Rate: ${((stats.successfulRuns / stats.totalRuns) * 100).toFixed(1)}%`
      );
    }

    console.log("");
  });

// Start the scheduler
cronCommand
  .command("start")
  .description("Start the cron scheduler daemon")
  .action(async () => {
    const scheduler = getCronScheduler();
    scheduler.start();

    console.log("✅ Cron scheduler started");
    console.log("   Checking for jobs every minute");
    console.log("\nPress Ctrl+C to stop");

    // Keep process alive
    process.on("SIGINT", () => {
      console.log("\n🛑 Stopping scheduler...");
      scheduler.stop();
      process.exit(0);
    });

    // Keep running
    setInterval(() => {}, 1000);
  });

// Stop the scheduler
cronCommand
  .command("stop")
  .description("Stop the cron scheduler")
  .action(async () => {
    const scheduler = getCronScheduler();
    scheduler.stop();
    console.log("✅ Cron scheduler stopped");
  });

// Quick examples
cronCommand
  .command("examples")
  .description("Show example commands")
  .action(() => {
    console.log(`
📚 Cron Command Examples

Daily morning briefing at 7am:
  0xkobold cron add \\
    --name "Morning Brief" \\
    --cron "0 7 * * *" \\
    --session isolated \\
    --message "Generate today's briefing: weather, calendar, tasks"

One-shot reminder in 20 minutes:
  0xkobold cron add \\
    --name "Call Reminder" \\
    --at "20m" \\
    --session main \\
    --wake \\
    --delete \\
    --message "Call the client back"

Weekly report on Mondays at 9am:
  0xkobold cron add \\
    --name "Weekly Report" \\
    --cron "0 9 * * 1" \\
    --timezone "America/New_York" \\
    --model "kimi-k2.5:cloud" \\
    --message "Generate weekly project summary"

Every 30 minutes (heartbeat style):
  0xkobold cron add \\
    --name "Heartbeat" \\
    --cron "*/30 * * * *" \\
    --session main \\
    --message "Check HEARTBEAT.md for any tasks"

Show all jobs:
  0xkobold cron list

Remove a job:
  0xkobold cron remove cron:1234567890:1234

Show upcoming:
  0xkobold cron upcoming --limit 5
`);
  });
