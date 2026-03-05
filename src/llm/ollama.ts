/**
 * Ollama Provider
 *
 * Local LLM via Ollama HTTP API.
 */

import type { LLMProvider, ChatOptions, ChatResponse, Message } from './types';

const OLLAMA_BASE_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

/**
 * Check if Ollama is running
 */
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
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
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) return [];

    const data: any = await res.json();
    return (data.models ?? []).map((m: any) => m.name);
  } catch {
    return [];
  }
}

/**
 * Ollama LLM Provider
 */
export class OllamaProvider implements LLMProvider {
  name = 'ollama';
  private baseUrl: string;

  constructor(baseUrl = OLLAMA_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    const model = options.model.replace('ollama/', '');

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

    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Ollama error: ${err}`);
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
    return listOllamaModels();
  }
}

/**
 * Create default Ollama provider
 */
export function createOllamaProvider(): OllamaProvider {
  return new OllamaProvider();
}
