/**
 * Unified Session Types
 * 
 * Single source of truth for session management across all 0xKobold subsystems.
 * Sessions survive restarts with stable IDs and track complete lifecycle.
 */

import type { AgentStatus, AgentType } from "../gateway/persistence/AgentStore.js";

// ============================================================================
// Core Session Types
// ============================================================================

export type SessionState = "idle" | "active" | "error" | "completed" | "suspended";
export type SessionMode = "persistent" | "oneshot" | "forked" | "cron";
export type SessionSource = "tui" | "discord" | "web" | "gateway" | "cron" | "api" | "fork";
export type WorkspaceType = "main" | "isolated" | "cron" | "agent" | "subagent";

/**
 * Primary session entity - stored in unified sessions.db
 * This is the single source of truth for all session management
 */
export interface UnifiedSession {
  // Primary key - stable hash of pi-session-id (survives restarts)
  id: string;
  
  // Links to pi-coding-agent
  piSessionId: string;        // Original pi-coding-agent session identifier
  piSessionFile?: string;     // Path to .pi-session-* file if exists
  
  // Identity & Ownership
  deviceId: string;           // Device that owns this session
  userId?: string;            // User identifier (for multi-user)
  
  // State Management
  state: SessionState;        // Current operational state
  mode: SessionMode;        // Persistence behavior
  
  // Workspace Context
  cwd: string;              // Working directory
  workspaceType: WorkspaceType;
  
  // Timestamps (all in milliseconds)
  createdAt: number;
  lastActivityAt: number;   // Last user/LLM interaction
  lastAccessedAt: number;   // Last any access
  completedAt?: number;     // When completed if applicable
  
  // Usage Statistics
  totalTurns: number;       // Total conversation turns
  totalTokens: {            // Aggregate token usage
    input: number;
    output: number;
  };
  
  // Context Source
  source: SessionSource;
  channelId?: string;         // Associated channel (discord, etc.)
  
  // Session Configuration
  config?: SessionConfig;
  
  // Extension Metadata (flexible storage)
  metadata?: Record<string, unknown>;
}

/**
 * Session configuration options
 */
export interface SessionConfig {
  model?: string;           // LLM model preference
  thinkingLevel?: "fast" | "normal" | "deep";
  permissionProfile?: string;
  timeoutSeconds?: number;
  maxTurns?: number;        // Auto-complete after N turns
  autoCompact?: boolean;    // Enable automatic context pruning
}

// ============================================================================
// Session Hierarchy (Subagents, Forks)
// ============================================================================

/**
 * Tracks parent-child relationships between sessions
 * Enables tree navigation like OpenClaw's spawn tracking
 */
export interface SessionHierarchy {
  sessionId: string;                    // This session
  parentSessionId?: string;           // Parent (null for root sessions)
  rootSessionId?: string;             // Top-most ancestor (optimization)
  spawnDepth: number;                 // 0 = root, 1 = first child, etc.
  
  // Spawn Context
  spawnedBy?: string;                 // Tool/agent that initiated spawn
  spawnReason?: string;               // Why this session was created
  spawnMethod?: "manual" | "auto" | "cron" | "heartbeat" | "api";
  spawnedAt: number;
  
  // Relationship Status
  isFork: boolean;                    // True if forked from transcript
  forkedFromParent?: boolean;         // OpenClaw compatibility
}

// ============================================================================
// Session Snapshots (Restore Points)
// ============================================================================

/**
 * Complete session state for restore/resume
 * Captures full context at a point in time
 */
export interface SessionSnapshot {
  id: string;                         // Snapshot ID
  sessionId: string;                  // Parent session
  
  // Snapshot Metadata
  timestamp: number;
  type: "auto" | "manual" | "pre_spawn" | "post_completion" | "checkpoint" | "migration";
  triggeredBy?: string;               // What caused the snapshot
  
