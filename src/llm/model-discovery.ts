/**
 * Model Discovery Service
 *
 * Dynamically discovers and caches Ollama model information.
 * Fetches from both local Ollama and cloud endpoints.
 *
 * Uses @0xkobold/pi-ollama/shared for context window detection (DRY).
 */

import { existsSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import { getContextLength } from '@0xkobold/pi-ollama/shared';

export interface OllamaModelInfo {
  name: string;
  id: string;
  size: number;
  modified: Date;
  isCloud: boolean;
  details?: {
    format?: string;
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
    model_info?: Record<string, unknown>;
  };
}

export interface DiscoveredModel {
  name: string;
  displayName: string;
  provider: 'ollama';
  isCloud: boolean;
  // Derived capabilities
  parameterCount?: number; // in billions
  contextWindow: number;
  capabilities: {
    chat: boolean;
    code: boolean;
    vision: boolean;
    reasoning: boolean;
    embedding: boolean;
  };
  // Performance characteristics
  speedTier: 'fast' | 'medium' | 'slow';
  qualityTier: 'basic' | 'good' | 'excellent';
  // Specializations
  specializations: string[];
  // Raw metadata
  raw: OllamaModelInfo;
}

interface CacheEntry {
  models: DiscoveredModel[];
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';

class ModelDiscoveryService {
  private cache: CacheEntry | null = null;
  private baseUrl: string;

  constructor(baseUrl: string = OLLAMA_HOST) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * Discover all available models from Ollama
   */
  async discoverModels(forceRefresh = false): Promise<DiscoveredModel[]> {
    // Return cached if valid
    if (!forceRefresh && this.cache && Date.now() - this.cache.timestamp < CACHE_TTL_MS) {
      return this.cache.models;
    }

    const models: DiscoveredModel[] = [];

    // Fetch local models
    try {
      const localModels = await this.fetchLocalModels();
      for (const model of localModels) {
        models.push(this.classifyModel(model));
      }
    } catch (err) {
      console.warn('[ModelDiscovery] Failed to fetch local models:', err);
    }

    // Fetch cloud models (if API key available)
    try {
      const cloudModels = await this.fetchCloudModels();
      for (const model of cloudModels) {
        if (!models.some(m => m.name === model.name)) {
          models.push(this.classifyModel(model));
        }
      }
    } catch (err) {
      // Cloud fetch is optional
      console.debug('[ModelDiscovery] Cloud models not available:', err);
    }

    // Update cache
    this.cache = {
      models,
      timestamp: Date.now(),
    };

    return models;
  }

  /**
   * Get a specific model by name
   */
  async getModel(name: string): Promise<DiscoveredModel | undefined> {
    const models = await this.discoverModels();
    return models.find(m => m.name === name || m.displayName === name);
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
    const models = await this.discoverModels();

    return models.filter(m => {
      if (criteria.capability && !m.capabilities[criteria.capability]) return false;
      if (criteria.speedTier && m.speedTier !== criteria.speedTier) return false;
      if (criteria.qualityTier && m.qualityTier !== criteria.qualityTier) return false;
      if (criteria.specialization && !m.specializations.includes(criteria.specialization)) return false;
      return true;
    });
  }

  /**
   * Clear the cache
   */
  invalidateCache(): void {
    this.cache = null;
  }

  /**
   * Fetch models from local Ollama instance
   */
  private async fetchLocalModels(): Promise<OllamaModelInfo[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json() as { models: Array<{
      name: string;
      model: string;
      size: number;
      modified_at: string;
      details?: OllamaModelInfo['details'];
    }> };

    return data.models.map(m => ({
      name: m.name,
      id: m.model,
      size: m.size,
      modified: new Date(m.modified_at),
      isCloud: false,
      details: m.details,
    }));
  }

  /**
   * Fetch models from Ollama cloud (requires API key)
   */
  private async fetchCloudModels(): Promise<OllamaModelInfo[]> {
    // Check for cloud API key
    const configPath = resolve(homedir(), '.0xkobold/config.json');
    let apiKey: string | undefined;

    if (existsSync(configPath)) {
      try {
        const config = await import(configPath, { assert: { type: 'json' } });
        apiKey = config.default?.ollama?.apiKey || config.ollama?.apiKey;
      } catch {
        // Ignore config read errors
      }
    }

    apiKey = apiKey || process.env.OLLAMA_API_KEY;

    if (!apiKey) {
      return []; // No cloud access without API key
    }

    // Fetch from cloud API
    const response = await fetch('https://ollama.com/api/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return []; // Silently fail for cloud
    }

    const data = await response.json() as Array<{
      name: string;
      id: string;
    }>;

    return data.map(m => ({
      name: m.name,
      id: m.id,
      size: 0,
      modified: new Date(),
      isCloud: true,
    }));
  }

  /**
   * Classify a model based on its metadata
   */
  private classifyModel(info: OllamaModelInfo): DiscoveredModel {
    const name = info.name;
    const details = info.details;

    // Extract parameter count from name or details
    const paramCount = this.extractParameterCount(name, details?.parameter_size);

    // Determine capabilities from name patterns and metadata
    const capabilities = this.inferCapabilities(name, details);

    // Determine speed/quality tiers from parameter count
    const { speedTier, qualityTier } = this.inferTiers(paramCount, name);

    // Extract specializations
    const specializations = this.extractSpecializations(name);

    // Determine context window using shared utility (DRY)
    // Pass details.model_info if available, otherwise pass the whole details object
    const contextWindow = details?.model_info
      ? getContextLength(details.model_info, name)
      : getContextLength(null, name);

    return {
      name: info.name,
      displayName: this.formatDisplayName(info),
      provider: 'ollama',
      isCloud: info.isCloud,
      parameterCount: paramCount,
      contextWindow,
      capabilities,
      speedTier,
      qualityTier,
      specializations,
      raw: info,
    };
  }

  /**
   * Extract parameter count (in billions) from model name or metadata
   */
  private extractParameterCount(name: string, paramSize?: string): number | undefined {
    // From metadata first
    if (paramSize) {
      const match = paramSize.match(/(\d+(?:\.\d+)?)\s*[BMK]/i);
      if (match) {
        const num = parseFloat(match[1]);
        const unit = match[0].toUpperCase();
        if (unit.includes('B')) return num;
        if (unit.includes('M')) return num / 1000;
        if (unit.includes('K')) return num / 1000000;
      }
    }

    // From name patterns
    const patterns = [
      /:(\d+)b/i,           // :7b, :70b
      /-(\d+)b/i,           // -7b
      /(\d+)b-/i,           // 7b-
      /(\d{3})b/i,          // 480b (qwen3-coder:480b)
    ];

    for (const pattern of patterns) {
      const match = name.match(pattern);
      if (match) {
        const num = parseInt(match[1], 10);
        // Handle edge cases like 480b (which is actually 48B or similar)
        if (num > 100) return num / 10; // 480b -> 48B
        return num;
      }
    }

    // Known model families
    if (name.includes('llama3.2')) return 3;
    if (name.includes('llama3.3')) return 70;
    if (name.includes('llama3.1')) return 8;
    if (name.includes('llama3')) return 8;
    if (name.includes('llama2')) return 7;
    if (name.includes('mistral')) return 7;
    if (name.includes('mixtral')) return 8; // 8x7B
    if (name.includes('qwen2.5')) return 7;
    if (name.includes('qwen3')) return 48; // qwen3-coder:480b
    if (name.includes('kimi')) return 32; // kimi-k2.5
    if (name.includes('minimax')) return 24; // minimax-m2.5
    if (name.includes('gpt-oss')) return 120; // gpt-oss:120b

    return undefined;
  }

  /**
   * Infer capabilities from model name and metadata
   */
  private inferCapabilities(
    name: string,
    details?: OllamaModelInfo['details']
  ): DiscoveredModel['capabilities'] {
    const lower = name.toLowerCase();

    // Check if it's an embedding model first
    const isEmbedding = lower.includes('embed') || lower.includes('nomic') || lower.includes('bge') || lower.includes('mxbai');

    // Large models (>30B) can generally handle reasoning tasks
    const paramCount = this.extractParameterCount(name, details?.parameter_size);
    const isLargeModel = paramCount && paramCount >= 30;

    return {
      chat: !isEmbedding, // Most models except embeddings
      code: lower.includes('code') || lower.includes('coder') || lower.includes('llama') || isLargeModel,
      vision: lower.includes('vision') || lower.includes('vl') || lower.includes('llava') || lower.includes('bakllava'),
      reasoning: lower.includes('reason') || lower.includes('r1') || lower.includes('deepseek') || isLargeModel,
      embedding: isEmbedding,
    };
  }

  /**
   * Infer speed and quality tiers from parameter count
   */
  private inferTiers(
    paramCount: number | undefined,
    name: string
  ): { speedTier: DiscoveredModel['speedTier']; qualityTier: DiscoveredModel['qualityTier'] } {
    // Embedding models are fast but not for chat
    if (name.includes('embed')) {
      return { speedTier: 'fast', qualityTier: 'basic' };
    }

    if (!paramCount) {
      return { speedTier: 'medium', qualityTier: 'good' };
    }

    if (paramCount <= 4) {
      return { speedTier: 'fast', qualityTier: 'basic' };
    } else if (paramCount <= 8) {
      return { speedTier: 'fast', qualityTier: 'good' };
    } else if (paramCount <= 32) {
      return { speedTier: 'medium', qualityTier: 'good' };
    } else if (paramCount <= 70) {
      return { speedTier: 'slow', qualityTier: 'excellent' };
    } else {
      return { speedTier: 'slow', qualityTier: 'excellent' };
    }
  }

  /**
   * Extract specializations from model name
   */
  private extractSpecializations(name: string): string[] {
    const lower = name.toLowerCase();
    const specs: string[] = [];

    if (lower.includes('code') || lower.includes('coder')) specs.push('coding');
    if (lower.includes('vision') || lower.includes('vl') || lower.includes('llava')) specs.push('vision');
    if (lower.includes('instruct')) specs.push('instruction-following');
    if (lower.includes('chat')) specs.push('chat');
    if (lower.includes('embed')) specs.push('embeddings');
    if (lower.includes('reason')) specs.push('reasoning');
    if (lower.includes('math')) specs.push('math');
    if (lower.includes('math')) specs.push('math');

    return specs;
  }

  // Note: Context window inference moved to @0xkobold/pi-ollama/shared (getContextLength)
  // This keeps the logic DRY and consistent across all consumers

  /**
   * Format a display name for the model
   */
  private formatDisplayName(info: OllamaModelInfo): string {
    const parts: string[] = [];

    if (info.isCloud) parts.push('☁️');
    if (this.inferCapabilities(info.name, info.details).vision) parts.push('👁️');

    parts.push(info.name);

    return parts.join(' ');
  }
}

// Singleton instance
let discoveryService: ModelDiscoveryService | null = null;

export function getModelDiscoveryService(baseUrl?: string): ModelDiscoveryService {
  if (!discoveryService) {
    discoveryService = new ModelDiscoveryService(baseUrl);
  }
  return discoveryService;
}

export { ModelDiscoveryService };
export default ModelDiscoveryService;
