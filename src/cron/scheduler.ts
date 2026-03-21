/**
 * Cron Scheduler - 0xKobold
 * 
 * Core scheduler for cron jobs with SQLite persistence.
 * Supports both recurring (cron expressions) and one-shot jobs.
 */

import { EventEmitter } from "events";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomInt } from "node:crypto";
import { existsSync } from "node:fs";

import {
  CronJob,
  JobResult,
  JobRun,
  SchedulerConfig,
  AddJobOptions,
  JobStatus,
} from "./types.js";
import {
  parseExpression,
  getNextRun,
  parseDuration,
  parseAt,
} from "./parser.js";

const DEFAULT_CONFIG: SchedulerConfig = {
  defaultTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  maxConcurrent: 5,
  defaultModel: "kimi-k2.5:cloud",
  enabled: true,
  checkInterval: 60000, // 1 minute
};

export class CronScheduler extends EventEmitter {
  private db: Database;
  private config: SchedulerConfig;
  private checkTimer?: Timer;
  private running = false;
  private activeJobs: Map<string, Promise<void>> = new Map();

  constructor(dbPath?: string, config?: Partial<SchedulerConfig>) {
    super();
    
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Default to ~/.0xkobold/cron.db
    const path = dbPath || join(homedir(), ".0xkobold", "cron.db");
    this.db = new Database(path);
    
    this.initSchema();
  }

  /**
   * Initialize database schema
   */
  private initSchema(): void {
    // Execute schema inline to avoid async loading issues
    // The schema.sql file path resolution can be tricky, so we inline the critical tables
    this.db.exec(`
      -- Cron jobs table
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cron_expression TEXT,
        at INTEGER,
        at_duration INTEGER,
        timezone TEXT DEFAULT 'UTC',
        session_type TEXT DEFAULT 'isolated',
        message TEXT NOT NULL,
        model TEXT,
        thinking_level TEXT,
        working_dir TEXT,
        token_limit INTEGER,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        last_run_at INTEGER,
        next_run_at INTEGER NOT NULL,
        run_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        last_error TEXT,
        last_output TEXT,
        delete_after_run INTEGER DEFAULT 0,
        wake_after_run INTEGER DEFAULT 0,
        stagger INTEGER DEFAULT 0,
        exact INTEGER DEFAULT 0,
        notify_channel TEXT,
        notify_recipient TEXT,
        notify_on_success INTEGER DEFAULT 1,
        notify_on_error INTEGER DEFAULT 1,
        notify_prefix TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run 
        ON cron_jobs(next_run_at) 
        WHERE enabled = 1;

      CREATE INDEX IF NOT EXISTS idx_cron_jobs_last_run 
        ON cron_jobs(last_run_at);

      CREATE TABLE IF NOT EXISTS cron_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER,
        success INTEGER,
        output TEXT,
        tokens_used INTEGER DEFAULT 0,
        cost REAL,
        error TEXT,
        exit_code INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_cron_runs_job_id 
        ON cron_runs(job_id);

      CREATE INDEX IF NOT EXISTS idx_cron_runs_started 
        ON cron_runs(started_at DESC);
    `);
    
    this.emit("schema:initialized");
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.running) return;
    
    this.running = true;
    this.emit("started");
    
    // Initial check
    this.checkAndRunJobs();
    
    // Schedule periodic checks
    this.checkTimer = setInterval(() => {
      this.checkAndRunJobs();
    }, this.config.checkInterval);
    
