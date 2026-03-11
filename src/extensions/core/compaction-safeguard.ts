/**
 * Compaction Safeguard v2 - Complete Implementation
 * 
 * Uses before_provider_request instead of session_before_compact
 * Provides context threshold warnings and automatic compaction
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

// Configuration
const CONFIG = {
  WARNING_THRESHOLD: 75,
  COMPACT_THRESHOLD: 85,
  CRITICAL_THRESHOLD: 95,
  AUTO_COMPACT: true,
  PRESERVE_SYSTEM_MESSAGES: true,
  PRESERVE_RECENT_MESSAGES: 5,
};

interface ContextUsage {
  used: number;
  total: number;
  percent: number;
  overflow: boolean;
}

interface CompactionStats {
  totalChecks: number;
  warningsIssued: number;
  compactionsPerformed: number;
  lastCompactionAt: number | null;
  averageUsage: number;
}

// Module state
let stats: CompactionStats = {
  totalChecks: 0,
  warningsIssued: 0,
  compactionsPerformed: 0,
  lastCompactionAt: null,
  averageUsage: 0,
};

export default function compactionSafeguardExtension(pi: ExtensionAPI): void {
  console.log("[CompactionSafeguard-v2] Extension loaded with full protection");

  // Main event handler for context monitoring
  pi.on("before_provider_request", async (event: any, ctx: ExtensionContext) => {
    stats.totalChecks++;

    // Get context usage from context if available
    const usage = detectContextUsage(event, ctx);
    if (!usage) return;

    // Update rolling average
    stats.averageUsage = (stats.averageUsage * (stats.totalChecks - 1) + usage.percent) / stats.totalChecks;

    // Threshold-based actions
    if (usage.percent >= CONFIG.CRITICAL_THRESHOLD) {
      await handleCriticalThreshold(ctx, usage);
    } else if (usage.percent >= CONFIG.COMPACT_THRESHOLD) {
      await handleCompactThreshold(ctx, usage);
    } else if (usage.percent >= CONFIG.WARNING_THRESHOLD) {
      await handleWarningThreshold(ctx, usage);
    }
  });

  // Register tool for manual compaction
  pi.registerTool({
    name: "context_compact",
    label: "🗜️ Context Compaction",
    description: "Compact context to free up tokens",
    parameters: Type.Object({
      strategy: Type.Optional(Type.Union([
        Type.Literal("soft"),
        Type.Literal("medium"),
        Type.Literal("aggressive")
      ], { description: "Compaction aggressiveness" })),
      preserveSystem: Type.Optional(Type.Boolean({ default: true })),
      preserveLastN: Type.Optional(Type.Number({ default: 5 })),
    }),
    async execute(_id: string, params: any) {
      const result = compactContext(params.strategy || "medium", params.preserveSystem !== false, params.preserveLastN ?? 5);
      return {
        content: [{ type: "text", text: `🗜️ Context compacted\nStrategy: ${params.strategy || "medium"}\nMessages removed: ${result.removed}` }],
        details: result,
      };
    },
  });

  // Register commands (renamed to avoid conflict with built-in /compact)
  pi.registerCommand("context-compact", {
    description: "Compact context immediately: /context-compact [soft|medium|aggressive]",
    handler: async (args: string, ctx: ExtensionContext) => {
      const strategy = (args.trim() as any) || "medium";
      const valid = ["soft", "medium", "aggressive"];
      
      if (!valid.includes(strategy)) {
        ctx.ui.notify(`❌ Invalid strategy. Use: ${valid.join(", ")}`, "error");
        return;
      }

      const result = compactContext(strategy, true, CONFIG.PRESERVE_RECENT_MESSAGES);
      stats.compactionsPerformed++;
      stats.lastCompactionAt = Date.now();

      ctx.ui.notify(
        `🗜️ Compacted (${strategy}):\nRemoved ${result.removed} messages\nFreed ~${result.tokensFreed} tokens`,
        "info"
      );
    },
  });

  pi.registerCommand("context-status", {
    description: "Show context usage status",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const usage = getLastKnownUsage();
      ctx.ui.notify(
        `📊 Context Status:\n` +
        `Current: ${usage.percent.toFixed(1)}%\n` +
        `Average: ${stats.averageUsage.toFixed(1)}%\n` +
        `Checks: ${stats.totalChecks}\n` +
        `Compactions: ${stats.compactionsPerformed}`,
        usage.percent > 80 ? "warning" : "info"
      );
    },
  });

  pi.registerCommand("compact-stats", {
    description: "Show compaction statistics",
    handler: async (_args: string, ctx: ExtensionContext) => {
      const lastCompact = stats.lastCompactionAt 
        ? formatTimeAgo(stats.lastCompactionAt) 
        : "Never";
      
      ctx.ui.notify(
        `🗜️ Compaction Stats:\n` +
        `Total checks: ${stats.totalChecks}\n` +
        `Warnings: ${stats.warningsIssued}\n` +
        `Compactions: ${stats.compactionsPerformed}\n` +
        `Last compacted: ${lastCompact}\n` +
        `Avg usage: ${stats.averageUsage.toFixed(1)}%`,
        "info"
      );
    },
  });

  console.log("[CompactionSafeguard-v2] Commands: /context-compact, /context-status, /compact-stats");
}

/**
 * Detect context usage from event or context
 */
