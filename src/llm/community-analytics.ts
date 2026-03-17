/**
 * Community Analytics Service
 *
 * Shares anonymized model performance data with the 0xKobold community.
 * 
 * Privacy guarantees:
 * - NO prompts or responses shared
 * - NO user identity or IP stored
 * - ONLY aggregated model stats (name, rating, latency, success rate)
 * - Opt-in only (disabled by default)
 * 
 * Data shared:
 * - Model name
 * - Average rating (1-5)
 * - Average latency (ms)
 * - Success rate (0-1)
 * - Usage count
 * - Task types used for
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { getModelScoringDB, ModelScore } from './model-scoring-db';
import { getModelPopularityService } from './model-popularity';

// Nostr integration using nostr-tools
import { finalizeEvent, verifyEvent, SimplePool, generateSecretKey, getPublicKey } from 'nostr-tools';

// ============================================================================
// Types
// ============================================================================

export interface CommunityTaskStats {
  taskType: string;          // Task type (chat, code, vision, reasoning)
  avgRating: number;        // Average rating for this task
  avgLatency: number;       // Average latency for this task
  successRate: number;     // Success rate for this task
  usageCount: number;       // How many times used for this task
}

export interface CommunityModelStats {
  modelName: string;
  avgRating: number;        // 1-5 average user rating
  avgLatency: number;       // Average response time in ms
  successRate: number;      // 0-1 success rate
  usageCount: number;       // Total usage count across community
  taskStats: CommunityTaskStats[];  // Per-task performance
  bestFor: string[];        // What this model is best at
  lastUpdated: number;     // Unix timestamp
  contributorCount: number; // Number of contributors
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
  userId?: string;         // Anonymous user ID (generated)
  submitInterval: number;   // Hours between submissions
  lastSubmitted?: number;
  lastFetched?: number;
}

// ============================================================================
// Constants
// ============================================================================

const CONFIG_PATH = join(homedir(), '.0xkobold', 'community-config.json');
const DATA_PATH = join(homedir(), '.0xkobold', 'community-data.json');

const DEFAULT_CONFIG: CommunityConfig = {
  enabled: false, // Opt-in only
  endpoint: 'https://raw.githubusercontent.com/kobolds/0xKobolds/main/community/model-stats.json',
  submitInterval: 24, // Submit once per day
};

// Default community endpoint (can be customized)
const COMMUNITY_ENDPOINT = 'https://raw.githubusercontent.com/kobolds/0xKobolds/main/community/model-stats.json';

// ============================================================================
// Community Analytics Service
// ============================================================================

class CommunityAnalyticsService {
  private config: CommunityConfig;
  private userId: string;

  constructor() {
    this.config = this.loadConfig();
    this.userId = this.generateOrGetUserId();
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
    
    // Generate anonymous ID (random UUID)
    const id = `user_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    writeFileSync(idPath, id);
    return id;
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

  // ============================================================================
  // Data Collection
  // ============================================================================

  /**
   * Collect anonymized stats from local database
   */
  collectLocalStats(): CommunityModelStats[] {
    const scoringDB = getModelScoringDB();
    const popularity = getModelPopularityService();
    
    const scores = scoringDB.getAllScores();
    const stats: CommunityModelStats[] = [];
    
    for (const score of scores) {
      if (score.usageCount < 1) continue; // Skip unused models
      
      // Get task-specific performance
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
          
          // Mark as "best for" if rated highly (4+ rating, 80%+ success)
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
        contributorCount: 1, // Just this user
      });
    }
    
    return stats;
  }

  /**
   * Export stats for community submission
   */
  exportForCommunity(): { userId: string; stats: CommunityModelStats[]; timestamp: number } {
    const stats = this.collectLocalStats();
    
    return {
      userId: this.userId, // Anonymous ID
      stats,
      timestamp: Date.now(),
    };
  }

  // ============================================================================
  // Submission (to user's own storage)
  // ============================================================================

  /**
   * Save community submission locally for manual upload
   */
  saveSubmissionLocally(): string {
    const data = this.exportForCommunity();
    const outputPath = join(homedir(), '.0xkobold', 'community-submission.json');
    
    writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`[Community] Saved submission to: ${outputPath}`);
    console.log(`[Community] Stats prepared for ${data.stats.length} models`);
    
    return outputPath;
  }

  /**
   * Create a shareable text summary for manual submission
   */
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
        
        // Get task ratings
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
  // Fetching Community Data
  // ============================================================================

  /**
   * Fetch community stats from remote endpoint
   */
  async fetchCommunityStats(): Promise<CommunityData | null> {
    try {
      const response = await fetch(this.config.endpoint, {
        headers: {
          'User-Agent': '0xKobold/1.0',
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        console.warn(`[Community] Failed to fetch: ${response.status}`);
        return null;
      }

      const data = await response.json() as CommunityData;
      
      // Validate structure
      if (!data.version || !Array.isArray(data.models)) {
        console.warn('[Community] Invalid data structure');
        return null;
      }

      console.log(`[Community] Fetched ${data.models.length} model stats from ${data.totalContributors || 'unknown'} contributors`);
      
      // Save locally
      writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
      this.config.lastFetched = Date.now();
      this.saveConfig();
      
      return data;
    } catch (err) {
      console.error('[Community] Error fetching:', err);
      return null;
    }
  }

  /**
   * Get cached community data
   */
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
   * Merge community stats with local scores for combined ranking
   */
  mergeWithLocal(): Map<string, CommunityModelStats> {
    const merged = new Map<string, CommunityModelStats>();
    
    // Start with community data
    const communityData = this.getCachedData();
    if (communityData) {
      for (const stat of communityData.models) {
        merged.set(stat.modelName, { ...stat, taskStats: [...stat.taskStats] });
      }
    }
    
    // Merge with local data
    const localStats = this.collectLocalStats();
    for (const local of localStats) {
      const existing = merged.get(local.modelName);
      
      if (existing) {
        // Weighted average: community + local
        const totalUsage = existing.usageCount + local.usageCount;
        const communityWeight = existing.usageCount / totalUsage;
        const localWeight = local.usageCount / totalUsage;
        
        // Merge task stats
        const mergedTasks = new Map<string, CommunityTaskStats>();
        
        // Add community tasks
        for (const task of existing.taskStats) {
          mergedTasks.set(task.taskType, { ...task });
        }
        
        // Merge with local tasks
        for (const task of local.taskStats) {
          const existingTask = mergedTasks.get(task.taskType);
          if (existingTask) {
            const taskTotal = existingTask.usageCount + task.usageCount;
            const tw = existingTask.usageCount / taskTotal;
            const lw = task.usageCount / taskTotal;
            mergedTasks.set(task.taskType, {
              taskType: task.taskType,
              avgRating: existingTask.avgRating * tw + task.avgRating * lw,
              avgLatency: existingTask.avgLatency * tw + task.avgLatency * lw,
              successRate: existingTask.successRate * tw + task.successRate * lw,
              usageCount: taskTotal,
            });
          } else {
            mergedTasks.set(task.taskType, { ...task });
          }
        }
        
        merged.set(local.modelName, {
          modelName: local.modelName,
          avgRating: existing.avgRating * communityWeight + local.avgRating * localWeight,
          avgLatency: existing.avgLatency * communityWeight + local.avgLatency * localWeight,
          successRate: existing.successRate * communityWeight + local.successRate * localWeight,
          usageCount: totalUsage,
          taskStats: Array.from(mergedTasks.values()),
          bestFor: [...new Set([...existing.bestFor, ...local.bestFor])],
          lastUpdated: Math.max(existing.lastUpdated, local.lastUpdated),
          contributorCount: existing.contributorCount + 1,
        });
      } else {
        merged.set(local.modelName, local);
      }
    }
    
    return merged;
  }

  /**
   * Get community-enhanced tier list
   */
  getCommunityTierList(): { tier: string; models: CommunityModelStats[] }[] {
    const merged = this.mergeWithLocal();
    const models = Array.from(merged.values())
      .filter(m => m.usageCount >= 2) // Need at least 2 uses
      .sort((a, b) => {
        // Score: 40% rating + 30% success + 20% speed + 10% popularity
        const scoreA = (a.avgRating / 5) * 0.4 + a.successRate * 0.3 + 
                       (1 - a.avgLatency / 10000) * 0.2 + 
                       Math.min(a.usageCount / 100, 1) * 0.1;
        const scoreB = (b.avgRating / 5) * 0.4 + b.successRate * 0.3 + 
                       (1 - b.avgLatency / 10000) * 0.2 + 
                       Math.min(b.usageCount / 100, 1) * 0.1;
        return scoreB - scoreA;
      });

    const tiers: { tier: string; models: CommunityModelStats[] }[] = [
      { tier: 'S', models: models.filter(m => (m.avgRating / 5) * 0.4 + m.successRate * 0.3 + (1 - m.avgLatency / 10000) * 0.2 >= 0.85) },
      { tier: 'A', models: models.filter(m => { const s = (m.avgRating / 5) * 0.4 + m.successRate * 0.3 + (1 - m.avgLatency / 10000) * 0.2; return s >= 0.70 && s < 0.85; }) },
      { tier: 'B', models: models.filter(m => { const s = (m.avgRating / 5) * 0.4 + m.successRate * 0.3 + (1 - m.avgLatency / 10000) * 0.2; return s >= 0.55 && s < 0.70; }) },
      { tier: 'C', models: models.filter(m => { const s = (m.avgRating / 5) * 0.4 + m.successRate * 0.3 + (1 - m.avgLatency / 10000) * 0.2; return s >= 0.40 && s < 0.55; }) },
      { tier: 'D', models: models.filter(m => { const s = (m.avgRating / 5) * 0.4 + m.successRate * 0.3 + (1 - m.avgLatency / 10000) * 0.2; return s < 0.40; }) },
    ];

    return tiers;
  }

  // ============================================================================
  // Nostr Integration
  // ============================================================================

  /**
   * Get or generate user's Nostr keypair
   */
  getNostrKeypair(): { pubkey: string; privkey: string } {
    const KEY_PATH = join(homedir(), '.0xkobold', 'community-nostr-key.json');
    
    if (existsSync(KEY_PATH)) {
      return JSON.parse(readFileSync(KEY_PATH, 'utf-8'));
    }
    
    // Generate new keypair using nostr-tools
    const sk = generateSecretKey();
    const privkey = Buffer.from(sk).toString('hex');
    const pubkey = getPublicKey(sk);
    
    const keypair = { pubkey, privkey };
    
    writeFileSync(KEY_PATH, JSON.stringify(keypair, null, 2));
    console.log('[Community] Generated new Nostr keypair:', pubkey);
    
    return keypair;
  }

  /**
   * Publish stats to Nostr relays
   */
  async publishToNostr(): Promise<{ success: boolean; eventId?: string; error?: string }> {
    if (!this.config.enabled) {
      return { success: false, error: 'Community sharing not enabled' };
    }

    const stats = this.collectLocalStats();
    if (stats.length === 0) {
      return { success: false, error: 'No stats to publish' };
    }

    const keypair = this.getNostrKeypair();
    const relayUrls = [
      'wss://relay.nostr.band',
      'wss://nos.lol',
      'wss://relay.damus.io',
    ];

    const eventTemplate = {
      kind: 31234, // Custom kind for model performance reports
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['client', '0xkobold'],
        ['version', '1.0'],
      ],
      content: JSON.stringify({
        version: 1,
        userId: this.userId,
        models: stats.map(s => ({
          n: s.modelName,
          r: Math.round(s.avgRating * 10) / 10, // Compact format
          l: Math.round(s.avgLatency),
          s: Math.round(s.successRate * 100),
          u: s.usageCount,
          t: s.taskStats.map(t => [t.taskType, t.avgRating, t.successRate]),
          b: s.bestFor,
        })),
      }),
    };

    try {
      // Sign and finalize the event
      const privkeyBytes = Uint8Array.from(Buffer.from(keypair.privkey, 'hex'));
      const signedEvent = finalizeEvent(eventTemplate, privkeyBytes);
      
      // Verify signature
      if (!verifyEvent(signedEvent)) {
        return { success: false, error: 'Invalid event signature' };
      }

      // Publish using SimplePool
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
   * Fetch community stats from Nostr
   */
  async fetchFromNostr(): Promise<CommunityData | null> {
    const relayUrls = [
      'wss://relay.nostr.band',
      'wss://nos.lol',
      'wss://relay.damus.io',
    ];

    const allStats = new Map<string, CommunityModelStats>();
    let totalContributors = 0;
    const seenPubkeys = new Set<string>();

    try {
      const pool = new SimplePool();
      
      // Query for model performance events
      const events = await pool.querySync(relayUrls, {
        kinds: [31234],
        limit: 100,
      } as any);
      
      pool.close(relayUrls);

      for (const event of events) {
        if (!verifyEvent(event)) continue;
        if (seenPubkeys.has(event.pubkey)) continue;
        seenPubkeys.add(event.pubkey);
        totalContributors++;

        try {
          const content = JSON.parse(event.content);
          if (!content.models) continue;

          for (const m of content.models) {
            const existing = allStats.get(m.n);
            const newStats: CommunityModelStats = {
              modelName: m.n,
              avgRating: existing 
                ? (existing.avgRating * existing.usageCount + m.r) / (existing.usageCount + 1)
                : m.r,
              avgLatency: existing
                ? (existing.avgLatency * existing.usageCount + m.l) / (existing.usageCount + 1)
                : m.l,
              successRate: existing
                ? (existing.successRate * existing.usageCount + m.s / 100) / (existing.usageCount + 1)
                : m.s / 100,
              usageCount: existing ? existing.usageCount + 1 : 1,
              taskStats: m.t?.map((t: any[]) => ({
                taskType: t[0],
                avgRating: t[1],
                successRate: t[2],
                avgLatency: 0,
                usageCount: 1,
              })) || [],
              bestFor: m.b || [],
              lastUpdated: event.created_at * 1000,
              contributorCount: totalContributors,
            };
            allStats.set(m.n, newStats);
          }
        } catch (e) {
          // Skip malformed events
        }
      }

      if (allStats.size === 0) return null;

      const data: CommunityData = {
        version: '1.0',
        updatedAt: Date.now(),
        generatedAt: new Date().toISOString(),
        totalContributors,
        models: Array.from(allStats.values()),
      };

      // Cache the result
      writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
      this.config.lastFetched = Date.now();
      this.saveConfig();

      console.log(`[Community] Fetched ${allStats.size} models from ${totalContributors} Nostr contributors`);
      return data;
    } catch (err: any) {
      console.error('[Community] Nostr fetch error:', err);
      return null;
    }
  }

  // ============================================================================
  // Auto-Submit (if enabled and interval passed)
  // ============================================================================

  /**
   * Check if should auto-submit
   */
  shouldSubmit(): boolean {
    if (!this.config.enabled) return false;
    
    const hoursSinceLastSubmit = this.config.lastSubmitted
      ? (Date.now() - this.config.lastSubmitted) / (1000 * 60 * 60)
      : Infinity;
    
    return hoursSinceLastSubmit >= this.config.submitInterval;
  }

  /**
   * Auto-submit if interval passed (called periodically)
   */
  async autoSubmit(): Promise<boolean> {
    if (!this.shouldSubmit()) return false;
    
    // For now, just save locally - user can manually submit
    // In future, could send to actual endpoint
    const outputPath = this.saveSubmissionLocally();
    this.config.lastSubmitted = Date.now();
    this.saveConfig();
    
    return true;
  }
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