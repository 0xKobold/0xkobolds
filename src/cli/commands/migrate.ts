/**
 * Migrate Command - v0.3.0
 *
 * Migrate from OpenClaw to 0xKobold
 */

import { Command } from "commander";
import { runMigration } from "../../migration/openclaw.js";

export const migrateCommand = new Command("migrate")
  .description("Migrate from OpenClaw (koclaw) to 0xKobold")
  .option("-s, --source <path>", "OpenClaw source directory", "~/.openclaw")
  .option("-t, --target <path>", "0xKobold target directory", "~/.0xkobold")
  .option("--dry-run", "Preview changes without applying", true)
  .option("--live", "Apply changes (default is dry-run)", false)
  .option("-f, --force", "Force migration (skip dry-run)", false)
  .action(async (options) => {
    const dryRun = !options.live && !options.force;
    
    await runMigration({
      source: options.source,
      target: options.target,
      dryRun,
      force: options.force,
    });
  });
