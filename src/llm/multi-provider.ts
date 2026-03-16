/**
 * Multi-Provider Router
 *
 * Extends AdaptiveModelRouter to support multiple LLM providers.
 * Routes requests to the appropriate provider based on model prefix.
 *
 * Model prefixes:
 * - ollama/* → OllamaProvider (local or cloud)
 * - claude/* → AnthropicProvider
 * - anthropic/* → AnthropicProvider (alias)
 *
 * Usage:
 *   const router = await getMultiProviderRouter();
 *   const response = await router.chat({ model: 'claude/claude-3-5-sonnet', ... });
 */

import type { LLMProvider, ChatOptions, ChatResponse } from './types';
import { AdaptiveModelRouter, createRouter } from './router-core';
import { getOllamaProvider, OllamaProvider } from './ollama';
import { AnthropicProvider, createAnthropicProvider } from './anthropic';
import { getModelDiscoveryService } from './model-discovery';

// ============================================================================
// Types
// ============================================================================

export interface ProviderConfig {
  name: string;
  prefix: string;
  create: () => LLMProvider;
  models?: string[];
}

export interface ProviderStatus {
  name: string;
  available: boolean;
  modelCount: number;
  lastChecked: number;
}

// ============================================================================
// Provider Registry
// ============================================================================

const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    name: 'ollama',
    prefix: 'ollama/',
    create: () => getOllamaProvider(),
  },
  {
    name: 'claude',
    prefix: 'claude/',
    create: () => createAnthropicProvider(),
  },
  {
    name: 'anthropic',
    prefix: 'anthropic/',
    create: () => createAnthropicProvider(), // Alias
  },
];

class ProviderRegistry {
  private providers: Map<string, LLMProvider> = new Map();
  private configs: ProviderConfig[];
  private status: Map<string, ProviderStatus> = new Map();

  constructor(configs: ProviderConfig[] = DEFAULT_PROVIDERS) {
    this.configs = configs;
  }

  /**
   * Get provider for a model
   */
  getProvider(model: string): LLMProvider {
    // Extract prefix (e.g., "ollama/", "claude/")
    const prefixMatch = this.configs.find(cfg => model.startsWith(cfg.prefix));
    
    if (prefixMatch) {
      const providerName = prefixMatch.name;
      
      // Cache provider instance
      if (!this.providers.has(providerName)) {
        this.providers.set(providerName, prefixMatch.create());
      }
      
      return this.providers.get(providerName)!;
    }

    // Default to Ollama if no prefix
    if (!this.providers.has('ollama')) {
      this.providers.set('ollama', getOllamaProvider());
    }
    return this.providers.get('ollama')!;
  }

  /**
   * Get provider name from model
   */
  getProviderName(model: string): string {
    const prefixMatch = this.configs.find(cfg => model.startsWith(cfg.prefix));
    return prefixMatch?.name ?? 'ollama';
  }

  /**
   * Strip provider prefix from model name
   */
  stripPrefix(model: string): string {
    const prefixMatch = this.configs.find(cfg => model.startsWith(cfg.prefix));
    if (prefixMatch) {
      return model.slice(prefixMatch.prefix.length);
    }
    return model;
  }

