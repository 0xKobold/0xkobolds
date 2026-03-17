/**
 * Model Scoring Database - Persistent Model Performance Tracking
 *
 * Stores and retrieves model performance data for adaptive routing.
 * Enables long-term learning and AI-generated tier lists.
 *
 * Database: ~/.0xkobold/model-scoring.db
 */

import { Database } from 'bun:sqlite';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

// ============================================================================
// Types
// ============================================================================

export interface ModelPerformance {
  id?: string;
  modelName: string;
  taskType: string;
  complexity: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  timestamp: number;
  userRating?: number;
  success: boolean;
  sessionId?: string;
}

export interface ModelScore {
  modelName: string;
  avgLatency: number;
  avgQuality: number;
  usageCount: number;
  successRate: number;
  score: number;
  lastUsed: number;
}

export interface ModelTier {
  modelName: string;
  tier: 'S' | 'A' | 'B' | 'C' | 'D';
  score: number;
  avgLatency: number;
  avgQuality: number;
  usageCount: number;
  successRate: number;
  strengths: string[];
  weaknesses: string[];
  recommendedFor: string[];
}

export interface RankingPeriod {
  period: 'day' | 'week' | 'month' | 'all';
  startTime: number;
  endTime: number;
}

// ============================================================================
// Database Schema
// ============================================================================

const DB_PATH = join(homedir(), '.0xkobold', 'model-scoring.db');

const SCHEMA = `
  -- Individual performance records
  CREATE TABLE IF NOT EXISTS performance_history (
    id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    task_type TEXT DEFAULT 'chat',
    complexity TEXT DEFAULT 'medium',
    latency_ms INTEGER DEFAULT 0,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    timestamp INTEGER NOT NULL,
    user_rating INTEGER,
    success INTEGER DEFAULT 1,
    session_id TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_perf_model ON performance_history(model_name);
  CREATE INDEX IF NOT EXISTS idx_perf_time ON performance_history(timestamp);
  CREATE INDEX IF NOT EXISTS idx_perf_task ON performance_history(task_type);
  CREATE INDEX IF NOT EXISTS idx_perf_session ON performance_history(session_id);

  -- Aggregated scores (updated periodically)
  CREATE TABLE IF NOT EXISTS model_scores (
    model_name TEXT PRIMARY KEY,
    avg_latency REAL DEFAULT 0,
    avg_quality REAL DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0,
    score REAL DEFAULT 0,
    last_used INTEGER,
    last_updated INTEGER
  );

  -- Task-specific performance
  CREATE TABLE IF NOT EXISTS task_performance (
    id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    task_type TEXT NOT NULL,
    avg_latency REAL DEFAULT 0,
    avg_quality REAL DEFAULT 0,
    usage_count INTEGER DEFAULT 0,
    success_rate REAL DEFAULT 0,
    score REAL DEFAULT 0,
    last_updated INTEGER,
    UNIQUE(model_name, task_type)
  );

  CREATE INDEX IF NOT EXISTS idx_task_perf_model ON task_performance(model_name);
  CREATE INDEX IF NOT EXISTS idx_task_perf_type ON task_performance(task_type);

  -- User feedback history
  CREATE TABLE IF NOT EXISTS user_feedback (
    id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    rating INTEGER NOT NULL,
    task_type TEXT,
    context TEXT,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_feedback_model ON user_feedback(model_name);
  CREATE INDEX IF NOT EXISTS idx_feedback_time ON user_feedback(timestamp);

  -- Tier list snapshots (AI-generated)
  CREATE TABLE IF NOT EXISTS tier_lists (
    id TEXT PRIMARY KEY,
    generated_at INTEGER NOT NULL,
    period TEXT NOT NULL,
    tiers TEXT NOT NULL,  -- JSON array of ModelTier
    summary TEXT,
    total_samples INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_tier_time ON tier_lists(generated_at);
`;

// ============================================================================
// Model Scoring Database Class
// ============================================================================

class ModelScoringDB {
  private db: Database;
  private initialized = false;

