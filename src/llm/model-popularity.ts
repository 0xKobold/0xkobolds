/**
 * Model Popularity Service
 *
 * Gathers model popularity data from multiple sources:
 * 1. Ollama library (pull counts) - scraped from ollama.com/library
 * 2. Nostr network - decentralized community stats sharing
 * 3. Local usage history - your own usage patterns
 *
 * This data is used by the adaptive router to boost popular/community-tested models.
 */

import { Database } from 'bun:sqlite';
import { homedir } from 'os';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

// ============================================================================
// Types
// ============================================================================

export interface ModelPopularity {
  modelName: string;
  pullCount: number;           // Ollama pull count
  pullCountRank: number;        // Rank among all models
  communityScore: number;       // Aggregated Nostr community rating
  communitySampleSize: number;  // Number of community reports
  localUsageCount: number;      // Local usage count
  trending: boolean;            // Is it trending upward?
  lastUpdated: number;
}

export interface NostrModelReport {
  pubkey: string;
  modelName: string;
  rating: number;              // 1-5
  taskType: string;
  latency: number;
  success: boolean;
  timestamp: number;
  signature: string;
}

export interface PopularityWeights {
  pullCount: number;            // Weight for Ollama popularity
  communityScore: number;      // Weight for Nostr community data
  localUsage: number;          // Weight for personal usage
}

// ============================================================================
// Database Schema
// ============================================================================

const DB_PATH = join(homedir(), '.0xkobold', 'model-popularity.db');

const SCHEMA = `
  -- Cached Ollama library data
  CREATE TABLE IF NOT EXISTS ollama_models (
    name TEXT PRIMARY KEY,
    pull_count INTEGER DEFAULT 0,
    tags TEXT,
    description TEXT,
    updated_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_ollama_pulls ON ollama_models(pull_count DESC);

  -- Community reports from Nostr
  CREATE TABLE IF NOT EXISTS nostr_reports (
    id TEXT PRIMARY KEY,
    pubkey TEXT NOT NULL,
    model_name TEXT NOT NULL,
    rating INTEGER,
    task_type TEXT,
    latency INTEGER,
    success INTEGER,
    timestamp INTEGER NOT NULL,
    signature TEXT,
    UNIQUE(pubkey, model_name, timestamp)
  );

  CREATE INDEX IF NOT EXISTS idx_nostr_model ON nostr_reports(model_name);
  CREATE INDEX IF NOT EXISTS idx_nostr_time ON nostr_reports(timestamp DESC);

  -- Aggregated popularity scores
  CREATE TABLE IF NOT EXISTS model_popularity (
    model_name TEXT PRIMARY KEY,
    pull_count INTEGER DEFAULT 0,
    pull_count_rank INTEGER DEFAULT 999,
    community_score REAL DEFAULT 0,
    community_sample_size INTEGER DEFAULT 0,
    local_usage_count INTEGER DEFAULT 0,
    trending INTEGER DEFAULT 0,
    last_updated INTEGER
  );

  -- Cache metadata
  CREATE TABLE IF NOT EXISTS cache_metadata (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at INTEGER
  );
`;

// ============================================================================
// Ollama Library Scraper
// ============================================================================

interface OllamaLibraryModel {
  name: string;
  pullCount: number;
  tags: string[];
  description: string;
}

async function fetchOllamaLibrary(): Promise<OllamaLibraryModel[]> {
  const models: OllamaLibraryModel[] = [];

  try {
    const response = await fetch('https://ollama.com/library', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; 0xKobold/1.0)',
      },
    });

    const html = await response.text();

    // Split into model sections using the x-test-model attribute
    const modelSectionRegex = /x-test-model[^>]*>([\s\S]*?)<\/li>/gi;
    
    let modelMatch;
    while ((modelMatch = modelSectionRegex.exec(html)) !== null) {
      const section = modelMatch[1];

      // Extract model name from href="/library/xxx"
      const nameMatch = section.match(/href="\/library\/([^"]+)"/);
      if (!nameMatch) continue;
      const name = nameMatch[1];

      // Extract pull count from x-test-pull-count
      const pullMatch = section.match(/x-test-pull-count[^>]*>([^<]+)</);
      let pullCount = 0;

      if (pullMatch) {
        const countStr = pullMatch[1].trim();
        pullCount = parsePullCount(countStr);
      }

      // Extract tags (look for tags in the section)
      const tags: string[] = [];
      if (section.includes('tools')) tags.push('tools');
      if (section.includes('vision')) tags.push('vision');
      if (section.includes('embedding')) tags.push('embedding');
      if (section.includes('thinking')) tags.push('thinking');
      if (section.includes('cloud')) tags.push('cloud');

      models.push({
        name,
        pullCount,
        tags,
        description: '',
      });
    }

    // Sort by pull count descending
    models.sort((a, b) => b.pullCount - a.pullCount);

  } catch (err) {
    console.error('[ModelPopularity] Failed to fetch Ollama library:', err);
  }

  return models;
}

