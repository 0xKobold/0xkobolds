/**
 * Ollama LLM Provider
 *
 * Unified local + cloud support using official Ollama client.
 * Uses OpenAI-compatible endpoints (/v1) for pi-coding-agent compatibility.
 */

import type { LLMProvider, ChatOptions, ChatResponse, Message } from './types';
import { Ollama } from 'ollama';
import {
  loadConfigFromEnv,
  DEFAULT_CONFIG,
  type OllamaConfig,
  type OllamaClients,
} from '@0xkobold/pi-ollama/shared';

/**
 * Ollama Provider
 * Supports both local and cloud modes using official client
 */
export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  private clients: OllamaClients;
  private cloudOnly: boolean = false;

  constructor() {
    // Merge env config with defaults
    const envConfig = loadConfigFromEnv();
    const config: OllamaConfig = {
      baseUrl: envConfig.baseUrl ?? process.env.OLLAMA_BASE_URL ?? DEFAULT_CONFIG.baseUrl,
      cloudUrl: envConfig.cloudUrl ?? process.env.OLLAMA_CLOUD_URL ?? DEFAULT_CONFIG.cloudUrl,
      apiKey: envConfig.apiKey ?? process.env.OLLAMA_API_KEY ?? DEFAULT_CONFIG.apiKey,
    };
    
    // Create clients
    this.clients = {
      local: new Ollama({ host: config.baseUrl }),
      cloud: config.apiKey 
        ? new Ollama({ host: config.cloudUrl, headers: { Authorization: `Bearer ${config.apiKey}` } })
        : null,
    };
    
    this.detectMode();
  }

  private async detectMode(): Promise<void> {
    try {
      await this.clients.local.list();
      this.cloudOnly = false;
    } catch {
      this.cloudOnly = true;
    }
  }

  /**
   * Get the appropriate client for a model
   */
  private getClient(model: string): { client: Ollama; isCloud: boolean } {
    // If model has :cloud suffix, use cloud client
    if (model.endsWith(':cloud') && this.clients.cloud) {
      return { client: this.clients.cloud, isCloud: true };
    }
    // If local is unavailable, use cloud
    if (this.cloudOnly && this.clients.cloud) {
      return { client: this.clients.cloud, isCloud: true };
    }
    // Default to local
    return { client: this.clients.local, isCloud: false };
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const { client, isCloud } = this.getClient(options.model);
    // Only strip :cloud suffix when actually using cloud client
    const model = isCloud ? options.model.replace(':cloud', '') : options.model;

    // Convert messages to OpenAI format
    const messages = options.messages.map((m: Message) => ({
      role: m.role as 'system' | 'user' | 'assistant' | 'tool',
      content: m.content,
    }));

    try {
      // Use the chat API
      const response = await client.chat({
        model,
        messages,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 4096,
        },
      });

      return {
        content: response.message.content,
        usage: {
          inputTokens: response.prompt_eval_count ?? 0,
          outputTokens: response.eval_count ?? 0,
        },
        model: options.model,
      };
    } catch (err: any) {
      throw new Error(`Ollama ${isCloud ? 'Cloud' : 'Local'} error: ${err.message}`);
    }
  }

  async *chatStream(options: ChatOptions): AsyncGenerator<string, void, unknown> {
    const { client, isCloud } = this.getClient(options.model);
    // Only strip :cloud suffix when actually using cloud client
    const model = isCloud ? options.model.replace(':cloud', '') : options.model;

    // Convert messages to OpenAI format
    const messages = options.messages.map((m: Message) => ({
      role: m.role as 'system' | 'user' | 'assistant' | 'tool',
      content: m.content,
    }));

    try {
      const stream = await client.chat({
        model,
        messages,
        stream: true,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 4096,
        },
      });

      for await (const chunk of stream) {
        if (chunk.message?.content) {
          yield chunk.message.content;
        }
      }
    } catch (err: any) {
      throw new Error(`Ollama stream error: ${err.message}`);
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const { models } = await this.clients.local.list();
      const modelNames = models.map(m => m.name);
      
      // Also list cloud models if available
      if (this.clients.cloud && !this.cloudOnly) {
        try {
          const { models: cloudModels } = await this.clients.cloud.list();
          const cloudNames = cloudModels.map(m => `${m.name}:cloud`);
          return [...modelNames, ...cloudNames];
        } catch {
          // Cloud unavailable, just return local
        }
      }
      
      return modelNames;
    } catch {
      // If local fails, try cloud
      if (this.clients.cloud) {
        const { models } = await this.clients.cloud.list();
        return models.map(m => `${m.name}:cloud`);
      }
      return [];
    }
  }

  /**
   * Check if Ollama is running (local mode)
   */
  async isLocalRunning(): Promise<boolean> {
    try {
      await this.clients.local.list();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if running in cloud-only mode
   */
  isCloudOnly(): boolean {
    return this.cloudOnly;
  }
}

/**
 * Check if Ollama is running (local mode)
 */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const client = new Ollama({ host: process.env.OLLAMA_HOST || 'http://localhost:11434' });
    await client.list();
    return true;
  } catch {
    return false;
  }
}

/**
 * List available Ollama models
 */
export async function listOllamaModels(): Promise<string[]> {
  const provider = new OllamaProvider();
  return provider.listModels();
}

/**
 * Create default Ollama provider
 */
export function createOllamaProvider(): OllamaProvider {
  return new OllamaProvider();
}

/**
 * Get singleton Ollama provider instance
 */
let ollamaProviderInstance: OllamaProvider | null = null;
export function getOllamaProvider(): OllamaProvider {
  if (!ollamaProviderInstance) {
    ollamaProviderInstance = new OllamaProvider();
  }
  return ollamaProviderInstance;
}

export default createOllamaProvider;