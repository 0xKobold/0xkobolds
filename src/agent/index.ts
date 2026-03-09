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