  /**
   * Check if provider is available
   */
  async checkAvailability(providerName: string): Promise<boolean> {
    const config = this.configs.find(cfg => cfg.name === providerName);
    if (!config) return false;

    try {
      const provider = this.getProvider(`${config.prefix}test`);
      // Try to list models or make a minimal call
      if (provider.listModels) {
        const models = await provider.listModels();
        return models.length > 0;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get all provider statuses
   */
  async getStatuses(): Promise<ProviderStatus[]> {
    const statuses: ProviderStatus[] = [];

    for (const config of this.configs) {
      const available = await this.checkAvailability(config.name);
      const provider = this.providers.get(config.name);
      
      statuses.push({
        name: config.name,
        available,
        modelCount: available ? (await provider?.listModels?.() ?? []).length : 0,
        lastChecked: Date.now(),
      });
    }

    return statuses;
  }

  /**
   * Register a new provider
   */
  register(config: ProviderConfig): void {
    this.configs.push(config);
  }

  /**
   * List configured providers
   */
  listProviders(): string[] {
    return this.configs.map(cfg => cfg.name);
  }
}

// ============================================================================
// Multi-Provider Router
// ============================================================================

let registryInstance: ProviderRegistry | null = null;
let multiProviderRouter: MultiProviderRouter | null = null;

export class MultiProviderRouter implements LLMProvider {
  name = 'multi-provider';
  private registry: ProviderRegistry;
  private defaultProvider: string = 'ollama';
  private routers: Map<string, AdaptiveModelRouter> = new Map();

  constructor(registry: ProviderRegistry) {
    this.registry = registry;
  }

  /**
   * Chat using appropriate provider
   */
  async chat(options: ChatOptions): Promise<ChatResponse> {
    const providerName = this.registry.getProviderName(options.model);
    const provider = this.registry.getProvider(options.model);
    const modelName = this.registry.stripPrefix(options.model);

    // Adapt ChatOptions for the provider
    const providerOptions: ChatOptions = {
      ...options,
      model: modelName,
    };

    console.log(`[MultiProvider] Routing to ${providerName}: ${modelName}`);

    // Track timing for performance
    const startTime = Date.now();
    try {
      const response = await provider.chat(providerOptions);
      const duration = Date.now() - startTime;

      console.log(`[MultiProvider] ${providerName}/${modelName} completed in ${duration}ms`);

      // Add provider info to response
      return {
        ...response,
        model: `${providerName}/${modelName}`,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[MultiProvider] ${providerName}/${modelName} failed after ${duration}ms:`, error);
      throw error;
    }
  }

  /**
   * List models from all providers
   */
  async listModels(): Promise<string[]> {
    const allModels: string[] = [];

    for (const providerName of this.registry.listProviders()) {
      try {
        const provider = this.registry.getProvider(`${providerName}/test`);
        if (provider.listModels) {
          const models = await provider.listModels();
          for (const model of models) {
            allModels.push(`${providerName}/${model}`);
          }
        }
      } catch (error) {
        console.warn(`[MultiProvider] Failed to list models from ${providerName}:`, error);
      }
    }

    return allModels;
  }

  /**
   * Get provider registry
   */
  getRegistry(): ProviderRegistry {
    return this.registry;
  }

  /**
   * Get adaptive router for a specific provider
   */
  async getRouterForProvider(providerName: string): Promise<AdaptiveModelRouter | null> {
    if (this.routers.has(providerName)) {
      return this.routers.get(providerName)!;
    }

    const config = this.registry.listProviders().includes(providerName);
    if (!config) return null;

    const provider = this.registry.getProvider(`${providerName}/default`);
    const router = await createRouter(provider, 'default');
    this.routers.set(providerName, router);

    return router;
  }
}

// ============================================================================
// Singleton Access
// ============================================================================

export function getProviderRegistry(): ProviderRegistry {
  if (!registryInstance) {
    registryInstance = new ProviderRegistry();
  }
  return registryInstance;
}

export async function getMultiProviderRouter(): Promise<MultiProviderRouter> {
  if (!multiProviderRouter) {
    const registry = getProviderRegistry();
    multiProviderRouter = new MultiProviderRouter(registry);
    console.log('[MultiProvider] Initialized with providers:', registry.listProviders());
  }
  return multiProviderRouter;
}

/**
 * Convenience: Chat with automatic provider routing
 */
export async function chat(options: ChatOptions): Promise<ChatResponse> {
  const router = await getMultiProviderRouter();
  return router.chat(options);
}

/**
 * Convenience: List all available models with provider prefixes
 */
export async function listAllModels(): Promise<string[]> {
  const router = await getMultiProviderRouter();
  return router.listModels();
}

/**
 * Convenience: Get provider statuses
 */
export async function getProviderStatuses(): Promise<ProviderStatus[]> {
  const registry = getProviderRegistry();
  return registry.getStatuses();
}