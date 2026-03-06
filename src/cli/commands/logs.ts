/**
 * Logs Command
 * 
 * View service logs
 */

import { Command } from "commander";
import { spawn } from "child_process";

export function createLogsCommand(): Command {
  return new Command("logs")
    .description("View service logs")
    .option("-f, --follow", "Follow log output", true)
    .option("-n, --lines <n>", "Number of lines", "50")
    .action(async (opts) => {
      const args = ["--user", "-u", "0xkobold", "--no-pager"];
      
      if (opts.follow) {
        args.push("-f");
      }
      
      args.push("-n", opts.lines);
      
      const proc = spawn("journalctl", args, {
        stdio: "inherit",
      });
      
      proc.on("exit", (code) => {
        process.exit(code ?? 0);
      });
    });
}