  constructor(dbPath: string = DB_PATH) {
    const dir = join(homedir(), '.0xkobold');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(SCHEMA);
    this.initialized = true;
    console.log('[ModelScoringDB] Initialized');
  }

  // ============================================================================
  // Performance Recording
  // ============================================================================

  recordPerformance(perf: ModelPerformance): string {
    const id = `perf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.db.query(`
      INSERT INTO performance_history (
        id, model_name, task_type, complexity, latency_ms,
        input_tokens, output_tokens, timestamp, user_rating, success, session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      perf.modelName,
      perf.taskType,
      perf.complexity,
      perf.latencyMs,
      perf.inputTokens,
      perf.outputTokens,
      perf.timestamp || Date.now(),
      perf.userRating ?? null,
      perf.success ? 1 : 0,
      perf.sessionId ?? null
    );

    // Update aggregated scores asynchronously
    this.updateModelScore(perf.modelName);

    return id;
  }

  addFeedback(modelName: string, rating: number, taskType?: string, context?: string): string {
    const id = `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.db.query(`
      INSERT INTO user_feedback (id, model_name, rating, task_type, context, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      modelName,
      rating,
      taskType ?? null,
      context ?? null,
      Date.now()
    );

    // Update quality score
    this.updateModelScore(modelName);

    return id;
  }

  // ============================================================================
  // Aggregated Scores
  // ============================================================================

  private updateModelScore(modelName: string): void {
    // Calculate aggregated metrics
    const stats = this.db.query(`
      SELECT
        AVG(latency_ms) as avg_latency,
        AVG(CASE WHEN user_rating IS NOT NULL THEN user_rating ELSE NULL END) as avg_quality,
        COUNT(*) as usage_count,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as success_rate,
        MAX(timestamp) as last_used
      FROM performance_history
      WHERE model_name = ?
    `).get(modelName) as any;

    // Calculate overall score
    const avgRating = stats?.avg_quality ?? 3;
    const avgLatency = stats?.avg_latency ?? 0;
    const successRate = stats?.success_rate ?? 0.5;
    const usageCount = stats?.usage_count ?? 0;

    // Score formula: 40% quality + 30% success rate + 20% speed + 10% reliability
    const normalizedLatency = avgLatency > 0 ? Math.max(0, 1 - (avgLatency / 10000)) : 0.5;
    const qualityScore = avgRating / 5;

    const score =
      qualityScore * 0.40 +
      successRate * 0.30 +
      normalizedLatency * 0.20 +
      Math.min(usageCount / 100, 1) * 0.10;

    // Upsert to model_scores
    this.db.query(`
      INSERT INTO model_scores (
        model_name, avg_latency, avg_quality, usage_count, success_rate, score, last_used, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(model_name) DO UPDATE SET
        avg_latency = excluded.avg_latency,
        avg_quality = excluded.avg_quality,
        usage_count = excluded.usage_count,
        success_rate = excluded.success_rate,
        score = excluded.score,
        last_used = excluded.last_used,
        last_updated = excluded.last_updated
    `).run(
      modelName,
      avgLatency,
      avgRating,
      usageCount,
      successRate,
      score,
      stats?.last_used ?? Date.now(),
      Date.now()
    );
  }

  getModelScore(modelName: string): ModelScore | null {
    const row = this.db.query(`
      SELECT model_name, avg_latency, avg_quality, usage_count, success_rate, score, last_used
      FROM model_scores WHERE model_name = ?
    `).get(modelName) as any;

    if (!row) return null;

    return {
      modelName: row.model_name,
      avgLatency: row.avg_latency,
      avgQuality: row.avg_quality,
      usageCount: row.usage_count,
      successRate: row.success_rate,
      score: row.score,
      lastUsed: row.last_used,
    };
  }

  getAllScores(): ModelScore[] {
    const rows = this.db.query(`
      SELECT model_name, avg_latency, avg_quality, usage_count, success_rate, score, last_used
      FROM model_scores
      ORDER BY score DESC
    `).all() as any[];

    return rows.map(row => ({
      modelName: row.model_name,
      avgLatency: row.avg_latency,
      avgQuality: row.avg_quality,
      usageCount: row.usage_count,
      successRate: row.success_rate,
      score: row.score,
      lastUsed: row.last_used,
    }));
  }

