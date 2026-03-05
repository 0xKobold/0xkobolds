/**
 * Anthropic Provider
 *
 * Claude API integration.
 */

import type { LLMProvider, ChatOptions, ChatResponse, Message } from './types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? process.env.ANTHROPIC_API_KEY ?? '';
  }

  async chat(options: ChatOptions): Promise<ChatResponse> {
    if (!this.apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    // Extract system message
    const systemMessage = options.messages.find(m => m.role === 'system');
    const messages = options.messages
      .filter(m => m.role !== 'system')
      .map((m: Message) => ({
        role: m.role,
        content: m.content,
      }));

    const body: any = {
      model: options.model.replace('anthropic/', ''),
      messages,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.7,
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    // Add tools
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }

    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic error: ${err}`);
    }

    const data: any = await res.json();

    // Parse content blocks
    let content = '';
    const toolCalls = [];

    for (const block of data.content ?? []) {
      if (block.type === 'text') {
        content += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          function: {
            name: block.name,
            arguments: block.input,
          },
        });
      }
    }

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      model: options.model,
      usage: {
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      },
    };
  }
}

/**
 * Create Anthropic provider
 */
export function createAnthropicProvider(apiKey?: string): AnthropicProvider {
  return new AnthropicProvider(apiKey);
}
