/**
 * LLM Module - Unified Model Router
 *
 * Two-layer architecture:
 * - router-core.ts: The brains (scoring, learning, selection)
 * - router-commands.ts: The plumbing (singleton, commands, status)
 * - model-discovery.ts: Data source (API fetching, caching)
 * - multi-provider.ts: Multi-provider routing (Ollama, Anthropic)
 */

// Router core (brains)
export { AdaptiveModelRouter, createRouter } from './router-core';
export type { TaskRequirements, ModelPerformance, ModelScore } from './router-core';

// Router commands (plumbing)
export {
  getRouter,
  isRouterReady,
  getRouterStatus,
  createRoutedOllamaProvider,
  handleRouterCommand,
  handleModelsCommand,
  handleRateCommand,
  handleProvidersCommand,
  getFooterStatus,
  // Status state
  setCurrentModel,
  getCurrentModel,
  clearCurrentModel,
} from './router-commands';
export type { ModelStatus } from './router-commands';

// Model discovery
export {
  getModelDiscoveryService,
  ModelDiscoveryService,
} from './model-discovery';
export type { DiscoveredModel, OllamaModelInfo } from './model-discovery';

// Multi-provider routing
export {
  MultiProviderRouter,
  getMultiProviderRouter,
  getProviderRegistry,
  chat,
  listAllModels,
  getProviderStatuses,
} from './multi-provider';
export type { ProviderConfig, ProviderStatus } from './multi-provider';

// Types
export * from './types';

// Providers (legacy exports)
export { OllamaProvider, createOllamaProvider, getOllamaProvider } from './ollama';
export { AnthropicProvider } from './anthropic';