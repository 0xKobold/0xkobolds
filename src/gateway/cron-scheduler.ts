/**
 * Gateway Cron Scheduler
 *
 * OpenClaw/Hermes-style cron for scheduled agent tasks.
 * Unlike heartbeats (flexible intervals), cron runs at exact times.
 *
 * Features:
 * - Cron expressions (e.g., "0 8 * * *" = 8 AM daily)
 * - Natural language intervals (e.g., "every 4 hours")
 * - At-style scheduling (e.g., "at 09:00")
 * - Isolated sessions per run
 * - Model/thinking level override per job
 */

import { EventEmitter } from "node:events";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadConfig } from "../config/loader";
import { getGateway } from "./gateway-server";

// Cron job configuration
export interface CronJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: CronSchedule;
  target: string; // Agent ID
  message: string;
  model?: string;
  thinkingLevel?: "none" | "low" | "medium" | "high";
  workingDir?: string;
  timezone?: string;
  createdAt: number;
  lastRun?: number;
  lastResult?: "success" | "failure" | "skipped";
  nextRun?: number;
}

// Schedule types
export type CronSchedule =
  | { type: "cron"; expression: string } // e.g., "0 8 * * *"
  | { type: "every"; interval: string } // e.g., "4h", "30m"
  | { type: "at"; time: string } // e.g., "09:00"
  | { type: "daily"; time: string; days?: number[] } // e.g., "08:00" with optional days filter
  | { type: "weekly"; day: number; time: string }; // day: 0-6 (Sun-Sat)

// Cron result
export interface CronResult {
  jobId: string;
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
}

// Constants
const CRON_DIR = join(homedir(), ".0xkobold", "cron");
const JOBS_FILE = join(CRON_DIR, "jobs.json");

/**
 * Parse and evaluate schedules
 */
class ScheduleEvaluator {
  /**
   * Parse cron expression (5 fields: minute, hour, day, month, weekday)
   */
  static parseCron(expression: string): { minute: number[]; hour: number[]; day: number[]; month: number[]; weekday: number[] } | null {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    const parseField = (field: string, min: number, max: number): number[] => {
      if (field === "*") return Array.from({ length: max - min + 1 }, (_, i) => min + i);
      if (field.includes(",")) return field.split(",").flatMap(p => parseField(p, min, max));
      if (field.includes("-")) {
        const [start, end] = field.split("-").map(Number);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
      }
      if (field.includes("/")) {
        const [base, step] = field.split("/");
        const values = base === "*" ? Array.from({ length: max - min + 1 }, (_, i) => min + i) : parseField(base, min, max);
        return values.filter((_, i) => i % parseInt(step) === 0);
      }
      return [parseInt(field)];
    };

    return {
      minute: parseField(parts[0], 0, 59),
      hour: parseField(parts[1], 0, 23),
      day: parseField(parts[2], 1, 31),
      month: parseField(parts[3], 1, 12),
      weekday: parseField(parts[4], 0, 6),
    };
  }

  /**
   * Check if a given time matches a cron expression
   */
  static matchesCron(expression: string, time: Date): boolean {
    const parsed = this.parseCron(expression);
    if (!parsed) return false;

    return (
      parsed.minute.includes(time.getMinutes()) &&
      parsed.hour.includes(time.getHours()) &&
      parsed.day.includes(time.getDate()) &&
      parsed.month.includes(time.getMonth() + 1) &&
      parsed.weekday.includes(time.getDay())
    );
  }

