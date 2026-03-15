/**
 * Memory Integration (Phase 5)
 * 
 * Bridges Session Memory Bridge ↔ Perennial Memory ↔ Generative Agents
 * 
 * - Saves thread summaries to perennial
 * - Loads relevant perennial memories into thread context
 * - Triggers generative reflections on big sessions
 * - Auto-recap before new session messages
 */

import { eventBus } from "../event-bus";
import { getSessionMemoryBridge, SessionMemoryContext } from "./session-memory-bridge";
import { getSessionStore } from "./session-store";

// Types
interface MemoryIntegrationConfig {
  // Auto-save thread to perennial after N messages
  autoSaveThreshold: number;
  
  // Load N relevant memories into context
  contextMemoryLimit: number;
  
  // Trigger generative reflection after N observations
  observationReflectionThreshold: number;
}

const DEFAULT_CONFIG: MemoryIntegrationConfig = {
  autoSaveThreshold: 10,
  contextMemoryLimit: 5,
  observationReflectionThreshold: 20,
};

class MemoryIntegration {
  private config = DEFAULT_CONFIG;
  // Track observation counts per session (generative agents uses this for reflections)
  private observationCounts = new Map<string, number>();

  constructor() {
    console.log("[MemoryIntegration] Initializing...");
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // When session connects via gateway
    eventBus.on("gateway.session_connected", async (event) => {
      const { sessionKey } = event.payload as { sessionKey: string };
      await this.enrichSessionWithPerennial(sessionKey);
    });

    // When agent completes a run in gateway session
    eventBus.on("session.run.completed", async (event) => {
      const { sessionKey, runId, result } = event.payload as { sessionKey: string; runId: string; result: string };
      await this.processRunCompletion(sessionKey, runId, result);
    });

    // When generative agent observes
    eventBus.on("learning.observation", async (event) => {
      const { agentId, content, sessionId } = event.payload as { agentId: string; content: string; sessionId?: string };
      if (sessionId) {
        await this.trackObservation(sessionId, agentId, content);
      }
    });

    // When generative recap triggers
    eventBus.on("learning.recap", async (event) => {
      const { agentId, summary, memories } = event.payload as { agentId: string; summary: string; memories: Array<{ content: string; type: string }> };
      await this.processGenerativeRecap(agentId, summary, memories);
    });
  }

  /**
   * 1. ENRICH: Load relevant perennial memories into session context
   */
  async enrichSessionWithPerennial(sessionKey: string): Promise<void> {
    console.log(`[MemoryIntegration] Enriching session ${sessionKey.slice(0, 8)}...`);

    try {
      // Get session context
      const bridge = getSessionMemoryBridge();
      const session = await bridge.getEnrichedSession(sessionKey);
      
      if (!session) return;

      // Try to search perennial for relevant memories
      // This would need perennial memory API - let's emit an event
      const query = session.conversationSummary || "current work context";

      // Event for perennial to pick up
      eventBus.emit("perennial.query_for_session", {
        sessionKey,
        query,
        limit: this.config.contextMemoryLimit,
      });
    } catch (err) {
      console.warn("[MemoryIntegration] Failed to enrich session:", err);
    }
  }

  /**
   * 2. SAVE: When session accumulates messages, save to perennial
   */
  async processRunCompletion(
    sessionKey: string,
    _runId: string,
    result?: string
  ): Promise<void> {
    try {
      const bridge = getSessionMemoryBridge();
      const session = await bridge.getEnrichedSession(sessionKey);
      
      if (!session) return;

      // Check if we should auto-save
      if (session.messageCount >= this.config.autoSaveThreshold) {
        // Emit event for perennial to save this thread
        eventBus.emit("perennial.save_session", {
          sessionKey,
          memoryThreadId: session.memoryThreadId,
          summary: session.conversationSummary,
          category: "context",
          tags: ["gateway-session", `thread-${session.memoryThreadId}`],
          importance: 0.7,
        });
      }

      // Also add generative observation
      if (result) {
        eventBus.emit("learning.observe_session", {
          sessionKey,
          content: `Session completed with ${result.slice(0, 100)}...
`,          type: "action",
        });
      }
    } catch (err) {
      console.warn("[MemoryIntegration] Failed to process run completion:", err);
    }
  }

  /**
   * 3. TRACK: Count observations for reflection triggering
   */
  async trackObservation(
    sessionId: string,
    agentId: string,
    content: string
  ): Promise<void> {
    const currentCount = this.observationCounts.get(sessionId) || 0;
    const newCount = currentCount + 1;
    this.observationCounts.set(sessionId, newCount);

    // Check if we should trigger reflection
    if (newCount >= this.config.observationReflectionThreshold && newCount % 20 === 0) {
      console.log(`[MemoryIntegration] Triggering reflection for ${sessionId.slice(0, 8)}...`);
      
      eventBus.emit("learning.trigger_reflection", {
        agentId,
        sessionId,
        observationCount: newCount,
      });
    }
  }

  /**
   * 4. RECAP: When generative agents generate insights, save to perennial
   */
  async processGenerativeRecap(
    agentId: string,
    summary: string,
    memories: Array<{ content: string; type: string }>
  ): Promise<void> {
    console.log(`[MemoryIntegration] Processing recap from ${agentId.slice(0, 8)}...`);

    // Save the reflection summary to perennial
    eventBus.emit("perennial.save", {
      content: `Reflection from ${agentId}: ${summary}`,
      category: "learning",
      tags: ["generative-reflection", `agent-${agentId}`],
      importance: 0.8,
    });

    // Also extract key observations and save
    const keyMemories = memories
      .filter(m => m.type === "observation" || m.type === "thought")
      .slice(0, 5);

    for (const mem of keyMemories) {
      eventBus.emit("perennial.save", {
        content: mem.content,
        category: "context",
        tags: ["generative-memory", `agent-${agentId}`, `type-${mem.type}`],
        importance: 0.6,
      });
    }
  }

  /**
   * 5. AUTO-RECAP: Get conversation summary before new messages
   */
  async getSessionRecap(sessionKey: string): Promise<string | undefined> {
    try {
      const bridge = getSessionMemoryBridge();
      const context = await bridge.getMemoryContext(sessionKey);
      
      if (!context) return undefined;

      // Try to get from generative agents
      const memories = await this.queryGenerativeMemories(context.memoryThreadId);
      
      if (memories.length > 0) {
        return `Previous conversation (${memories.length} memories):
${memories.map(m => `- ${m.content.slice(0, 80)}...`).join("\n")}`;
      }

      // Fall back to stored summary
      if (context.conversationSummary) {
        return `Summary: ${context.conversationSummary}`;
      }

      return undefined;
    } catch (err) {
      console.warn("[MemoryIntegration] Failed to get recap:", err);
      return undefined;
    }
  }

  /**
   * Query generative memory stream for this thread
   */
  private async queryGenerativeMemories(threadId: string): Promise<Array<{ content: string; type: string }>> {
    // This would query the generative agents database
    // For now, return empty and rely on event emission
    eventBus.emit("learning.query_thread", { threadId });
    return [];
  }

  /**
   * Get total observation count for a session
   */
  getObservationCount(sessionId: string): number {
    return this.observationCounts.get(sessionId) || 0;
  }

  /**
   * Reset observation count (e.g., when reflection completes)
   */
  resetObservationCount(sessionId: string): void {
    this.observationCounts.delete(sessionId);
  }
}

// Singleton
const integration = new MemoryIntegration();

export function getMemoryIntegration(): MemoryIntegration {
  return integration;
}

// Re-export
export type { MemoryIntegration, MemoryIntegrationConfig };
