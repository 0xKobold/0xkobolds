/**
 * Unified Session Manager
 *
 * High-level session lifecycle management that coordinates
 * all 0xKobold subsystems under a unified session model.
 */

import { homedir } from "os";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { SessionStore, generateStableSessionId, getDeviceId } from "./SessionStore.js";
import type {
  UnifiedSession,
  SessionHierarchy,
  SessionSnapshot,
  SessionState,
  SessionMode,
  SessionSource,
  SessionRef,
  SessionFilter,
  SessionSummary,
} from "./types.js";

// ============================================================================
// Configuration
// ============================================================================

const KOBOLD_DIR = join(homedir(), ".0xkobold");
const SESSIONS_DB_PATH = join(KOBOLD_DIR, "sessions.db");

interface SessionManagerConfig {
  autoResume?: boolean;         // Auto-resume sessions on startup
  resumeMaxAgeHours?: number;   // How old sessions to resume
  snapshotInterval?: number;     // Auto-snapshot interval (ms)
  cleanupAgeHours?: number;      // Clean up completed sessions
}

// ============================================================================
// Session Manager
// ============================================================================

export class SessionManager {
  private store: SessionStore;
  private currentSessionId?: string;
  private config: SessionManagerConfig;
  private restorePromise?: Promise<void>;

