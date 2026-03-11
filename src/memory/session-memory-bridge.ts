/**
 * Session Memory Bridge (Phase 5)
 *
 * Links gateway sessions to memory systems:
 * - Generative Agents (memory stream)
 * - Perennial Memory (embeddings)
 * - User Profile (learning/preferences)
 */

import { eventBus } from "../event-bus";
import { SessionEntry, getSessionStore } from "./session-store";
import type { AgentRun } from "../agent/DraconicRunRegistry";

export interface SessionMemoryContext {
  sessionKey: string;
  memoryThreadId: string;
  userProfileId?: string;
  previousRuns: string[];
  conversationSummary?: string;
}

export interface MemoryEnrichedSession extends SessionEntry {
  recentMemories: Array<{
    content: string;
    type: "observation" | "thought" | "action";
    timestamp: number;
  }>;
  userPreferences: Record<string, unknown>;
  relevantContext: string;
}

class SessionMemoryBridge {
  private store = getSessionStore();

  /**
   * Get or create a memory context for a session
   */
  async getMemoryContext(sessionKey: string): Promise<SessionMemoryContext> {
    let session = this.store.get(sessionKey);

    // Create new session if doesn't exist
    if (!session) {
      session = this.createSession(sessionKey);
    }

    // Ensure memory thread exists
    if (!session.memoryThreadId) {
      session.memoryThreadId = this.generateMemoryThreadId();
      this.store.set(sessionKey, session);
    }

    // Get previous runs from this session
    const previousRuns = await this.getPreviousRuns(session);

    return {
      sessionKey,
      memoryThreadId: session.memoryThreadId,
      userProfileId: session.userProfileId,
      previousRuns,
      conversationSummary: session.conversationSummary,
    };
  }

  /**
   * Link a gateway session to an agent run
   */
  async linkRunToSession(sessionKey: string, runId: string): Promise<void> {
    const session = this.store.get(sessionKey);
    if (!session) return;

    session.lastRunId = runId;
    session.updatedAt = Date.now();
    session.messageCount++;

    this.store.set(sessionKey, session);

    // Emit event for memory systems to track
    eventBus.emit("session.run.linked", {
      sessionKey,
      runId,
      memoryThreadId: session.memoryThreadId,
    });
  }

  /**
   * Get memory-enriched context for an agent
   */
  async getEnrichedSession(sessionKey: string): Promise<MemoryEnrichedSession | undefined> {
    const session = this.store.get(sessionKey);
    if (!session) return undefined;

    // Load recent memories from generative agents
    const recentMemories = await this.loadRecentMemories(session.memoryThreadId);

    // Load user preferences
    const userPreferences = await this.loadUserPreferences(session.userProfileId);

    // Generate relevant context
    const relevantContext = await this.generateContext(session, recentMemories);

    return {
      ...session,
      recentMemories,
      userPreferences,
      relevantContext,
    };
  }

  /**
   * Update conversation summary (compaction)
   */
  async updateSummary(sessionKey: string, summary: string): Promise<void> {
    const session = this.store.get(sessionKey);
    if (!session) return;

    session.conversationSummary = summary;
    session.updatedAt = Date.now();
    this.store.set(sessionKey, session);
  }

  /**
   * Associate user profile with session
   */
  async setUserProfile(sessionKey: string, userProfileId: string): Promise<void> {
    const session = this.store.get(sessionKey);
    if (!session) return;

    session.userProfileId = userProfileId;
    session.updatedAt = Date.now();
    this.store.set(sessionKey, session);
  }

  /**
   * Get all active sessions with memory context
   */
  async getActiveMemorySessions(): Promise<SessionMemoryContext[]> {
    const sessions = this.store.getActiveSessions();
    
    return Promise.all(
      sessions.map(async (session) => ({
        sessionKey: session.sessionKey,
        memoryThreadId: session.memoryThreadId || this.generateMemoryThreadId(),
        userProfileId: session.userProfileId,
        previousRuns: await this.getPreviousRuns(session),
        conversationSummary: session.conversationSummary,
      })),
    );
  }

  /**
   * Resume a session from a memory thread ID
   */
  async resumeFromMemoryThread(threadId: string): Promise<SessionMemoryContext | undefined> {
    const session = this.store.getByMemoryThread(threadId);
    if (!session) return undefined;

    return {
      sessionKey: session.sessionKey,
      memoryThreadId: threadId,
      userProfileId: session.userProfileId,
      previousRuns: await this.getPreviousRuns(session),
      conversationSummary: session.conversationSummary,
    };
  }

  // Private helpers
  private createSession(sessionKey: string): SessionEntry {
    const now = Date.now();
    const session: SessionEntry = {
      sessionId: `sess_${now}_${Math.random().toString(36).slice(2, 6)}`,
      sessionKey,
      createdAt: now,
      updatedAt: now,
      memoryThreadId: this.generateMemoryThreadId(),
      messageCount: 0,
    };
    this.store.set(sessionKey, session);
    return session;
  }

  private generateMemoryThreadId(): string {
    return `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private async getPreviousRuns(session: SessionEntry): Promise<string[]> {
    // This would query the agent registry for runs associated with this session
    // For now, return empty or last run
    return session.lastRunId ? [session.lastRunId] : [];
  }

  private async loadRecentMemories(threadId: string | undefined): Promise<MemoryEnrichedSession["recentMemories"]> {
    if (!threadId) return [];

    // TODO: Query generative agents memory_stream table
    // For now, return empty
    return [];
  }

  private async loadUserPreferences(userProfileId: string | undefined): Promise<Record<string, unknown>> {
    if (!userProfileId) return {};

    // TODO: Load from user-profile.ts
    return {};
  }

  private async generateContext(
    session: SessionEntry,
    memories: Array<{ content: string; type: string; timestamp: number }>,
  ): Promise<string> {
    const parts: string[] = [];

    if (session.conversationSummary) {
      parts.push(`Previous context: ${session.conversationSummary}`);
    }

    if (memories.length > 0) {
      const recent = memories.slice(-5).map((m) => m.content).join("\n");
      parts.push(`Recent activity:\n${recent}`);
    }

    return parts.join("\n\n");
  }
}

// Singleton
const bridge = new SessionMemoryBridge();

export function getSessionMemoryBridge(): SessionMemoryBridge {
  return bridge;
}

// Re-export types
export type { SessionMemoryBridge };
