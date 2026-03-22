/**
 * Cross-Database Queries
 * 
 * Queries that span multiple databases.
 * This is the killer feature of the DB SDK.
 */

import { Database } from 'bun:sqlite';
import { join } from 'path';
import { homedir } from 'os';
import { DB_PATHS } from '../index.js';

// ============================================================================
// Types
// ============================================================================

export interface CronJobPerformance {
  name: string;
  job_id: string;
  total_runs: number;
  successes: number;
  failures: number;
  success_rate: number;
  avg_duration_ms: number;
  total_duration_ms: number;
  last_run?: string;
  cron_expression?: string;
}

export interface LLMUsageByModel {
  model: string;
  provider?: string;
  request_count: number;
  avg_duration_ms: number;
  total_tokens: number;
  success_rate: number;
}

export interface TelemetryWithContext {
  // From telemetry
  category: string;
  event_name: string;
  duration_ms: number;
  success: boolean;
  timestamp: number;
  properties: Record<string, any>;
  
  // From cron (if applicable)
  cron_job_name?: string;
  cron_expression?: string;
  cron_triggered_by?: string;
}

export interface DashboardStats {
  time_range_days: number;
  total_events: number;
  by_category: Record<string, number>;
  by_success: { success: number; failure: number };
  top_events: Array<{ name: string; count: number }>;
  avg_latency_by_category: Record<string, number>;
}

// ============================================================================
// Cross-DB Queries
// ============================================================================

export class CrossDBQueries {
  private telemetryDb: Database;
  private cronDb: Database;

  constructor() {
    this.telemetryDb = new Database(DB_PATHS.telemetry);
    this.cronDb = new Database(DB_PATHS.cron);
  }

  // ============================================================================
  // Cron + Telemetry Correlation
  // ============================================================================

  /**
   * Get cron job performance from telemetry data
   * This is what we struggled with earlier!
   */
  cronJobPerformance(days = 7): CronJobPerformance[] {
    const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

    const events = this.telemetryDb.query(
      `SELECT * FROM events WHERE category = 'cron' AND timestamp > ?`
    ).all(since) as any[];

    // Group by job name
    const byName = new Map<string, any[]>();
    for (const event of events) {
      const name = event.event_name;
      if (!byName.has(name)) {
        byName.set(name, []);
      }
      byName.get(name)!.push(event);
    }

    // Get cron job metadata from cron.db
    const cronJobs = this.cronDb.query(`SELECT * FROM cron_jobs`).all() as any[];
    const jobMeta = new Map<string, any>();
    for (const job of cronJobs) {
      jobMeta.set(job.name, job);
    }

    // Build performance metrics
    const results: CronJobPerformance[] = [];
    for (const [name, events] of byName) {
      const total = events.length;
      const successes = events.filter(e => e.success).length;
      const failures = total - successes;
      const totalDuration = events.reduce((sum, e) => sum + (e.duration_ms || 0), 0);
      const lastEvent = events.reduce((latest, e) => e.timestamp > latest.timestamp ? e : latest, events[0]);
      const meta = jobMeta.get(name);

      results.push({
        name,
        job_id: meta?.id || events[0]?.properties?.job_id || '-',
        total_runs: total,
        successes,
        failures,
        success_rate: (successes / total) * 100,
        avg_duration_ms: totalDuration / total,
        total_duration_ms: totalDuration,
        last_run: new Date(lastEvent.timestamp * 1000).toISOString(),
        cron_expression: meta?.cron_expression || events[0]?.properties?.cron_expression,
      });
    }

    return results.sort((a, b) => b.total_runs - a.total_runs);
  }

