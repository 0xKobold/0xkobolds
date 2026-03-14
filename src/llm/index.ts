/**
 * LLM Module - Unified Model Router
 * 
 * Single source of truth for model routing.
 * All routing functionality exported from unified-router.ts
 */

// Unified router (single source of truth)
export {
  getRouter,
  isRouterReady,
  getRouterStatus,
  createRoutedOllamaProvider,
  handleRouterCommand,
  handleModelsCommand,
  handleRateCommand,
  getFooterStatus,
} from './unified-router';

// Model status (shared state)
export {
  setCurrentModel,
  getCurrentModel,
  clearCurrentModel,
  type ModelStatus,
} from './model-status';

// Types
export * from './types';

// Legacy exports (for backward compatibility)
export { OllamaProvider, createOllamaProvider, getOllamaProvider } from './ollama';
export { AnthropicProvider } from './anthropic';
