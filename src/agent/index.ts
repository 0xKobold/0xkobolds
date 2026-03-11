export { loadBootstrapFiles, ensureDefaultBootstrap, DEFAULT_BOOTSTRAP_FILES } from "./bootstrap-loader.js";
export { buildSystemPrompt, createSystemPromptOverride } from "./system-prompt.js";
export { runEmbeddedAgent, initEmbeddedMode, isEmbeddedModeAvailable } from "./embedded-runner.js";
export type { BootstrapFile, BootstrapConfig } from "./bootstrap-loader.js";
export type { SystemPromptConfig } from "./system-prompt.js";
export type { EmbeddedRunConfig, EmbeddedRunResult } from "./embedded-runner.js";

// Agent Types (v0.2.0)
export { AGENT_TYPES, getAgentType, getAllAgentTypes, getAgentTypesForTask } from "./types/index.js";
export type { AgentType } from "./types/index.js";

// Task Router (v0.2.0)
export { routeTask, quickRoute, shouldUseSubagents } from "./task-router.js";
export type { TaskRequest, TaskRouterResult } from "./task-router.js";

// Agent Tools (v0.2.0)
export { spawnAgent, spawnAgents, getSpawnAgentToolConfig, executeSpawnAgent } from "./tools/index.js";
export type { SpawnAgentParams, SpawnAgentResult } from "./tools/index.js";

// User Profile (Phase 1.2)
export { loadUserProfile, saveUserProfile, learnPreference, ensureUserProfile, getUserPreferencesForPrompt } from "./user-profile.js";
export type { UserProfile, UserPreferences, LearnedPreferences, Workflow } from "./user-profile.js";

// Dynamic Personality (Phase 1.2)
export { loadPersonalityState, savePersonalityState, recordInteraction, adaptPersonality, getDynamicPersona, getPersonalityInsights, resetPersonality } from "./dynamic-personality.js";

// Context Pruning (Phase 1.3)
export { 
  calculateTokenUsage, 
  shouldPrune, 
  pruneContext, 
  recommendStrategy, 
  autoPrune, 
  estimateTokens,
  oldestFirstStrategy,
  importanceStrategy,
  smartCompactionStrategy,
  smartestPruningStrategy,
  DEFAULT_BUDGET,
  BUDGET_PRESETS 
} from "./context-pruning.js";
export type { ContextBudget, ContextItem, PruningStrategy, PruningResult } from "./context-pruning.js";

// Model Fallback (Phase 3)
export { 
  runWithModelFallback, 
  runWithSimpleFallback,
  FailoverError,
  isRetryableError,
  classifyFailoverReason,
  computeBackoff 
} from "./model-fallback.js";
export type { 
  ModelRef, 
  FallbackResult, 
  FallbackConfig, 
  FallbackError 
} from "./model-fallback.js";

// Auth Profiles (Phase 4)
export {
  addAuthProfile,
  removeAuthProfile,
  getAuthProfile,
  listAuthProfiles,
  getApiKeyForProvider,
  markAuthProfileUsed,
  markAuthProfileFailure,
  markAuthProfileGood,
  rotateApiKey,
  ensureAuthProfilesFromConfig,
  isProfileInCooldown,
  resolveProfilesUnavailableReason,
  clearAuthProfiles,
} from "./auth-profiles.js";
export type { AuthProfile, ResolvedProviderAuth } from "./auth-profiles.js";