  // ============================================================================
  // Task-Specific Performance
  // ============================================================================

  updateTaskPerformance(modelName: string, taskType: string): void {
    const stats = this.db.query(`
      SELECT
        AVG(latency_ms) as avg_latency,
        AVG(CASE WHEN user_rating IS NOT NULL THEN user_rating ELSE NULL END) as avg_quality,
        COUNT(*) as usage_count,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as success_rate
      FROM performance_history
      WHERE model_name = ? AND task_type = ?
    `).get(modelName, taskType) as any;

    if (!stats || stats.usage_count === 0) return;

    const avgRating = stats?.avg_quality ?? 3;
    const successRate = stats?.success_rate ?? 0.5;
    const score = (avgRating / 5) * 0.5 + successRate * 0.5;

    const id = `tp-${modelName}-${taskType}`;

    this.db.query(`
      INSERT INTO task_performance (
        id, model_name, task_type, avg_latency, avg_quality, usage_count, success_rate, score, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(model_name, task_type) DO UPDATE SET
        avg_latency = excluded.avg_latency,
        avg_quality = excluded.avg_quality,
        usage_count = excluded.usage_count,
        success_rate = excluded.success_rate,
        score = excluded.score,
        last_updated = excluded.last_updated
    `).run(
      id,
      modelName,
      taskType,
      stats.avg_latency,
      avgRating,
      stats.usage_count,
      successRate,
      score,
      Date.now()
    );
  }

  getTaskPerformance(modelName: string, taskType: string): ModelScore | null {
    const row = this.db.query(`
      SELECT model_name, avg_latency, avg_quality, usage_count, success_rate, score
      FROM task_performance
      WHERE model_name = ? AND task_type = ?
    `).get(modelName, taskType) as any;

    if (!row) return null;

    return {
      modelName: row.model_name,
      avgLatency: row.avg_latency,
      avgQuality: row.avg_quality,
      usageCount: row.usage_count,
      successRate: row.success_rate,
      score: row.score,
      lastUsed: Date.now(),
    };
  }

  getBestForTask(taskType: string, minSamples: number = 3): ModelScore | null {
    const row = this.db.query(`
      SELECT model_name, avg_latency, avg_quality, usage_count, success_rate, score
      FROM task_performance
      WHERE task_type = ? AND usage_count >= ?
      ORDER BY score DESC
      LIMIT 1
    `).get(taskType, minSamples) as any;

    if (!row) return null;

    return {
      modelName: row.model_name,
      avgLatency: row.avg_latency,
      avgQuality: row.avg_quality,
      usageCount: row.usage_count,
      successRate: row.success_rate,
      score: row.score,
      lastUsed: Date.now(),
    };
  }

  // ============================================================================
  // Tier List Generation
  // ============================================================================