function parsePullCount(countStr: string): number {
  const clean = countStr.trim();
  
  if (clean.includes('M')) {
    return parseFloat(clean) * 1_000_000;
  } else if (clean.includes('K')) {
    return parseFloat(clean) * 1_000;
  }
  
  const num = parseFloat(clean.replace(/,/g, ''));
  return isNaN(num) ? 0 : num;
}

// ============================================================================
// Nostr Integration
// ============================================================================

/**
 * Nostr event kind for model performance reports
 * Using kind 31234 for application-specific data
 */
const NOSTR_KIND_MODEL_REPORT = 31234;

interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/**
 * Parse a Nostr model report from event content
 */
function parseNostrReport(event: NostrEvent): NostrModelReport | null {
  try {
    const content = JSON.parse(event.content);
    return {
      pubkey: event.pubkey,
      modelName: content.modelName,
      rating: content.rating,
      taskType: content.taskType,
      latency: content.latency,
      success: content.success,
      timestamp: event.created_at * 1000,
      signature: event.sig,
    };
  } catch {
    return null;
  }
}

/**
 * Create a Nostr model report event (for publishing)
 */
export function createModelReportEvent(
  modelName: string,
  rating: number,
  taskType: string,
  latency: number,
  success: boolean
): object {
  return {
    kind: NOSTR_KIND_MODEL_REPORT,
    content: JSON.stringify({
      modelName,
      rating,
      taskType,
      latency,
      success,
      timestamp: Date.now(),
    }),
    tags: [
      ['model', modelName],
      ['rating', String(rating)],
      ['task', taskType],
    ],
    created_at: Math.floor(Date.now() / 1000),
  };
}

// ============================================================================
// Model Popularity Service
// ============================================================================

class ModelPopularityService {
  private db: Database;
  private cache: Map<string, ModelPopularity> = new Map();
  private lastFetch = 0;
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  constructor(dbPath: string = DB_PATH) {
    const dir = join(homedir(), '.0xkobold');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
    
    // Load lastFetch from database
    this.loadLastFetch();
  }
  
  private loadLastFetch(): void {
    try {
      const row = this.db.prepare('SELECT value FROM cache_metadata WHERE key = ?').get('lastFetch') as { value: string } | undefined;
      if (row) {
        this.lastFetch = parseInt(row.value, 10);
      }
    } catch {
      // Table might not exist yet, that's fine
    }
  }
  
  private saveLastFetch(): void {
    try {
      this.db.prepare('INSERT OR REPLACE INTO cache_metadata (key, value) VALUES (?, ?)').run('lastFetch', String(this.lastFetch));
    } catch {
      // Ignore errors
    }
  }

  /**
   * Refresh popularity data from Ollama library
   */
  async refreshFromOllama(): Promise<number> {
    console.log('[ModelPopularity] Fetching Ollama library...');
    const models = await fetchOllamaLibrary();

    if (models.length === 0) {
      return 0;
    }

    // Sort by pull count for ranking
    models.sort((a, b) => b.pullCount - a.pullCount);

    // Update database
    const stmt = this.db.query(`
      INSERT OR REPLACE INTO ollama_models (name, pull_count, tags, description, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    let updated = 0;
    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      stmt.run(
        model.name,
        model.pullCount,
        JSON.stringify(model.tags),
        model.description,
        Date.now()
      );
      updated++;
    }

    // Update rankings
    this.updatePopularityRankings();

    // Update cache metadata
    this.db.query(`
      INSERT OR REPLACE INTO cache_metadata (key, value, updated_at)
      VALUES ('ollama_fetch', 'completed', ?)
    `).run(Date.now());

    this.lastFetch = Date.now();
    this.saveLastFetch();
    console.log(`[ModelPopularity] Updated ${updated} models from Ollama`);

    return updated;
  }

  /**
   * Update popularity rankings based on pull counts
   */
  private updatePopularityRankings(): void {
    const models = this.db.query(`
      SELECT name, pull_count,
             ROW_NUMBER() OVER (ORDER BY pull_count DESC) as rank
      FROM ollama_models
    `).all() as any[];

    const stmt = this.db.query(`
      INSERT OR REPLACE INTO model_popularity
        (model_name, pull_count, pull_count_rank, last_updated)
      VALUES (?, ?, ?, ?)
    `);

    for (const model of models) {
      stmt.run(model.name, model.pull_count, model.rank, Date.now());
    }
  }

  /**
   * Store a Nostr report
   */
  storeNostrReport(report: NostrModelReport): void {
    const id = `${report.pubkey}-${report.modelName}-${report.timestamp}`;

    this.db.query(`
      INSERT OR REPLACE INTO nostr_reports
        (id, pubkey, model_name, rating, task_type, latency, success, timestamp, signature)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      report.pubkey,
      report.modelName,
      report.rating,
      report.taskType,
      report.latency,
      report.success ? 1 : 0,
      report.timestamp,
      report.signature
    );

    // Update aggregated popularity
    this.updateCommunityScore(report.modelName);
  }

