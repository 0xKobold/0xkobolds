/**
 * Ephemeral Agent System
 * 
 * Based on OpenClaw/Hermes patterns:
 * - Spawn → work → report → die
 * - Isolated workspaces per agent
 * - TTL-based cleanup
 * - Telemetry integration
 */

export { ephemeralRegistry, EphemeralRegistry, DEFAULT_CONFIG } from './registry.js';
export { createWorkspace, cleanupWorkspace, cleanupAllWorkspaces, workspaceExists } from './workspace.js';
export { spawnEphemeral, spawnEphemeralFanOut, spawnEphemeralWithTimeout } from './spawner.js';

export type {
  EphemeralAgent,
  EphemeralResult,
  EphemeralStatus,
  TokenMetrics,
  RegistryStats,
  SpawnEphemeralParams,
  SubAgentConfig,
} from './types.js';
