/**
 * Model Router
 *
 * Smart model selection based on task complexity.
 * Uses fast models for simple tasks, switches to smart models for complex reasoning.
 */

import type { LLMProvider } from './types';

export interface ModelConfig {
  name: string;
  provider: LLMProvider;
  speed: 'fast' | 'medium' | 'slow';
  cost: 'free' | 'cheap' | 'expensive';
  capabilities: string[];
  contextWindow: number;
}

export class ModelRouter {
  private models: Map<string, ModelConfig> = new Map();
  private defaultModel: string;

  constructor(defaultModel?: string) {
    this.defaultModel = defaultModel ?? 'ollama/llama3.2';
  }

  /**
   * Register a model
   */
  register(config: ModelConfig): void {
    this.models.set(config.name, config);
  }

  /**
   * Select model based on message and context
   */
  selectModel(message: string, history?: string[]): string {
    const complexity = this.assessComplexity(message, history);

    // Simple queries → fast model
    if (complexity < 3) {
      const fast = this.findModel({ speed: 'fast' });
      if (fast) return fast.name;
    }

    // Medium complexity → balanced
    if (complexity < 6) {
      const medium = this.findModel({ speed: 'medium' });
      if (medium) return medium.name;
    }

    // Complex reasoning → smart model
    const smart = this.findModel({ speed: 'slow' });
    if (smart) return smart.name;

    return this.defaultModel;
  }

  /**
   * Assess complexity of a task (0-10 scale)
   */
  private assessComplexity(message: string, history?: string[]): number {
    let score = 0;

    // Length factor
    if (message.length > 500) score += 2;
    if (message.length > 1000) score += 2;

    // Keywords indicating complexity
    const complexKeywords = [
      'analyze', 'compare', 'evaluate', 'synthesize',
      'explain in detail', 'step by step', 'reasoning',
      'architecture', 'design', 'implement',
      'debug', 'optimize', 'refactor',
    ];

    for (const keyword of complexKeywords) {
      if (message.toLowerCase().includes(keyword)) {
        score += 1;
      }
    }

    // Code indicators
    if (message.includes('```')) score += 1;
    if (/\b(function|class|interface|async|await)\b/.test(message)) score += 1;

    // Conversation depth
    if (history && history.length > 10) score += 1;

    return Math.min(score, 10);
  }

  /**
   * Find model matching criteria
   */
  private findModel(criteria: Partial<ModelConfig>): ModelConfig | undefined {
    for (const model of this.models.values()) {
      let matches = true;

      if (criteria.speed && model.speed !== criteria.speed) matches = false;
      if (criteria.cost && model.cost !== criteria.cost) matches = false;

      if (matches) return model;
    }

    // Return first available as fallback
    return this.models.values().next().value;
  }

  /**
   * Get provider for a model
   */
  getProvider(modelName: string): LLMProvider | undefined {
    const model = this.models.get(modelName);
    return model?.provider;
  }

  /**
   * Get default model
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * List available models
   */
  listModels(): string[] {
    return Array.from(this.models.keys());
  }
}

/**
 * Create default router with Ollama models
 */
export function createOllamaRouter(provider: LLMProvider): ModelRouter {
  const router = new ModelRouter('ollama/llama3.2');

  // Fast model for simple queries
  router.register({
    name: 'ollama/llama3.2:3b',
    provider,
    speed: 'fast',
    cost: 'free',
    capabilities: ['chat', 'simple'],
    contextWindow: 8192,
  });

  // Medium model for most tasks
  router.register({
    name: 'ollama/llama3.2',
    provider,
    speed: 'medium',
    cost: 'free',
    capabilities: ['chat', 'code', 'reasoning'],
    contextWindow: 128000,
  });

  // Smart model for complex reasoning
  router.register({
    name: 'ollama/llama3.2:70b',
    provider,
    speed: 'slow',
    cost: 'free',
    capabilities: ['chat', 'code', 'reasoning', 'analysis'],
    contextWindow: 128000,
  });

  return router;
}

export default ModelRouter;