  /**
   * Update community score for a model
   */
  private updateCommunityScore(modelName: string): void {
    const stats = this.db.query(`
      SELECT
        AVG(rating) as avg_rating,
        COUNT(*) as sample_size,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as success_rate
      FROM nostr_reports
      WHERE model_name = ?
    `).get(modelName) as any;

    if (stats && stats.sample_size > 0) {
      const communityScore = (stats.avg_rating / 5) * 0.6 + (stats.success_rate ?? 0.5) * 0.4;

      this.db.query(`
        UPDATE model_popularity
        SET community_score = ?, community_sample_size = ?, last_updated = ?
        WHERE model_name = ?
      `).run(communityScore, stats.sample_size, Date.now(), modelName);
    }
  }

  /**
   * Increment local usage count
   */
  incrementLocalUsage(modelName: string): void {
    this.db.query(`
      INSERT INTO model_popularity (model_name, local_usage_count, last_updated)
      VALUES (?, 1, ?)
      ON CONFLICT(model_name) DO UPDATE SET
        local_usage_count = local_usage_count + 1,
        last_updated = excluded.last_updated
    `).run(modelName, Date.now());
  }

  /**
   * Get popularity for a specific model
   */
  getPopularity(modelName: string): ModelPopularity | null {
    const row = this.db.query(`
      SELECT
        model_name,
        COALESCE(pull_count, 0) as pull_count,
        COALESCE(pull_count_rank, 999) as pull_count_rank,
        COALESCE(community_score, 0) as community_score,
        COALESCE(community_sample_size, 0) as community_sample_size,
        COALESCE(local_usage_count, 0) as local_usage_count,
        COALESCE(trending, 0) as trending,
        last_updated
      FROM model_popularity
      WHERE model_name = ?
    `).get(modelName) as any;

    if (!row) {
      // Check if model exists in Ollama cache
      const ollamaModel = this.db.query(`
        SELECT name, pull_count FROM ollama_models WHERE name = ?
      `).get(modelName) as any;

      if (ollamaModel) {
        return {
          modelName: modelName,
          pullCount: ollamaModel.pull_count || 0,
          pullCountRank: 999,
          communityScore: 0,
          communitySampleSize: 0,
          localUsageCount: 0,
          trending: false,
          lastUpdated: Date.now(),
        };
      }

      return null;
    }

    return {
      modelName: row.model_name,
      pullCount: row.pull_count,
      pullCountRank: row.pull_count_rank,
      communityScore: row.community_score,
      communitySampleSize: row.community_sample_size,
      localUsageCount: row.local_usage_count,
      trending: row.trending === 1,
      lastUpdated: row.last_updated,
    };
  }

  /**
   * Get all popularity data
   */
  getAllPopularity(): ModelPopularity[] {
    const rows = this.db.query(`
      SELECT
        model_name,
        COALESCE(pull_count, 0) as pull_count,
        COALESCE(pull_count_rank, 999) as pull_count_rank,
        COALESCE(community_score, 0) as community_score,
        COALESCE(community_sample_size, 0) as community_sample_size,
        COALESCE(local_usage_count, 0) as local_usage_count,
        COALESCE(trending, 0) as trending,
        last_updated
      FROM model_popularity
      ORDER BY pull_count DESC
    `).all() as any[];

    return rows.map(row => ({
      modelName: row.model_name,
      pullCount: row.pull_count,
      pullCountRank: row.pull_count_rank,
      communityScore: row.community_score,
      communitySampleSize: row.community_sample_size,
      localUsageCount: row.local_usage_count,
      trending: row.trending === 1,
      lastUpdated: row.last_updated,
    }));
  }

