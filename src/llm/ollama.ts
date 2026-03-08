/**
 * Ollama Provider
 *
 * Local LLM via Ollama HTTP API.
 */

import type { LLMProvider, ChatOptions, ChatResponse, Message } from './types';
import { shouldUseCloud } from '../extensions/core/ollama-router-extension';

const LOCAL_BASE_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const CLOUD_BASE_URL = 'https://ollama.com';

/**
 * Get Ollama base URL based on mode
 */
function getOllamaBaseUrl(): string {
  return shouldUseCloud() ? CLOUD_BASE_URL : LOCAL_BASE_URL;
}

/**
 * Get Ollama API key for cloud mode
 */
async function getOllamaApiKey(): Promise<string | undefined> {
  // Will be populated by framework from auth.json
  return process.env.OLLAMA_API_KEY;
}

/**
 * Check if Ollama is running (local mode)
 */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_BASE_URL}/api/tags`, {
      method: 'GET',
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check if Ollama Cloud is available
 */
export async function isOllamaCloudAvailable(): Promise<boolean> {
  try {
    const apiKey = await getOllamaApiKey();
    if (!apiKey) return false;
    
    const res = await fetch(`${CLOUD_BASE_URL}/api/tags`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * List available Ollama models
 */
export async function listOllamaModels(): Promise<string[]> {
  try {
    const baseUrl = getOllamaBaseUrl();
    const res = await fetch(`${baseUrl}/api/tags`);
    if (!res.ok) return [];

    const data: any = await res.json();
    return (data.models ?? []).map((m: any) => m.name);
  } catch {
    return [];
  }
}

/**
 * Ollama LLM Provider
 * Supports both local (localhost:11434) and cloud (ollama.com) modes
 */
export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? getOllamaBaseUrl();
  }

  /**
   * Update base URL based on current mode
   */
  updateBaseUrl(): void {
    this.baseUrl = getOllamaBaseUrl();
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    // Ensure we're using correct mode
    this.updateBaseUrl();
    
    const model = options.model.replace('ollama/', '');
    const isCloud = this.baseUrl === CLOUD_BASE_URL;

    // Convert messages to Ollama format
    const messages = options.messages.map((m: Message) => ({
      role: m.role,
      content: m.content,
      tool_calls: m.toolCalls?.map(tc => ({
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      })),
    }));

    // Build request
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
    
    // Add auth header for cloud mode
    if (isCloud) {
      const apiKey = await getOllamaApiKey();
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
    }

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama ${isCloud ? 'Cloud' : 'Local'} error: ${err}`);
    }

    const data: any = await res.json();

    // Parse tool calls from response
    const toolCalls = data.message?.tool_calls?.map((tc: any) => ({
      id: `call-${Date.now()}`,
      function: {
        name: tc.function?.name ?? tc.function,
        arguments: tc.function?.arguments ?? {},
      },
    }));

    return {
      content: data.message?.content ?? '',
      toolCalls,
      model: options.model,
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
    };
  }

  async listModels(): Promise<string[]> {
    this.updateBaseUrl();
    const isCloud = this.baseUrl === CLOUD_BASE_URL;
    
    try {
      const headers: Record<string, string> = {};
      if (isCloud) {
        const apiKey = await getOllamaApiKey();
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
      }
      
      const res = await fetch(`${this.baseUrl}/api/tags`, { headers });
      if (!res.ok) return [];

      const data: any = await res.json();
      return (data.models ?? []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }
}

/**
 * Create default Ollama provider
 */
export function createOllamaProvider(): OllamaProvider {
  return new OllamaProvider();
}
