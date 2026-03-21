/**
 * 0xKobold Memory Architecture
 * 
 * Complete 3-phase implementation based on Rohit's article:
 * - Phase 1: Smart Write Rules + Memory Audit
 * - Phase 2: Three-Tier Memory + Decay Jobs
 * - Phase 3: Conflict Detection + Knowledge Graph + Checkpoints
 * 
 * Usage:
 *   import { TieredMemory, MemoryDecay, ConflictDetector, ContextGraph, CheckpointManager } from "./memory";
 */

// Phase 1: Smart Write Rules
export {
  analyzeMemoryWorthiness,
  shouldStore,
  explainDecision,
  type MemoryWorthiness,
  type WriteRuleConfig,
} from "./smart-write-rules.js";

// Phase 2: Three-Tier Memory
export {
  TieredMemory,
  DEFAULT_CONFIG as TIERED_MEMORY_CONFIG,
  type TieredMemoryConfig,
} from "./tiered-memory.js";

// Phase 2: Memory Decay
export {
  MemoryDecay,
  DEFAULT_DECAY_CONFIG,
  type DecayConfig,
} from "./memory-decay.js";

// Phase 3: Conflict Detection
export {
  ConflictDetector,
  DEFAULT_CONFLICT_CONFIG,
  type ConflictConfig,
} from "./conflict-detector.js";

// Phase 3: Knowledge Graph
export {
  ContextGraph,
  DEFAULT_GRAPH_CONFIG as GRAPH_CONFIG,
  type GraphConfig,
  type GraphNode,
  type GraphEdge,
} from "./context-graph.js";

// Phase 3: Checkpoints
export {
  CheckpointManager,
  DEFAULT_CHECKPOINT_CONFIG,
  type Checkpoint,
  type CheckpointConfig,
} from "./checkpoint-manager.js";

// Shared types
export type {
  MemoryEntry,
  MemoryResource,
  MemoryItem,
  MemoryCategory,
  MemoryCheckpoint,
  MemoryConflict,
  MemoryAudit,
} from "./types.js";

// Version
export const MEMORY_VERSION = "1.0.0";
export const MEMORY_PHASE = "Complete (Phases 1-3)";

// Session Search with FTS5 (Hermes-style)
export {
  sessionSearchFts,
  initFtsTables,
  indexSessionContent,
  searchSessions,
  searchWithLineageContext,
  getSessionLineage,
  getSessionChildren,
  registerSessionLineage,
  markSessionCompressed,
  autoTitleSession,
  getSessionSummaryPrompt,
  type SearchResult,
  type SessionLineage,
  type SearchOptions,
} from "./session-search-fts.js";