/**
 * Dynamic Model Router
 *
 * Smart model selection based on task complexity and discovered model capabilities.
 * Automatically discovers available Ollama models and routes to the best match.
 */

import type { LLMProvider } from './types';
import { getModelDiscoveryService, type DiscoveredModel } from './model-discovery';

export interface ModelConfig {
  name: string;
  provider: LLMProvider;
  speed: 'fast' | 'medium' | 'slow';
  cost: 'free' | 'cheap' | 'expensive';
  capabilities: string[];
  contextWindow: number;
}

export interface TaskRequirements {
  type?: 'chat' | 'code' | 'vision' | 'reasoning' | 'embedding';
  complexity?: 'low' | 'medium' | 'high';
  preferSpeed?: boolean;
  preferQuality?: boolean;
  requiredCapabilities?: string[];
}

export class DynamicModelRouter {
  private discovery = getModelDiscoveryService();
  private provider: LLMProvider;
  private defaultModel: string;
  private initialized = false;

  constructor(provider: LLMProvider, defaultModel?: string) {
    this.provider = provider;
    this.defaultModel = defaultModel ?? 'kimi-k2.5:cloud';
  }

  /**
   * Initialize the router by discovering available models
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const models = await this.discovery.discoverModels();
    console.log(`[ModelRouter] Discovered ${models.length} models:`);
    for (const m of models) {
      const caps = Object.entries(m.capabilities)
        .filter(([, v]) => v)
        .map(([k]) => k[0].toUpperCase())
        .join('');
      console.log(`  • ${m.name} (${m.speedTier}, ${m.qualityTier}, caps:${caps})`);
    }

    this.initialized = true;
  }

  /**
   * Refresh the model cache
   */
  async refreshModels(): Promise<DiscoveredModel[]> {
    this.initialized = false;
    const models = await this.discovery.discoverModels(true);
    this.initialized = true;
    return models;
  }

  /**
   * Select the best model for a task
   */
  async selectModel(
    message: string,
    options: TaskRequirements = {}
  ): Promise<string> {
    await this.ensureInitialized();

    // Determine task requirements from message if not specified
    const requirements = this.inferRequirements(message, options);

    // Get all available models
    const models = await this.discovery.discoverModels();

    // Filter by required capabilities
    let candidates = models.filter(m => {
      // Must have the primary capability
      if (requirements.type && !m.capabilities[requirements.type]) return false;

      // Must have all required capabilities
      if (requirements.requiredCapabilities) {
        for (const cap of requirements.requiredCapabilities) {
          if (!m.capabilities[cap as keyof typeof m.capabilities]) return false;
        }
      }

      return true;
    });

    // If no candidates match, try fallbacks
    if (candidates.length === 0) {
      if (requirements.type === 'vision') {
        // Vision tasks: fall back to chat models with warning
        candidates = models.filter(m => m.capabilities.chat && !m.capabilities.embedding);
        if (candidates.length > 0) {
          console.warn(`[ModelRouter] No vision models available, falling back to chat model`);
        }
      } else if (requirements.type === 'embedding') {
        // Embedding tasks: must have embedding capability
        candidates = models.filter(m => m.capabilities.embedding);
      } else {
        // General fallback to chat-capable models
        candidates = models.filter(m => m.capabilities.chat);
      }

      if (candidates.length === 0) {
        // Last resort: any model
        candidates = models;
      }

      if (candidates.length > 0) {
        console.warn(`[ModelRouter] No models match exact requirements, using fallback`);
      }
    }

    // Score and rank candidates
    const scored = candidates.map(m => ({
      model: m,
      score: this.scoreModel(m, requirements, message),
    }));

    scored.sort((a, b) => b.score - a.score);

    // Return best match
    const best = scored[0];
    if (best) {
      console.log(`[ModelRouter] Selected ${best.model.name} (score: ${best.score.toFixed(2)})`);
      return best.model.name;
    }

    return this.defaultModel;
  }

  /**
   * Get model info by name
   */
  async getModelInfo(name: string): Promise<DiscoveredModel | undefined> {
    return this.discovery.getModel(name);
  }

  /**
   * List all available models
   */
  async listModels(): Promise<DiscoveredModel[]> {
    await this.ensureInitialized();
    return this.discovery.discoverModels();
  }

