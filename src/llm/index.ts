/**
 * LLM Module - Unified Model Router
 *
 * Two-layer architecture:
 * - router-core.ts: The brains (scoring, learning, selection)
 * - router-commands.ts: The plumbing (singleton, commands, status)
 * - model-discovery.ts: Data source (API fetching, caching)
 * - model-scoring-db.ts: Persistent performance tracking
 * - model-popularity.ts: Community popularity (Ollama + Nostr)
 * - multi-provider.ts: Multi-provider routing (Ollama, Anthropic)
 */

// Router core (brains)
export { AdaptiveModelRouter, createRouter } from './router-core';
export type { TaskRequirements, ModelPerformance, ModelScore, ModelTier } from './router-core';

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
  handleModelRankingsCommand,
  handleTierListCommand,
  handlePopularityCommand,
  handleRefreshPopularity,
  handleModelStatsCommand,
  handleCommunityCommand,
  handleBestForCommand,
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

// Model scoring database
export {
  getModelScoringDB,
  closeModelScoringDB,
  ModelScoringDB,
} from './model-scoring-db';
export type {
  ModelPerformance as DBPerformance,
  ModelScore as DBScore,
  ModelTier as DBTier,
} from './model-scoring-db';

// Model popularity
export {
  getModelPopularityService,
  closeModelPopularityService,
  createModelReportEvent,
} from './model-popularity';
export type {
  ModelPopularity,
  NostrModelReport,
  PopularityWeights,
} from './model-popularity';

// Community analytics
export {
  getCommunityAnalytics,
  CommunityAnalyticsService,
} from './community-analytics';
export type {
  CommunityModelStats,
  CommunityData,
  CommunityConfig,
  CommunityTaskStats,
} from './community-analytics';

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