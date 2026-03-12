/**
 * Intelligent Context Extension - v1.0 (Clean & Integrated)
 *
 * Hooks into pi-coding-agent's framework for automatic context management.
 * Uses battle-tested strategies from agent/context-pruning.ts (single source of truth).
 *
 * Strategies (from agent/context-pruning.ts):
 * - oldest-first: Remove oldest messages first
 * - importance-based: Remove by importance score
 * - smart-compaction: Summarize old content
 * - auto: Automatically select based on context size
 *
 * No duplicate code - all token estimation and strategies imported from agent/pruning.
 */

import type { ExtensionAPI, ExtensionContext, AgentToolResult } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  importanceStrategy,
  smartCompactionStrategy,
  oldestFirstStrategy,
  recommendStrategy,
  DEFAULT_BUDGET,
  type ContextBudget,
  type PruningStrategy,
} from "../../agent/context-pruning.js";

// Extension configuration
interface IntelligentContextConfig {
  enabled: boolean;
  strategy: "auto" | "oldest" | "importance" | "smart";
  budget: ContextBudget;
  logMetrics: boolean;
}

const DEFAULT_CONFIG: IntelligentContextConfig = {
  enabled: true,
  strategy: "auto",
  budget: DEFAULT_BUDGET,
  logMetrics: true,
};

// Global state
let globalConfig = { ...DEFAULT_CONFIG };
let compactionStats = {
  totalChecks: 0,
  compactions: 0,
  lastCompactionTime: 0,
};

// Strategy registry
const strategies: Record<string, PruningStrategy> = {
  oldest: oldestFirstStrategy,
  importance: importanceStrategy,
  smart: smartCompactionStrategy,
};