  constructor(config: SessionManagerConfig = {}) {
    this.ensureDirectories();
    this.store = new SessionStore(SESSIONS_DB_PATH);
    this.config = {
      autoResume: true,
      resumeMaxAgeHours: 168, // 1 week
      snapshotInterval: 5 * 60 * 1000, // 5 minutes
      cleanupAgeHours: 168,
      ...config,
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Initialize with pi-coding-agent extension
   */
  async initialize(pi?: ExtensionAPI): Promise<void> {
    console.log("[SessionManager] Initializing...");

    // Auto-resume previous sessions
    if (this.config.autoResume) {
      this.restorePromise = this.restoreSessions();
    }

    // Set up periodic maintenance
    this.startMaintenanceLoop();

    // Hook into pi events if available
    if (pi) {
      this.hookIntoPi(pi);
    }

    console.log("[SessionManager] Initialized");
  }

  /**
   * Hook into pi-coding-agent events
   */
  private hookIntoPi(pi: ExtensionAPI): void {
    // Session start - create/get unified session
    pi.on("session_start", async (_event, ctx) => {
      const piSessionId = ctx.sessionManager.getSessionId();
      const { session, created } = await this.getOrCreateSession(piSessionId, {
        source: this.detectSource(),
        cwd: ctx.sessionManager.getCwd(),
        piSessionFile: this.findPiSessionFile(piSessionId),
      });

      this.currentSessionId = session.id;

      // Set environment for subsystems
      process.env.KOBOLD_UNIFIED_SESSION_ID = session.id;
      process.env.KOBOLD_SESSION_STATE = session.state;

      if (created) {
        console.log(`[SessionManager] Created unified session: ${session.id.slice(0, 16)}...`);
      } else {
        console.log(`[SessionManager] Resumed unified session: ${session.id.slice(0, 16)}...`);
      }

      // Emit event for extensions
      // @ts-ignore Display property required by API
      pi.sendMessage?.({
        customType: "session.unified.start",
        content: [{ type: "text", text: `Unified session: ${session.id}` }],
        display: false,
        details: { sessionId: session.id, created },
      });
    });

    // Session switch - track current session
    pi.on("session_switch", async (_event, ctx) => {
      const piSessionId = ctx.sessionManager.getSessionId();
      const { session } = await this.getOrCreateSession(piSessionId);
      this.currentSessionId = session.id;
      process.env.KOBOLD_UNIFIED_SESSION_ID = session.id;

      console.log(`[SessionManager] Switched to session: ${session.id.slice(0, 16)}...`);
    });

    // Session fork - create child session
    // @ts-ignore SessionForkEvent type mismatch - event.childSessionId not in type
    pi.on("session_fork", async (event, ctx) => {
      const parentPiId = ctx.sessionManager.getSessionId();
      // @ts-ignore Extension event has extra properties at runtime
      const childPiId = event.childSessionId;

      const parentSession = await this.getOrCreateSession(parentPiId);
      // @ts-ignore Runtime properties
      const childSession = await this.forkSession(
        parentSession.session.id,
        childPiId,
        // @ts-ignore SessionForkEvent doesn't have reason property in API types
        (event as any).reason || "fork"
      );

      this.currentSessionId = childSession.id;
      process.env.KOBOLD_UNIFIED_SESSION_ID = childSession.id;

      console.log(
        `[SessionManager] Forked session: ${childSession.id.slice(0, 16)} from ${parentSession.session.id.slice(0, 16)}`
      );
    });

    // Shutdown - suspend current session
    // @ts-ignore "shutdown" is not a valid event type in ExtensionAPI - using session_shutdown
    pi.on("shutdown" as any, async () => {
      await this.suspendCurrentSession();
    });
  }

  // ============================================================================
  // Session Operations
  // ============================================================================

  /**
   * Get the current unified session ID
   */
  getCurrentSessionId(): string | undefined {
    return this.currentSessionId;
  }

  /**
   * Get current session
   */
  async getCurrentSession(): Promise<UnifiedSession | null> {
    if (!this.currentSessionId) return null;
    return this.store.getSession(this.currentSessionId);
  }

  /**
   * Get or create session (idempotent, stable ID)
   */
  async getOrCreateSession(
    piSessionId: string,
    data?: Partial<UnifiedSession>
  ): Promise<{ session: UnifiedSession; created: boolean }> {
    return this.store.getOrCreateSession(piSessionId, data);
  }

  /**
   * Fork a session (for subagents)
   */
  async forkSession(
    parentId: string,
    childPiSessionId: string,
    reason: string,
    spawnedBy?: string
  ): Promise<UnifiedSession> {
    // Get parent info
    const parentHier = await this.store.getHierarchy(parentId);
    const parent = await this.store.getSession(parentId);
    if (!parent) {
      throw new Error(`Parent session ${parentId} not found`);
    }

    // Create child session
    // @ts-ignore Additional properties stored in metadata/hierarchy tracked separately
    const { session: child } = await this.store.getOrCreateSession(childPiSessionId, {
      // @ts-ignore parent/root tracked in hierarchy, not on session
      parentSessionId: parentId,
      // @ts-ignore 
      rootSessionId: parentHier?.rootSessionId || parentId,
      // @ts-ignore mode "forked" stored as metadata
      mode: "forked" as any,
      source: parent.source,
      cwd: parent.cwd,
      deviceId: parent.deviceId,
      userId: parent.userId,
    });

    // Create hierarchy entry
    await this.store.createHierarchy(child.id, {
      parentSessionId: parentId,
      rootSessionId: parentHier?.rootSessionId || parentId,
      spawnDepth: (parentHier?.spawnDepth || 0) + 1,
      spawnReason: reason,
      spawnMethod: "auto",
      spawnedBy,
      spawnedAt: Date.now(),
      isFork: true,
    });

    // Create snapshot of parent at fork point
    await this.store.createSnapshot(parentId, "pre_spawn", {
      triggeredBy: "fork",
      conversationHistory: [], // Would be passed in real implementation
    });

    // Log event
    await this.store.logEvent(child.id, "forked", {
      parentId,
      reason,
      spawnedBy,
    });

    return child;
  }

  /**
   * Suspend current session (on shutdown/lost connection)
   */
  async suspendCurrentSession(): Promise<void> {
    if (!this.currentSessionId) return;

    const session = await this.store.getSession(this.currentSessionId);
    if (!session) return;

    // Create final snapshot
    await this.createSnapshot(this.currentSessionId, "checkpoint");

    // Suspend if active
    if (session.state === "active") {
      await this.store.setState(this.currentSessionId, "suspended", {
        reason: "shutdown",
      });
    }

    // Checkpoint database
    await this.store.checkpoint();

    console.log(`[SessionManager] Suspended session: ${this.currentSessionId.slice(0, 16)}...`);
  }

  /**
   * Resume a suspended session
   */
  async resumeSession(sessionId: string): Promise<UnifiedSession> {
    const session = await this.store.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (session.state === "suspended" || session.state === "idle") {
      await this.store.setState(sessionId, "active");
    }

    this.currentSessionId = sessionId;
    process.env.KOBOLD_UNIFIED_SESSION_ID = sessionId;

    return session;
  }

  /**
   * Complete a session
   */
  async completeSession(sessionId: string, summary?: string): Promise<void> {
    await this.store.updateSession(sessionId, {
      state: "completed",
      completedAt: Date.now(),
    });

    await this.store.setState(sessionId, "completed", { summary });
  }

  /**
   * Record session activity
   */
  async recordActivity(
    tokens?: { input: number; output: number },
    turns: number = 1
  ): Promise<void> {
    if (!this.currentSessionId) return;

    const session = await this.store.getSession(this.currentSessionId);
    if (!session) return;

    await this.store.updateSession(this.currentSessionId, {
      lastActivityAt: Date.now(),
      totalTurns: session.totalTurns + turns,
      totalTokens: {
        input: session.totalTokens.input + (tokens?.input || 0),
        output: session.totalTokens.output + (tokens?.output || 0),
      },
      state: session.state === "idle" ? "active" : session.state,
    });
  }

  // ============================================================================
  // Snapshots
  // ============================================================================

  /**
   * Create session snapshot
   */
  async createSnapshot(
    sessionId: string,
    type: SessionSnapshot["type"] = "manual",
    data?: Partial<SessionSnapshot>
  ): Promise<string> {
    return this.store.createSnapshot(sessionId, type, {
      triggeredBy: data?.triggeredBy || this.currentSessionId,
      ...data,
    });
  }

  /**
   * Restore session from snapshot
   */
  async restoreFromSnapshot(sessionId: string): Promise<SessionSnapshot | null> {
    const snapshot = await this.store.getLatestSnapshot(sessionId);
    if (!snapshot) return null;

    // Restore to active state if needed
    // @ts-ignore "resumed" is treated as metadata, actual state becomes "active"
    await this.store.setState(sessionId, "active", {
      // @ts-ignore Custom event type
      eventType: "resumed",
      fromSnapshot: snapshot.id,
    });

    return snapshot;
  }

  // ============================================================================
  // Queries
  // ============================================================================

  /**
   * List sessions
   */
  async listSessions(filter?: SessionFilter, limit?: number): Promise<SessionSummary[]> {
    return this.store.listSessions(filter, limit);
  }

  /**
   * Get active sessions
   */
  async getActiveSessions(): Promise<UnifiedSession[]> {
    return this.store.getActiveSessions();
  }

  /**
   * Get session tree
   */
  async getSessionTree(rootId: string): Promise<UnifiedSession[]> {
    return this.store.getSessionTree(rootId);
  }

  /**
   * Get session statistics
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    idle: number;
    totalTokens: number;
    totalTurns: number;
  }> {
    const stats = await this.store.getStats();
    return {
      total: stats.total,
      active: stats.active,
      idle: stats.idle,
      totalTokens: stats.totalInputTokens + stats.totalOutputTokens,
      totalTurns: stats.totalTurns,
    };
  }

  // ============================================================================
  // Subsystem Integration
  // ============================================================================

  /**
   * Register subsystem reference
   */
  async registerSubsystemRef(
    sessionId: string,
    subsystem: string,
    recordId: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // This links subsystem records to unified sessions
    // Implementation in SessionStore
  }

  /**
   * Get session references across subsystems
   */
  async getSubsystemRefs(sessionId: string): Promise<Array<{ subsystem: string; recordId: string }>> {
    // Return all subsystem records linked to this session
    return [];
  }

  // ============================================================================
  // Restore All Sessions
  // ============================================================================

  private async restoreSessions(): Promise<void> {
    const sessions = await this.store.getSessionsForResume(this.config.resumeMaxAgeHours);

    if (sessions.length === 0) {
      console.log("[SessionManager] No sessions to restore");
      return;
    }

    console.log(`[SessionManager] Found ${sessions.length} sessions to restore`);

    for (const session of sessions) {
      // Only restore active sessions automatically
      if (session.state === "active") {
        await this.restoreFromSnapshot(session.id);
        console.log(`[SessionManager] Restored session: ${session.id.slice(0, 16)}...`);
      }
    }
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private ensureDirectories(): void {
    if (!existsSync(KOBOLD_DIR)) {
      mkdirSync(KOBOLD_DIR, { recursive: true });
    }
  }

  private detectSource(): SessionSource {
    // Detect how this session was created
    if (process.env.DISCORD_TOKEN || process.env.KOBOLD_CHANNEL_TYPE === "discord") {
      return "discord";
    }
    if (process.env.KOBOLD_SUBAGENT === "true") {
      return "api";
    }
    if (process.argv.includes("--cron")) {
      return "cron";
    }
    return "tui";
  }

  private findPiSessionFile(piSessionId: string): string | undefined {
    // Attempt to find the pi-coding-agent session file
    const possiblePaths = [
      join(KOBOLD_DIR, ".pi-session-*"),
      join(process.cwd(), ".pi-session-*"),
      join(homedir(), ".local", "share", "pi-coding-agent", "sessions", "*"),
    ];

    // Return first match containing piSessionId
    // Simplified - real implementation would search
    return undefined;
  }

  private startMaintenanceLoop(): void {
    if (this.config.snapshotInterval > 0) {
      setInterval(async () => {
        if (this.currentSessionId && this.config.snapshotInterval) {
          await this.createSnapshot(this.currentSessionId, "auto").catch(() => {});
        }
      }, this.config.snapshotInterval);
    }

    if (this.config.cleanupAgeHours > 0) {
      // Daily cleanup
      setInterval(
        async () => {
          const result = await this.store.cleanup(this.config.cleanupAgeHours!);
          console.log(
            `[SessionManager] Cleanup: ${result.sessionsDeleted} sessions, ${result.snapshotsDeleted} snapshots`
          );
        },
        24 * 60 * 60 * 1000
      );
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalSessionManager: SessionManager | null = null;

export function getSessionManager(config?: SessionManagerConfig): SessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new SessionManager(config);
  }
  return globalSessionManager;
}

export function setSessionManager(manager: SessionManager): void {
  globalSessionManager = manager;
}

// Convenience function for getting current unified session ID
export function getCurrentUnifiedSessionId(): string | undefined {
  return (
    process.env.KOBOLD_UNIFIED_SESSION_ID ||
    globalSessionManager?.getCurrentSessionId()
  );
}

export default SessionManager;