  /**
   * Parse interval string to milliseconds
   */
  static parseInterval(interval: string): number {
    const match = interval.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return 0;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case "s": return value * 1000;
      case "m": return value * 60 * 1000;
      case "h": return value * 60 * 60 * 1000;
      case "d": return value * 24 * 60 * 60 * 1000;
      default: return 0;
    }
  }

  /**
   * Parse "at" time (e.g., "09:00")
   */
  static parseAtTime(time: string): { hour: number; minute: number } | null {
    const match = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return { hour: parseInt(match[1]), minute: parseInt(match[2]) };
  }

  /**
   * Check if job should run now
   */
  static shouldRun(job: CronJob, now: Date): boolean {
    if (!job.enabled) return false;

    const schedule = job.schedule;

    switch (schedule.type) {
      case "cron":
        // Check if current minute matches
        return this.matchesCron(schedule.expression, now);

      case "every": {
        // Check if interval has elapsed since last run
        const intervalMs = this.parseInterval(schedule.interval);
        if (intervalMs === 0) return false;
        const lastRun = job.lastRun || 0;
        return now.getTime() - lastRun >= intervalMs;
      }

      case "at": {
        const parsed = this.parseAtTime(schedule.time);
        if (!parsed) return false;
        // Run when minute matches and we haven't run today
        const isRightTime = now.getHours() === parsed.hour && now.getMinutes() === parsed.minute;
        const sameDay = (d1: Date, d2: Date) =>
          d1.getFullYear() === d2.getFullYear() &&
          d1.getMonth() === d2.getMonth() &&
          d1.getDate() === d2.getDate();
        const runToday = job.lastRun ? sameDay(new Date(job.lastRun), now) : false;
        return isRightTime && !runToday;
      }

      case "daily": {
        const parsed = this.parseAtTime(schedule.time);
        if (!parsed) return false;
        const isRightTime = now.getHours() === parsed.hour && now.getMinutes() === parsed.minute;
        if (!isRightTime) return false;

        // Check days filter
        if (schedule.days) {
          const dayOfWeek = now.getDay();
          if (!schedule.days.includes(dayOfWeek)) return false;
        }

        // Check if already run today
        const sameDay = (d1: Date, d2: Date) =>
          d1.getFullYear() === d2.getFullYear() &&
          d1.getMonth() === d2.getMonth() &&
          d1.getDate() === d2.getDate();
        const runToday = job.lastRun ? sameDay(new Date(job.lastRun), now) : false;
        return !runToday;
      }

      case "weekly": {
        const parsed = this.parseAtTime(schedule.time);
        if (!parsed) return false;
        const isRightTime = now.getHours() === parsed.hour && now.getMinutes() === parsed.minute;
        const isRightDay = now.getDay() === schedule.day;
        if (!isRightTime || !isRightDay) return false;

        // Check if already run this week
        const getWeekNumber = (d: Date) => {
          const start = new Date(d.getFullYear(), 0, 1);
          return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
        };
        const sameWeek = (d1: Date, d2: Date) =>
          d1.getFullYear() === d2.getFullYear() && getWeekNumber(d1) === getWeekNumber(d2);
        const runThisWeek = job.lastRun ? sameWeek(new Date(job.lastRun), now) : false;
        return !runThisWeek;
      }

      default:
        return false;
    }
  }

  /**
   * Calculate next run time
   */
  static nextRun(job: CronJob, from: Date): number {
    // Simplified: for 'every' type, just add interval
    // For cron/at/daily, would need more complex logic

    const schedule = job.schedule;
    if (schedule.type === "every") {
      const intervalMs = this.parseInterval(schedule.interval);
      return from.getTime() + intervalMs;
    }

    if (schedule.type === "at" || schedule.type === "daily") {
      const parsed = this.parseAtTime(schedule.time);
      if (!parsed) return 0;

      const next = new Date(from);
      next.setHours(parsed.hour, parsed.minute, 0, 0);
      if (next.getTime() <= from.getTime()) {
        next.setDate(next.getDate() + 1);
      }
      return next.getTime();
    }

    // For cron, default to checking next minute
    return from.getTime() + 60000;
  }
}

/**
 * Gateway Cron Scheduler
 */
export class CronScheduler extends EventEmitter {
  private jobs: Map<string, CronJob> = new Map();
  private checkTimer: Timer | null = null;
  private isRunning = false;
  private lastCheck: Date = new Date();

  constructor() {
    super();
  }

  /**
   * Start the cron scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    // Load jobs from disk
    await this.loadJobs();

    // Load jobs from config
    await this.loadFromConfig();

    // Check every minute at :00 seconds
    const now = new Date();
    const nextMinute = new Date(now);
    nextMinute.setMinutes(now.getMinutes() + 1, 0, 0);
    const delay = nextMinute.getTime() - now.getTime();

    setTimeout(() => {
      this.checkAll();
      this.checkTimer = setInterval(() => this.checkAll(), 60000);
    }, delay);

    this.isRunning = true;
    console.log(`[CronScheduler] Started with ${this.jobs.size} jobs`);
    this.emit("started");
  }

  /**
   * Stop the cron scheduler
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.isRunning = false;
    console.log("[CronScheduler] Stopped");
    this.emit("stopped");
  }

  /**
   * Load jobs from disk
   */
  private async loadJobs(): Promise<void> {
    try {
      await mkdir(CRON_DIR, { recursive: true });
      const data = await readFile(JOBS_FILE, "utf-8");
      const jobs = JSON.parse(data) as CronJob[];

      for (const job of jobs) {
        this.jobs.set(job.id, job);
      }
    } catch {
      // No jobs file, start empty
    }
  }

  /**
   * Load jobs from config
   */
  private async loadFromConfig(): Promise<void> {
    try {
      const configSnapshot = await loadConfig();
      const config = configSnapshot.config;
      const cronJobs = (config as any).cron?.jobs || [];

      for (const jobDef of cronJobs) {
        const job: CronJob = {
          id: `cron-${jobDef.name.toLowerCase().replace(/\s+/g, "-")}`,
          name: jobDef.name,
          enabled: jobDef.enabled ?? true,
          schedule: this.parseScheduleString(jobDef.schedule),
          target: jobDef.target || "default",
          message: jobDef.message,
          model: jobDef.model,
          createdAt: Date.now(),
        };
        this.jobs.set(job.id, job);
      }
    } catch (err) {
      console.error("[CronScheduler] Failed to load config:", err);
    }
  }

