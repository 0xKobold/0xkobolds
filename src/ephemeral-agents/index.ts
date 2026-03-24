/**
 * Ephemeral Agent System - v1.0
 * 
 * Uses RpcClient from pi-coding-agent SDK for:
 * - Actual tool execution (read, bash, edit, write)
 * - Full agent capabilities
 * - Proper event handling
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
