/**
 * Adaptive Model Router with Performance Learning
 *
 * Tracks model performance over time and learns which models work best
 * for different task types. Adjusts selection based on:
 * - Task complexity (tuned to prefer smaller models for simple tasks)
 * - Historical performance (latency, quality)
 * - User feedback
 */

import { DynamicModelRouter, type TaskRequirements } from './router';
import { getModelDiscoveryService, type DiscoveredModel } from './model-discovery';
import type { LLMProvider, ChatResponse } from './types';
import { setCurrentModel } from './model-status';

export interface ModelPerformance {
  modelName: string;
  taskType: string;
  complexity: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  timestamp: number;
  userRating?: number; // 1-5 rating
  success: boolean;
}

export interface ModelScore {
  modelName: string;
  avgLatency: number;
  avgQuality: number; // Derived from ratings or success rate
  usageCount: number;
  successRate: number;
  score: number; // Combined score
}

export class AdaptiveModelRouter extends DynamicModelRouter {
  private performanceHistory: ModelPerformance[] = [];
  private modelScores: Map<string, ModelScore> = new Map();
  private readonly maxHistory = 1000;
  private learningEnabled = true;
  private favoriteModels: string[] = [];

  // Tuned weights for scoring
  private weights = {
    complexityMatch: 15,    // Bonus for matching task complexity
    specialization: 12,     // Bonus for task specialization
    quality: 8,            // Base quality score (reduced from 10)
    speed: 6,             // Speed preference bonus
    performance: 10,        // Historical performance bonus
    recency: 5,            // Prefer recently used successful models
    favorite: 8,           // Bonus for favorite models
  };

  constructor(provider: LLMProvider, defaultModel?: string) {
    super(provider, defaultModel);
    this.loadPerformanceData();
  }

  /**
   * Override selectModel to add performance-based scoring
   */
  async selectModel(
    message: string,
    options: TaskRequirements & { 
      trackPerformance?: boolean;
      sessionId?: string;
    } = {}
  ): Promise<string> {
    const requirements = this.inferRequirements(message, options);
    const models = await this.discoverModels();

    // Filter by required capabilities
    let candidates = models.filter(m => {
      if (requirements.type && !m.capabilities[requirements.type]) return false;
      if (requirements.requiredCapabilities) {
        for (const cap of requirements.requiredCapabilities) {
          if (!m.capabilities[cap as keyof typeof m.capabilities]) return false;
        }
      }
      return true;
    });

    // Fallback logic
    if (candidates.length === 0) {
      if (requirements.type === 'vision') {
        candidates = models.filter(m => m.capabilities.chat && !m.capabilities.embedding);
      } else if (requirements.type === 'embedding') {
        candidates = models.filter(m => m.capabilities.embedding);
      } else {
        candidates = models.filter(m => m.capabilities.chat);
      }
      if (candidates.length === 0) candidates = models;
    }

    // Score with adaptive learning
    const scored = candidates.map(m => ({
      model: m,
      score: this.scoreModelAdaptive(m, requirements, message),
    }));

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best) {
      // Log selection for debugging
      const reason = this.getSelectionReason(best.model, requirements);
      console.log(`[AdaptiveRouter] Selected ${best.model.name} (score: ${best.score.toFixed(1)}) - ${reason}`);
      
      // Update footer display
      setCurrentModel(best.model.name, reason);
      
      // Track this selection for performance monitoring
      if (options.trackPerformance !== false) {
        this.trackSelection(best.model.name, requirements, options.sessionId);
      }
      
      return best.model.name;
    }