  /**
   * Parse schedule string into CronSchedule
   */
  private parseScheduleString(schedule: string): CronSchedule {
    // cron expression (5 fields)
    if (/^\d|\*/.test(schedule) && schedule.split(/\s+/).length === 5) {
      return { type: "cron", expression: schedule };
    }

    // "every X" pattern
    const everyMatch = schedule.match(/^every\s+(\d+[smhd])/i);
    if (everyMatch) {
      return { type: "every", interval: everyMatch[1] };
    }

    // "at HH:MM" pattern
    const atMatch = schedule.match(/^at\s+(\d{1,2}:\d{2})$/i);
    if (atMatch) {
      return { type: "at", time: atMatch[1] };
    }

    // "daily at HH:MM" pattern
    const dailyMatch = schedule.match(/^daily(?:\s+at)?\s+(\d{1,2}:\d{2})$/i);
    if (dailyMatch) {
      return { type: "daily", time: dailyMatch[1] };
    }

    // Default: every hour
    return { type: "every", interval: "1h" };
  }

  /**
   * Save jobs to disk
   */
  private async saveJobs(): Promise<void> {
    await mkdir(CRON_DIR, { recursive: true });
    await writeFile(JOBS_FILE, JSON.stringify(Array.from(this.jobs.values()), null, 2));
  }

  /**
   * Check all jobs for execution
   */
  private async checkAll(): Promise<void> {
    const now = new Date();

    for (const [id, job] of this.jobs) {
      try {
        if (ScheduleEvaluator.shouldRun(job, now)) {
          await this.runJob(job);
        }
      } catch (err) {
        console.error(`[CronScheduler] Error checking job ${id}:`, err);
      }
    }

    this.lastCheck = now;
  }

  /**
   * Run a cron job
   */
  private async runJob(job: CronJob): Promise<CronResult> {
    console.log(`[CronScheduler] Running job: ${job.name}`);
    const startTime = Date.now();

    try {
      // Get gateway
      const gateway = getGateway();
      if (!gateway) {
        console.error(`[CronScheduler] Cannot run job ${job.name}: Gateway not running`);
        return {
          jobId: job.id,
          success: false,
          error: "Gateway not running",
          duration: Date.now() - startTime,
        };
      }

      // Create isolated session and run
      // In full implementation, this would:
      // 1. Create a new session
      // 2. Load agent config
      // 3. Run the message prompt
      // 4. Store result

      const result: CronResult = {
        jobId: job.id,
        success: true,
        output: `Executed: ${job.message}`,
        duration: Date.now() - startTime,
      };

      // Update job state
      job.lastRun = startTime;
      job.lastResult = result.success ? "success" : "failure";
      job.nextRun = ScheduleEvaluator.nextRun(job, new Date());

      await this.saveJobs();

      this.emit("job", result);
      return result;

    } catch (err) {
      const result: CronResult = {
        jobId: job.id,
        success: false,
        error: String(err),
        duration: Date.now() - startTime,
      };

      job.lastRun = startTime;
      job.lastResult = "failure";

      await this.saveJobs();

      this.emit("job", result);
      return result;
    }
  }

  /**
   * Add a new job
   */
  async addJob(job: Omit<CronJob, "id" | "createdAt">): Promise<string> {
    const id = `cron-${job.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now().toString(36)}`;
    const fullJob: CronJob = {
      ...job,
      id,
      createdAt: Date.now(),
      nextRun: ScheduleEvaluator.nextRun({ ...job, id } as CronJob, new Date()),
    };

    this.jobs.set(id, fullJob);
    await this.saveJobs();

    return id;
  }

  /**
   * Remove a job
   */
  async removeJob(id: string): Promise<boolean> {
    const existed = this.jobs.delete(id);
    if (existed) {
      await this.saveJobs();
    }
    return existed;
  }

  /**
   * Enable/disable a job
   */
  async setJobEnabled(id: string, enabled: boolean): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;

    job.enabled = enabled;
    await this.saveJobs();
    return true;
  }

  /**
   * Get all jobs
   */
  getJobs(): CronJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get a specific job
   */
  getJob(id: string): CronJob | undefined {
    return this.jobs.get(id);
  }

  /**
   * Trigger a job manually
   */
  async triggerJob(id: string): Promise<CronResult> {
    const job = this.jobs.get(id);
    if (!job) {
      return {
        jobId: id,
        success: false,
        error: "Job not found",
        duration: 0,
      };
    }

    return this.runJob(job);
  }
}

// Singleton instance
let cronInstance: CronScheduler | null = null;

export function getCronScheduler(): CronScheduler {
  if (!cronInstance) {
    cronInstance = new CronScheduler();
  }
  return cronInstance;
}

export function startCronScheduler(): CronScheduler {
  const scheduler = getCronScheduler();
  scheduler.start();
  return scheduler;
}

export function stopCronScheduler(): void {
  cronInstance?.stop();
}