  // Serialized State
  conversationHistory: Message[];     // Full conversation
  contextWindow?: {                   // Current context state
    tokensUsed: number;
    tokenLimit: number;
    compressionRatio?: number;
  };
  
  // Subsystem States
  tasks?: TaskState[];
  channels?: ChannelState[];
  agents?: AgentState[];
  
  // Memory State
  workingMemory?: Record<string, unknown>;
  perennialRefs?: string[];         // References to perennial memories
  
  // Additional metadata
  metadata?: Record<string, unknown>;
  expiresAt?: number;                 // Snapshot expiration timestamp
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface TaskState {
  id: string;
  title: string;
  status: string;
  priority: string;
}

export interface ChannelState {
  channelId: string;
  type: string;
  lastMessageAt?: number;
  unreadCount?: number;
}

export interface AgentState {
  id: string;
  type: AgentType;
  status: AgentStatus;
  task?: string;
  parentId?: string;
}

// ============================================================================
// Cross-Subsystem References
// ============================================================================

/**
 * Unified foreign key references
 * All subsystems store these to link back to unified session
 */
export interface SessionRef {
  sessionId: string;        // Unified session ID (stable)
  piSessionId?: string;     // Legacy pi-coding-agent ID
  hierarchyId?: string;     // Hierarchy entry if child session
}

/**
 * Session summary for listing/display
 */
export interface SessionSummary {
  id: string;
  state: SessionState;
  source: SessionSource;
  cwd: string;
  createdAt: number;
  lastActivityAt: number;
  totalTurns: number;
  hasChildren: boolean;
  depth: number;
}

// ============================================================================
// Session Events
// ============================================================================

export type SessionEventType = 
  | "created"
  | "activated" 
  | "suspended"
  | "resumed"
  | "completed"
  | "forked"
  | "error"
  | "checkpoint"
  | "migrated";

export interface SessionEvent {
  id: string;
  sessionId: string;
  type: SessionEventType;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Query Filters
// ============================================================================

export interface SessionFilter {
  state?: SessionState | SessionState[];
  source?: SessionSource | SessionSource[];
  mode?: SessionMode;
  workspaceType?: WorkspaceType;
  deviceId?: string;
  userId?: string;
  activeSince?: number;     // Sessions active since timestamp
  inactiveFor?: number;     // Inactive for N milliseconds
  hasChildren?: boolean;
  searchCwd?: string;       // Search working directory
}

export interface SnapshotFilter {
  sessionId?: string;
  type?: SessionSnapshot["type"];
  since?: number;
  until?: number;
}

// ============================================================================
// Migration Types
// ============================================================================

export interface MigrationResult {
  migrated: number;
  orphaned: number;
  skipped: number;
  conflicts: number;
  errors: Array<{ item: string; error: string }>;
}

export interface LegacySessionData {
  // From old fragmented databases
  tasks?: { id: string; oldSessionId: string; data: unknown }[];
  channels?: { id: string; oldSessionId: string; data: unknown }[];
  agents?: { id: string; oldSessionKey: string; data: unknown }[];
  conversations?: { id: string; oldSessionId: string; data: unknown }[];
}

// ============================================================================
// OpenClaw Compatibility
// ============================================================================

/**
 * OpenClaw session format for migration
 */
export interface OpenClawSession {
  sessionKey: string;
  sessionFile?: string;
  spawnedBy?: string;
  spawnDepth?: number;
  chatType?: string;
  updatedAt: number;
  
  meta: {
    backend: string;
    agent: string;
    runtimeSessionName: string;
    mode: "persistent" | "oneshot";
    cwd?: string;
    state: "idle" | "running" | "error";
    lastActivityAt: number;
    lastError?: string;
  };
  
  identity?: {
    state: "pending" | "resolved";
    acpxRecordId?: string;
    acpxSessionId?: string;
    agentSessionId?: string;
  };
}

export type OpenClawToUnifiedMapping = {
  openclawKey: string;
  unifiedId: string;
  migrationStatus: "success" | "partial" | "failed";
  issues?: string[];
};
