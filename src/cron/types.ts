/**
 * Cron Types - 0xKobold
 * 
 * TypeScript interfaces for cron job scheduling.
 * Based on OpenClaw cron specifications.
 */

/**
 * Cron expression components
 */
export interface CronExpression {
  minute: number[] | '*';
  hour: number[] | '*';
  dayOfMonth: number[] | '*';
  month: number[] | '*';
  dayOfWeek: number[] | '*';
  timezone: string;
}

/**
 * Session type for job execution
 */
export type SessionType = 'main' | 'isolated';

/**
 * Cron job definition
 */
export interface CronJob {
  /** Unique job ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Cron expression (e.g., "0 9 * * *") */
  cronExpression?: string;
  /** One-shot: absolute timestamp (ms since epoch) */
  at?: number;
  /** One-shot: relative duration in ms */
  atDuration?: number;
  /** Session type: main (shares context) or isolated (clean slate) */
  session: SessionType;
  /** Message/prompt to send to the agent */
  message: string;
  /** Model override (e.g., "kimi-k2.5:cloud") */
  model?: string;
  /** Thinking level override */
  thinkingLevel?: 'fast' | 'normal' | 'deep';
  /** Timezone for scheduling (default: UTC) */
  timezone: string;
  /** Whether job is enabled */
  enabled: boolean;
  /** When job was created */
  createdAt: number;
  /** Last run timestamp */
  lastRunAt?: number;
  /** Next scheduled run timestamp */
  nextRunAt: number;
  /** Number of times job has run */
  runCount: number;
  /** Number of failed runs */
  errorCount: number;
  /** Last error message */
  lastError?: string;
  /** Delete after running (for one-shots) */
  deleteAfterRun?: boolean;
  /** Wake main session after run */
  wakeAfterRun?: boolean;
  /** Working directory for isolated sessions */
  workingDir?: string;
  /** Random delay 0-N minutes (load spreading) */
  stagger?: number;
  /** Force exact timing (disable stagger) */
  exact?: boolean;
  /** Max tokens allowed for this job */
  tokenLimit?: number;
  /** Notification settings */
  notify?: {
    channel: 'telegram' | 'discord' | 'slack' | 'whatsapp';
    recipient: string;
    onSuccess?: boolean;
    onError?: boolean;
    prefix?: string;
  };
}

/**
 * Job execution result
 */
export interface JobResult {
  success: boolean;
  output: string;
  tokensUsed: number;
  cost?: number;
  duration: number;
  error?: string;
}

/**
 * Job run log entry
 */
export interface JobRun {
  id: number;
  jobId: string;
  startedAt: number;
  completedAt: number;
  success: boolean;
  output: string;
  tokensUsed: number;
  cost?: number;
  error?: string;
}

/**
 * Scheduler configuration
 */
export interface SchedulerConfig {
  /** Default timezone */
  defaultTimezone: string;
  /** Max concurrent jobs */
  maxConcurrent: number;
  /** Default model */
  defaultModel: string;
  /** Enabled/disabled */
  enabled: boolean;
  /** Check interval in ms (default: 60000 = 1 minute) */
  checkInterval: number;
}

/**
 * CLI options for adding a job
 */
export interface AddJobOptions {
  name: string;
  cron?: string;
  at?: string;
  timezone?: string;
  session?: SessionType;
  model?: string;
  thinkingLevel?: 'fast' | 'normal' | 'deep';
  deleteAfterRun?: boolean;
  wake?: boolean;
  workingDir?: string;
  notify?: {
    channel: 'telegram' | 'discord' | 'slack' | 'whatsapp';
    recipient: string;
    onSuccess?: boolean;
    onError?: boolean;
    prefix?: string;
  };
  message: string;
}

/**
 * Parsed duration
 */
export interface ParsedDuration {
  milliseconds: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/**
 * Job status summary for CLI
 */
export interface JobStatus {
  id: string;
  name: string;
  schedule: string;
  nextRun: string;
  session: SessionType;
  status: 'enabled' | 'disabled' | 'paused';
  lastRun?: string;
  runCount: number;
}