    console.log(`[CronScheduler] Started (check interval: ${this.config.checkInterval}ms)`);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    this.running = false;
    
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
    }
    
    this.emit("stopped");
    console.log("[CronScheduler] Stopped");
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get all jobs (alias for listJobs)
   */
  getAllJobs(): CronJob[] {
    return this.listJobs();
  }

  /**
   * Manually trigger a job by ID
   */
  async runJob(jobId: string): Promise<{ success: boolean; tokensUsed?: number; error?: string; output?: string }> {
    const job = this.getJob(jobId);
    if (!job) {
      return { success: false, error: `Job not found: ${jobId}` };
    }
    
    try {
      // Import runner dynamically
      const { runJobRunner } = await import("./runner.js");
      const result = await runJobRunner(job);
      return { 
        success: result.success, 
        tokensUsed: result.tokensUsed, 
        output: result.output,
        error: result.error 
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Check for and run due jobs
   */
  private async checkAndRunJobs(): Promise<void> {
    if (!this.running) return;
    
    const now = Date.now();
    
    // Get jobs that should run now (respecting concurrency limit)
    const availableSlots = this.config.maxConcurrent - this.activeJobs.size;
    
    if (availableSlots <= 0) {
      console.log("[CronScheduler] Max concurrent jobs reached, skipping check");
      return;
    }
    
    const jobs = this.db
      .query<CronJob, [number, number]>(
        `SELECT * FROM cron_jobs 
         WHERE enabled = true 
           AND next_run_at <= ? 
           AND (last_run_at IS NULL OR last_run_at < next_run_at)
         ORDER BY next_run_at ASC
         LIMIT ?`
      )
      .all(now, availableSlots);
    
    for (const job of jobs) {
      if (this.activeJobs.has(job.id)) continue;
      
      // Add stagger for load distribution
      const staggerMs = this.calculateStagger(job);
      
      if (staggerMs > 0) {
        // Job has stagger, update next_run_at but don't run yet
        this.db.run(
          `UPDATE cron_jobs 
           SET next_run_at = next_run_at + ? 
           WHERE id = ?`,
          [staggerMs, job.id]
        );
        continue;
      }
      
      // Run the job
      const jobPromise = this.executeJob(job);
      this.activeJobs.set(job.id, jobPromise);
      
      jobPromise
        .then(() => {
          this.activeJobs.delete(job.id);
          this.emit("job:completed", job.id);
        })
        .catch((error) => {
          this.activeJobs.delete(job.id);
          console.error(`[CronScheduler] Job ${job.id} failed:`, error);
          this.emit("job:failed", job.id, error);
        });
    }
  }

  /**
   * Calculate stagger delay for a job
   */
  private calculateStagger(job: CronJob): number {
    if (job.exact || !job.stagger || job.stagger <= 0) {
      return 0;
    }
    
    // Random delay between 0 and stagger minutes (converted to ms)
    return randomInt(0, job.stagger * 60 * 1000);
  }

  /**
   * Execute a single job
   */
  private async executeJob(job: CronJob): Promise<void> {
    const runId = this.logJobStart(job.id);
    const startTime = Date.now();
    
    try {
      // Import runner dynamically to avoid circular deps
      const { runJobRunner } = await import("./runner.js");
      
      const result = await runJobRunner(job);
      
      const duration = Date.now() - startTime;
      
      // Log completion
      this.logJobComplete(runId, result, duration);
      
      // Update job stats
      this.updateJobAfterRun(job, result, duration);
      
      // Handle wake
      if (job.wakeAfterRun && result.success) {
        this.emit("job:wake", job.id, result.output);
      }
      
      // Handle delete for one-shots
      if (job.deleteAfterRun) {
        this.removeJob(job.id, false);
        this.emit("job:deleted", job.id);
      }
      
      this.emit("job:success", job.id, result);
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      this.logJobError(runId, errorMsg);
      this.updateJobError(job, errorMsg);
      
      this.emit("job:error", job.id, error);
      throw error;
    }
  }

  /**
   * Add a new job
   */
  addJob(options: AddJobOptions): CronJob {
    const id = `cron:${Date.now()}:${randomInt(1000, 9999)}`;
    
    const session = options.session || "isolated";
    const timezone = options.timezone || this.config.defaultTimezone;
    
    let nextRunAt: number;
    let cronExpression: string | undefined;
    let at: number | undefined;
    let atDuration: number | undefined;
    
    if (options.cron) {
      // Recurring job
      cronExpression = options.cron;
      const expr = parseExpression(options.cron, timezone);
      nextRunAt = getNextRun(expr).getTime();
    } else if (options.at) {
      // One-shot job
      const atTime = parseAt(options.at);
      
      if (atTime > Date.now() + 365 * 24 * 60 * 60 * 1000) {
        // Likely an absolute timestamp
        at = atTime;
      } else {
        // Relative duration
        atDuration = atTime - Date.now();
        at = atTime;
      }
      
      nextRunAt = atTime;
    } else {
      throw new Error("Either --cron or --at is required");
    }
    
    const job: CronJob = {
      id,
      name: options.name,
      cronExpression,
      at,
      atDuration,
      session,
      message: options.message,
      model: options.model,
      thinkingLevel: options.thinkingLevel,
      timezone,
      enabled: true,
      createdAt: Date.now(),
      nextRunAt,
      runCount: 0,
      errorCount: 0,
      deleteAfterRun: options.deleteAfterRun,
      wakeAfterRun: options.wake,
      workingDir: options.workingDir,
      notify: options.notify,
    };
    
    // Insert into database
    this.db.run(
      `INSERT INTO cron_jobs (
        id, name, cron_expression, at, at_duration, timezone,
        session_type, message, model, thinking_level, working_dir, token_limit,
        enabled, created_at, next_run_at, run_count, error_count,
        delete_after_run, wake_after_run,
        notify_channel, notify_recipient, notify_on_success, notify_on_error, notify_prefix
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id,
        job.name,
        job.cronExpression || null,
        job.at || null,
        job.atDuration || null,
        job.timezone,
        job.session,
        job.message,
        job.model || null,
        job.thinkingLevel || null,
        job.workingDir || null,
        job.tokenLimit || null,
        job.enabled ? 1 : 0,
        job.createdAt,
        job.nextRunAt,
        job.runCount,
        job.errorCount,
        job.deleteAfterRun ? 1 : 0,
        job.wakeAfterRun ? 1 : 0,
        job.notify?.channel || null,
        job.notify?.recipient || null,
        job.notify?.onSuccess !== false ? 1 : 0,
        job.notify?.onError !== false ? 1 : 0,
        job.notify?.prefix || null,
      ]
    );
    
    this.emit("job:added", job);
    console.log(`[CronScheduler] Added job: ${job.name} (${job.id})`);
    
    return job;
  }

  /**
   * Remove a job
   */
  removeJob(id: string, log: boolean = true): boolean {
    const result = this.db.run("DELETE FROM cron_jobs WHERE id = ?", [id]);
    
    if (result.changes > 0) {
      if (log) {
        this.emit("job:removed", id);
        console.log(`[CronScheduler] Removed job: ${id}`);
      }
      return true;
    }
    
    return false;
  }

  /**
   * Enable a job
   */
  enableJob(id: string): boolean {
    const result = this.db.run(
      "UPDATE cron_jobs SET enabled = 1 WHERE id = ?",
      [id]
    );
    
    if (result.changes > 0) {
      this.emit("job:enabled", id);
      return true;
    }
    
    return false;
  }

  /**
   * Disable a job
   */
  disableJob(id: string): boolean {
    const result = this.db.run(
      "UPDATE cron_jobs SET enabled = 0 WHERE id = ?",
      [id]
    );
    
    if (result.changes > 0) {
      this.emit("job:disabled", id);
      return true;
    }
    
    return false;
  }

  /**
   * Get a job by ID
   */
  getJob(id: string): CronJob | null {
    return this.db.query<CronJob, [string]>(
      "SELECT * FROM cron_jobs WHERE id = ?"
    ).get(id);
  }

  /**
   * List all jobs
   */
  listJobs(): CronJob[] {
    return this.db.query<CronJob, []>(
      "SELECT * FROM cron_jobs ORDER BY created_at DESC"
    ).all();
  }

  /**
   * Get job status for CLI display
   */
  getJobStatus(): JobStatus[] {
    return this.db.query<JobStatus, []>(`
      SELECT 
        id,
        name,
        CASE 
          WHEN cron_expression IS NOT NULL THEN cron_expression
          ELSE 'one-shot'
        END as schedule,
        datetime(next_run_at / 1000, 'unixepoch') as nextRun,
        session_type as session,
        CASE 
          WHEN enabled = 0 THEN 'disabled'
          ELSE 'enabled'
        END as status,
        datetime(last_run_at / 1000, 'unixepoch') as lastRun,
        run_count as runCount
      FROM cron_jobs
      ORDER BY next_run_at ASC
    `).all();
  }

  /**
   * Get upcoming jobs
   */
  getUpcoming(limit: number = 10): CronJob[] {
    return this.db.query<CronJob, [number]>(`
      SELECT * FROM cron_jobs 
      WHERE enabled = true 
        AND next_run_at > ?
      ORDER BY next_run_at ASC
      LIMIT ${limit}
    `).all(Date.now());
  }

  /**
   * Get job run history
   */
  getJobHistory(jobId: string, limit: number = 10): JobRun[] {
    return this.db.query<JobRun, [string, number]>(`
      SELECT * FROM cron_runs 
      WHERE job_id = ? 
      ORDER BY started_at DESC
      LIMIT ?
    `).all(jobId, limit);
  }

  /**
   * Log job start
   */
  private logJobStart(jobId: string): number {
    const result = this.db.run(
      "INSERT INTO cron_runs (job_id, started_at) VALUES (?, ?)",
      [jobId, Date.now()]
    );
    
    return result.lastInsertRowid as number;
  }

  /**
   * Log job completion
   */
  private logJobComplete(
    runId: number,
    result: JobResult,
    duration: number
  ): void {
    this.db.run(
      `UPDATE cron_runs 
       SET completed_at = ?, success = ?, output = ?, tokens_used = ?, cost = ?
       WHERE id = ?`,
      [
        Date.now(),
        result.success ? 1 : 0,
        result.output,
        result.tokensUsed,
        result.cost || null,
        runId,
      ]
    );
  }

  /**
   * Log job error
   */
  private logJobError(runId: number, error: string): void {
    this.db.run(
      `UPDATE cron_runs 
       SET completed_at = ?, success = 0, error = ?
       WHERE id = ?`,
      [Date.now(), error, runId]
    );
  }

  /**
   * Update job after successful run
   */
  private updateJobAfterRun(
    job: CronJob,
    result: JobResult,
    duration: number
  ): void {
    // Calculate next run for recurring jobs
    let nextRunAt: number | null = null;
    
    if (job.cronExpression) {
      // Recurring: calculate next run from cron
      const expr = parseExpression(job.cronExpression, job.timezone);
      nextRunAt = getNextRun(expr, new Date()).getTime();
    } else if (!job.deleteAfterRun) {
      // One-shot that shouldn't delete - disable it
      this.disableJob(job.id);
      return;
    }
    
    this.db.run(
      `UPDATE cron_jobs 
       SET last_run_at = ?, 
           next_run_at = ?,
           run_count = run_count + 1,
           last_output = ?
       WHERE id = ?`,
      [
        Date.now(),
        nextRunAt,
        result.output.substring(0, 1000), // Truncate for storage
        job.id,
      ]
    );
  }

  /**
   * Update job after error
   */
  private updateJobError(job: CronJob, error: string): void {
    // For recurring jobs, calculate next run
    let nextRunAt: number | null = null;
    
    if (job.cronExpression) {
      const expr = parseExpression(job.cronExpression, job.timezone);
      nextRunAt = getNextRun(expr, new Date()).getTime();
    }
    
    this.db.run(
      `UPDATE cron_jobs 
       SET error_count = error_count + 1,
           last_error = ?,
           next_run_at = COALESCE(?, next_run_at)
       WHERE id = ?`,
      [error.substring(0, 500), nextRunAt, job.id]
    );
  }

  /**
   * Get scheduler statistics
   */
  getStats(): {
    totalJobs: number;
    enabledJobs: number;
    activeJobs: number;
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
  } {
    const totalJobs = this.db.query<{ count: number }, []>(
      "SELECT COUNT(*) as count FROM cron_jobs"
    ).get()!.count;
    
    const enabledJobs = this.db.query<{ count: number }, []>(
      "SELECT COUNT(*) as count FROM cron_jobs WHERE enabled = 1"
    ).get()!.count;
    
    const totalRuns = this.db.query<{ count: number }, []>(
      "SELECT COUNT(*) as count FROM cron_runs"
    ).get()!.count;
    
    const successfulRuns = this.db.query<{ count: number }, []>(
      "SELECT COUNT(*) as count FROM cron_runs WHERE success = 1"
    ).get()!.count;
    
    return {
      totalJobs,
      enabledJobs,
      activeJobs: this.activeJobs.size,
      totalRuns,
      successfulRuns,
      failedRuns: totalRuns - successfulRuns,
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    this.stop();
    this.db.close();
  }
}

// Singleton instance
let schedulerInstance: CronScheduler | null = null;

export function getCronScheduler(
  dbPath?: string,
  config?: Partial<SchedulerConfig>
): CronScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new CronScheduler(dbPath, config);
  }
  return schedulerInstance;
}

export function resetCronScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.close();
    schedulerInstance = null;
  }
}
