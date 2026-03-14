/**
 * Ollama LLM Provider
 *
 * Unified local + cloud support using shared utilities from @0xkobold/pi-ollama.
 * DRY: All client management, model detection, and chat logic is shared.
 * Uses OpenAI-compatible endpoints (/v1) for pi-coding-agent compatibility.
 */

import type { LLMProvider, ChatOptions, ChatResponse, Message } from './types';
import {
  loadConfigFromEnv,
  createClients,
  isLocalRunning,
  getClientForModel,
  getModelName,
  listAllModels,
  chat,
  chatStream,
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
    let config = loadConfigFromEnv();
    // Fallback if config is incomplete (before extension loads)
    if (!config || !config.baseUrl) {
      config = {
        baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
        cloudUrl: process.env.OLLAMA_CLOUD_URL || 'https://ollama.com',
        apiKey: process.env.OLLAMA_API_KEY,
      };
    }
    this.clients = createClients(config);
    this.detectMode();
  }

  private async detectMode(): Promise<void> {
    this.cloudOnly = !(await isLocalRunning(this.clients.local));
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const { client, isCloud } = getClientForModel(options.model, this.clients, this.cloudOnly);
    const model = getModelName(options.model);

    // Convert messages to shared format
    const messages = options.messages.map((m: Message) => ({
      role: m.role as 'system' | 'user' | 'assistant' | 'tool',
      content: m.content,
    }));

    try {
      const result = await chat(client, {
        model,
        messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      });

      return {
        content: result.content,
        usage: result.usage,
        model: options.model,
      };
    } catch (err: any) {
      throw new Error(`Ollama ${isCloud ? 'Cloud' : 'Local'} error: ${err.message}`);
    }
  }

  async *chatStream(options: ChatOptions): AsyncGenerator<string, void, unknown> {
    const { client } = getClientForModel(options.model, this.clients, this.cloudOnly);
    const model = getModelName(options.model);

    // Convert messages to shared format
    const messages = options.messages.map((m: Message) => ({
      role: m.role as 'system' | 'user' | 'assistant' | 'tool',
      content: m.content,
    }));

    try {
      yield* chatStream(client, {
        model,
        messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      });
    } catch (err: any) {
      throw new Error(`Ollama stream error: ${err.message}`);
    }
  }

  async listModels(): Promise<string[]> {
    const models = await listAllModels(this.clients);
    return models.map(m => m.name);
  }

  /**
   * Check if Ollama is running (local mode)
   */
  async isLocalRunning(): Promise<boolean> {
    return isLocalRunning(this.clients.local);
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
 * Re-exported for compatibility
 */
export async function isOllamaRunning(): Promise<boolean> {
  const config = loadConfigFromEnv();
  const clients = createClients(config);
  return isLocalRunning(clients.local);
}

/**
 * List available Ollama models
 * Re-exported for compatibility
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
