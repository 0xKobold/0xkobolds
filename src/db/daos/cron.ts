/**
 * Cron DAO
 * 
 * Typed access to cron.db
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';
import { DB_PATHS } from '../index.js';

// ============================================================================
// Types
// ============================================================================

export interface CronJob {
  id: string;
  name: string;
  cron_expression?: string;
  at?: number;
  at_duration?: number;
  session: 'main' | 'isolated';
  message: string;
  model?: string;
  thinking_level?: 'fast' | 'normal' | 'deep';
  timezone: string;
  enabled: boolean;
  created_at: number;
  last_run_at?: number;
  next_run_at: number;
  run_count: number;
  error_count: number;
  last_error?: string;
  delete_after_run?: boolean;
  wake_after_run?: boolean;
  working_dir?: string;
  stagger?: number;
  exact?: boolean;
  token_limit?: number;
}

export interface CronRun {
  id: number;
  job_id: string;
  started_at: number;
  completed_at: number;
  success: boolean;
  output: string;
  tokens_used: number;
  cost?: number;
  error?: string;
}

export interface JobStatus {
  id: string;
  name: string;
  schedule: string;
  next_run: string;
  session: string;
  status: 'enabled' | 'disabled' | 'paused';
  last_run?: string;
  run_count: number;
}

// ============================================================================
// Cron DAO
// ============================================================================

export class CronDAO {
  private db: Database;

  constructor(dbPath?: string) {
    const path = dbPath || DB_PATHS.cron;
    this.db = new Database(path);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cron_expression TEXT,
        at INTEGER,
        at_duration INTEGER,
        session TEXT NOT NULL DEFAULT 'isolated',
        message TEXT NOT NULL,
        model TEXT,
        thinking_level TEXT,
        timezone TEXT NOT NULL DEFAULT 'UTC',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        last_run_at INTEGER,
        next_run_at INTEGER NOT NULL,
        run_count INTEGER NOT NULL DEFAULT 0,
        error_count INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        delete_after_run INTEGER DEFAULT 0,
        wake_after_run INTEGER DEFAULT 0,
        working_dir TEXT,
        stagger INTEGER,
        exact INTEGER DEFAULT 0,
        token_limit INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run ON cron_jobs(next_run_at);
      CREATE INDEX IF NOT EXISTS idx_cron_jobs_enabled ON cron_jobs(enabled);

      CREATE TABLE IF NOT EXISTS cron_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER NOT NULL,
        success INTEGER NOT NULL,
        output TEXT,
        tokens_used INTEGER DEFAULT 0,
        cost REAL,
        error TEXT,
        FOREIGN KEY (job_id) REFERENCES cron_jobs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_cron_runs_job_id ON cron_runs(job_id);
      CREATE INDEX IF NOT EXISTS idx_cron_runs_started ON cron_runs(started_at DESC);
    `);
  }

  // ============================================================================
  // Job CRUD
  // ============================================================================

  /**
   * Get all jobs
   */
  getAllJobs(): CronJob[] {
    return this.db.query(`SELECT * FROM cron_jobs ORDER BY next_run_at`).all() as CronJob[];
  }

  /**
   * Get job by ID
   */
  getJob(id: string): CronJob | null {
    return this.db.query(`SELECT * FROM cron_jobs WHERE id = ?`).get(id) as CronJob | null;
  }

  /**
   * Get enabled jobs that are due
   */
  getDueJobs(now?: number): CronJob[] {
    const timestamp = now || Date.now();
    return this.db.query(
      `SELECT * FROM cron_jobs WHERE enabled = 1 AND next_run_at <= ? ORDER BY next_run_at`
    ).all(timestamp) as CronJob[];
  }

  /**
   * Create a new job
   */
  createJob(job: Omit<CronJob, 'created_at' | 'run_count' | 'error_count'>): CronJob {
    const created_at = Date.now();
    this.db.run(
      `INSERT INTO cron_jobs (
        id, name, cron_expression, at, at_duration, session, message,
        model, thinking_level, timezone, enabled, created_at, next_run_at,
        delete_after_run, wake_after_run, working_dir, stagger, exact, token_limit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        job.id, job.name, job.cron_expression, job.at, job.at_duration,
        job.session, job.message, job.model, job.thinking_level, job.timezone,
        job.enabled ? 1 : 0, created_at, job.next_run_at,
        job.delete_after_run ? 1 : 0, job.wake_after_run ? 1 : 0,
        job.working_dir, job.stagger, job.exact ? 1 : 0, job.token_limit
      ]
    );
    return { ...job, created_at, run_count: 0, error_count: 0 };
  }

  /**
   * Update job after run
   */
  updateAfterRun(
    jobId: string,
    success: boolean,
    duration: number,
    error?: string
  ): void {
    const now = Date.now();
    this.db.run(
      `UPDATE cron_jobs SET 
        last_run_at = ?,
        run_count = run_count + 1,
        error_count = error_count + ?,
        last_error = ?
      WHERE id = ?`,
      [now, success ? 0 : 1, error || null, jobId]
    );
  }

  /**
   * Delete job
   */
  deleteJob(id: string): boolean {
    const result = this.db.run(`DELETE FROM cron_jobs WHERE id = ?`, [id]);
    return result.changes > 0;
  }

  // ============================================================================
  // Run Log
  // ============================================================================

  /**
   * Log job start
   */
  logRunStart(jobId: string): number {
    const startedAt = Date.now();
    this.db.run(
      `INSERT INTO cron_runs (job_id, started_at, completed_at, success, output) VALUES (?, ?, ?, 0, '')`,
      [jobId, startedAt, startedAt]
    );
    return startedAt;
  }

  /**
   * Log job completion
   */
  logRunComplete(
    runId: number,
    success: boolean,
    output: string,
    tokensUsed: number,
    cost?: number,
    error?: string
  ): void {
    const completedAt = Date.now();
    this.db.run(
      `UPDATE cron_runs SET completed_at = ?, success = ?, output = ?, tokens_used = ?, cost = ?, error = ? WHERE id = ?`,
      [completedAt, success ? 1 : 0, output, tokensUsed, cost || null, error || null, runId]
    );
  }

  /**
   * Get recent runs
   */
  getRecentRuns(limit = 50): CronRun[] {
    return this.db.query(
      `SELECT * FROM cron_runs ORDER BY started_at DESC LIMIT ?`
    ).all(limit) as CronRun[];
  }

  /**
   * Get runs for a specific job
   */
  getRunsForJob(jobId: string, limit = 10): CronRun[] {
    return this.db.query(
      `SELECT * FROM cron_runs WHERE job_id = ? ORDER BY started_at DESC LIMIT ?`
    ).all(jobId, limit) as CronRun[];
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  /**
   * Get job status summary
   */
  getStatus(): {
    total: number;
    enabled: number;
    disabled: number;
    next_run?: CronJob;
    running: number;
  } {
    const total = (this.db.query(`SELECT COUNT(*) as count FROM cron_jobs`).get() as any).count;
    const enabled = (this.db.query(`SELECT COUNT(*) as count FROM cron_jobs WHERE enabled = 1`).get() as any).count;
    const disabled = total - enabled;
    const nextRun = this.db.query(
      `SELECT * FROM cron_jobs WHERE enabled = 1 ORDER BY next_run_at LIMIT 1`
    ).get() as CronJob | undefined;

    return { total, enabled, disabled, next_run: nextRun, running: 0 };
  }

  /**
   * Close connection
   */
  close(): void {
    this.db.close();
  }
}

// Singleton
let instance: CronDAO | null = null;

export const cronDAO = (): CronDAO => {
  if (!instance) {
    instance = new CronDAO();
  }
  return instance;
};
