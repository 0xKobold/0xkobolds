/**
 * Telemetry Type Definitions
 * 
 * Central type definitions for all telemetry categories.
 */

// ============================================================================
// Categories
// ============================================================================

export type TelemetryCategory = 
  | 'gateway'
  | 'llm'
  | 'session'
  | 'skill'
  | 'agent'
  | 'storage'
  | 'websocket'
  | 'channel'
  | 'cron'
  | 'system';

export interface TelemetryEvent {
  category: TelemetryCategory;
  event: string;
  properties?: Record<string, unknown>;
  duration_ms?: number;
  success?: boolean;
  timestamp?: number;
}

// ============================================================================
// Gateway Types
// ============================================================================

export interface GatewayRequestData {
  latency_ms: number;
  success: boolean;
  method?: string;
  error?: string;
}

export interface GatewayConnectData {
  client_type: 'web' | 'discord' | 'telegram' | 'internal' | 'node';
  node_id?: string;
}

export interface GatewayDisconnectData {
  client_type: string;
  reason?: 'timeout' | 'error' | 'client_close' | 'unknown';
}

export interface GatewayRateLimitData {
  client_type: string;
  endpoint?: string;
}

// ============================================================================
// LLM Types
// ============================================================================

export interface LLMRequestData {
  model: string;
  latency_ms: number;
  tokens_used: number;
  success: boolean;
  provider?: string;
  error?: string;
}

export interface LLMFallbackData {
  from_model: string;
  to_model: string;
  reason: string;
}

export interface LLMRetryData {
  model: string;
  attempt: number;
  error?: string;
}

// ============================================================================
// Session Types
// ============================================================================

export interface SessionCreateData {
  session_id: string;
  type: 'new' | 'resume' | 'fork';
}

export interface SessionResumeData {
  session_id: string;
  age_hours?: number;
}

export interface SessionForkData {
  parent_id: string;
  child_id: string;
}

export interface SessionAbandonData {
  session_id: string;
  reason?: string;
}

// ============================================================================
// Skill Types
// ============================================================================

export interface SkillExecuteData {
  name: string;
  latency_ms: number;
  success: boolean;
  error?: string;
}

export interface SkillInvokeData {
  name: string;
}

// ============================================================================
// Agent Types
// ============================================================================

export interface AgentSpawnData {
  agent_id: string;
  type: string;
}

export interface AgentCompleteData {
  agent_id: string;
  duration_ms: number;
  success: boolean;
}

export interface AgentTimeoutData {
  agent_id: string;
  max_duration_ms: number;
}

export interface AgentMessageData {
  agent_id: string;
  sent: number;
  received: number;
}

// ============================================================================
// Storage Types
// ============================================================================

export interface StorageReadData {
  operation: string;
  latency_ms: number;
  records?: number;
}

export interface StorageWriteData {
  operation: string;
  latency_ms: number;
  records?: number;
}

export interface StorageQueryData {
  operation: string;
  latency_ms: number;
}

// ============================================================================
// WebSocket Types
// ============================================================================

export interface WebSocketConnectData {
  url: string;
  protocol?: string;
}

export interface WebSocketDisconnectData {
  url: string;
  reason?: string;
}

export interface WebSocketReconnectData {
  url: string;
  attempt: number;
}

export interface WebSocketLatencyData {
  latency_ms: number;
  url: string;
}

// ============================================================================
// Channel Types
// ============================================================================

export interface ChannelMessageData {
  platform: 'discord' | 'telegram' | 'twitch' | 'slack' | 'whatsapp';
  direction: 'in' | 'out';
  message_count: number;
}

export interface ChannelCommandData {
  platform: string;
  command: string;
}

export interface ChannelErrorData {
  platform: string;
  error: string;
}

// ============================================================================
// Cron Types
// ============================================================================

export interface CronJobData {
  name: string;
  latency_ms: number;
  success: boolean;
  error?: string;
}

export interface CronSkippedData {
  name: string;
  reason: string;
}

// ============================================================================
// System Types
// ============================================================================

export interface SystemStartupData {
  uptime_seconds: number;
}

export interface SystemShutdownData {
  uptime_seconds: number;
}

export interface SystemMemoryData {
  heap_used_mb: number;
  heap_total_mb: number;
}

export interface SystemCpuData {
  usage_percent: number;
}

export interface SystemErrorData {
  error_type: string;
  message: string;
}

// ============================================================================
// Dashboard Summary Types
// ============================================================================

export interface DashboardSummary {
  gateway: {
    count: number;
    success_rate: number;
    avg_latency: number;
  };
  llm: {
    count: number;
    success_rate: number;
    avg_latency: number;
  };
  skill: {
    count: number;
    success_rate: number;
    avg_latency: number;
  };
  cron: {
    count: number;
    success_rate: number;
    avg_latency: number;
  };
  session: {
    created: number;
    resumed: number;
    forked: number;
    abandoned: number;
  };
  agent: {
    spawned: number;
    completed: number;
    timeouts: number;
  };
}
