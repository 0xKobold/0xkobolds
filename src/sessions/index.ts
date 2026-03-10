/**
 * Unified Sessions Module
 *
 * Single source of truth for session management across 0xKobold.
 * All subsystems reference unified sessions via stable IDs.
 */

// Core types
export type {
  UnifiedSession,
  SessionHierarchy,
  SessionSnapshot,
  SessionEvent,
  SessionFilter,
  SnapshotFilter,
  SessionSummary,
  SessionRef,
  SessionState,
  SessionMode,
  SessionSource,
  WorkspaceType,
  MigrationResult,
  LegacySessionData,
  OpenClawSession,
  OpenClawToUnifiedMapping,
} from "./types.js";

// Core implementation
export {
  SessionStore,
  generateStableSessionId,
  getDeviceId,
} from "./SessionStore.js";

// Manager
export {
  SessionManager,
  getSessionManager,
  setSessionManager,
  getCurrentUnifiedSessionId,
} from "./SessionManager.js";

// Migration
export { migrateToUnifiedSessions } from "./migration/index.js";

// Extension
export { default as UnifiedSessionBridge } from "./UnifiedSessionBridge.js";