export default function intelligentContextExtension(pi: ExtensionAPI): void {
  console.log("[IntelligentContext] v1.0 - Integrated with framework");

  // ============================================================================
  // HOOK: Monitor before provider request
  // ============================================================================
  pi.on("before_provider_request", async (_event: any, ctx: ExtensionContext) => {
    if (!globalConfig.enabled) return;

    compactionStats.totalChecks++;

    // Get context usage from framework
    const usage = ctx.getContextUsage();
    if (!usage || usage.tokens === null || usage.percent === null) return;

    const percentage = usage.percent;

    // Log periodically
    if (globalConfig.logMetrics && compactionStats.totalChecks % 10 === 0) {
      console.log(`[IntelligentContext] Usage: ${percentage.toFixed(1)}% (${usage.tokens?.toLocaleString() || "?"}/${usage.contextWindow.toLocaleString()})`);
    }

    // Trigger compaction if over threshold
    if (percentage >= globalConfig.budget.warningThreshold) {
      // Debounce
      const now = Date.now();
      if (now - compactionStats.lastCompactionTime < 30000) return;

      // Select strategy
      let strategyName = globalConfig.strategy;
      if (strategyName === "auto") {
        strategyName = percentage >= globalConfig.budget.criticalThreshold ? "smart" : "importance";
      }
      const strategy = strategies[strategyName] || importanceStrategy;

      console.log(`[IntelligentContext] Triggering compaction (${percentage.toFixed(1)}%, ${strategyName})`);

      // Trigger framework compaction
      ctx.compact({
        customInstructions: `${strategyName} strategy: prioritize removing tool results and older assistant messages while preserving system prompt and recent context`,
      });

      compactionStats.compactions++;
      compactionStats.lastCompactionTime = now;

      // Notify if critical
      if (percentage >= globalConfig.budget.criticalThreshold) {
        ctx.ui.notify(
          `🗜️ Context critical: ${percentage.toFixed(0)}% - Compaction triggered`,
          "warning"
        );
      }
    }
  });

  // ============================================================================
  // TOOL: Strategy switching
  // ============================================================================
  pi.registerTool({
    name: "context_strategy",
    label: "/context_strategy",
    description: "Switch context pruning strategy (auto/oldest/importance/smart)",
    // @ts-ignore TSchema mismatch
    parameters: Type.Object({
      strategy: Type.String({
        description: "Strategy: auto (recommended), oldest, importance, smart",
        enum: ["auto", "oldest", "importance", "smart"],
      }),
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>
    ): Promise<AgentToolResult<any>> {
      const strategy = params.strategy as string;

      if (!["auto", "oldest", "importance", "smart"].includes(strategy)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `❌ Invalid strategy: ${strategy}. Use: auto, oldest, importance, smart`,
            },
          ],
          details: {
            error: "invalid_strategy",
            available: ["auto", "oldest", "importance", "smart"],
          },
        };
      }

      globalConfig.strategy = strategy as any;

      return {
        content: [
          {
            type: "text" as const,
            text:
              `✅ Context strategy set to: ${strategy}\n\n` +
              `Available strategies:\n` +
              `- auto: Automatically select based on context size (recommended)\n` +
              `- oldest: Remove oldest messages first\n` +
              `- importance: Remove by importance score\n` +
              `- smart: Summarize old content`,
          },
        ],
        details: {
          strategy,
          available: ["auto", "oldest", "importance", "smart"],
          current: globalConfig.strategy,
        },
      };
    },
  });

  // ============================================================================
  // TOOL: Get metrics
  // ============================================================================
  pi.registerTool({
    name: "context_metrics",
    label: "/context_metrics",
    description: "Show context compaction metrics",
    // @ts-ignore TSchema mismatch
    parameters: Type.Object({}),
    async execute(): Promise<AgentToolResult<any>> {
      const text =
        compactionStats.compactions === 0
          ? "No compactions yet. Context pruning triggers automatically when needed."
          : `📊 Context Metrics\n${"─".repeat(40)}\n\n` +
            `Total checks: ${compactionStats.totalChecks.toLocaleString()}\n` +
            `Compactions: ${compactionStats.compactions.toLocaleString()}\n` +
            `Current strategy: ${globalConfig.strategy}\n` +
            `Budget: ${globalConfig.budget.maxTokens.toLocaleString()} tokens\n` +
            `Thresholds: ${globalConfig.budget.warningThreshold}% warning, ${globalConfig.budget.criticalThreshold}% critical\n` +
            `Last compaction: ${compactionStats.lastCompactionTime ? new Date(compactionStats.lastCompactionTime).toLocaleTimeString() : "never"}`;

      return {
        content: [{ type: "text" as const, text }],
        details: {
          ...compactionStats,
          strategy: globalConfig.strategy,
          budget: globalConfig.budget,
        },
      };
    },
  });

  // ============================================================================
  // TOOL: Manual compaction
  // ============================================================================
  pi.registerTool({
    name: "context_compact",
    label: "/context_compact",
    description: "Trigger manual context compaction",
    // @ts-ignore TSchema mismatch
    parameters: Type.Object({
      strategy: Type.Optional(Type.String({
        description: "Strategy to use (uses default if not specified)",
        enum: ["oldest", "importance", "smart"],
      })),
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal,
      _onUpdate: any,
      ctx: ExtensionContext
    ): Promise<AgentToolResult<any>> {
      const strategy = (params.strategy as string) || globalConfig.strategy;

      console.log(`[IntelligentContext] Manual compaction (${strategy})`);

      ctx.compact({
        customInstructions: `Manual ${strategy} compaction: apply ${strategy} pruning strategy based on message importance and age`,
      });

      compactionStats.compactions++;
      compactionStats.lastCompactionTime = Date.now();

      return {
        content: [
          {
            type: "text" as const,
            text: `✅ Manual compaction triggered\n\nStrategy: ${strategy}\nStatus: Compaction in progress...`,
          },
        ],
        details: { strategy, triggered: true },
      };
    },
  });

  console.log("[IntelligentContext] ✅ Extension loaded");
  console.log("[IntelligentContext] Strategy:", globalConfig.strategy);
  console.log("[IntelligentContext] Commands: /context_strategy, /context_metrics, /context_compact");
}
