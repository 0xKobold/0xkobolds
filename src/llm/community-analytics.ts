/**
 * Community Analytics Service - STRENGTHENED EDITION
 *
 * Shares anonymized model performance data with the 0xKobold community.
 * 
 * Privacy guarantees:
 * - NO prompts or responses shared
 * - NO user identity or IP stored
 * - ONLY aggregated model stats (name, rating, latency, success rate)
 * - Opt-in only (disabled by default)
 * 
 * Data integrity features:
 * - Reputation-weighted contributions
 * - Sybil/spam detection
 * - Outlier filtering
 * - Minimum thresholds
 * - Anomaly scoring
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { getModelScoringDB, ModelScore } from './model-scoring-db';
import { getModelPopularityService } from './model-popularity';

// ERC-8004 Bridge for cryptoeconomic identity verification (PRIVACY-PRESERVING)
import { 
  getERC8004Bridge, 
  TrustLevel,
  scoreToLevel,
  levelWeight
} from './erc8004-community-bridge';

// Nostr integration using nostr-tools
import { finalizeEvent, verifyEvent, SimplePool, generateSecretKey, getPublicKey } from 'nostr-tools';

// ============================================================================
// Types
// ============================================================================

export interface CommunityTaskStats {
  taskType: string;
  avgRating: number;
  avgLatency: number;
  successRate: number;
  usageCount: number;
}

export interface CommunityModelStats {
  modelName: string;
  avgRating: number;
  avgLatency: number;
  successRate: number;
  usageCount: number;
  taskStats: CommunityTaskStats[];
  bestFor: string[];
  lastUpdated: number;
  contributorCount: number;
  /** NEW: Trust score (0-100) */
  trustScore?: number;
  /** NEW: Data quality flags */
  flags?: string[];
}

export interface CommunityData {
  version: string;
  updatedAt: number;
  generatedAt: string;
  totalContributors: number;
  models: CommunityModelStats[];
}

export interface CommunityConfig {
  enabled: boolean;
  endpoint: string;
  userId?: string;
  submitInterval: number;
  lastSubmitted?: number;
  lastFetched?: number;
  /** NEW: Enable ERC-8004 cryptoeconomic verification */
  erc8004Enabled?: boolean;
  /** NEW: Minimum ERC-8004 trust level to accept contributions */
  erc8004MinTrust?: 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';
  /** NEW: Blockchain network for ERC-8004 */
  erc8004Chain?: 'base' | 'sepolia';
}

/** NEW: Contributor reputation tracking */
export interface ContributorReputation {
  pubkey: string;
  /** Unix timestamp when first seen */
  firstSeen: number;
  /** Number of valid submissions */
  validSubmissions: number;
  /** Number of flagged/submitted reports */
  totalSubmissions: number;
  /** Weighted trust score (0-100) */
  trustScore: number;
  /** Known good models this contributor has reported on */
  reportedModels: Set<string>;
  /** Submission history for anomaly detection */
  submissionHistory: Array<{
    timestamp: number;
    modelCount: number;
    avgRating: number;
    avgLatency: number;
  }>;
}

/** NEW: Spam detection result */
export interface SpamAnalysis {
  isSpam: boolean;
  confidence: number; // 0-1
  reasons: string[];
  anomalyScore: number; // 0-1 (higher = more suspicious)
}

// ============================================================================
// Constants
// ============================================================================

const CONFIG_PATH = join(homedir(), '.0xkobold', 'community-config.json');
const DATA_PATH = join(homedir(), '.0xkobold', 'community-data.json');
const REPUTATION_PATH = join(homedir(), '.0xkobold', 'community-reputation.json');

const DEFAULT_CONFIG: CommunityConfig = {
  enabled: false,
  endpoint: 'https://raw.githubusercontent.com/kobolds/0xKobolds/main/community/model-stats.json',
  submitInterval: 24,
};

// ============================================================================
// Spam Detection Thresholds
// ============================================================================

const SPAM_THRESHOLDS = {
  /** Minimum usage count to be considered legitimate */
  MIN_USAGE_COUNT: 3,
  /** Minimum contributor count before merging */
  MIN_CONTRIBUTOR_COUNT: 3,
  /** Maximum trust given to any single contributor */
  MAX_INDIVIDUAL_TRUST: 0.3,
  /** Suspiciously perfect rating threshold */
  SUSPICIOUS_PERFECT_RATING: 4.9,
  /** Suspiciously high success rate */
  SUSPICIOUS_SUCCESS_RATE: 0.98,
  /** Suspiciously fast latency (ms) for any LLM */
  SUSPICIOUS_FAST_LATENCY: 500,
  /** Maximum acceptable variance in ratings */
  MAX_RATING_VARIANCE: 1.5,
  /** Age in ms required for trusted status */
  TRUSTED_ACCOUNT_AGE_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  /** Minimum submissions for reputation */
  MIN_REPUTATION_SUBMISSIONS: 3,
  /** Decay factor for old submissions */
  RECENCY_DECAY_DAYS: 30,
};

// ============================================================================
// Community Analytics Service - Strengthened
// ============================================================================

class CommunityAnalyticsService {
  private config: CommunityConfig;
  private userId: string;
  /** NEW: Reputation database */
  private reputationDb: Map<string, ContributorReputation>;
  /** NEW: ERC-8004 Bridge for cryptoeconomic verification (privacy-preserving) */
  private erc8004Bridge: ReturnType<typeof getERC8004Bridge>;

