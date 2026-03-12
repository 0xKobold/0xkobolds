/**
 * Ollama LLM Provider
 * 
 * Unified local + cloud support via ollama-extension.ts
 * Routing logic is now handled in the extension, this provider
 * just makes the actual API calls.
 */

import type { LLMProvider, ChatOptions, ChatResponse, Message } from './types';

// Cloud URL for fallback
const CLOUD_URL = 'https://ollama.com';

// Helper functions (previously imported from extension)
async function checkLocalOllama(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { 
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    return res.ok;
  } catch {
    return false;
  }
}

function getOllamaBaseUrl(modelId: string): string {
  // If model has cloud/ prefix or no local Ollama, use cloud
  if (modelId.includes('cloud/')) return CLOUD_URL;
  return 'http://localhost:11434';
}

function getOllamaApiKey(): string | undefined {
  return process.env.OLLAMA_API_KEY;
}

function modelRequiresApiKey(modelId: string): boolean {
  // Cloud models require API key
  return modelId.includes('cloud/') || modelId.startsWith('cloud-');
}

/**
 * Ollama Provider
 * Supports both local and cloud modes
 */
export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  private baseUrl: string = 'http://localhost:11434';
  private cloudOnly: boolean = false;

  constructor() {
    // Check if we have local Ollama
    this.detectMode();
  }

  private async detectMode(): Promise<void> {
    const hasLocal = await checkLocalOllama();
    this.cloudOnly = !hasLocal;
    this.baseUrl = hasLocal ? 'http://localhost:11434' : CLOUD_URL;
  }

  /**
   * Update base URL based on current mode and model
   */
  private updateBaseUrl(modelId: string): void {
    // Use the extension's routing logic
    this.baseUrl = getOllamaBaseUrl(modelId);
  }

  /**
   * Check if running in cloud-only mode
   */
  isCloudOnly(): boolean {
    return this.cloudOnly;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    // Set base URL based on model
    this.updateBaseUrl(options.model);
    const isCloud = this.baseUrl === CLOUD_URL || options.model.includes('cloud/');

    // Get model name (strip prefix)
    const model = options.model.replace(/^ollama\//, '').replace(/^cloud\//, '');

    // Build messages
    const messages = options.messages.map((m: Message) => ({
      role: m.role,
      content: m.content,
    }));

    // Build request body
    const body: any = {
      model,
      messages,
      stream: options.stream ?? false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 4096,
      },
    };

    // Add tools if provided
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(t => ({
        type: t.type,
        function: t.function,
      }));
    }

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add auth for cloud mode
    if (isCloud || modelRequiresApiKey(options.model)) {
      const apiKey = getOllamaApiKey();
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Ollama ${isCloud ? 'Cloud' : 'Local'} error: ${err}`);
    }

    const data: any = await res.json();

    // Parse tool calls from response
    const toolCalls = data.message?.tool_calls?.map((tc: any) => ({
      id: `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      function: {
        name: tc.function?.name ?? tc.function,
        arguments: typeof tc.function?.arguments === 'string' 
          ? JSON.parse(tc.function.arguments) 
          : tc.function?.arguments ?? {},
      },
    }));

    // Calculate usage (Ollama provides eval counts)
    const usage = {
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
    };

    return {
      content: data.message?.content ?? '',
      toolCalls,
      model: options.model,
      usage,
    };
  }

  async *chatStream(options: ChatOptions): AsyncGenerator<string, void, unknown> {
    // Set base URL based on model
    this.updateBaseUrl(options.model);
    const isCloud = this.baseUrl === CLOUD_URL || options.model.includes('cloud/');

    // Get model name (strip prefix)
    const model = options.model.replace(/^ollama\//, '').replace(/^cloud\//, '');

    // Build messages
    const messages = options.messages.map((m: Message) => ({
      role: m.role,
      content: m.content,
    }));

    const body = {
      model,
      messages,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens ?? 4096,
      },
    };

    // Build headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    // Add auth for cloud mode
    if (isCloud || modelRequiresApiKey(options.model)) {
      const apiKey = getOllamaApiKey();
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      throw new Error(`Ollama ${isCloud ? 'Cloud' : 'Local'} error: ${err}`);
    }

    if (!res.body) {
      throw new Error('No response body');
    }

    // Process stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              yield data.message.content;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async listModels(): Promise<string[]> {
    // Try local first
    const hasLocal = await checkLocalOllama();
    
    try {
      const headers: Record<string, string> = {};
      const url = hasLocal ? 'http://localhost:11434' : CLOUD_URL;
      
      if (!hasLocal) {
        const apiKey = getOllamaApiKey();
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      }
      
      const res = await fetch(`${url}/api/tags`, { headers });
      if (!res.ok) return [];

      const data: any = await res.json();
      return (data.models ?? []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }
}

/**
 * Check if Ollama is running (local mode)
 * Re-exported from extension for compatibility
 */
export async function isOllamaRunning(): Promise<boolean> {
  return checkLocalOllama();
}

/**
 * List available Ollama models
 * Re-exported from extension for compatibility
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

export default createOllamaProvider;
