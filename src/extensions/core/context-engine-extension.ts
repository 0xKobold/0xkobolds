/**
 * Context Engine Extension - v0.1.0
 *
 * Implements Koclaw-style context management plugin interface.
 * Provides lifecycle hooks for context management strategies.
 *
 * Reference: Koclaw PR #22201
 *
 * Features:
 * - Bootstrap: Initialize context at start
 * - Ingest: Process messages/tool results
 * - Assemble: Build prompt from context
 * - Compact: Compress when token limit hit
 * - AfterTurn: Post-processing
 * - Slot-based registry for different strategies
 *
 * Plugin Types:
 * - default: Standard context (no limits)
 * - sliding: Sliding window (keep last N tokens)
 * - summary: Summarize older context
 * - importance: Score and prune by importance
 */

import type { ExtensionAPI, ExtensionContext, AgentToolResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// ============================================================================
// TYPES
// ============================================================================

export interface ContextMessage {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  // Importance scoring (0-1, higher = more important)
  importance?: number;
}

export interface ContextState {
  messages: ContextMessage[];
  summary?: string; // Optional summary of earlier messages
  tokens: number;
  maxTokens: number;
  turn: number;
}

export interface AssembledContext {
  system: string;
  messages: ContextMessage[];
  tokenCount: number;
  strategy: string;
}

export interface CompactionResult {
  removed: ContextMessage[];
  summary?: string;
  newTokenCount: number;
}

export interface ContextEnginePlugin {
  name: string;
  version: string;
  /**
   * Initialize context at start
   */
  bootstrap(params: BootstrapParams): Promise<ContextState>;
  /**
   * Process incoming message
   */
  ingest(state: ContextState, message: ContextMessage): Promise<ContextState>;
  /**
   * Build final prompt context
   */
  assemble(state: ContextState, systemPrompt: string): Promise<AssembledContext>;
  /**
   * Compress context to target tokens
   */
  compact(state: ContextState, targetTokens: number): Promise<CompactionResult>;
  /**
   * Post-turn hook
   */
  afterTurn(state: ContextState): Promise<void>;
}

export interface BootstrapParams {
  maxTokens: number;
  systemPrompt: string;
  initialMessages?: ContextMessage[];
}

// ============================================================================
// PLUGIN IMPLEMENTATIONS
// ============================================================================

/**
 * Default Context Plugin - No limits, keeps everything
 */
class DefaultContextPlugin implements ContextEnginePlugin {
  name = "default";
  version = "0.1.0";

  async bootstrap(params: BootstrapParams): Promise<ContextState> {
    const systemMessage: ContextMessage = {
      id: `sys-${Date.now()}`,
      role: "system",
      content: params.systemPrompt,
      timestamp: new Date(),
      importance: 1.0, // System is always important
    };

    return {
      messages: [systemMessage, ...(params.initialMessages || [])],
      tokens: await estimateTokens(params.systemPrompt),
      maxTokens: params.maxTokens,
      turn: 0,
    };
  }

  async ingest(state: ContextState, message: ContextMessage): Promise<ContextState> {
    // Calculate importance for non-system messages
    if (message.role !== "system") {
      message.importance = calculateImportance(message);
    }

    const tokens = await estimateTokens(message.content);
    return {
      ...state,
      messages: [...state.messages, message],
      tokens: state.tokens + tokens,
      turn: state.turn + 1,
    };
  }

  async assemble(state: ContextState, systemPrompt: string): Promise<AssembledContext> {
    return {
      system: systemPrompt,
      messages: state.messages.filter((m) => m.role !== "system"),
      tokenCount: state.tokens,
      strategy: this.name,
    };
  }

  async compact(state: ContextState, targetTokens: number): Promise<CompactionResult> {
    // Default impl: just truncate oldest messages
    const removed: ContextMessage[] = [];
    let currentTokens = state.tokens;
    const keep = [...state.messages];

    while (currentTokens > targetTokens && keep.length > 1) {
      const removed_msg = keep[1]; // Keep system (index 0), remove next
      if (!removed_msg) break;

      const tokens = await estimateTokens(removed_msg.content);
      removed.push(removed_msg);
      keep.splice(1, 1);
      currentTokens -= tokens;
    }

    return {
      removed,
      newTokenCount: currentTokens,
    };
  }

  async afterTurn(state: ContextState): Promise<void> {
    // No-op for default
    console.log(`[ContextEngine] Turn ${state.turn} complete`);
  }
}

/**
 * Sliding Window Plugin - Keeps last N tokens
 */
class SlidingWindowPlugin implements ContextEnginePlugin {
  name = "sliding";
  version = "0.1.0";

  async bootstrap(params: BootstrapParams): Promise<ContextState> {
    return new DefaultContextPlugin().bootstrap(params);
  }

  async ingest(state: ContextState, message: ContextMessage): Promise<ContextState> {
    message.importance = calculateImportance(message);
    const tokens = await estimateTokens(message.content);

    let newState = {
      ...state,
      messages: [...state.messages, message],
      tokens: state.tokens + tokens,
      turn: state.turn + 1,
    };

    // Auto-compact if over limit (keep system + last N)
    if (newState.tokens > newState.maxTokens) {
      const result = await this.compact(newState, newState.maxTokens * 0.8); // Target 80%
      newState = {
        ...newState,
        messages: [newState.messages[0], ...newState.messages.filter((m) => !result.removed.includes(m))],
        tokens: result.newTokenCount,
      };
    }

    return newState;
  }

  async assemble(state: ContextState, systemPrompt: string): Promise<AssembledContext> {
    return {
      system: systemPrompt,
      messages: state.messages.slice(-20), // Last 20 messages
      tokenCount: state.tokens,
      strategy: this.name,
    };
  }

  async compact(state: ContextState, targetTokens: number): Promise<CompactionResult> {
    // Sliding window: keep system, remove oldest user messages
    const removed: ContextMessage[] = [];
    let currentTokens = state.tokens;
    const keep = [...state.messages];

    // Sort by importance (lowest first), then by timestamp
    const sorted = keep
      .slice(1) // Skip system
      .map((m, i) => ({ ...m, index: i + 1 }))
      .sort((a, b) => (a.importance || 0) - (b.importance || 0));

    for (const msg of sorted) {
      if (currentTokens <= targetTokens) break;

      const idx = keep.findIndex((m) => m.id === msg.id);
      if (idx > 0) {
        const tokens = await estimateTokens(msg.content);
        const [removedMsg] = keep.splice(idx, 1);
        if (removedMsg) {
          removed.push(removedMsg);
          currentTokens -= tokens;
        }
      }
    }

    return {
      removed,
      newTokenCount: currentTokens,
      summary: removed.length > 0 ? `Removed ${removed.length} older messages` : undefined,
    };
  }

  async afterTurn(state: ContextState): Promise<void> {
    console.log(`[ContextEngine] Sliding window: ${state.messages.length} messages, ${state.tokens} tokens`);
  }
}

/**
 * Importance-Based Plugin - Scores and prunes
 */
class ImportancePlugin implements ContextEnginePlugin {
  name = "importance";
  version = "0.1.0";

  async bootstrap(params: BootstrapParams): Promise<ContextState> {
    return new DefaultContextPlugin().bootstrap(params);
  }

  async ingest(state: ContextState, message: ContextMessage): Promise<ContextState> {
    // Higher importance calculation
    message.importance = calculateImportance(message) * 1.2;
    const tokens = await estimateTokens(message.content);

    return {
      ...state,
      messages: [...state.messages, message],
      tokens: state.tokens + tokens,
      turn: state.turn + 1,
    };
  }

  async assemble(state: ContextState, systemPrompt: string): Promise<AssembledContext> {
    // Sort by importance, take top messages within token budget
    const sorted = [...state.messages]
      .filter((m) => m.role !== "system")
      .sort((a, b) => (b.importance || 0) - (a.importance || 0));

    let tokenCount = await estimateTokens(systemPrompt);
    const messages: ContextMessage[] = [];

    for (const msg of sorted) {
      const tokens = await estimateTokens(msg.content);
      if (tokenCount + tokens < state.maxTokens * 0.9) {
        messages.push(msg);
        tokenCount += tokens;
      }
    }

    // Sort back by timestamp for conversation flow
    messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return {
      system: systemPrompt,
      messages,
      tokenCount,
      strategy: this.name,
    };
  }

  async compact(state: ContextState, targetTokens: number): Promise<CompactionResult> {
    const result = await new SlidingWindowPlugin().compact(state, targetTokens);
    result.summary = `Importance-based compaction: ${result.removed.length} low-importance messages removed`;
    return result;
  }

  async afterTurn(state: ContextState): Promise<void> {
    const avgImportance = state.messages.reduce((sum, m) => sum + (m.importance || 0), 0) / state.messages.length;
    console.log(`[ContextEngine] Importance: avg ${avgImportance.toFixed(2)}, ${state.messages.length} messages`);
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

async function estimateTokens(text: string): Promise<number> {
  // Simple approximation: ~4 chars per token (rough)
  return Math.ceil(text.length / 4);
}

function calculateImportance(message: ContextMessage): number {
  let score = 0.5; // Base

  // Tool results are important
  if (message.role === "tool") score += 0.3;

  // User questions are important
  if (message.role === "user") {
    score += 0.1;
    // Questions (end with ?) are more important
    if (message.content.includes("?")) score += 0.1;
    // Commands (start with /) are important
    if (message.content.startsWith("/")) score += 0.2;
  }

  // Assistant responses with code are important
  if (message.role === "assistant") {
    if (message.content.includes("```")) score += 0.15;
    if (message.content.includes("export ") || message.content.includes("interface ")) {
      score += 0.1;
    }
  }

  // Decay with age (older = less important)
  const age = Date.now() - message.timestamp.getTime();
  const hoursOld = age / (1000 * 60 * 60);
  score *= Math.max(0.3, 1 - hoursOld / 24); // Decay over 24 hours

  return Math.min(1.0, Math.max(0.1, score));
}

// ============================================================================
// REGISTRY
// ============================================================================

const plugins: Map<string, ContextEnginePlugin> = new Map();
let activePlugin: ContextEnginePlugin | null = null;
let currentState: ContextState | null = null;
let currentConfig: ContextConfig = {
  plugin: "default",
  maxTokens: 128000, // Default to Kimi K2.5 context
  systemPrompt: "You are a helpful AI assistant that writes clean, efficient code.",
};

interface ContextConfig {
  plugin: string;
  maxTokens: number;
  systemPrompt: string;
}

// Register built-in plugins
function registerBuiltinPlugins(): void {
  plugins.set("default", new DefaultContextPlugin());
  plugins.set("sliding", new SlidingWindowPlugin());
  plugins.set("importance", new ImportancePlugin());
  console.log("[ContextEngine] Built-in plugins registered:", Array.from(plugins.keys()).join(", "));
}

// ============================================================================
// EXTENSION API
// ============================================================================

export default async function contextEngineExtension(pi: ExtensionAPI) {
  console.log("[ContextEngine] Extension loading...");

  // Initialize
  registerBuiltinPlugins();

  // Register tools
  pi.registerTool({
    name: "context_engine",
    label: "/context",
    description: "Manage context engine: bootstrap, ingest, assemble, compact, switch plugins",
    // @ts-ignore TSchema mismatch
    // @ts-ignore TSchema mismatch
    parameters: Type.Object({
      operation: Type.String({
        description: "Operation: bootstrap, ingest, assemble, compact, switch, status",
      }),
      plugin: Type.Optional(Type.String({ description: "Plugin to switch to (for switch operation)" })),
      message: Type.Optional(Type.String({ description: "Message to ingest (for ingest operation)" })),
      targetTokens: Type.Optional(Type.Number({ description: "Target tokens for compaction" })),
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal,
      _onUpdate: any,
      _ctx: ExtensionContext
    ): Promise<AgentToolResult<any>> {
      const operation = params.operation as string;

      switch (operation) {
        case "bootstrap": {
          if (!activePlugin) {
            activePlugin = plugins.get(currentConfig.plugin) || plugins.get("default")!;
          }
          currentState = await activePlugin.bootstrap({
            maxTokens: currentConfig.maxTokens,
            systemPrompt: currentConfig.systemPrompt,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `✅ Context bootstrapped with '${currentConfig.plugin}' plugin. Max ${currentConfig.maxTokens.toLocaleString()} tokens.`,
              },
            ],
            details: { plugin: currentConfig.plugin, maxTokens: currentConfig.maxTokens },
          };
        }

        case "ingest": {
          if (!activePlugin || !currentState) {
            return {
              content: [{ type: "text" as const, text: "❌ Context not bootstrapped" }],
              details: { error: "not_bootstrapped" },
            };
          }
          const content = (params.message as string) || "";
          const message: ContextMessage = {
            id: `msg-${Date.now()}`,
            role: "user",
            content,
            timestamp: new Date(),
          };
          currentState = await activePlugin.ingest(currentState, message);
          return {
            content: [{ type: "text" as const, text: `✅ Ingested message` }],
            details: { tokens: currentState.tokens, messages: currentState.messages.length },
          };
        }

        case "assemble": {
          if (!activePlugin || !currentState) {
            return {
              content: [{ type: "text" as const, text: "❌ Context not bootstrapped" }],
              details: { error: "not_bootstrapped" },
            };
          }
          const assembled = await activePlugin.assemble(currentState, currentConfig.systemPrompt);
          return {
            content: [
              { type: "text" as const, text: `✅ Assembled context (${assembled.tokenCount} tokens, ${assembled.messages.length} messages)` },
            ],
            details: assembled,
          };
        }

        case "compact": {
          if (!activePlugin || !currentState) {
            return {
              content: [{ type: "text" as const, text: "❌ Context not bootstrapped" }],
              details: { error: "not_bootstrapped" },
            };
          }
          const target = (params.targetTokens as number) || currentState.maxTokens * 0.8;
          const result = await activePlugin.compact(currentState, target);
          return {
            content: [
              { type: "text" as const, text: `✅ Compacted: removed ${result.removed.length} messages (${result.summary || ""})` },
            ],
            details: result,
          };
        }

        case "switch": {
          const pluginName = params.plugin as string;
          const newPlugin = plugins.get(pluginName);
          if (!newPlugin) {
            const available = Array.from(plugins.keys()).join(", ");
            return {
              content: [{ type: "text" as const, text: `❌ Plugin '${pluginName}' not found. Available: ${available}` }],
              details: { available: Array.from(plugins.keys()) },
            };
          }
          activePlugin = newPlugin;
          currentConfig.plugin = pluginName;
          return {
            content: [{ type: "text" as const, text: `✅ Switched to '${pluginName}' context plugin` }],
            details: { plugin: pluginName, available: Array.from(plugins.keys()) },
          };
        }

        case "status": {
          return {
            content: [
              {
                type: "text" as const,
                text: `🧠 Context Engine\n  Plugin: ${currentConfig.plugin}\n  State: ${currentState ? "active" : "inactive"}\n  Messages: ${currentState?.messages.length || 0}\n  Tokens: ${currentState?.tokens.toLocaleString() || 0}`,
              },
            ],
            details: {
              plugin: currentConfig.plugin,
              active: !!currentState,
              messages: currentState?.messages.length || 0,
              tokens: currentState?.tokens || 0,
              available: Array.from(plugins.keys()),
            },
          };
        }

        default:
          return {
            content: [{ type: "text" as const, text: `❌ Unknown operation: ${operation}` }],
            details: {
              available: ["bootstrap", "ingest", "assemble", "compact", "switch", "status"],
            },
          };
      }
    },
  });

  // Auto-bootstrap on startup
  activePlugin = plugins.get(currentConfig.plugin) || plugins.get("default")!;
  currentState = await activePlugin.bootstrap({
    maxTokens: currentConfig.maxTokens,
    systemPrompt: currentConfig.systemPrompt,
  });

  console.log("[ContextEngine] ✅ Extension loaded. Type /context to use.");
  console.log("[ContextEngine] Active plugin:", currentConfig.plugin);
}

// Types already exported above
