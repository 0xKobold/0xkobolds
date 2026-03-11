/**
 * Session Resume System
 * 
 * Allows searching and resuming previous sessions.
 * Auto-saves sessions on shutdown.
 * Suggests relevant past sessions on startup.
 */

import { eventBus } from "../event-bus";
import { getSessionStore, SessionEntry } from "./session-store";
import { getSessionMemoryBridge } from "./session-memory-bridge";

interface SessionSearchResult {
  sessionKey: string;
  memoryThreadId: string;
  lastActive: string;
  messageCount: number;
  summary?: string;
  relevanceScore: number;
  preview: string;
}

interface ResumeSuggestion {
  sessionKey: string;
  reason: string;
  lastMessage: string;
  timeAgo: string;
}

class SessionResumeSystem {
  private store = getSessionStore();
  private bridge = getSessionMemoryBridge();
  private currentSessionKey?: string;
  private shutdownInProgress = false;

  constructor() {
    console.log("[SessionResume] Initializing...");
    this.setupShutdownHandlers();
    this.setupEventListeners();
  }

  /**
   * Setup graceful shutdown handlers
   */
  private setupShutdownHandlers() {
    // Ctrl+C (SIGINT)
    process.on("SIGINT", async () => {
      console.log("\n[SIGINT] Graceful shutdown...");
      await this.performGracefulShutdown();
      process.exit(0);
    });

    // SIGTERM (Docker kill, etc)
    process.on("SIGTERM", async () => {
      console.log("\n[SIGTERM] Graceful shutdown...");
      await this.performGracefulShutdown();
      process.exit(0);
    });

    // Before exit (last resort)
    process.on("exit", (code) => {
      if (!this.shutdownInProgress && this.currentSessionKey) {
        console.log("[SessionResume] Emergency save on exit...");
        // Synchronous fallback - can't use async here
        try {
          const fs = require("fs");
          const path = require("path");
          const os = require("os");
          const dumpPath = path.join(os.homedir(), ".0xkobold", "emergency-sessions.json");
          const sessions = this.store.list().map(k => ({ key: k, saved: Date.now() }));
          fs.writeFileSync(dumpPath, JSON.stringify(sessions, null, 2));
        } catch {}
      }
    });
  }

  /**
   * Graceful shutdown - save current session
   */
  private async performGracefulShutdown() {
    if (this.shutdownInProgress) return;
    this.shutdownInProgress = true;

    try {
      if (this.currentSessionKey) {
        console.log(`[SessionResume] Saving session ${this.currentSessionKey.slice(0, 8)}...`);
        await this.saveSessionToPerennial(this.currentSessionKey, "shutdown");
      }

      // Also save all active sessions
      const activeSessions = this.store.getActiveSessions();
      for (const session of activeSessions) {
        if (session.messageCount > 0) {
          await this.saveSessionToPerennial(session.sessionKey, "shutdown-batch");
        }
      }

      console.log(`[SessionResume] Saved ${activeSessions.length} active sessions`);
    } catch (err) {
      console.error("[SessionResume] Shutdown save failed:", err);
    }
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners() {
    // Track current session
    eventBus.on("gateway.session_connected", async (event) => {
      const { sessionKey } = event.payload as { sessionKey: string };
      this.currentSessionKey = sessionKey;
      console.log(`[SessionResume] Now tracking session: ${sessionKey.slice(0, 8)}`);
    });

    // When session disconnects
    eventBus.on("gateway.session_disconnected", async (event) => {
      const { sessionKey } = event.payload as { sessionKey: string };
      if (this.currentSessionKey === sessionKey) {
        await this.saveSessionToPerennial(sessionKey, "disconnect");
        this.currentSessionKey = undefined;
      }
    });
  }

  /**
   * Save session summary to perennial memory
   */
  private async saveSessionToPerennial(sessionKey: string, reason: string): Promise<void> {
    const session = this.store.get(sessionKey);
    if (!session || session.messageCount === 0) return;

    const enriched = await this.bridge.getEnrichedSession(sessionKey);
    if (!enriched) return;

    // Build summary
    const summary = enriched.conversationSummary || `Session with ${session.messageCount} messages`;
    const content = `[Session ${reason}] ${sessionKey.slice(0, 8)}: ${summary}`;

    // Emit to perennial
    eventBus.emit("perennial.save", {
      content,
      category: "context",
      tags: ["session-summary", `reason-${reason}`, `thread-${session.memoryThreadId}`],
      importance: Math.min(0.9, 0.5 + session.messageCount * 0.01),
      project: "0xKobold",
    });

    // Also save thread summary
    eventBus.emit("perennial.save", {
      content: `Conversation thread ${session.memoryThreadId}: ${summary}`,
      category: "context",
      tags: ["conversation-thread", `session-${sessionKey.slice(0, 8)}`],
      importance: 0.7,
      project: "0xKobold",
    });

    console.log(`[SessionResume] Saved session ${sessionKey.slice(0, 8)} (${session.messageCount} msgs)`);
  }

  /**
   * Search through all sessions
   */
  async searchSessions(query: string, options: {
    limit?: number;
    includeInactive?: boolean;
  } = {}): Promise<SessionSearchResult[]> {
    const { limit = 10, includeInactive = true } = options;
    
    // Get all sessions
    const allSessions = includeInactive 
      ? this.store.list().map(k => this.store.get(k)).filter(Boolean) as SessionEntry[]
      : this.store.getActiveSessions();

    // Score each session
    const scored = await Promise.all(
      allSessions.map(async (session) => {
        const enriched = await this.bridge.getEnrichedSession(session.sessionKey);
        
        // Calculate relevance
        const searchText = [
          session.conversationSummary,
          enriched?.conversationSummary,
          ...enriched?.recentMemories.map(m => m.content) || [],
        ].join(" ");

        const relevanceScore = this.calculateRelevance(searchText, query);
        
        return {
          sessionKey: session.sessionKey,
          memoryThreadId: session.memoryThreadId || "unknown",
          lastActive: new Date(session.updatedAt).toISOString(),
          messageCount: session.messageCount,
          summary: session.conversationSummary,
          relevanceScore,
          preview: searchText.slice(0, 200) + "...",
        };
      })
    );

    // Sort by relevance and return top
    return scored
      .filter(s => s.relevanceScore > 0.1)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, limit);
  }

