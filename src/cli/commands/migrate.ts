/**
 * Migrate Command - v0.3.0
 *
 * Migrate from OpenClaw (koclaw) to 0xKobold
 */

import { Command } from "commander";
import { runMigration } from "../../migration/openclaw.js";

export const migrateCommand = new Command("migrate")
  .description("Migrate from OpenClaw (koclaw) to 0xKobold")
  .option("-s, --source <path>", "OpenClaw source directory", "~/.openclaw")
  .option("-t, --target <path>", "0xKobold target directory", "~/.0xkobold")
  .option("--dry-run", "Preview changes without applying")
  .option("--live", "Apply changes (creates backup first)", false)
  .option("-f, --force", "Force migration even if target exists", false)
  .action(async (options) => {
    // If neither --dry-run nor --live specified, default to dry-run
    const dryRun = !options.live && !options.force;
    
    // runMigration handles its own exit
    await runMigration({
      source: options.source,
      target: options.target,
      dryRun,
      force: options.force,
    });
  });
