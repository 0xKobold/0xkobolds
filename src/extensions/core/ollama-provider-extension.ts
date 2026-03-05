/**
 * Ollama Provider Extension for 0xKobold
 *
 * Registers Ollama as a model provider with pi-coding-agent
 * Fixes the "No models available" error by providing Ollama model definitions
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';

const OLLAMA_BASE_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

export default function ollamaProviderExtension(pi: ExtensionAPI) {
  // Register Ollama as a provider with available models
  // Note: Ollama doesn't require authentication, but pi-coding-agent requires apiKey or oauth
  pi.registerProvider('ollama', {
    baseUrl: `${OLLAMA_BASE_URL}/v1`,
    apiKey: 'ollama', // Dummy key (Ollama doesn't require auth for local access)
    api: 'openai-completions',
    models: [
      {
        id: 'kimi-k2.5:cloud',
        name: 'Kimi K2.5 (Cloud)',
        reasoning: true,
        input: ['text', "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 256000,
        maxTokens: 8192,
      },
      {
        id: 'minimax-m2.5:cloud',
        name: 'Minimax M2.5 (Cloud)',
        reasoning: true,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 198000,
        maxTokens: 8192,
      },
      {
        id: 'glm-5:cloud',
        name: 'GLM-5 (Cloud)',
        reasoning: true,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 198000,
        maxTokens: 8192,
      },
      {
        id: 'qwen3.5:cloud',
        name: 'Qwen3.5 (Cloud)',
        reasoning: true,
        input: ['text'],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 256000,
        maxTokens: 8192,
      },
      {
        id: 'qwen3.5:397b-cloud',
        name: 'Qwen3.5 397B (Cloud)',
        reasoning: true,
        input: ['text', "image"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 256000,
        maxTokens: 8192,
      },
    ],
  });

  console.log('[Ollama] Provider registered with models: minimax-m2.5:cloud, llama3.2, llama3.1:8b, mistral:7b, codellama');
}
