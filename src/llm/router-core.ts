/**
 * Router Core - Adaptive Model Router
 *
 * The brains: scoring, task inference, complexity assessment, and performance learning.
 * This is the single source of truth for model selection logic.
 *
 * Consolidated from:
 * - router.ts (DynamicModelRouter)
 * - adaptive-router.ts (performance learning)
 */

import type { LLMProvider, ChatResponse } from './types';
import { getModelDiscoveryService, type DiscoveredModel } from './model-discovery';
import { getModelScoringDB, type ModelTier } from './model-scoring-db';
import { getModelPopularityService } from './model-popularity';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

export interface TaskRequirements {
  type?: 'chat' | 'code' | 'vision' | 'reasoning' | 'embedding';
  complexity?: 'low' | 'medium' | 'high';
  preferSpeed?: boolean;
  preferQuality?: boolean;
  requiredCapabilities?: string[];
}

export interface ModelPerformance {
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
  lastUsed?: number;
}

export { ModelTier };

// ============================================================================
// Adaptive Model Router
// ============================================================================

export interface DataCollectionConfig {
  enabled: boolean;              // Enable data collection mode
  minTestsThreshold: number;      // Minimum tests before trusting scores (default: 10)
  confidentThreshold: number;     // Tests needed for confident scoring (default: 50)
  explorationRate: number;        // Fraction of requests to explore (default: 0.2)
  shareToNostr: boolean;          // Share scores to community
  manualTestingMode?: boolean;    // Manual testing only (default: false)
  allowedModels?: string[];       // Only use these models in manual mode
}

const DEFAULT_DATA_COLLECTION: DataCollectionConfig = {
  enabled: true,
  minTestsThreshold: 10,
  confidentThreshold: 50,
  explorationRate: 0.2,
  shareToNostr: true,
};

export class AdaptiveModelRouter {
  private discovery = getModelDiscoveryService();
  private scoringDB = getModelScoringDB();
  private popularity = getModelPopularityService();
  private provider: LLMProvider;
  private defaultModel: string;
  private initialized = false;

  // Performance learning (in-memory cache, backed by DB)
  private performanceHistory: ModelPerformance[] = [];
  private modelScores: Map<string, ModelScore> = new Map();
  private readonly maxHistory = 1000;
  private learningEnabled = true;
  private favoriteModels: string[] = [];

  // Data collection mode
  private dataCollection: DataCollectionConfig = DEFAULT_DATA_COLLECTION;
  private explorationCounter = 0;

  // Tuned weights for scoring (used when NOT in data collection mode)
  private weights = {
    complexityMatch: 15,
    specialization: 12,
    quality: 8,
    speed: 6,
    performance: 10,
    recency: 5,
    favorite: 8,
    popularity: 7,       // Weight for community popularity (Ollama pulls + Nostr)
    communityScore: 5,   // Weight for Nostr community ratings
  };

  constructor(provider: LLMProvider, defaultModel?: string) {
    this.provider = provider;
    this.defaultModel = defaultModel ?? 'kimi-k2.5:cloud';
    this.loadPerformanceData();
    this.loadScoresFromDB();
    this.loadDataCollectionConfig();
  }

  /**
   * Set data collection mode configuration
   */
  setDataCollectionConfig(config: Partial<DataCollectionConfig>): void {
    this.dataCollection = { ...this.dataCollection, ...config };
  }

  /**
   * Get current data collection config
   */
  getDataCollectionConfig(): DataCollectionConfig {
    return { ...this.dataCollection };
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    const models = await this.discovery.discoverModels();
    console.log(`[Router] Discovered ${models.length} models:`);
    for (const m of models) {
      const caps = Object.entries(m.capabilities)
        .filter(([, v]) => v)
        .map(([k]) => k[0].toUpperCase())
        .join('');
      console.log(`  • ${m.name} (${m.speedTier}, ${m.qualityTier}, caps:${caps})`);
    }

    this.initialized = true;
  }

  async refreshModels(): Promise<DiscoveredModel[]> {
    this.initialized = false;
    const models = await this.discovery.discoverModels(true);
    this.initialized = true;
    return models;
  }

  // ============================================================================
  // Model Selection
  // ============================================================================