  /**
   * Calculate popularity score for use in routing
   * Returns a normalized score (0-1) factoring in multiple signals
   */
  calculatePopularityScore(modelName: string, weights?: Partial<PopularityWeights>): number {
    const pop = this.getPopularity(modelName);
    if (!pop) return 0.5; // Default for unknown models

    const w: PopularityWeights = {
      pullCount: 0.4,
      communityScore: 0.4,
      localUsage: 0.2,
      ...weights,
    };

    // Normalize pull count (log scale)
    const pullScore = Math.log10(pop.pullCount + 1) / 8; // 100M pulls = ~1

    // Community score is already normalized (0-1)
    const communityNorm = pop.communitySampleSize > 0
      ? pop.communityScore
      : 0.5; // Default for no community data

    // Normalize local usage (log scale)
    const localScore = Math.log10(pop.localUsageCount + 1) / 4; // 10K uses = ~1

    return pullScore * w.pullCount +
           communityNorm * w.communityScore +
           Math.min(localScore, 1) * w.localUsage;
  }

  /**
   * Get trending models (fastest growing)
   */
  getTrending(limit: number = 10): ModelPopularity[] {
    const rows = this.db.query(`
      SELECT
        model_name,
        pull_count,
        pull_count_rank,
        community_score,
        community_sample_size,
        local_usage_count,
        trending,
        last_updated
      FROM model_popularity
      WHERE pull_count > 0
      ORDER BY pull_count DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      modelName: row.model_name,
      pullCount: row.pull_count,
      pullCountRank: row.pull_count_rank,
      communityScore: row.community_score,
      communitySampleSize: row.community_sample_size,
      localUsageCount: row.local_usage_count,
      trending: row.trending === 1,
      lastUpdated: row.last_updated,
    }));
  }

  /**
   * Get most used models locally
   */
  getMostUsedLocally(limit: number = 10): ModelPopularity[] {
    const rows = this.db.query(`
      SELECT
        model_name,
        pull_count,
        pull_count_rank,
        community_score,
        community_sample_size,
        local_usage_count,
        trending,
        last_updated
      FROM model_popularity
      WHERE local_usage_count > 0
      ORDER BY local_usage_count DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      modelName: row.model_name,
      pullCount: row.pull_count,
      pullCountRank: row.pull_count_rank,
      communityScore: row.community_score,
      communitySampleSize: row.community_sample_size,
      localUsageCount: row.local_usage_count,
      trending: false,
      lastUpdated: row.last_updated,
    }));
  }

  /**
   * Check if cache needs refresh
   */
  needsRefresh(): boolean {
    return Date.now() - this.lastFetch > this.CACHE_TTL;
  }

  /**
   * Auto-refresh if needed
   */
  async ensureFresh(): Promise<void> {
    if (this.needsRefresh()) {
      await this.refreshFromOllama();
    }
  }

  /**
   * Export popularity data for sharing
   */
  exportForNostr(): object {
    const myReports = this.db.query(`
      SELECT model_name,
             AVG(rating) as avg_rating,
             COUNT(*) as count,
             AVG(latency) as avg_latency
      FROM nostr_reports
      GROUP BY model_name
    `).all() as any[];

    return {
      kind: NOSTR_KIND_MODEL_REPORT,
      models: myReports.map(r => ({
        model: r.model_name,
        rating: r.avg_rating,
        samples: r.count,
        latency: r.avg_latency,
      })),
      timestamp: Date.now(),
    };
  }

  /**
   * Close database
   */
  close(): void {
    this.db.close();
  }
}

// ============================================================================
// Nostr Relay Client (Simple Implementation)
// ============================================================================

interface NostrRelayConfig {
  relays: string[];
  timeout: number;
}

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
];

/**
 * Fetch model reports from Nostr relays
 * This is a simplified implementation - for full Nostr support,
 * use a proper Nostr library like nostr-tools
 */
async function fetchNostrModelReports(
  modelNames: string[],
  config: Partial<NostrRelayConfig> = {}
): Promise<NostrModelReport[]> {
  const { relays = DEFAULT_RELAYS, timeout = 5000 } = config;
  const reports: NostrModelReport[] = [];

  // Note: This is a simplified WebSocket implementation
  // In production, use a proper Nostr library with proper signing
  console.log('[Nostr] Fetching model reports from relays...');

  // For now, return local data
  // Full Nostr integration would require:
  // 1. WebSocket connections to relays
  // 2. REQ messages with filters for kind 31234
  // 3. Event signature verification
  // 4. Rate limiting and pagination

  console.log('[Nostr] Note: Full Nostr integration requires nostr-tools library');

  return reports;
}

// ============================================================================
// Singleton Instance
// ============================================================================

let popularityInstance: ModelPopularityService | null = null;

export function getModelPopularityService(): ModelPopularityService {
  if (!popularityInstance) {
    popularityInstance = new ModelPopularityService();
  }
  return popularityInstance;
}

export function closeModelPopularityService(): void {
  if (popularityInstance) {
    popularityInstance.close();
    popularityInstance = null;
  }
}

export { ModelPopularityService, fetchNostrModelReports, NOSTR_KIND_MODEL_REPORT };
export default ModelPopularityService;