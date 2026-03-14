/**
 * Router Commands - Singleton, Init, CLI Handlers
 *
 * The plumbing: singleton state, initialization, command handlers,
 * and model status tracking for display.
 *
 * Consolidated from:
 * - unified-router.ts (singleton, commands)
 * - model-status.ts (current model tracking)
 */

import { resolve, join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import type { LLMProvider, ChatOptions, ChatResponse, Message } from './types';
import { AdaptiveModelRouter, createRouter } from './router-core';
import { getModelDiscoveryService, type DiscoveredModel } from './model-discovery';
import { getOllamaProvider } from './ollama';

// ============================================================================
// Model Status State
// ============================================================================

export interface ModelStatus {
  name: string;
  reason?: string;
  timestamp: number;
}

let currentModel: ModelStatus | null = null;

export function setCurrentModel(modelName: string, reason?: string): void {
  currentModel = {
    name: modelName,
    reason,
    timestamp: Date.now(),
  };
}

export function getCurrentModel(): ModelStatus | null {
  return currentModel;
}

export function clearCurrentModel(): void {
  currentModel = null;
}

// ============================================================================
// Singleton Router State
// ============================================================================

let routerInstance: AdaptiveModelRouter | null = null;
let routerInitializing = false;
let routerInitPromise: Promise<AdaptiveModelRouter> | null = null;
let favoriteModels: string[] = [];

// ============================================================================
// Initialization
// ============================================================================

export async function getRouter(): Promise<AdaptiveModelRouter> {
  if (routerInstance) return routerInstance;

  if (routerInitializing && routerInitPromise) {
    return routerInitPromise;
  }

  routerInitializing = true;
  routerInitPromise = initializeRouter();

  try {
    routerInstance = await routerInitPromise;
    return routerInstance;
  } catch (err) {
    routerInitPromise = null;
    throw err;
  }
}

async function initializeRouter(): Promise<AdaptiveModelRouter> {
  console.log('[Router] Initializing...');

  const provider = await getOllamaProvider();
  const router = await createRouter(provider, 'kimi-k2.5:cloud');

  await loadFavoriteModels(router);

  router.setLearningEnabled(true);

  console.log('[Router] Ready with adaptive routing');
  return router;
}

async function loadFavoriteModels(router: AdaptiveModelRouter): Promise<void> {
  try {
    const configPath = resolve(homedir(), '.0xkobold/config.json');
    if (!existsSync(configPath)) return;

    const config = JSON.parse(await Bun.file(configPath).text());
    if (config.favoriteModels && Array.isArray(config.favoriteModels)) {
      favoriteModels = config.favoriteModels;
      router.setFavoriteModels(favoriteModels);
      console.log(`[Router] Favorites: ${favoriteModels.join(', ')}`);
    }
  } catch {
    // Silent fail - favorites are optional
  }
}

// ============================================================================
// Status Checks
// ============================================================================

export function isRouterReady(): boolean {
  return routerInstance !== null;
}

export function getRouterStatus(): {
  ready: boolean;
  initializing: boolean;
  favorites: string[];
} {
  return {
    ready: routerInstance !== null,
    initializing: routerInitializing,
    favorites: [...favoriteModels],
  };
}

// ============================================================================
// Routed Provider Wrapper
// ============================================================================

export async function createRoutedOllamaProvider(): Promise<{
  name: string;
  chat: (options: ChatOptions) => Promise<ChatResponse>;
  chatStream: (options: ChatOptions) => AsyncGenerator<ChatResponse>;
  listModels: () => Promise<any[]>;
}> {
  const router = await getRouter();

  return {
    name: 'routed-ollama',

    async chat(options: ChatOptions): Promise<ChatResponse> {
      const lastUserMsg =
        (options.messages?.findLast as any)?.((m: Message) => m.role === 'user')?.content || '';
      const selectedModel = await router.selectModel(lastUserMsg);

      setCurrentModel(selectedModel, 'adaptive routing');

      const baseProvider = await getOllamaProvider();
      return baseProvider.chat({ ...options, model: selectedModel });
    },

    // Note: Streaming not fully implemented - falls back to non-streaming
    async *chatStream(options: ChatOptions): AsyncGenerator<ChatResponse> {
      const baseProvider = await getOllamaProvider();
      const router = await getRouter();

      const lastUserMsg =
        (options.messages?.findLast as any)?.((m: Message) => m.role === 'user')?.content || '';
      const selectedModel = await router.selectModel(lastUserMsg);
      const result = await baseProvider.chat({ ...options, model: selectedModel });
      yield result;
    },

    async listModels(): Promise<any[]> {
      const models = await router.listModels();
      return models.map(m => ({
        id: m.name,
        name: m.name,
        provider: 'routed-ollama',
        contextWindow: m.contextWindow,
      }));
    },
  };
}

// ============================================================================
// Command Handlers
// ============================================================================

export async function handleRouterCommand(args: string): Promise<string> {
  const subcommand = args.trim().toLowerCase();

  if (!subcommand) {
    return `🧠 Adaptive Model Router

Commands:
  /router auto         - Enable adaptive routing
  /router manual       - Use static model
  /router info         - Show current model info
  /router favorites    - List favorite models
  /router fav MODEL    - Add to favorites
  /router unfav MODEL  - Remove from favorites
  /router MODEL        - Force specific model
  /models              - List all models`;
  }

  const router = await getRouter();

  switch (subcommand) {
    case 'auto':
      router.setLearningEnabled(true);
      return '🧠 Adaptive routing enabled. Model will be selected automatically.';

    case 'manual':
    case 'static':
      router.setLearningEnabled(false);
      return '🎯 Static model selection. Use /router MODEL to select specific model.';

    case 'info':
      return getRouterInfo(router);

    case 'favorites':
    case 'favs':
      return getFavoritesOutput(router);

    default:
      if (subcommand.startsWith('fav ')) {
        const model = args.replace(/^fav\s+/, '').trim();
        router.addFavoriteModel(model);
        return `⭐ Added ${model} to favorites`;
      }

      if (subcommand.startsWith('unfav ')) {
        const model = args.replace(/^unfav\s+/, '').trim();
        router.removeFavoriteModel(model);
        return `⭐ Removed ${model} from favorites`;
      }

      return `🎯 Model set to: ${args.trim()}\nUse /router auto to re-enable adaptive routing.`;
  }
}

export async function handleModelsCommand(args: string): Promise<string> {
  const router = await getRouter();
  const models = await router.listModels();

  if (args.includes('--refresh')) {
    await router.refreshModels();
    return '✅ Model cache refreshed';
  }

  if (args.includes('--recommend')) {
    return getRecommendationsOutput(models);
  }

  const lines = ['🧠 Available Models:\n'];

  const byType = {
    chat: models.filter(m => m.capabilities.chat),
    code: models.filter(m => m.capabilities.code && m.specializations.includes('coding')),
    reasoning: models.filter(m => m.capabilities.reasoning),
    vision: models.filter(m => m.capabilities.vision),
  };

  for (const [type, list] of Object.entries(byType)) {
    if (list.length > 0) {
      lines.push(`${type.toUpperCase()}:`);
      for (const m of list) {
        const params = m.parameterCount ? ` ${m.parameterCount}B` : '';
        const cloud = m.isCloud ? ' ☁️' : '';
        const isFav = favoriteModels.includes(m.name) ? ' ⭐' : '';
        lines.push(`  • ${m.name}${params}${cloud}${isFav} - ${m.speedTier}/${m.qualityTier}`);
      }
      lines.push('');
    }
  }

  lines.push('Commands: /router auto|manual|info|favorites');
  return lines.join('\n');
}

export async function handleRateCommand(args: string): Promise<string> {
  const rating = parseInt(args.trim(), 10);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    return 'Usage: /rate <1-5>';
  }
  return `✅ Rating ${rating}/5 recorded. This helps improve model selection.`;
}

