/**
 * Cron Module - 0xKobold
 * 
 * Export all cron-related functionality.
 * 
 * Example usage:
 * ```typescript
 * import { getCronScheduler, parseExpression } from "./cron/index.js";
 * 
 * const scheduler = getCronScheduler();
 * scheduler.start();
 * 
 * // Add a daily morning briefing
 * scheduler.addJob({
 *   name: "Morning Brief",
 *   cron: "0 7 * * *",
 *   session: "isolated",
 *   message: "Generate today's briefing: weather, calendar, tasks"
 * });
 * 
 * // One-shot reminder in 20 minutes
 * scheduler.addJob({
 *   name: "Call Reminder",
 *   at: "20m",
 *   session: "main",
 *   wake: true,
 *   deleteAfterRun: true,
 *   message: "Call the client back"
 * });
 * ```
 */

// Types
export type {
  CronJob,
  CronExpression,
  JobResult,
  JobRun,
  SchedulerConfig,
  AddJobOptions,
  JobStatus,
  SessionType,
  ParsedDuration,
} from "./types.js";

// Parser
export {
  parseCron,
  parseExpression,
  parseDuration,
  parseAt,
  getNextRun,
  formatCron,
  validateCron,
  CRON_PRESETS,
} from "./parser.js";

// Natural Language Parser (v0.1.0)
export {
  parseNaturalSchedule,
  createCronFromNL,
  type ParsedSchedule,
} from "./nl-parser.js";

// Scheduler
export {
  CronScheduler,
  getCronScheduler,
  resetCronScheduler,
} from "./scheduler.js";

// Runner
export {
  runJobRunner,
  runSystemEvent,
  validateJob,
} from "./runner.js";
