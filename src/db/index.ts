/**
 * 0xKobold Database SDK
 * 
 * Unified access to all 0xKobold databases.
 * Provides typed DAOs and cross-DB queries.
 * 
 * Usage:
 *   import { db } from './db';
 *   
 *   // Simple DAO access
 *   await db.telemetry().trackCronJob({ name: 'Moltx', duration: 1000 });
 *   
 *   // Cross-DB query
 *   const results = await db.queries().cronJobPerformance(7);
 */

import { homedir } from 'os';
import { join } from 'path';

// Database paths
export const DB_PATHS = {
  telemetry: join(homedir(), '.0xkobold', 'telemetry.db'),
  cron: join(homedir(), '.0xkobold', 'cron.db'),
  agents: join(homedir(), '.0xkobold', 'agents.db'),
  sessions: join(homedir(), '.0xkobold', 'sessions.db'),
  tasks: join(homedir(), '.0xkobold', 'tasks.db'),
  metrics: join(homedir(), '.0xkobold', 'metrics.db'),
  dialectic: join(homedir(), '.0xkobold', 'dialectic', 'dialectic.db'),
  memory: join(homedir(), '.0xkobold', 'memory', 'perennial', 'knowledge.db'),
} as const;

export type DBName = keyof typeof DB_PATHS;

// Import DAOs (use aliases to avoid naming conflicts)
import { TelemetryDAO, telemetryDAO } from './daos/telemetry.js';
import { CronDAO, cronDAO } from './daos/cron.js';
import { CrossDBQueries, crossDBQueries } from './queries/index.js';

// Re-export types
export type { TelemetryEvent, CronJobEvent, DashboardSummary } from './daos/telemetry.js';
export type { CronJob, CronRun, JobStatus } from './daos/cron.js';
export type { CronJobPerformance, LLMUsageByModel, TelemetryWithContext, DashboardStats } from './queries/index.js';

// ============================================================================
// Database SDK
// ============================================================================

class DatabaseSDK {
  private _telemetry: TelemetryDAO | null = null;
  private _cron: CronDAO | null = null;
  private _queries: CrossDBQueries | null = null;

  /**
   * Get Telemetry DAO
   */
  telemetry(): TelemetryDAO {
    if (!this._telemetry) {
      this._telemetry = new TelemetryDAO();
    }
    return this._telemetry;
  }

  /**
   * Get Cron DAO
   */
  cron(): CronDAO {
    if (!this._cron) {
      this._cron = new CronDAO();
    }
    return this._cron;
  }

  /**
   * Get cross-DB queries
   */
  queries(): CrossDBQueries {
    if (!this._queries) {
      this._queries = new CrossDBQueries();
    }
    return this._queries;
  }

  /**
   * Close all connections
   */
  close(): void {
    if (this._telemetry) {
      this._telemetry.close();
      this._telemetry = null;
    }
    if (this._cron) {
      this._cron.close();
      this._cron = null;
    }
    if (this._queries) {
      this._queries.close();
      this._queries = null;
    }
  }
}

// Singleton instance
let sdk: DatabaseSDK | null = null;

export const db = (): DatabaseSDK => {
  if (!sdk) {
    sdk = new DatabaseSDK();
  }
  return sdk;
};

// Export individual DAOs for convenience (with aliases)
export { TelemetryDAO } from './daos/telemetry.js';
export { telemetryDAO };
export { CronDAO } from './daos/cron.js';
export { cronDAO };
export { CrossDBQueries } from './queries/index.js';
export { crossDBQueries };