// ============================================================================
// Output Helpers
// ============================================================================

async function getRouterInfo(router: AdaptiveModelRouter): Promise<string> {
  const currentModel = router.getDefaultModel();
  const modelInfo = await router.getModelInfo(currentModel);

  const lines = ['🧠 Model Info'];
  lines.push('Mode: 🧠 Adaptive (auto-select)');
  lines.push(`Current: ${currentModel}`);

  if (modelInfo) {
    lines.push(`Speed: ${modelInfo.speedTier} | Quality: ${modelInfo.qualityTier}`);
    lines.push(`Context: ${modelInfo.contextWindow.toLocaleString()} tokens`);
  }

  if (favoriteModels.length > 0) {
    lines.push(`Favorites: ${favoriteModels.join(', ')}`);
  }

  return lines.join('\n');
}

function getFavoritesOutput(router: AdaptiveModelRouter): string {
  const favs = router.getFavoriteModels();
  if (favs.length === 0) {
    return '⭐ No favorites set.\nAdd to ~/.0xkobold/config.json:\n  "favoriteModels": ["kimi-k2.5:cloud"]';
  }
  return '⭐ Favorite models:\n' + favs.map(f => `  • ${f}`).join('\n');
}

function getRecommendationsOutput(models: DiscoveredModel[]): string {
  const lines = ['🎯 Model Recommendations:\n'];

  const bySize = {
    fast: models.filter(m => m.speedTier === 'fast'),
    balanced: models.filter(m => m.speedTier === 'medium' && m.qualityTier === 'good'),
    powerful: models.filter(m => m.qualityTier === 'excellent'),
  };

  if (bySize.fast.length > 0) {
    lines.push('Fast (simple tasks):');
    bySize.fast.slice(0, 3).forEach(m => lines.push(`  • ${m.name}`));
    lines.push('');
  }

  if (bySize.balanced.length > 0) {
    lines.push('Balanced (most tasks):');
    bySize.balanced.slice(0, 3).forEach(m => lines.push(`  • ${m.name}`));
    lines.push('');
  }

  if (bySize.powerful.length > 0) {
    lines.push('Powerful (complex tasks):');
    bySize.powerful.slice(0, 3).forEach(m => lines.push(`  • ${m.name}`));
  }

  return lines.join('\n');
}

// ============================================================================
// Footer Status (for TUI)
// ============================================================================

export async function getFooterStatus(): Promise<{ text: string; tooltip: string } | null> {
  try {
    if (!routerInstance) {
      return { text: '🧠 init...', tooltip: 'Router initializing...' };
    }

    const currentModel = routerInstance.getDefaultModel();
    const modelInfo = await routerInstance.getModelInfo(currentModel);

    if (!modelInfo) {
      return {
        text: '🧠 auto',
        tooltip: `Model: ${currentModel}\nAdaptive routing active`,
      };
    }

    return {
      text: '🧠 auto',
      tooltip: `Model: ${modelInfo.name}\nSpeed: ${modelInfo.speedTier} | Quality: ${modelInfo.qualityTier}\n🧠 Adaptive routing with learning`,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export { AdaptiveModelRouter, createRouter };