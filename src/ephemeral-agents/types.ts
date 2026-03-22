/**
 * Ephemeral Agent Types
 */

export interface EphemeralAgent {
  id: string;
  type: string;
  task: string;
  workspace: string;
  status: EphemeralStatus;
  startedAt: number;
  completedAt?: number;
  result?: EphemeralResult;
  error?: string;
  parentId?: string;
  children: string[];
  ttlMs: number;
}

export type EphemeralStatus = 'spawning' | 'running' | 'completed' | 'failed' | 'timeout';

export interface EphemeralResult {
  success: boolean;
  text: string;
  tokens?: TokenMetrics;
  durationMs: number;
  status: 'completed' | 'failed' | 'timed_out';
}

export interface TokenMetrics {
  input: number;
  output: number;
  total: number;
}

export interface RegistryStats {
  active: number;
  finished: number;
  avgDuration: number;
  byStatus: Record<string, number>;
}

export interface SpawnEphemeralParams {
  task: string;
  agentType?: string;
  model?: string;
  timeoutMs?: number;
  parentId?: string;
  workspace?: string;
  extraSystemPrompt?: string;
}

export interface SubAgentConfig {
  maxConcurrent: number;      // Global cap (default: 8)
  maxChildrenPerAgent: number; // Per parent cap (default: 5)
  maxSpawnDepth: number;      // Nesting limit (default: 2)
  defaultTimeoutMs: number;   // Default: 5 min
  archiveAfterMs: number;     // Cleanup finished (default: 30 min)
}