  /**
   * Find models matching criteria
   */
  async findModels(criteria: {
    capability?: keyof DiscoveredModel['capabilities'];
    speedTier?: DiscoveredModel['speedTier'];
    qualityTier?: DiscoveredModel['qualityTier'];
    specialization?: string;
  }): Promise<DiscoveredModel[]> {
    await this.ensureInitialized();
    return this.discovery.findModels(criteria);
  }

  /**
   * Get provider for a model
   */
  getProvider(): LLMProvider {
    return this.provider;
  }

  /**
   * Get default model
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * Ensure router is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Infer task requirements from message and options
   */
  protected inferRequirements(
    message: string,
    options: TaskRequirements
  ): Required<TaskRequirements> {
    const lower = message.toLowerCase();

    // Determine task type
    let type = options.type;
    if (!type) {
      if (lower.includes('```') || /\b(function|class|const|let|var|import|export)\b/.test(message)) {
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
      const score = this.assessComplexity(message);
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

  /**
   * Assess complexity of a task (0-10 scale)
   */
  private assessComplexity(message: string): number {
    let score = 0;

    // Length factor
    if (message.length > 500) score += 1;
    if (message.length > 1000) score += 2;
    if (message.length > 2000) score += 2;

    // Keywords indicating complexity
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

    // Code complexity indicators
    const codeBlocks = message.match(/```[\s\S]*?```/g);
    if (codeBlocks) {
      score += Math.min(codeBlocks.length, 2);
      const totalCodeLength = codeBlocks.reduce((sum, block) => sum + block.length, 0);
      if (totalCodeLength > 500) score += 1;
    }

    // Multiple questions or tasks
    const questions = message.match(/\?/g);
    if (questions && questions.length > 2) score += 1;

    return Math.min(score, 10);
  }

  /**
   * Score a model for a specific task
   */
  private scoreModel(
    model: DiscoveredModel,
    requirements: Required<TaskRequirements>,
    message: string
  ): number {
    let score = 0;

    // Base score by quality tier
    const qualityScores = { basic: 1, good: 2, excellent: 3 };
    score += qualityScores[model.qualityTier] * 10;

    // Capability match
    if (requirements.type && model.capabilities[requirements.type]) {
      score += 20;
    }

    // Specialization bonus
    if (requirements.type === 'code' && model.specializations.includes('coding')) {
      score += 15;
    }
    if (requirements.type === 'vision' && model.specializations.includes('vision')) {
      score += 15;
    }
    if (requirements.type === 'reasoning' && model.specializations.includes('reasoning')) {
      score += 10;
    }

    // Complexity matching
    if (requirements.complexity === 'high') {
      // Prefer larger models for complex tasks
      if (model.qualityTier === 'excellent') score += 10;
      if (model.parameterCount && model.parameterCount >= 70) score += 5;
    } else if (requirements.complexity === 'low') {
      // Prefer faster models for simple tasks
      if (model.speedTier === 'fast') score += 10;
      if (model.parameterCount && model.parameterCount <= 8) score += 5;
    }

    // User preferences
    if (requirements.preferSpeed) {
      const speedScores = { fast: 10, medium: 5, slow: 0 };
      score += speedScores[model.speedTier];
    }
    if (requirements.preferQuality) {
      const qualityBonus = { basic: 0, good: 5, excellent: 10 };
      score += qualityBonus[model.qualityTier];
    }

    // Context window adequacy
    const estimatedTokens = message.length / 4; // Rough estimate
    if (model.contextWindow > estimatedTokens * 2) {
      score += 5; // Plenty of room
    } else if (model.contextWindow > estimatedTokens) {
      score += 2; // Adequate
    } else {
      score -= 10; // Might not fit
    }

    // Slight preference for non-cloud (lower latency)
    if (!model.isCloud) {
      score += 2;
    }

    return score;
  }
}

/**
 * Create a dynamic router with Ollama provider
 */
export async function createDynamicRouter(
  provider: LLMProvider,
  defaultModel?: string
): Promise<DynamicModelRouter> {
  const router = new DynamicModelRouter(provider, defaultModel);
  await router.initialize();
  return router;
}

export default DynamicModelRouter;