  /**
   * Get telemetry events with cron job context
   * Correlates telemetry events with cron job metadata
   */
  telemetryWithCronContext(eventNames?: string[], days = 7): TelemetryWithContext[] {
    const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

    let sql = `SELECT * FROM events WHERE category = 'cron' AND timestamp > ?`;
    const params: any[] = [since];

    if (eventNames && eventNames.length > 0) {
      sql += ` AND event_name IN (${eventNames.map(() => '?').join(',')})`;
      params.push(...eventNames);
    }

    sql += ` ORDER BY timestamp DESC`;

    const events = this.telemetryDb.query(sql).all(...params) as any[];

    // Get cron job names from cron.db
    const cronJobs = this.cronDb.query(`SELECT id, name, cron_expression FROM cron_jobs`).all() as any[];
    const jobMap = new Map<string, any>();
    for (const job of cronJobs) {
      jobMap.set(job.name, job);
    }

    return events.map(e => {
      const props = JSON.parse(e.properties || '{}');
      const meta = jobMap.get(e.event_name);

      return {
        category: e.category,
        event_name: e.event_name,
        duration_ms: e.duration_ms,
        success: Boolean(e.success),
        timestamp: e.timestamp,
        properties: props,
        cron_job_name: meta?.name || e.event_name,
        cron_expression: meta?.cron_expression || props.cron_expression,
        cron_triggered_by: props.triggered_by,
      };
    });
  }

  // ============================================================================
  // LLM Analytics
  // ============================================================================

  /**
   * Get LLM usage breakdown by model
   */
  llmUsageByModel(days = 7): LLMUsageByModel[] {
    const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

    const events = this.telemetryDb.query(
      `SELECT * FROM events WHERE category = 'llm' AND timestamp > ?`
    ).all(since) as any[];

    // Group by model
    const byModel = new Map<string, any[]>();
    for (const event of events) {
      const props = JSON.parse(event.properties || '{}');
      const model = props.model || 'unknown';
      if (!byModel.has(model)) {
        byModel.set(model, []);
      }
      byModel.get(model)!.push({ ...event, props });
    }

    const results: LLMUsageByModel[] = [];
    for (const [model, events] of byModel) {
      const total = events.length;
      const successes = events.filter(e => e.success).length;
      const totalDuration = events.reduce((sum, e) => sum + (e.duration_ms || 0), 0);
      const totalTokens = events.reduce((sum, e) => sum + ((e.props as any)?.tokens || 0), 0);

      results.push({
        model,
        provider: events[0].props?.provider,
        request_count: total,
        avg_duration_ms: totalDuration / total,
        total_tokens: totalTokens,
        success_rate: (successes / total) * 100,
      });
    }

    return results.sort((a, b) => b.request_count - a.request_count);
  }

  // ============================================================================
  // Dashboard Stats
  // ============================================================================

  /**
   * Get comprehensive dashboard stats
   */
  dashboardStats(days = 7): DashboardStats {
    const since = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);

    const events = this.telemetryDb.query(
      `SELECT * FROM events WHERE timestamp > ?`
    ).all(since) as any[];

    const byCategory = new Map<string, number>();
    let successCount = 0;
    let failureCount = 0;
    const eventCounts = new Map<string, number>();
    const latencyByCategory = new Map<string, { sum: number; count: number }>();

    for (const event of events) {
      // By category
      byCategory.set(event.category, (byCategory.get(event.category) || 0) + 1);

      // By success
      if (event.success) successCount++;
      else failureCount++;

      // Event counts
      eventCounts.set(event.event_name, (eventCounts.get(event.event_name) || 0) + 1);

      // Latency
      if (event.duration_ms) {
        const current = latencyByCategory.get(event.category) || { sum: 0, count: 0 };
        current.sum += event.duration_ms;
        current.count++;
        latencyByCategory.set(event.category, current);
      }
    }

    const topEvents = Array.from(eventCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const avgLatencyByCategory: Record<string, number> = {};
    for (const [cat, data] of latencyByCategory) {
      avgLatencyByCategory[cat] = data.sum / data.count;
    }

    return {
      time_range_days: days,
      total_events: events.length,
      by_category: Object.fromEntries(byCategory),
      by_success: { success: successCount, failure: failureCount },
      top_events: topEvents,
      avg_latency_by_category: avgLatencyByCategory,
    };
  }

  /**
   * Close connections
   */
  close(): void {
    this.telemetryDb.close();
    this.cronDb.close();
  }
}

// Singleton
let instance: CrossDBQueries | null = null;

export const crossDBQueries = (): CrossDBQueries => {
  if (!instance) {
    instance = new CrossDBQueries();
  }
  return instance;
};