  generateTierList(period: 'day' | 'week' | 'month' | 'all' = 'all'): ModelTier[] {
    const now = Date.now();
    let sinceTime: number;

    switch (period) {
      case 'day':
        sinceTime = now - 24 * 60 * 60 * 1000;
        break;
      case 'week':
        sinceTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case 'month':
        sinceTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
      default:
        sinceTime = 0;
    }

    const rows = this.db.query(`
      SELECT
        model_name,
        AVG(latency_ms) as avg_latency,
        AVG(CASE WHEN user_rating IS NOT NULL THEN user_rating ELSE 3 END) as avg_quality,
        COUNT(*) as usage_count,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as success_rate,
        MAX(timestamp) as last_used
      FROM performance_history
      WHERE timestamp >= ?
      GROUP BY model_name
      HAVING usage_count >= 2
      ORDER BY
        (AVG(CASE WHEN user_rating IS NOT NULL THEN user_rating ELSE 3 END) / 5.0) * 0.4 +
        (SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*)) * 0.3 +
        (1 - AVG(latency_ms) / 10000.0) * 0.2 +
        (MIN(COUNT(*) / 50.0, 1.0)) * 0.1
        DESC
    `).all(sinceTime) as any[];

    const tiers: ModelTier[] = [];
    const tierThresholds = {
      S: 0.85,
      A: 0.70,
      B: 0.55,
      C: 0.40,
      D: 0,
    };

    for (const row of rows) {
      const qualityScore = (row.avg_quality ?? 3) / 5;
      const successRate = row.success_rate;
      const normalizedLatency = row.avg_latency > 0
        ? Math.max(0, 1 - (row.avg_latency / 10000))
        : 0.5;
      const reliabilityBonus = Math.min(row.usage_count / 50, 1);

      const score =
        qualityScore * 0.40 +
        successRate * 0.30 +
        normalizedLatency * 0.20 +
        reliabilityBonus * 0.10;

      // Determine tier
      let tier: 'S' | 'A' | 'B' | 'C' | 'D' = 'D';
      if (score >= tierThresholds.S) tier = 'S';
      else if (score >= tierThresholds.A) tier = 'A';
      else if (score >= tierThresholds.B) tier = 'B';
      else if (score >= tierThresholds.C) tier = 'C';

      // Determine strengths and weaknesses
      const strengths: string[] = [];
      const weaknesses: string[] = [];

      if (successRate > 0.9) strengths.push('Reliable');
      if (row.avg_latency < 2000) strengths.push('Fast');
      if (qualityScore > 0.8) strengths.push('High Quality');
      if (row.usage_count > 50) strengths.push('Well-tested');

      if (successRate < 0.7) weaknesses.push('Unreliable');
      if (row.avg_latency > 5000) weaknesses.push('Slow');
      if (qualityScore < 0.6) weaknesses.push('Low Quality');
      if (row.usage_count < 5) weaknesses.push('Limited Data');

      // Recommend based on performance profile
      const recommendedFor: string[] = [];
      if (row.avg_latency < 3000 && successRate > 0.8) recommendedFor.push('Quick Tasks');
      if (qualityScore > 0.75 && row.usage_count > 10) recommendedFor.push('Complex Tasks');
      if (successRate > 0.9) recommendedFor.push('Critical Operations');
      if (row.avg_latency < 1500) recommendedFor.push('Real-time');

      tiers.push({
        modelName: row.model_name,
        tier,
        score,
        avgLatency: row.avg_latency,
        avgQuality: row.avg_quality,
        usageCount: row.usage_count,
        successRate: row.success_rate,
        strengths,
        weaknesses,
        recommendedFor,
      });
    }

    // Save tier list snapshot
    this.saveTierList(tiers, period);

    return tiers;
  }