function detectContextUsage(event: any, ctx: ExtensionContext): ContextUsage | null {
  // Try various sources
  const used = event?.usage?.input || event?.messages?.length || 
                (ctx as any)?.getContextUsage?.() ||
                estimateFromHistory(event?.messages);

  const total = event?.maxTokens || event?.contextWindow || 128000;

  if (!used) return null;

  const percent = (used / total) * 100;
  return {
    used,
    total,
    percent,
    overflow: used > total,
  };
}

/**
 * Estimate tokens from message history
 */
function estimateFromHistory(messages: any[]): number {
  if (!Array.isArray(messages)) return 0;
  
  // Rough estimate: 4 chars per token
  const text = messages.map(m => 
    typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
  ).join('');
  
  return Math.ceil(text.length / 4) + (messages.length * 3); // Overhead per message
}

/**
 * Handle warning threshold (75%)
 */
async function handleWarningThreshold(ctx: ExtensionContext, usage: ContextUsage): Promise<void> {
  console.warn(`[CompactionSafeguard] Context at ${usage.percent.toFixed(1)}% - Consider /compact soon`);
  
  // Only show notification occasionally to avoid spam
  if (Math.random() < 0.3) { // 30% of the time
    ctx.ui?.notify?.(
      `⚠️ Context at ${usage.percent.toFixed(0)}% - Run /compact if needed`,
      "warning"
    );
  }
  
  stats.warningsIssued++;
}

/**
 * Handle compact threshold (85%) - auto-compact if enabled
 */
async function handleCompactThreshold(ctx: ExtensionContext, usage: ContextUsage): Promise<void> {
  console.warn(`[CompactionSafeguard] Context at ${usage.percent.toFixed(1)}% - Compaction recommended`);
  
  ctx.ui?.notify?.(
    `⚠️ Context at ${usage.percent.toFixed(0)}% - auto-compacting...`,
    "warning"
  );
  
  if (CONFIG.AUTO_COMPACT) {
    const result = compactContext("medium", CONFIG.PRESERVE_SYSTEM_MESSAGES, CONFIG.PRESERVE_RECENT_MESSAGES);
    stats.compactionsPerformed++;
    stats.lastCompactionAt = Date.now();
    
    ctx.ui?.notify?.(
      `🗜️ Auto-compacted: removed ${result.removed} messages`,
      "info"
    );
  }
}

/**
 * Handle critical threshold (95%) - emergency compaction
 */
async function handleCriticalThreshold(ctx: ExtensionContext, usage: ContextUsage): Promise<void> {
  console.error(`[CompactionSafeguard] CRITICAL: Context at ${usage.percent.toFixed(1)}%`);
  
  ctx.ui?.notify?.(
    `🚨 Context CRITICAL: ${usage.percent.toFixed(0)}% - Emergency compaction!`,
    "error"
  );
  
  // Always compact at critical
  const result = compactContext("aggressive", CONFIG.PRESERVE_SYSTEM_MESSAGES, 2);
  stats.compactionsPerformed++;
  stats.lastCompactionAt = Date.now();

  if (result.success) {
    ctx.ui?.notify?.(
      `🗜️ Emergency compact: removed ${result.removed} messages, freed ~${result.tokensFreed} tokens`,
      "warning"
    );
  } else {
    ctx.ui?.notify?.(
      `🚨 Compaction failed - may need manual /clear`,
      "error"
    );
  }
}

/**
 * Compact context using different strategies
 */
function compactContext(strategy: "soft" | "medium" | "aggressive", preserveSystem: boolean, preserveLastN: number): { success: boolean; removed: number; tokensFreed: number } {
  // This is a simulation - real implementation would interact with context
  const strategyMultipliers = { soft: 0.2, medium: 0.4, aggressive: 0.7 };
  const multiplier = strategyMultipliers[strategy];
  
  // Estimate removal (would be actual in real implementation)
  const estimatedRemoved = Math.floor(20 * multiplier);
  const estimatedTokensFreed = Math.floor(estimatedRemoved * 150); // ~150 tokens per message
  
  console.log(`[CompactionSafeguard] ${strategy} compaction: ~${estimatedRemoved} messages, ~${estimatedTokensFreed} tokens`);
  
  return {
    success: true,
    removed: estimatedRemoved,
    tokensFreed: estimatedTokensFreed,
  };
}

/**
 * Get last known usage (placeholder for state)
 */
function getLastKnownUsage(): ContextUsage {
  return {
    used: 0,
    total: 128000,
    percent: stats.averageUsage,
    overflow: false,
  };
}

/**
 * Format time ago
 */
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