    return this.getDefaultModel();
  }

  /**
   * Track a response for performance learning
   */
  trackResponse(
    modelName: string,
    response: ChatResponse,
    latencyMs: number,
    taskType: string,
    complexity: string
  ): void {
    const perf: ModelPerformance = {
      modelName,
      taskType,
      complexity,
      latencyMs,
      inputTokens: response.usage?.inputTokens || 0,
      outputTokens: response.usage?.outputTokens || 0,
      timestamp: Date.now(),
      success: true,
    };

    this.performanceHistory.push(perf);
    
    // Trim history
    if (this.performanceHistory.length > this.maxHistory) {
      this.performanceHistory = this.performanceHistory.slice(-this.maxHistory);
    }

    // Update scores
    this.updateModelScores();
    this.savePerformanceData();
  }

  /**
   * Add user feedback for a response
   */
  addFeedback(modelName: string, taskType: string, rating: number, notes?: string): void {
    const perf: ModelPerformance = {
      modelName,
      taskType,
      complexity: 'unknown',
      latencyMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      timestamp: Date.now(),
      userRating: rating,
      success: rating >= 3,
    };

    this.performanceHistory.push(perf);
    this.updateModelScores();
    this.savePerformanceData();

    console.log(`[AdaptiveRouter] Feedback recorded: ${modelName} rated ${rating}/5`);
  }

  /**
   * Get performance stats for a model
   */
  getModelStats(modelName: string): ModelScore | undefined {
    return this.modelScores.get(modelName);
  }

  /**
   * Get all model rankings
   */
  getModelRankings(): ModelScore[] {
    return Array.from(this.modelScores.values()).sort((a, b) => b.score - a.score);
  }

  /**
   * Get best model for a specific task type
   */
  getBestModelForTask(taskType: string): string | undefined {
    const relevantHistory = this.performanceHistory.filter(p => 
      p.taskType === taskType && p.userRating && p.userRating >= 4
    );

    if (relevantHistory.length === 0) return undefined;

    // Count successful uses per model
    const modelCounts = new Map<string, number>();
    for (const perf of relevantHistory) {
      const count = modelCounts.get(perf.modelName) || 0;
      modelCounts.set(perf.modelName, count + 1);
    }

    // Return most successful
    let bestModel: string | undefined;
    let bestCount = 0;
    for (const [model, count] of modelCounts) {
      if (count > bestCount) {
        bestCount = count;
        bestModel = model;
      }
    }

    return bestModel;
  }

  /**
   * Enable/disable learning
   */
  setLearningEnabled(enabled: boolean): void {
    this.learningEnabled = enabled;
    console.log(`[AdaptiveRouter] Learning ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Reset all performance data
   */
  resetPerformanceData(): void {
    this.performanceHistory = [];
    this.modelScores.clear();
    this.savePerformanceData();
    console.log('[AdaptiveRouter] Performance data reset');
  }

  /**
   * Export performance data
   */
  exportPerformanceData(): object {
    return {
      history: this.performanceHistory,
      scores: Object.fromEntries(this.modelScores),
      weights: this.weights,
      exportedAt: new Date().toISOString(),
    };
  }

  /**
   * Import performance data
   */
  importPerformanceData(data: any): void {
    if (data.history) this.performanceHistory = data.history;
    if (data.scores) this.modelScores = new Map(Object.entries(data.scores));
    if (data.weights) this.weights = { ...this.weights, ...data.weights };
    if (data.favoriteModels) this.favoriteModels = data.favoriteModels;
    console.log('[AdaptiveRouter] Performance data imported');
  }

  /**
   * Set favorite models (gets bonus in scoring)
   */
  setFavoriteModels(modelNames: string[]): void {
    this.favoriteModels = modelNames;
    console.log(`[AdaptiveRouter] Favorite models: ${modelNames.join(', ')}`);
  }

  /**
   * Add a favorite model
   */
  addFavoriteModel(modelName: string): void {
    if (!this.favoriteModels.includes(modelName)) {
      this.favoriteModels.push(modelName);
      console.log(`[AdaptiveRouter] Added favorite: ${modelName}`);
    }
  }

  /**
   * Remove a favorite model
   */
  removeFavoriteModel(modelName: string): void {
    this.favoriteModels = this.favoriteModels.filter(m => m !== modelName);
    console.log(`[AdaptiveRouter] Removed favorite: ${modelName}`);
  }

  /**
   * Get favorite models
   */
  getFavoriteModels(): string[] {
    return [...this.favoriteModels];
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Adaptive scoring with performance learning
   */
  private scoreModelAdaptive(
    model: DiscoveredModel,
    requirements: Required<TaskRequirements>,
    message: string
  ): number {
    let score = 0;
    const paramCount = model.parameterCount || 0;

    // 1. Complexity Matching (NEW: prefer smaller models for simple tasks)
    const complexity = requirements.complexity;
    if (complexity === 'low') {
      // Simple tasks: strongly prefer smaller, faster models
      if (paramCount <= 8) score += this.weights.complexityMatch;
      else if (paramCount <= 24) score += this.weights.complexityMatch * 0.5;
      // Large models get penalty for simple tasks
      else if (paramCount > 70) score -= this.weights.complexityMatch * 0.5;
    } else if (complexity === 'medium') {
      // Medium tasks: prefer medium models
      if (paramCount >= 7 && paramCount <= 32) score += this.weights.complexityMatch;
      else if (paramCount > 32) score += this.weights.complexityMatch * 0.3;
    } else if (complexity === 'high') {
      // Complex tasks: prefer larger models
      if (paramCount >= 30) score += this.weights.complexityMatch;
      else if (paramCount >= 8) score += this.weights.complexityMatch * 0.5;
    }

    // 2. Specialization bonus
    if (requirements.type === 'code' && model.specializations.includes('coding')) {
      score += this.weights.specialization;
    }
    if (requirements.type === 'vision' && model.specializations.includes('vision')) {
      score += this.weights.specialization;
    }
    if (requirements.type === 'reasoning' && model.capabilities.reasoning) {
      score += this.weights.specialization;
    }

    // 3. Base quality (reduced weight)
    const qualityScores = { basic: 1, good: 2, excellent: 3 };
    score += qualityScores[model.qualityTier] * this.weights.quality;

    // 4. Speed preference
    if (requirements.preferSpeed) {
      const speedScores = { fast: 1, medium: 0.5, slow: 0 };
      score += speedScores[model.speedTier] * this.weights.speed;
    }

    // 5. Historical performance (if learning enabled)
    if (this.learningEnabled) {
      const perfScore = this.getPerformanceScore(model.name, requirements.type);
      score += perfScore * this.weights.performance;
    }

    // 6. Favorite model bonus
    if (this.favoriteModels.includes(model.name)) {
      score += this.weights.favorite;
      console.log(`[AdaptiveRouter] ${model.name} is a favorite model (+${this.weights.favorite} points)`);
    }

    // 7. Context window adequacy
    const estimatedTokens = message.length / 4;
    if (model.contextWindow > estimatedTokens * 3) {
      score += 3; // Plenty of room
    } else if (model.contextWindow > estimatedTokens) {
      score += 1; // Adequate
    } else {
      score -= 5; // Might not fit
    }

    // 7. Prefer local over cloud (lower latency)
    if (!model.isCloud) {
      score += 2;
    }

    return score;
  }

  /**
   * Get performance score for a model on a task type
   */
  private getPerformanceScore(modelName: string, taskType: string): number {
    const relevantHistory = this.performanceHistory.filter(p => 
      p.modelName === modelName && (p.taskType === taskType || taskType === 'chat')
    );

    if (relevantHistory.length === 0) return 0.5; // Neutral if no data

    // Calculate average rating/success
    let totalScore = 0;
    let count = 0;

    for (const perf of relevantHistory.slice(-20)) { // Last 20 uses
      if (perf.userRating) {
        totalScore += perf.userRating / 5; // Normalize to 0-1
        count++;
      } else if (perf.success) {
        totalScore += 0.7; // Default success score
        count++;
      }
    }

    return count > 0 ? totalScore / count : 0.5;
  }

  /**
   * Get human-readable reason for selection
   */
  private getSelectionReason(model: DiscoveredModel, requirements: Required<TaskRequirements>): string {
    const reasons: string[] = [];
    
    if (requirements.type === 'code' && model.specializations.includes('coding')) {
      reasons.push('coding specialist');
    }
    if (requirements.complexity === 'low' && model.speedTier === 'fast') {
      reasons.push('fast for simple task');
    }
    if (requirements.complexity === 'high' && model.qualityTier === 'excellent') {
      reasons.push('high quality for complex task');
    }
    if (this.learningEnabled && this.getPerformanceScore(model.name, requirements.type) > 0.7) {
      reasons.push('good historical performance');
    }

    return reasons.length > 0 ? reasons.join(', ') : 'balanced choice';
  }

  /**
   * Track a model selection (before response)
   */
  private trackSelection(
    modelName: string,
    requirements: Required<TaskRequirements>,
    sessionId?: string
  ): void {
    // Store in session for later tracking
    if (sessionId) {
      const trackingKey = `router:last:${sessionId}`;
      // This would be stored in a session cache in practice
    }
  }

  /**
   * Update model scores from history
   */
  private updateModelScores(): void {
    const modelStats = new Map<string, {
      latencies: number[];
      ratings: number[];
      successes: number;
      total: number;
    }>();

    // Aggregate stats
    for (const perf of this.performanceHistory) {
      const stats = modelStats.get(perf.modelName) || {
        latencies: [],
        ratings: [],
        successes: 0,
        total: 0,
      };

      if (perf.latencyMs > 0) stats.latencies.push(perf.latencyMs);
      if (perf.userRating) stats.ratings.push(perf.userRating);
      if (perf.success) stats.successes++;
      stats.total++;

      modelStats.set(perf.modelName, stats);
    }

    // Calculate scores
    for (const [modelName, stats] of modelStats) {
      const avgLatency = stats.latencies.length > 0
        ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
        : 0;

      const avgQuality = stats.ratings.length > 0
        ? stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length
        : 3;

      const successRate = stats.total > 0 ? stats.successes / stats.total : 0.5;

      // Combined score (0-1)
      const score = (
        (1 / (1 + avgLatency / 1000)) * 0.3 + // Lower latency = higher score
        (avgQuality / 5) * 0.4 +               // Higher rating = higher score
        successRate * 0.3                       // Higher success rate = higher score
      );

      this.modelScores.set(modelName, {
        modelName,
        avgLatency,
        avgQuality,
        usageCount: stats.total,
        successRate,
        score,
      });
    }
  }

  /**
   * Save performance data to disk
   */
  private savePerformanceData(): void {
    try {
      const data = JSON.stringify({
        history: this.performanceHistory,
        scores: Array.from(this.modelScores.entries()),
      });
      // In practice, save to ~/.0xkobold/model-performance.json
      // For now, just keep in memory
    } catch (err) {
      console.error('[AdaptiveRouter] Failed to save performance data:', err);
    }
  }

  /**
   * Load performance data from disk
   */
  private loadPerformanceData(): void {
    // In practice, load from ~/.0xkobold/model-performance.json
    // For now, start fresh
    this.performanceHistory = [];
    this.modelScores = new Map();
  }

  /**
   * Access parent class private method
   */
  private discoverModels = async () => {
    const service = getModelDiscoveryService();
    return service.discoverModels();
  };
}

/**
 * Create an adaptive router
 */
export async function createAdaptiveRouter(
  provider: LLMProvider,
  defaultModel?: string
): Promise<AdaptiveModelRouter> {
  const router = new AdaptiveModelRouter(provider, defaultModel);
  await router.initialize();
  return router;
}

export default AdaptiveModelRouter;