  private saveTierList(tiers: ModelTier[], period: string): void {
    const id = `tier-${Date.now()}`;

    this.db.query(`
      INSERT INTO tier_lists (id, generated_at, period, tiers, summary, total_samples)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      Date.now(),
      period,
      JSON.stringify(tiers),
      `Generated ${tiers.length} model rankings for period: ${period}`,
      tiers.reduce((sum, t) => sum + t.usageCount, 0)
    );
  }

  getLatestTierList(): { tiers: ModelTier[]; generatedAt: number; period: string } | null {
    const row = this.db.query(`
      SELECT generated_at, period, tiers
      FROM tier_lists
      ORDER BY generated_at DESC
      LIMIT 1
    `).get() as any;

    if (!row) return null;

    return {
      tiers: JSON.parse(row.tiers),
      generatedAt: row.generated_at,
      period: row.period,
    };
  }

  // ============================================================================
  // Statistics & Reporting
  // ============================================================================

  getPerformanceHistory(limit: number = 100): ModelPerformance[] {
    const rows = this.db.query(`
      SELECT * FROM performance_history
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      modelName: row.model_name,
      taskType: row.task_type,
      complexity: row.complexity,
      latencyMs: row.latency_ms,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      timestamp: row.timestamp,
      userRating: row.user_rating,
      success: row.success === 1,
      sessionId: row.session_id,
    }));
  }

  getRecentFeedback(limit: number = 50): Array<{
    modelName: string;
    rating: number;
    taskType?: string;
    timestamp: number;
  }> {
    const rows = this.db.query(`
      SELECT model_name, rating, task_type, timestamp
      FROM user_feedback
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      modelName: row.model_name,
      rating: row.rating,
      taskType: row.task_type,
      timestamp: row.timestamp,
    }));
  }

  getModelStats(modelName: string): {
    totalUsage: number;
    avgLatency: number;
    avgRating: number;
    successRate: number;
    taskBreakdown: Record<string, number>;
  } {
    const stats = this.db.query(`
      SELECT
        COUNT(*) as total_usage,
        AVG(latency_ms) as avg_latency,
        AVG(CASE WHEN user_rating IS NOT NULL THEN user_rating ELSE NULL END) as avg_rating,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as success_rate
      FROM performance_history
      WHERE model_name = ?
    `).get(modelName) as any;

    const tasks = this.db.query(`
      SELECT task_type, COUNT(*) as count
      FROM performance_history
      WHERE model_name = ?
      GROUP BY task_type
    `).all(modelName) as any[];

    const taskBreakdown: Record<string, number> = {};
    for (const task of tasks) {
      taskBreakdown[task.task_type] = task.count;
    }

    return {
      totalUsage: stats?.total_usage ?? 0,
      avgLatency: stats?.avg_latency ?? 0,
      avgRating: stats?.avg_rating ?? 0,
      successRate: stats?.success_rate ?? 0,
      taskBreakdown,
    };
  }

  // ============================================================================
  // Maintenance
  // ============================================================================

  clearHistory(): void {
    this.db.exec(`
      DELETE FROM performance_history;
      DELETE FROM user_feedback;
      DELETE FROM task_performance;
      DELETE FROM tier_lists;
      DELETE FROM model_scores;
    `);
    console.log('[ModelScoringDB] History cleared');
  }

  vacuum(): void {
    this.db.exec('VACUUM;');
    console.log('[ModelScoringDB] Database vacuumed');
  }

  close(): void {
    this.db.close();
    this.initialized = false;
  }

  // ============================================================================
  // Export/Import
  // ============================================================================

  exportData(): object {
    const history = this.db.query('SELECT * FROM performance_history').all();
    const scores = this.db.query('SELECT * FROM model_scores').all();
    const feedback = this.db.query('SELECT * FROM user_feedback').all();
    const tasks = this.db.query('SELECT * FROM task_performance').all();
    const tiers = this.db.query('SELECT * FROM tier_lists').all();

    return {
      exportedAt: new Date().toISOString(),
      history,
      scores,
      feedback,
      tasks,
      tiers,
    };
  }

  importData(data: {
    history?: any[];
    scores?: any[];
    feedback?: any[];
  }): void {
    if (data.history) {
      for (const row of data.history) {
        this.db.query(`
          INSERT OR REPLACE INTO performance_history
          (id, model_name, task_type, complexity, latency_ms, input_tokens, output_tokens, timestamp, user_rating, success, session_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          row.id || `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          row.model_name ?? row.modelName,
          row.task_type ?? row.taskType ?? 'chat',
          row.complexity ?? 'medium',
          row.latency_ms ?? row.latencyMs ?? 0,
          row.input_tokens ?? row.inputTokens ?? 0,
          row.output_tokens ?? row.outputTokens ?? 0,
          row.timestamp ?? Date.now(),
          row.user_rating ?? row.userRating ?? null,
          row.success ?? 1,
          row.session_id ?? row.sessionId ?? null
        );
      }
    }

    console.log('[ModelScoringDB] Data imported');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let dbInstance: ModelScoringDB | null = null;

export function getModelScoringDB(): ModelScoringDB {
  if (!dbInstance) {
    dbInstance = new ModelScoringDB();
  }
  return dbInstance;
}

export function closeModelScoringDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export { ModelScoringDB };
export default ModelScoringDB;