  /**
   * Get resume suggestions for new session
   */
  async getResumeSuggestions(currentContext?: string): Promise<ResumeSuggestion[]> {
    // Get recent active sessions (not current)
    const activeSessions = this.store.getActiveSessions()
      .filter(s => s.sessionKey !== this.currentSessionKey)
      .filter(s => s.messageCount > 0)
      .slice(0, 5);

    const suggestions: ResumeSuggestion[] = [];

    for (const session of activeSessions) {
      const enriched = await this.bridge.getEnrichedSession(session.sessionKey);
      const lastMessage = session.conversationSummary?.split("\n").pop() || "Previous conversation";
      const timeAgo = this.formatTimeAgo(session.updatedAt);
      
      let reason = `Last active ${timeAgo}`;
      if (currentContext && enriched?.conversationSummary) {
        const relevance = this.calculateRelevance(enriched.conversationSummary, currentContext);
        if (relevance > 0.3) {
          reason = `Related to current topic (${Math.round(relevance * 100)}% match)`;
        }
      }

      suggestions.push({
        sessionKey: session.sessionKey,
        reason,
        lastMessage: lastMessage.slice(0, 100),
        timeAgo,
      });
    }

    return suggestions;
  }

  /**
   * Resume a session by key or thread ID
   */
  async resumeSession(identifier: string): Promise<{
    success: boolean;
    sessionKey?: string;
    context?: string;
    error?: string;
  }> {
    // Try as session key first
    let session = this.store.get(identifier);
    
    // Try as memory thread ID
    if (!session) {
      session = this.store.getByMemoryThread(identifier);
    }

    // Try partial match
    if (!session) {
      const all = this.store.list();
      const partial = all.find(k => k.includes(identifier) || identifier.includes(k));
      if (partial) {
        session = this.store.get(partial);
      }
    }

    if (!session) {
      return { success: false, error: "Session not found" };
    }

    // Get full context
    const context = await this.bridge.getMemoryContext(session.sessionKey);
    const enriched = await this.bridge.getEnrichedSession(session.sessionKey);

    // Build resume context
    const resumeContext = [
      `Resuming session ${session.sessionKey.slice(0, 8)}...`,
      enriched?.conversationSummary ? `Previous: ${enriched.conversationSummary.slice(0, 500)}` : null,
      enriched?.recentMemories?.length ? 
        `Recent memories:\n${enriched.recentMemories.slice(-5).map(m => `- ${m.content.slice(0, 80)}`).join("\n")}` : null,
    ].filter(Boolean).join("\n\n");

    return {
      success: true,
      sessionKey: session.sessionKey,
      context: resumeContext,
    };
  }

  /**
   * Get current session stats
   */
  getCurrentSessionStats(): {
    activeSessions: number;
    currentSession?: string;
    totalMessages: number;
  } {
    const active = this.store.getActiveSessions();
    return {
      activeSessions: active.length,
      currentSession: this.currentSessionKey?.slice(0, 8),
      totalMessages: active.reduce((sum, s) => sum + s.messageCount, 0),
    };
  }

  // Private helpers
  private calculateRelevance(text: string, query: string): number {
    const textWords = new Set(text.toLowerCase().split(/\s+/));
    const queryWords = new Set(query.toLowerCase().split(/\s+/));
    const intersection = [...queryWords].filter(w => textWords.has(w));
    return intersection.length / Math.max(queryWords.size, 1);
  }

  private formatTimeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }
}

// Singleton
const resumeSystem = new SessionResumeSystem();

export function getSessionResumeSystem(): SessionResumeSystem {
  return resumeSystem;
}

export type { SessionSearchResult, ResumeSuggestion };