  async selectModel(
    message: unknown,
    options: TaskRequirements & { trackPerformance?: boolean; sessionId?: string } = {}
  ): Promise<string> {
    await this.ensureInitialized();

    const requirements = this.inferRequirements(message, options);
    const models = await this.discovery.discoverModels();

    // Manual testing mode: Only use allowed models
    let filteredModels = this.filterAllowedModels(models);

    // Filter by required capabilities
    let candidates = filteredModels.filter(m => {
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
      candidates = this.getFallbackModels(filteredModels, requirements.type);
    }

    // Data collection mode: Check if we should explore
    if (this.dataCollection.enabled && this.shouldExplore()) {
      const explorationModel = await this.selectExplorationModel(candidates);
      if (explorationModel) {
        console.log(`[Router] Data collection mode: exploring ${explorationModel}`);
        return explorationModel;
      }
    }

    // Normalize message for scoring
    let msgStr: string;
    if (typeof message !== 'string') {
      if (Array.isArray(message)) {
        const textPart = message.find(p => p?.type === 'text');
        msgStr = textPart?.text || '';
      } else if (message && typeof message === 'object') {
        msgStr = (message as any).text || '';
      } else {
        msgStr = String(message ?? '');
      }
    } else {
      msgStr = message;
    }

    // Score and rank
    const scored = candidates.map(m => {
      // Data collection mode: Use real score for confident models
      let score = this.scoreModelAdaptive(m, requirements, msgStr);
      
      if (this.dataCollection.enabled) {
        const confidence = this.getConfidenceLevel(m.name);
        if (confidence === 'confident') {
          // Override with real score from actual usage data
          const realScore = this.calculateRealScore(m.name);
          if (realScore > 0) {
            score = realScore;
          }
        }
      }
      
      return { model: m, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best) {
      const reason = this.getSelectionReason(best.model, requirements);
      const confidence = this.dataCollection.enabled ? ` (${this.getConfidenceLevel(best.model.name)})` : '';
      console.log(`[Router] Selected ${best.model.name} (score: ${best.score.toFixed(1)}) - ${reason}${confidence}`);
      return best.model.name;
    }

    return this.defaultModel;
  }

  /**
   * Check if we should explore a new model (data collection mode)
   */
  private shouldExplore(): boolean {
    // Manual testing mode: no exploration
    if (this.dataCollection.manualTestingMode) {
      return false;
    }
    
    // Check exploration rate
    this.explorationCounter++;
    
    // Every Nth request, explore
    const exploreEvery = Math.round(1 / this.dataCollection.explorationRate);
    if (this.explorationCounter % exploreEvery === 0) {
      return true;
    }
    
    // Check if primary model needs more data
    const primaryConfidence = this.getConfidenceLevel(this.defaultModel);
    if (primaryConfidence === 'exploration') {
      return true; // Need data on primary model
    }
    
    return false;
  }

  /**
   * Filter models to only allowed models (manual testing mode)
   */
  private filterAllowedModels(models: DiscoveredModel[]): DiscoveredModel[] {
    if (!this.dataCollection.manualTestingMode || !this.dataCollection.allowedModels) {
      return models;
    }
    
    return models.filter(m => this.dataCollection.allowedModels.includes(m.name));
  }

  async getModelInfo(name: string): Promise<DiscoveredModel | undefined> {
    return this.discovery.getModel(name);
  }

  async listModels(): Promise<DiscoveredModel[]> {
    await this.ensureInitialized();
    return this.discovery.discoverModels();
  }

  async findModels(criteria: {
    capability?: keyof DiscoveredModel['capabilities'];
    speedTier?: DiscoveredModel['speedTier'];
    qualityTier?: DiscoveredModel['qualityTier'];
    specialization?: string;
  }): Promise<DiscoveredModel[]> {
    await this.ensureInitialized();
    return this.discovery.findModels(criteria);
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  // ============================================================================
  // Performance Tracking
  // ============================================================================

  trackResponse(
    modelName: string,
    response: ChatResponse,
    latencyMs: number,
    taskType: string,
    complexity: string,
    sessionId?: string
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
      sessionId,
    };

    // Add to in-memory history
    this.performanceHistory.push(perf);

    if (this.performanceHistory.length > this.maxHistory) {
      this.performanceHistory = this.performanceHistory.slice(-this.maxHistory);
    }

    // Persist to database
    this.scoringDB.recordPerformance({
      modelName: perf.modelName,
      taskType: perf.taskType,
      complexity: perf.complexity,
      latencyMs: perf.latencyMs,
      inputTokens: perf.inputTokens,
      outputTokens: perf.outputTokens,
      timestamp: perf.timestamp,
      success: perf.success,
      sessionId: perf.sessionId,
    });

    // Update task-specific performance
    this.scoringDB.updateTaskPerformance(modelName, taskType);

    this.updateModelScores();
  }

  addFeedback(modelName: string, taskType: string, rating: number, context?: string): void {
    // Add to in-memory history
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

    // Persist to database
    this.scoringDB.addFeedback(modelName, rating, taskType, context);
    this.updateModelScores();

    console.log(`[Router] Feedback recorded: ${modelName} rated ${rating}/5`);
  }

  getModelStats(modelName: string): ModelScore | undefined {
    // First check in-memory cache
    const cached = this.modelScores.get(modelName);
    if (cached) return cached;

    // Fall back to database
    return this.scoringDB.getModelScore(modelName) ?? undefined;
  }

  getModelRankings(): ModelScore[] {
    // Get all scores from database
    return this.scoringDB.getAllScores();
  }

  getBestModelForTask(taskType: string): string | undefined {
    // Check database for best model for task
    const best = this.scoringDB.getBestForTask(taskType, 3);
    if (best) return best.modelName;

    // Fall back to in-memory history
    const relevantHistory = this.performanceHistory.filter(
      p => p.taskType === taskType && p.userRating && p.userRating >= 4
    );

    if (relevantHistory.length === 0) return undefined;

    const modelCounts = new Map<string, number>();
    for (const perf of relevantHistory) {
      const count = modelCounts.get(perf.modelName) || 0;
      modelCounts.set(perf.modelName, count + 1);
    }

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

  // ============================================================================
  // Learning Control
  // ============================================================================

  setLearningEnabled(enabled: boolean): void {
    this.learningEnabled = enabled;
    console.log(`[Router] Learning ${enabled ? 'enabled' : 'disabled'}`);
  }

  isLearningEnabled(): boolean {
    return this.learningEnabled;
  }

  resetPerformanceData(): void {
    this.performanceHistory = [];
    this.modelScores.clear();
    this.scoringDB.clearHistory();
    console.log('[Router] Performance data reset');
  }

  // ============================================================================
  // Favorites
  // ============================================================================

  setFavoriteModels(modelNames: string[]): void {
    this.favoriteModels = modelNames;
    console.log(`[Router] Favorites: ${modelNames.join(', ')}`);
  }

  addFavoriteModel(modelName: string): void {
    if (!this.favoriteModels.includes(modelName)) {
      this.favoriteModels.push(modelName);
      console.log(`[Router] Added favorite: ${modelName}`);
    }
  }

  removeFavoriteModel(modelName: string): void {
    this.favoriteModels = this.favoriteModels.filter(m => m !== modelName);
    console.log(`[Router] Removed favorite: ${modelName}`);
  }

  getFavoriteModels(): string[] {
    return [...this.favoriteModels];
  }

  // ============================================================================
  // Import/Export
  // ============================================================================

  exportPerformanceData(): object {
    return this.scoringDB.exportData();
  }

  importPerformanceData(data: {
    history?: ModelPerformance[];
    scores?: Record<string, ModelScore>;
    weights?: Partial<typeof this.weights>;
    favorites?: string[];
  }): void {
    if (data.history) {
      this.scoringDB.importData({ history: data.history });
    }
    if (data.scores) {
      this.modelScores = new Map(Object.entries(data.scores));
    }
    if (data.weights) this.weights = { ...this.weights, ...data.weights };
    if (data.favorites) this.favoriteModels = data.favorites;
    console.log('[Router] Performance data imported');
  }

  // ============================================================================
  // Tier List Generation
  // ============================================================================

  generateTierList(period: 'day' | 'week' | 'month' | 'all' = 'all'): ModelTier[] {
    return this.scoringDB.generateTierList(period);
  }

  getLatestTierList(): { tiers: ModelTier[]; generatedAt: number; period: string } | null {
    return this.scoringDB.getLatestTierList();
  }

  getPerformanceHistory(limit: number = 100): ModelPerformance[] {
    return this.scoringDB.getPerformanceHistory(limit);
  }

  getRecentFeedback(limit: number = 50): Array<{
    modelName: string;
    rating: number;
    taskType?: string;
    timestamp: number;
  }> {
    return this.scoringDB.getRecentFeedback(limit);
  }

  private loadScoresFromDB(): void {
    const scores = this.scoringDB.getAllScores();
    for (const score of scores) {
      this.modelScores.set(score.modelName, score);
    }
    console.log(`[Router] Loaded ${scores.length} model scores from database`);
  }

  private loadDataCollectionConfig(): void {
    // Load from config file if exists
    try {
      const configPath = path.join(process.env.HOME || '', '.0xkobold', 'router-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (config.dataCollection) {
          this.dataCollection = { ...DEFAULT_DATA_COLLECTION, ...config.dataCollection };
        }
      }
    } catch (e) {
      // Use defaults if config not found
    }
  }

  // ============================================================================
  // Data Collection Mode
  // ============================================================================

  /**
   * Check if a model needs more data collection
   */
  needsExploration(modelName: string): boolean {
    const score = this.modelScores.get(modelName);
    const usageCount = score?.usageCount ?? 0;
    return usageCount < this.dataCollection.minTestsThreshold;
  }

  /**
   * Get confidence level for a model's score
   */
  getConfidenceLevel(modelName: string): 'exploration' | 'learning' | 'confident' {
    const score = this.modelScores.get(modelName);
    const usageCount = score?.usageCount ?? 0;
    
    if (usageCount < this.dataCollection.minTestsThreshold) {
      return 'exploration';
    }
    if (usageCount < this.dataCollection.confidentThreshold) {
      return 'learning';
    }
    return 'confident';
  }

  /**
   * Select a model for exploration (rotate through untested models)
   */
  async selectExplorationModel(models: DiscoveredModel[]): Promise<string> {
    // Filter to cloud models that need exploration
    const needsTesting = models.filter(m => 
      !m.name.includes('embed') && 
      this.needsExploration(m.name)
    );

    if (needsTesting.length > 0) {
      // Pick randomly from models that need testing
      const idx = Math.floor(Math.random() * needsTesting.length);
      const selected = needsTesting[idx];
      console.log(`[Router] Exploration mode: testing ${selected.name} (${this.modelScores.get(selected.name)?.usageCount ?? 0} uses)`);
      return selected.name;
    }

    // All models have enough data - use normal selection
    return this.defaultModel;
  }

  /**
   * Calculate real score from actual usage data
   */
  calculateRealScore(modelName: string): number {
    const score = this.modelScores.get(modelName);
    if (!score) return 0;

    const confidence = this.getConfidenceLevel(modelName);
    
    // In exploration mode, return 0 to not influence selection
    if (confidence === 'exploration') {
      return 0;
    }

    // Calculate score from real metrics
    const qualityScore = (score.avgQuality / 100) * 40;  // 0-40 points
    const speedScore = Math.max(0, 30 - (score.avgLatency / 1000)); // 0-30 points (faster = higher)
    const reliabilityScore = score.successRate * 20;  // 0-20 points
    
    let totalScore = qualityScore + speedScore + reliabilityScore;
    
    // Confidence bonus for models with more data
    if (confidence === 'confident') {
      totalScore += 10; // Bonus for reliable scores
    }

    return totalScore;
  }

  /**
   * Record model usage with metrics
   */
  async recordModelUsage(
    modelName: string,
    metrics: {
      latencyMs: number;
      success: boolean;
      userRating?: number;
      taskType?: string;
    }
  ): Promise<void> {
    const score = this.modelScores.get(modelName) || {
      modelName,
      avgLatency: 0,
      avgQuality: 0,
      usageCount: 0,
      successRate: 0,
      score: 0,
    };

    // Update running averages
    const newCount = score.usageCount + 1;
    score.avgLatency = (score.avgLatency * score.usageCount + metrics.latencyMs) / newCount;
    score.usageCount = newCount;
    
    if (metrics.success) {
      score.successRate = (score.successRate * (newCount - 1) + 1) / newCount;
    } else {
      score.successRate = (score.successRate * (newCount - 1)) / newCount;
    }

    // Update quality from user rating if provided
    if (metrics.userRating !== undefined) {
      score.avgQuality = (score.avgQuality * (newCount - 1) + metrics.userRating * 20) / newCount;
    }

    // Recalculate score
    score.score = this.calculateRealScore(modelName);

    // Save to in-memory cache
    this.modelScores.set(modelName, score);

    // Persist to database via recordPerformance
    const perf: ModelPerformance = {
      modelName,
      taskType: metrics.taskType || 'chat',
      complexity: 'medium',
      latencyMs: metrics.latencyMs,
      inputTokens: 0,
      outputTokens: 0,
      timestamp: Date.now(),
      userRating: metrics.userRating,
      success: metrics.success,
    };
    this.scoringDB.recordPerformance(perf);

    console.log(`[Router] Recorded usage for ${modelName}: ${newCount} uses, score ${score.score.toFixed(1)}, confidence ${this.getConfidenceLevel(modelName)}`);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private inferRequirements(
    message: unknown,
    options: TaskRequirements
  ): Required<TaskRequirements> {
    // Handle non-string content safely
    let msg: string;
    if (typeof message !== 'string') {
      if (Array.isArray(message)) {
        const textPart = message.find(p => p?.type === 'text');
        msg = textPart?.text || '';
      } else if (message && typeof message === 'object') {
        msg = (message as any).text || '';
      } else {
        msg = String(message ?? '');
      }
    } else {
      msg = message;
    }
    
    const lower = msg.toLowerCase();

    // Determine task type
    let type = options.type;
    if (!type) {
      if (lower.includes('```') || /\b(function|class|const|let|var|import|export)\b/.test(msg)) {
        type = 'code';
      } else if (/\b(image|picture|photo|look at|describe)\b/.test(lower)) {
        type = 'vision';
      } else if (/\b(analyze|reason|think|step by step|explain why)\b/.test(lower)) {
        type = 'reasoning';
      } else if (/\b(embed|embedding|vector|similarity)\b/.test(lower)) {
        type = 'embedding';
      } else {
        type = 'chat';
      }
    }

    // Determine complexity
    let complexity = options.complexity;
    if (!complexity) {
      const score = this.assessComplexity(msg);
      if (score < 3) complexity = 'low';
      else if (score < 6) complexity = 'medium';
      else complexity = 'high';
    }

    return {
      type,
      complexity,
      preferSpeed: options.preferSpeed ?? false,
      preferQuality: options.preferQuality ?? false,
      requiredCapabilities: options.requiredCapabilities ?? [],
    };
  }

  private assessComplexity(message: string): number {
    let score = 0;

    if (message.length > 500) score += 1;
    if (message.length > 1000) score += 2;
    if (message.length > 2000) score += 2;

    const complexKeywords = [
      'analyze', 'compare', 'evaluate', 'synthesize', 'critique',
      'explain in detail', 'step by step', 'reasoning', 'complex',
      'architecture', 'design pattern', 'implement', 'refactor',
      'debug', 'optimize', 'performance', 'scalability',
      'trade-off', 'advantages and disadvantages', 'pros and cons',
    ];

    for (const keyword of complexKeywords) {
      if (message.toLowerCase().includes(keyword)) {
        score += 1;
      }
    }

    const codeBlocks = message.match(/```[\s\S]*?```/g);
    if (codeBlocks) {
      score += Math.min(codeBlocks.length, 2);
      const totalCodeLength = codeBlocks.reduce((sum, block) => sum + block.length, 0);
      if (totalCodeLength > 500) score += 1;
    }

    const questions = message.match(/\?/g);
    if (questions && questions.length > 2) score += 1;

    return Math.min(score, 10);
  }

  private scoreModelAdaptive(
    model: DiscoveredModel,
    requirements: Required<TaskRequirements>,
    message: string
  ): number {
    let score = 0;
    const paramCount = model.parameterCount || 0;

    // 1. Complexity Matching
    const complexity = requirements.complexity;
    if (complexity === 'low') {
      if (paramCount <= 8) score += this.weights.complexityMatch;
      else if (paramCount <= 24) score += this.weights.complexityMatch * 0.5;
      else if (paramCount > 70) score -= this.weights.complexityMatch * 0.5;
    } else if (complexity === 'medium') {
      if (paramCount >= 7 && paramCount <= 32) score += this.weights.complexityMatch;
      else if (paramCount > 32) score += this.weights.complexityMatch * 0.3;
    } else if (complexity === 'high') {
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

    // 3. Base quality
    const qualityScores = { basic: 1, good: 2, excellent: 3 };
    score += qualityScores[model.qualityTier] * this.weights.quality;

    // 4. Speed preference
    if (requirements.preferSpeed) {
      const speedScores = { fast: 1, medium: 0.5, slow: 0 };
      score += speedScores[model.speedTier] * this.weights.speed;
    }

    // 5. Historical performance
    if (this.learningEnabled) {
      const perfScore = this.getPerformanceScore(model.name, requirements.type);
      score += perfScore * this.weights.performance;
    }

    // 6. Favorite model bonus
    if (this.favoriteModels.includes(model.name)) {
      score += this.weights.favorite;
    }

    // 7. Context window adequacy
    const estimatedTokens = message.length / 4;
    if (model.contextWindow > estimatedTokens * 3) {
      score += 3;
    } else if (model.contextWindow > estimatedTokens) {
      score += 1;
    } else {
      score -= 5;
    }

    // 8. Prefer local over cloud
    if (!model.isCloud) {
      score += 2;
    }

    // 9. Community popularity (Ollama pulls + Nostr community ratings)
    const popularityScore = this.popularity.calculatePopularityScore(model.name);
    score += popularityScore * this.weights.popularity;

    // 10. Community ratings (if available from Nostr)
    const pop = this.popularity.getPopularity(model.name);
    if (pop && pop.communitySampleSize > 0) {
      score += pop.communityScore * this.weights.communityScore;
    }

    return score;
  }

  private getFallbackModels(
    models: DiscoveredModel[],
    type?: string
  ): DiscoveredModel[] {
    let candidates: DiscoveredModel[];

    if (type === 'vision') {
      candidates = models.filter(m => m.capabilities.chat && !m.capabilities.embedding);
      if (candidates.length > 0) {
        console.warn('[Router] No vision models, falling back to chat');
      }
    } else if (type === 'embedding') {
      candidates = models.filter(m => m.capabilities.embedding);
    } else {
      candidates = models.filter(m => m.capabilities.chat);
    }

    if (candidates.length === 0) {
      candidates = models;
    }

    if (candidates.length > 0) {
      console.warn('[Router] No exact match, using fallback');
    }

    return candidates;
  }

  private getSelectionReason(
    model: DiscoveredModel,
    requirements: Required<TaskRequirements>
  ): string {
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

  private getPerformanceScore(modelName: string, taskType: string): number {
    const relevantHistory = this.performanceHistory.filter(
      p => p.modelName === modelName && (p.taskType === taskType || taskType === 'chat')
    );

    if (relevantHistory.length === 0) return 0.5;

    let totalScore = 0;
    let count = 0;

    for (const perf of relevantHistory.slice(-20)) {
      if (perf.userRating) {
        totalScore += perf.userRating / 5;
        count++;
      } else if (perf.success) {
        totalScore += 0.7;
        count++;
      }
    }

    return count > 0 ? totalScore / count : 0.5;
  }

  private updateModelScores(): void {
    const modelStats = new Map<
      string,
      { latencies: number[]; ratings: number[]; successes: number; total: number }
    >();

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

    for (const [modelName, stats] of modelStats) {
      const avgLatency =
        stats.latencies.length > 0
          ? stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length
          : 0;

      const avgQuality =
        stats.ratings.length > 0
          ? stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length
          : 3;

      const successRate = stats.total > 0 ? stats.successes / stats.total : 0.5;

      const score =
        (1 / (1 + avgLatency / 1000)) * 0.3 +
        (avgQuality / 5) * 0.4 +
        successRate * 0.3;

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

  private savePerformanceData(): void {
    // Performance data is now persisted in real-time via scoringDB
    // This is kept for compatibility but operates as no-op
  }

  private loadPerformanceData(): void {
    // Performance data is now loaded from database via loadScoresFromDB()
    // This is kept for compatibility but operates as no-op
    // In-memory history starts fresh each session
    this.performanceHistory = [];
    this.modelScores = new Map();
  }
}

// ============================================================================
// Factory
// ============================================================================

export async function createRouter(
  provider: LLMProvider,
  defaultModel?: string
): Promise<AdaptiveModelRouter> {
  const router = new AdaptiveModelRouter(provider, defaultModel);
  await router.initialize();
  return router;
}

export default AdaptiveModelRouter;