  constructor() {
    this.config = this.loadConfig();
    this.userId = this.generateOrGetUserId();
    this.reputationDb = this.loadReputation();
    // Initialize ERC-8004 bridge if enabled
    const chain = this.config.erc8004Chain || 'sepolia';
    this.erc8004Bridge = getERC8004Bridge(chain);
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  private loadConfig(): CommunityConfig {
    if (existsSync(CONFIG_PATH)) {
      try {
        const data = readFileSync(CONFIG_PATH, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      } catch {
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  }

  private saveConfig(): void {
    writeFileSync(CONFIG_PATH, JSON.stringify(this.config, null, 2));
  }

  private generateOrGetUserId(): string {
    const idPath = join(homedir(), '.0xkobold', 'community-id.txt');
    
    if (existsSync(idPath)) {
      return readFileSync(idPath, 'utf-8').trim();
    }
    
    const id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    writeFileSync(idPath, id);
    return id;
  }

  // ============================================================================
  // Reputation Management (NEW)
  // ============================================================================

  private loadReputation(): Map<string, ContributorReputation> {
    const db = new Map<string, ContributorReputation>();
    
    if (existsSync(REPUTATION_PATH)) {
      try {
        const data = JSON.parse(readFileSync(REPUTATION_PATH, 'utf-8'));
        for (const [pubkey, rep] of Object.entries(data)) {
          const reputation = rep as ContributorReputation;
          reputation.reportedModels = new Set(reputation.reportedModels);
          db.set(pubkey, reputation);
        }
      } catch {
        // Start fresh
      }
    }
    
    return db;
  }

  private saveReputation(): void {
    type ReputationForStorage = {
      pubkey: string;
      firstSeen: number;
      validSubmissions: number;
      totalSubmissions: number;
      trustScore: number;
      reportedModels: string[];
      submissionHistory: Array<{
        timestamp: number;
        modelCount: number;
        avgRating: number;
        avgLatency: number;
      }>;
    };
    const data: Record<string, ReputationForStorage> = {};
    
    for (const [pubkey, rep] of this.reputationDb) {
      data[pubkey] = {
        pubkey: rep.pubkey,
        firstSeen: rep.firstSeen,
        validSubmissions: rep.validSubmissions,
        totalSubmissions: rep.totalSubmissions,
        trustScore: rep.trustScore,
        reportedModels: Array.from(rep.reportedModels),
        submissionHistory: rep.submissionHistory,
      };
    }
    
    writeFileSync(REPUTATION_PATH, JSON.stringify(data, null, 2));
  }

  /**
   * Update reputation for a contributor after processing their data
   */
  private updateReputation(
    pubkey: string, 
    models: Array<{ n: string; r: number; l: number; s: number; u: number }>,
    isValid: boolean
  ): void {
    let reputation = this.reputationDb.get(pubkey);
    const now = Date.now();
    
    if (!reputation) {
      reputation = {
        pubkey,
        firstSeen: now,
        validSubmissions: 0,
        totalSubmissions: 0,
        trustScore: 0,
        reportedModels: new Set(),
        submissionHistory: [],
      };
    }
    
    reputation.totalSubmissions++;
    
    if (isValid) {
      reputation.validSubmissions++;
    }
    
    // Track reported models
    for (const model of models) {
      reputation.reportedModels.add(model.n);
    }
    
    // Add to history for anomaly detection
    reputation.submissionHistory.push({
      timestamp: now,
      modelCount: models.length,
      avgRating: models.reduce((sum, m) => sum + m.r, 0) / models.length,
      avgLatency: models.reduce((sum, m) => sum + m.l, 0) / models.length,
    });
    
    // Keep only last 100 entries
    if (reputation.submissionHistory.length > 100) {
      reputation.submissionHistory = reputation.submissionHistory.slice(-100);
    }
    
    // Calculate trust score based on:
    // 1. Account age (older = more trusted)
    // 2. Ratio of valid to total submissions
    // 3. Number of distinct models reported
    // 4. Submission consistency
    const accountAge = now - reputation.firstSeen;
    const ageScore = Math.min(accountAge / SPAM_THRESHOLDS.TRUSTED_ACCOUNT_AGE_MS, 1) * 30;
    const validRatio = reputation.validSubmissions / reputation.totalSubmissions;
    const ratioScore = validRatio * 30;
    const modelDiversityScore = Math.min(reputation.reportedModels.size / 10, 1) * 20;
    const consistencyScore = this.calculateConsistencyScore(reputation) * 20;
    
    reputation.trustScore = Math.round(ageScore + ratioScore + modelDiversityScore + consistencyScore);
    
    this.reputationDb.set(pubkey, reputation);
    this.saveReputation();
  }

  /**
   * Calculate how consistent a contributor's submissions are
   */
  private calculateConsistencyScore(reputation: ContributorReputation): number {
    if (reputation.submissionHistory.length < 2) return 0.5;
    
    // Check variance in submission patterns
    const ratings = reputation.submissionHistory.map(h => h.avgRating);
    const ratingVariance = this.variance(ratings);
    
    // Low variance = high consistency = higher score
    // High variance = suspicious = lower score
    const normalizedVariance = Math.min(ratingVariance / SPAM_THRESHOLDS.MAX_RATING_VARIANCE, 1);
    
    return 1 - normalizedVariance;
  }

  private variance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  }

  /**
   * Get trust weight for a contributor (0-1)
   */
  private getTrustWeight(pubkey: string): number {
    const reputation = this.reputationDb.get(pubkey);
    
    if (!reputation) {
      // New contributor - minimal trust
      return 0.1;
    }
    
    // Cap individual influence
    return Math.min(reputation.trustScore / 100, SPAM_THRESHOLDS.MAX_INDIVIDUAL_TRUST);
  }

  // ============================================================================
  // Spam Detection (NEW)
  // ============================================================================

  /**
   * Analyze if a contributor's submission looks like spam
   */
  private analyzeSpam(
    pubkey: string,
    models: Array<{ n: string; r: number; l: number; s: number; u: number }>
  ): SpamAnalysis {
    const reasons: string[] = [];
    let anomalyScore = 0;
    const now = Date.now();
    
    const reputation = this.reputationDb.get(pubkey);
    
    // Check 1: Too many models reported at once (spam pattern)
    if (models.length > 50) {
      reasons.push(`Suspiciously high model count: ${models.length}`);
      anomalyScore += 0.3;
    }
    
    // Check 2: All ratings are suspiciously perfect
    const perfectRatings = models.filter(m => m.r >= SPAM_THRESHOLDS.SUSPICIOUS_PERFECT_RATING);
    if (perfectRatings.length > models.length * 0.8) {
      reasons.push(`Too many perfect ratings: ${perfectRatings.length}/${models.length}`);
      anomalyScore += 0.25;
    }
    
    // Check 3: All success rates are suspiciously high
    const highSuccess = models.filter(m => m.s >= SPAM_THRESHOLDS.SUSPICIOUS_SUCCESS_RATE * 100);
    if (highSuccess.length > models.length * 0.8) {
      reasons.push(`Too many perfect success rates: ${highSuccess.length}/${models.length}`);
      anomalyScore += 0.2;
    }
    
    // Check 4: Latencies are impossibly fast
    const fastLatencies = models.filter(m => m.l < SPAM_THRESHOLDS.SUSPICIOUS_FAST_LATENCY);
    if (fastLatencies.length > models.length * 0.9) {
      reasons.push(`Suspiciously fast latencies for all models`);
      anomalyScore += 0.15;
    }
    
    // Check 5: Very new account with many submissions
    if (reputation && reputation.totalSubmissions > 5) {
      const avgSubmissionsPerDay = reputation.totalSubmissions / 
        Math.max(1, (now - reputation.firstSeen) / (24 * 60 * 60 * 1000));
      
      if (avgSubmissionsPerDay > 3) {
        reasons.push(`High submission rate: ${avgSubmissionsPerDay.toFixed(1)}/day`);
        anomalyScore += 0.2;
      }
    }
    
    // Check 6: Known spammer
    if (reputation && reputation.validSubmissions / reputation.totalSubmissions < 0.3) {
      reasons.push(`Low validation ratio: ${reputation.validSubmissions}/${reputation.totalSubmissions}`);
      anomalyScore += 0.3;
    }
    
    // Check 7: Rating variance is too low (bots often have uniform ratings)
    if (models.length >= 3) {
      const ratingVariance = this.variance(models.map(m => m.r));
      if (ratingVariance < 0.1) {
        reasons.push(`Suspiciously uniform ratings (variance: ${ratingVariance.toFixed(3)})`);
        anomalyScore += 0.2;
      }
    }
    
    // Check 8: Comparing to contributor's history
    if (reputation && reputation.submissionHistory.length >= 3) {
      const recentHistory = reputation.submissionHistory.slice(-5);
      const avgRating = recentHistory.reduce((sum, h) => sum + h.avgRating, 0) / recentHistory.length;
      const currentAvg = models.reduce((sum, m) => sum + m.r, 0) / models.length;
      
      if (Math.abs(avgRating - currentAvg) > 1.0) {
        reasons.push(`Large deviation from submission history (+/- ${(avgRating - currentAvg).toFixed(1)})`);
        anomalyScore += 0.25;
      }
    }
    
    // CHECK 9 (NEW): ERC-8004 verification (PRIVACY-PRESERVING)
    // We verify claims server-side without requiring the contributor to reveal their address
    if (this.config.erc8004Enabled) {
      const trustInfo = this.erc8004Bridge.getTrustInfo(pubkey);
      const minTrustLevel = this.config.erc8004MinTrust || 'bronze';
      
      // Check if meets minimum trust requirement
      if (!this.erc8004Bridge.meetsTrustRequirement(pubkey, minTrustLevel)) {
        if (trustInfo) {
          const trustLevel = scoreToLevel(trustInfo.erc8004Score);
          reasons.push(`ERC-8004 trust too low: ${trustLevel} (need ${minTrustLevel}+)`);
          anomalyScore += 0.4;
        } else {
          reasons.push('No ERC-8004 identity linked');
          anomalyScore += 0.5; // Heavy penalty for no identity
        }
      }
      
      // Bonus: linked identity is a strong trust signal
      if (trustInfo && trustInfo.weight > 0.2) {
        anomalyScore -= 0.2; // Reduce suspicion for established identities
      }
    }
    
    // Determine if spam based on anomaly score
    const isSpam = anomalyScore >= 0.5;
    
    return {
      isSpam,
      confidence: Math.min(anomalyScore, 1),
      reasons,
      anomalyScore,
    };
  }

  /**
   * Filter outlier data points from a single contributor's submission
   */
  private filterOutliers(
    models: Array<{ n: string; r: number; l: number; s: number; u: number }>
  ): { filtered: Array<{ n: string; r: number; l: number; s: number; u: number }>; outliers: string[] } {
    const outliers: string[] = [];
    
    // Calculate statistics
    const ratings = models.map(m => m.r);
    const ratingMean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    const ratingStd = Math.sqrt(this.variance(ratings));
    
    // Z-score filtering (keep if within 2.5 std dev)
    const filtered = models.filter(m => {
      const zScore = ratingStd > 0 ? Math.abs(m.r - ratingMean) / ratingStd : 0;
      
      if (zScore > 2.5 && models.length > 3) {
        outliers.push(`${m.n} (rating z-score: ${zScore.toFixed(2)})`);
        return false;
      }
      return true;
    });
    
    return { filtered, outliers };
  }

  enable(): void {
    this.config.enabled = true;
    this.saveConfig();
    console.log('[Community] Enabled anonymous stats sharing');
  }

  disable(): void {
    this.config.enabled = false;
    this.saveConfig();
    console.log('[Community] Disabled anonymous stats sharing');
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  setEndpoint(endpoint: string): void {
    this.config.endpoint = endpoint;
    this.saveConfig();
    console.log(`[Community] Set endpoint to: ${endpoint}`);
  }

  setErc8004Enabled(enabled: boolean): void {
    this.config.erc8004Enabled = enabled;
    this.saveConfig();
    console.log(`[Community] ERC-8004 verification: ${enabled ? 'enabled' : 'disabled'}`);
  }

  setErc8004MinTrust(level: TrustLevel): void {
    this.config.erc8004MinTrust = level;
    this.saveConfig();
    console.log(`[Community] Minimum trust level: ${level}`);
  }

  setErc8004Chain(chain: 'base' | 'sepolia'): void {
    this.config.erc8004Chain = chain;
    this.saveConfig();
    console.log(`[Community] ERC-8004 chain: ${chain}`);
  }

  // ============================================================================
  // Data Collection
  // ============================================================================

  collectLocalStats(): CommunityModelStats[] {
    const scoringDB = getModelScoringDB();
    const popularity = getModelPopularityService();
    
    const scores = scoringDB.getAllScores();
    const stats: CommunityModelStats[] = [];
    
    for (const score of scores) {
      if (score.usageCount < SPAM_THRESHOLDS.MIN_USAGE_COUNT) continue;
      
      const taskTypes = ['chat', 'code', 'vision', 'reasoning'];
      const taskStats: CommunityTaskStats[] = [];
      const bestFor: string[] = [];
      
      for (const taskType of taskTypes) {
        const taskPerf = scoringDB.getTaskPerformance(score.modelName, taskType);
        if (taskPerf && taskPerf.usageCount >= 1) {
          taskStats.push({
            taskType,
            avgRating: taskPerf.avgQuality,
            avgLatency: taskPerf.avgLatency,
            successRate: taskPerf.successRate,
            usageCount: taskPerf.usageCount,
          });
          
          if (taskPerf.avgQuality >= 4 && taskPerf.successRate >= 0.8) {
            const taskName = taskType.charAt(0).toUpperCase() + taskType.slice(1);
            if (!bestFor.includes(taskName)) {
              bestFor.push(taskName);
            }
          }
        }
      }
      
      stats.push({
        modelName: score.modelName,
        avgRating: score.avgQuality,
        avgLatency: score.avgLatency,
        successRate: score.successRate,
        usageCount: score.usageCount,
        taskStats,
        bestFor,
        lastUpdated: Date.now(),
        contributorCount: 1,
        trustScore: 100, // Local data is trusted
      });
    }
    
    return stats;
  }

  exportForCommunity(): { userId: string; stats: CommunityModelStats[]; timestamp: number } {
    const stats = this.collectLocalStats();
    
    return {
      userId: this.userId,
      stats,
      timestamp: Date.now(),
    };
  }

  saveSubmissionLocally(): string {
    const data = this.exportForCommunity();
    const outputPath = join(homedir(), '.0xkobold', 'community-submission.json');
    
    writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`[Community] Saved submission to: ${outputPath}`);
    console.log(`[Community] Stats prepared for ${data.stats.length} models`);
    
    return outputPath;
  }

  createShareableText(): string {
    const data = this.exportForCommunity();
    
    const lines = [
      '# 0xKobold Community Stats Submission',
      `# Generated: ${new Date().toISOString()}`,
      `# User ID: ${this.userId}`,
      `# Models: ${data.stats.length}`,
      '',
      '## Model Performance Stats',
      '',
      '| Model | Overall | Code | Chat | Reasoning | Vision | Best For |',
      '|-------|---------|------|------|------------|--------|----------|',
    ];
    
    data.stats
      .sort((a, b) => b.avgRating - a.avgRating)
      .forEach(s => {
        const overall = `${s.avgRating.toFixed(1)}★`;
        
        const code = s.taskStats.find(t => t.taskType === 'code');
        const chat = s.taskStats.find(t => t.taskType === 'chat');
        const reasoning = s.taskStats.find(t => t.taskType === 'reasoning');
        const vision = s.taskStats.find(t => t.taskType === 'vision');
        
        const codeRating = code ? `${code.avgRating.toFixed(1)}` : '-';
        const chatRating = chat ? `${chat.avgRating.toFixed(1)}` : '-';
        const reasoningRating = reasoning ? `${reasoning.avgRating.toFixed(1)}` : '-';
        const visionRating = vision ? `${vision.avgRating.toFixed(1)}` : '-';
        
        const bestFor = s.bestFor.length > 0 ? s.bestFor.slice(0, 3).join(', ') : '-';
        
        lines.push(`| ${s.modelName} | ${overall} | ${codeRating} | ${chatRating} | ${reasoningRating} | ${visionRating} | ${bestFor} |`);
      });
    
    lines.push('');
    lines.push('## Raw JSON');
    lines.push('```json');
    lines.push(JSON.stringify(data, null, 2));
    lines.push('```');
    
    return lines.join('\n');
  }

  // ============================================================================
  // Fetching Community Data - STRENGTHENED
  // ============================================================================

  async fetchCommunityStats(): Promise<CommunityData | null> {
    try {
      const response = await fetch(this.config.endpoint, {
        headers: {
          'User-Agent': '0xKobold/1.0',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(`[Community] Failed to fetch: ${response.status}`);
        return null;
      }

      const data = await response.json() as CommunityData;
      
      if (!data.version || !Array.isArray(data.models)) {
        console.warn('[Community] Invalid data structure');
        return null;
      }

      // Apply spam filtering to fetched data
      const filteredData = this.filterFetchedData(data);
      
      console.log(`[Community] Fetched ${filteredData.models.length} model stats (filtered from ${data.models.length})`);
      
      writeFileSync(DATA_PATH, JSON.stringify(filteredData, null, 2));
      this.config.lastFetched = Date.now();
      this.saveConfig();
      
      return filteredData;
    } catch (err) {
      console.error('[Community] Error fetching:', err);
      return null;
    }
  }

  /**
   * Filter community data for spam and low-quality submissions
   */
  private filterFetchedData(data: CommunityData): CommunityData {
    // This is for GitHub endpoint data - apply conservative filtering
    const filteredModels = data.models.filter(model => {
      const flags: string[] = [];
      
      // Skip if contributor count is suspiciously low for high ratings
      if (model.avgRating >= 4.5 && model.contributorCount < SPAM_THRESHOLDS.MIN_CONTRIBUTOR_COUNT) {
        flags.push('low_contributors_high_rating');
      }
      
      // Skip if success rate is suspiciously high
      if (model.successRate >= SPAM_THRESHOLDS.SUSPICIOUS_SUCCESS_RATE) {
        flags.push('suspicious_success_rate');
      }
      
      // Skip if latency is impossibly fast
      if (model.avgLatency < SPAM_THRESHOLDS.SUSPICIOUS_FAST_LATENCY && model.usageCount > 10) {
        flags.push('suspicious_latency');
      }
      
      if (flags.length > 0) {
        console.log(`[Community] Flagged model ${model.modelName}: ${flags.join(', ')}`);
      }
      
      return flags.length === 0;
    });
    
    return {
      ...data,
      models: filteredModels,
    };
  }

  getCachedData(): CommunityData | null {
    if (!existsSync(DATA_PATH)) return null;
    
    try {
      const data = readFileSync(DATA_PATH, 'utf-8');
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  /**
   * Merge community stats with local scores - STRENGTHENED
   */
  mergeWithLocal(): Map<string, CommunityModelStats> {
    const merged = new Map<string, CommunityModelStats>();
    const contributorTrust = new Map<string, number>();
    
    // Phase 1: Collect and validate all data with reputation weights
    const communityData = this.getCachedData();
    
    if (communityData) {
      for (const stat of communityData.models) {
        // Only include models with minimum contributor count
        if (stat.contributorCount < SPAM_THRESHOLDS.MIN_CONTRIBUTOR_COUNT) {
          console.log(`[Community] Skipping ${stat.modelName}: only ${stat.contributorCount} contributors`);
          continue;
        }
        
        // Calculate aggregate trust score
        stat.trustScore = Math.min(50 + stat.contributorCount * 5, 95);
        merged.set(stat.modelName, { ...stat, taskStats: [...stat.taskStats] });
      }
    }
    
    // Phase 2: Merge with local data (local data is most trusted)
    const localStats = this.collectLocalStats();
    for (const local of localStats) {
      const existing = merged.get(local.modelName);
      
      if (existing) {
        // Reputation-weighted merge: local data gets higher weight
        const localWeight = 0.6; // Local data is 60% trusted
        const communityWeight = 0.4;
        
        merged.set(local.modelName, {
          modelName: local.modelName,
          avgRating: existing.avgRating * communityWeight + local.avgRating * localWeight,
          avgLatency: weightedAverage(existing.avgLatency, existing.usageCount, local.avgLatency, local.usageCount),
          successRate: weightedAverage(existing.successRate, existing.usageCount, local.successRate, local.usageCount),
          usageCount: existing.usageCount + local.usageCount,
          taskStats: mergeTaskStats(existing.taskStats, existing.usageCount, local.taskStats, local.usageCount),
          bestFor: [...new Set([...existing.bestFor, ...local.bestFor])],
          lastUpdated: Math.max(existing.lastUpdated, local.lastUpdated),
          contributorCount: existing.contributorCount + 1,
          trustScore: Math.max(existing.trustScore || 50, 100),
        });
      } else {
        merged.set(local.modelName, local);
      }
    }
    
    return merged;
  }

  getCommunityTierList(): { tier: string; models: CommunityModelStats[] }[] {
    const merged = this.mergeWithLocal();
    const models = Array.from(merged.values())
      .filter(m => m.usageCount >= 2)
      .sort((a, b) => {
        // Factor in trust score
        const trustFactorA = (a.trustScore || 50) / 100;
        const trustFactorB = (b.trustScore || 50) / 100;
        
        const scoreA = (
          (a.avgRating / 5) * 0.4 + 
          a.successRate * 0.3 + 
          (1 - a.avgLatency / 10000) * 0.2 + 
          Math.min(a.usageCount / 100, 1) * 0.1
        ) * trustFactorA;
        
        const scoreB = (
          (b.avgRating / 5) * 0.4 + 
          b.successRate * 0.3 + 
          (1 - b.avgLatency / 10000) * 0.2 + 
          Math.min(b.usageCount / 100, 1) * 0.1
        ) * trustFactorB;
        
        return scoreB - scoreA;
      });

    const tiers: { tier: string; models: CommunityModelStats[] }[] = [
      { tier: 'S', models: models.filter(m => getScore(m) >= 0.85) },
      { tier: 'A', models: models.filter(m => { const s = getScore(m); return s >= 0.70 && s < 0.85; }) },
      { tier: 'B', models: models.filter(m => { const s = getScore(m); return s >= 0.55 && s < 0.70; }) },
      { tier: 'C', models: models.filter(m => { const s = getScore(m); return s >= 0.40 && s < 0.55; }) },
      { tier: 'D', models: models.filter(m => getScore(m) < 0.40) },
    ];

    return tiers;
  }

  // ============================================================================
  // Nostr Integration - STRENGTHENED
  // ============================================================================

  getNostrKeypair(): { pubkey: string; privkey: string } {
    const KEY_PATH = join(homedir(), '.0xkobold', 'community-nostr-key.json');
    
    if (existsSync(KEY_PATH)) {
      return JSON.parse(readFileSync(KEY_PATH, 'utf-8'));
    }
    
    const sk = generateSecretKey();
    const privkey = Buffer.from(sk).toString('hex');
    const pubkey = getPublicKey(sk);
    
    const keypair = { pubkey, privkey };
    
    writeFileSync(KEY_PATH, JSON.stringify(keypair, null, 2));
    console.log('[Community] Generated new Nostr keypair:', pubkey);
    
    return keypair;
  }

  async publishToNostr(): Promise<{ success: boolean; eventId?: string; error?: string }> {
    if (!this.config.enabled) {
      return { success: false, error: 'Community sharing not enabled' };
    }

    const stats = this.collectLocalStats();
    if (stats.length === 0) {
      return { success: false, error: 'No stats to publish' }
    }

    const keypair = this.getNostrKeypair();
    const relayUrls = [
      'wss://relay.nostr.band',
      'wss://nos.lol',
      'wss://relay.damus.io',
    ];

    // Generate privacy-preserving trust tags (claims only, no addresses)
    const trustTags = this.erc8004Bridge.generateTrustTags();

    const eventTemplate = {
      kind: 31234,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['client', '0xkobold'],
        ['version', '3.0'], // Version bump for privacy-preserving trust claims
        ['min_usage', String(SPAM_THRESHOLDS.MIN_USAGE_COUNT)],
        ...trustTags, // ['trust', 'gold'], ['verified', '1'], ['nonce', 'abc123']
      ],
      content: JSON.stringify({
        version: 2,
        userId: this.userId,
        models: stats.map(s => ({
          n: s.modelName,
          r: Math.round(s.avgRating * 10) / 10,
          l: Math.round(s.avgLatency),
          s: Math.round(s.successRate * 100),
          u: s.usageCount,
          t: s.taskStats.map(t => [t.taskType, t.avgRating, t.successRate]),
          b: s.bestFor,
        })),
      }),
    };

    try {
      const privkeyBytes = Uint8Array.from(Buffer.from(keypair.privkey, 'hex'));
      const signedEvent = finalizeEvent(eventTemplate, privkeyBytes);
      
      if (!verifyEvent(signedEvent)) {
        return { success: false, error: 'Invalid event signature' };
      }

      const pool = new SimplePool();
      let publishedCount = 0;
      
      try {
        const promises = pool.publish(relayUrls, signedEvent as any);
        const results = await Promise.allSettled(promises);
        
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            publishedCount++;
          }
        }
      } finally {
        pool.close(relayUrls);
      }

      if (publishedCount > 0) {
        this.config.lastSubmitted = Date.now();
        this.saveConfig();
        console.log(`[Community] Published to ${publishedCount} Nostr relays`);
        return { success: true, eventId: signedEvent.id };
      } else {
        return { success: false, error: 'Failed to publish to any relay' };
      }
    } catch (err: any) {
      console.error('[Community] Nostr publish error:', err);
      return { success: false, error: err?.message || 'Unknown error' };
    }
  }

  /**
   * Fetch from Nostr - STRENGTHENED with spam detection
   */
  async fetchFromNostr(): Promise<CommunityData | null> {
    const relayUrls = [
      'wss://relay.nostr.band',
      'wss://nos.lol',
      'wss://relay.damus.io',
    ];

    const allStats = new Map<string, CommunityModelStats>();
    let totalContributors = 0;
    let spamDetected = 0;
    const seenPubkeys = new Set<string>();
    const spamReports: Array<{ pubkey: string; reason: string }> = [];

    try {
      const pool = new SimplePool();
      
      const events = await pool.querySync(relayUrls, {
        kinds: [31234],
        limit: 500, // Increased limit
      } as any);
      
      pool.close(relayUrls);

      for (const event of events) {
        if (!verifyEvent(event)) continue;
        
        try {
          const content = JSON.parse(event.content);
          if (!content.models || !Array.isArray(content.models)) continue;

          // NEW: Extract trust claim from event tags (privacy-preserving)
          // Claims are verified server-side without revealing addresses
          let claimedLevel: TrustLevel = 'none';
          let claimVerified = false;
          
          for (const tag of event.tags) {
            if (tag[0] === 'trust' && typeof tag[1] === 'string') {
              claimedLevel = tag[1] as TrustLevel;
            }
            if (tag[0] === 'verified' && tag[1] === '1') {
              claimVerified = true;
            }
          }
          
          // Verify the claim against on-chain data (server-side only)
          const claimResult = await this.erc8004Bridge.verifyClaim(
            event.pubkey, 
            claimedLevel, 
            claimVerified
          );
          
          // Apply penalty for fraudulent claims
          let trustWeight: number;
          if (!claimResult.valid) {
            // Fraudulent claim - heavily penalize
            trustWeight = 0.01;
            spamReports.push({ 
              pubkey: event.pubkey, 
              reason: `Fraudulent trust claim: ${claimResult.claimedLevel} (actual: ${claimResult.actualLevel})` 
            });
          } else {
            trustWeight = this.erc8004Bridge.getTrustWeight(event.pubkey);
          }
          
          // Spam analysis with ERC-8004 verification (now with verified claims)
          const spamAnalysis = this.analyzeSpam(event.pubkey, content.models);
          
          console.log(`[Community] ${event.pubkey.slice(0, 8)}... claim: ${claimedLevel}, verified: ${trustWeight > 0.1}, weight: ${trustWeight.toFixed(3)}`);
          
          if (spamAnalysis.isSpam) {
            spamDetected++;
            spamReports.push({ pubkey: event.pubkey, reason: spamAnalysis.reasons.join(', ') });
            
            // Still include but with reduced weight
            if (trustWeight < 0.05) {
              console.log(`[Community] Rejecting spam from ${event.pubkey.slice(0, 8)}...`);
              this.updateReputation(event.pubkey, content.models, false);
              // Record to ERC-8004 bridge if enabled
              if (this.config.erc8004Enabled) {
                this.erc8004Bridge.recordSubmission(event.pubkey, false, content.models.length);
              }
              continue; // Skip completely untrusted spam
            }
          }
          
          // Filter outliers within submission
          const { filtered, outliers } = this.filterOutliers(content.models);
          if (outliers.length > 0) {
            console.log(`[Community] Filtered outliers from ${event.pubkey.slice(0, 8)}...: ${outliers.join(', ')}`);
          }
          
          // Update reputation for valid submission
          this.updateReputation(event.pubkey, filtered, !spamAnalysis.isSpam);
          
          // Record to ERC-8004 bridge if enabled
          if (this.config.erc8004Enabled) {
            this.erc8004Bridge.recordSubmission(event.pubkey, !spamAnalysis.isSpam, filtered.length);
          }
          
          if (seenPubkeys.has(event.pubkey)) continue;
          seenPubkeys.add(event.pubkey);
          totalContributors++;

          for (const m of filtered) {
            // Get bestFor from full model data (compact format doesn't include it)
            const fullModel = content.models.find((fm: any) => fm.n === m.n);
            const modelBestFor: string[] = (fullModel as any)?.b || [];
            const existing = allStats.get(m.n);
            const weight = trustWeight * m.u; // Factor in trust and usage
            
            if (existing) {
              // Weighted merge
              const totalWeight = existing.usageCount + weight;
              allStats.set(m.n, {
                modelName: m.n,
                avgRating: (existing.avgRating * existing.usageCount + m.r * weight) / totalWeight,
                avgLatency: (existing.avgLatency * existing.usageCount + m.l * weight) / totalWeight,
                successRate: (existing.successRate * existing.usageCount + (m.s / 100) * weight) / totalWeight,
                usageCount: totalWeight,
                taskStats: existing.taskStats, // Simplified
                bestFor: modelBestFor.length > 0 ? modelBestFor : existing.bestFor,
                lastUpdated: Math.max(existing.lastUpdated, event.created_at * 1000),
                contributorCount: existing.contributorCount + 1,
                trustScore: Math.max((existing.trustScore || 50) * 0.9, trustWeight * 100),
              });
            } else {
              allStats.set(m.n, {
                modelName: m.n,
                avgRating: m.r,
                avgLatency: m.l,
                successRate: m.s / 100,
                usageCount: weight,
                taskStats: [],
                bestFor: modelBestFor,
                lastUpdated: event.created_at * 1000,
                contributorCount: 1,
                trustScore: trustWeight * 100,
              });
            }
          }
        } catch (e) {
          // Skip malformed events
        }
      }

      if (allStats.size === 0) return null;

      // Log spam statistics
      console.log(`[Community] Spam detection: ${spamDetected} suspicious, ${totalContributors} accepted`);
      if (spamReports.length > 0 && spamReports.length <= 5) {
        for (const report of spamReports) {
          console.log(`[Community] Spam: ${report.pubkey.slice(0, 8)}... - ${report.reason}`);
        }
      }

      // Final filtering pass
      const finalModels = Array.from(allStats.values()).filter(model => {
        // Only include models with enough contributor backing
        if (model.contributorCount < SPAM_THRESHOLDS.MIN_CONTRIBUTOR_COUNT) {
          return model.trustScore && model.trustScore > 50; // Allow if highly trusted
        }
        return true;
      });

      const data: CommunityData = {
        version: '2.0',
        updatedAt: Date.now(),
        generatedAt: new Date().toISOString(),
        totalContributors,
        models: finalModels,
      };

      writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
      this.config.lastFetched = Date.now();
      this.saveConfig();

      console.log(`[Community] Fetched ${allStats.size} models from ${totalContributors} contributors (spam rejected: ${spamDetected})`);
      return data;
    } catch (err: any) {
      console.error('[Community] Nostr fetch error:', err);
      return null;
    }
  }

  // ============================================================================
  // Auto-Submit
  // ============================================================================

  shouldSubmit(): boolean {
    if (!this.config.enabled) return false;
    
    const hoursSinceLastSubmit = this.config.lastSubmitted
      ? (Date.now() - this.config.lastSubmitted) / (1000 * 60 * 60)
      : Infinity;
    
    return hoursSinceLastSubmit >= this.config.submitInterval;
  }

  async autoSubmit(): Promise<boolean> {
    if (!this.shouldSubmit()) return false;
    
    const outputPath = this.saveSubmissionLocally();
    this.config.lastSubmitted = Date.now();
    this.saveConfig();
    
    return true;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get spam detection statistics
   */
  getSpamStats(): { totalContributors: number; avgTrust: number; spamCount: number } {
    let totalTrust = 0;
    let spamCount = 0;
    
    for (const rep of this.reputationDb.values()) {
      totalTrust += rep.trustScore;
      if (rep.validSubmissions / Math.max(1, rep.totalSubmissions) < 0.3) {
        spamCount++;
      }
    }
    
    return {
      totalContributors: this.reputationDb.size,
      avgTrust: this.reputationDb.size > 0 ? Math.round(totalTrust / this.reputationDb.size) : 0,
      spamCount,
    };
  }

  /**
   * Reset spam database (use with caution)
   */
  resetReputation(): void {
    this.reputationDb.clear();
    this.saveReputation();
    console.log('[Community] Reputation database reset');
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

function weightedAverage(
  val1: number, weight1: number, 
  val2: number, weight2: number
): number {
  const total = weight1 + weight2;
  if (total === 0) return 0;
  return (val1 * weight1 + val2 * weight2) / total;
}

function mergeTaskStats(
  existing: CommunityTaskStats[], 
  existingWeight: number,
  local: CommunityTaskStats[], 
  localWeight: number
): CommunityTaskStats[] {
  const merged = new Map<string, CommunityTaskStats>();
  
  for (const stat of existing) {
    merged.set(stat.taskType, { ...stat, usageCount: stat.usageCount * SPAM_THRESHOLDS.MIN_CONTRIBUTOR_COUNT });
  }
  
  for (const stat of local) {
    const existing = merged.get(stat.taskType);
    if (existing) {
      merged.set(stat.taskType, {
        taskType: stat.taskType,
        avgRating: weightedAverage(existing.avgRating, existing.usageCount, stat.avgRating, stat.usageCount),
        avgLatency: weightedAverage(existing.avgLatency, existing.usageCount, stat.avgLatency, stat.usageCount),
        successRate: weightedAverage(existing.successRate, existing.usageCount, stat.successRate, stat.usageCount),
        usageCount: existing.usageCount + stat.usageCount,
      });
    } else {
      merged.set(stat.taskType, { ...stat });
    }
  }
  
  return Array.from(merged.values());
}

function getScore(model: CommunityModelStats): number {
  const trustFactor = (model.trustScore || 50) / 100;
  return (
    (model.avgRating / 5) * 0.4 + 
    model.successRate * 0.3 + 
    (1 - model.avgLatency / 10000) * 0.2 + 
    Math.min(model.usageCount / 100, 1) * 0.1
  ) * trustFactor;
}

// ============================================================================
// Singleton
// ============================================================================

let service: CommunityAnalyticsService | null = null;

export function getCommunityAnalytics(): CommunityAnalyticsService {
  if (!service) {
    service = new CommunityAnalyticsService();
  }
  return service;
}

export { CommunityAnalyticsService };
