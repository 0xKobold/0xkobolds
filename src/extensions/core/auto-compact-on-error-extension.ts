/**
 * Auto-Compact on Error Extension
 * 
 * Automatically detects context overflow errors from LLM providers and
 * triggers compaction to reduce context size, then retries the request.
 * 
 * This prevents the "prompt too long; exceeded max context length" errors
 * by proactively compacting when they occur.
 * 
 * Adapted from OpenClaw error handling patterns.
 */

import type { 
  ExtensionAPI, 
  ExtensionContext,
  BeforeProviderRequestEvent,
  ToolResultEvent,
} from "@mariozechner/pi-coding-agent";

// Track retry attempts to prevent infinite loops
const retryAttempts = new Map<string, number>();
const MAX_RETRIES = 2;

// Context overflow error patterns (adapted from OpenClaw)
const CONTEXT_OVERFLOW_PATTERNS = [
  /request_too_large/i,
  /request exceeds the maximum size/i,
  /context length exceeded/i,
  /maximum context length/i,
  /prompt is too long/i,
  /exceeds model context window/i,
  /model token limit/i,
  /context overflow/i,
  /exceed context limit/i,
  /exceeds the model's maximum context/i,
  /context_window_exceeded/i,
  /exceeded max context length/i,
  /exceeded.*context.*limit/i,
  /prompt too long/i,
  /400 Bad Request.*prompt too long/i,
  // Chinese proxy error messages
  /上下文过[长多]/i,
  /上下文超出/i,
  /上下文长度超/i,
  /超出最大上下文/i,
  /请压缩上下文/i,
];

// TPM (tokens per minute) patterns - these are rate limits, NOT context overflow
const TPM_PATTERNS = [
  /tpm/i,
  /tokens per minute/i,
  /rate limit.*token/i,
];

/**
 * Check if error is a context overflow error
 */
function isContextOverflowError(errorMessage?: string): boolean {
  if (!errorMessage) return false;
  
  const lower = errorMessage.toLowerCase();
  
  // Exclude TPM/rate limit errors
  if (TPM_PATTERNS.some(p => p.test(errorMessage))) {
    return false;
  }
  
  // Check for context overflow patterns
  return CONTEXT_OVERFLOW_PATTERNS.some(pattern => pattern.test(errorMessage));
}

/**
 * Check if error is a reasoning constraint error (not overflow)
 */
function isReasoningConstraintError(errorMessage?: string): boolean {
  if (!errorMessage) return false;
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes("reasoning is mandatory") ||
    lower.includes("reasoning is required") ||
    lower.includes("requires reasoning") ||
    (lower.includes("reasoning") && lower.includes("cannot be disabled"))
  );
}

/**
 * Get session key for tracking retries
 */
function getSessionKey(ctx: ExtensionContext): string {
  // @ts-ignore - sessionManager may have getSessionId
  return ctx.sessionManager?.getSessionId?.() ?? 'default';
}

/**
 * Auto-Compact on Error Extension
 */
export default function autoCompactOnErrorExtension(pi: ExtensionAPI): void {
  console.log("[AutoCompactOnError] Extension loaded");

  // Listen for tool results that might contain errors
  pi.on("tool_result", async (event: ToolResultEvent, ctx: ExtensionContext) => {
    // Check if this is a provider error tool result
    if (event.toolName !== "provider_error" && event.toolName !== "llm_error") {
      return;
    }

    const errorMsg = event.content
      .filter(c => c.type === "text")
      .map(c => c.text)
      .join(" ");

    if (!isContextOverflowError(errorMsg) || isReasoningConstraintError(errorMsg)) {
      return;
    }

    const sessionKey = getSessionKey(ctx);
    const attempts = retryAttempts.get(sessionKey) ?? 0;

    if (attempts >= MAX_RETRIES) {
      console.log(`[AutoCompactOnError] Max retries (${MAX_RETRIES}) reached for session ${sessionKey}`);
      ctx.ui.notify(
        `⚠️ Context overflow persisted after ${MAX_RETRIES} compaction attempts.\n` +
        `You may need to start a new session with /new or manually compact with /compact.`,
        "error"
      );
      retryAttempts.delete(sessionKey);
      return;
    }

    console.log(`[AutoCompactOnError] Detected context overflow, attempt ${attempts + 1}/${MAX_RETRIES}`);
    
    ctx.ui.notify(
      `🗜️ Context overflow detected! Automatically compacting and retrying... (attempt ${attempts + 1}/${MAX_RETRIES})`,
      "warning"
    );

    // Increment retry count
    retryAttempts.set(sessionKey, attempts + 1);

    // Trigger compaction
    if (ctx.compact) {
      try {
        ctx.compact({
          onComplete: (result: any) => {  // eslint-disable-line @typescript-eslint/no-explicit-any
            console.log("[AutoCompactOnError] Compaction completed:", result);
            const tokensInfo = result.tokensBefore ? ` (${result.tokensBefore} tokens)` : "";
            ctx.ui.notify(
              `✅ Compaction complete! Summarized${tokensInfo}.\n` +
              `The request will be retried automatically.`,
              "info"
            );
          },
          onError: (error) => {
            console.error("[AutoCompactOnError] Compaction failed:", error);
            ctx.ui.notify(
              `❌ Auto-compaction failed: ${error.message}\n` +
              `Please try /compact manually or start a new session with /new.`,
              "error"
            );
          }
        });
      } catch (err) {
        console.error("[AutoCompactOnError] Error triggering compaction:", err);
      }
    }
  });

  // Also listen for before_provider_request to check payload size
  pi.on("before_provider_request", async (event: BeforeProviderRequestEvent, ctx: ExtensionContext) => {
    const usage = ctx.getContextUsage?.();
    
    if (!usage || usage.tokens === null) {
      return;
    }

    // Calculate warning threshold (90% of context window)
    const warningThreshold = usage.contextWindow * 0.9;
    
    if (usage.tokens > warningThreshold) {
      const sessionKey = getSessionKey(ctx);
      const attempts = retryAttempts.get(sessionKey) ?? 0;
      
      // Only warn and suggest compaction, don't auto-trigger yet
      // This gives the user a heads up before it fails
      if (attempts === 0) {
        ctx.ui.notify(
          `⚠️ Context is ${usage.percent?.toFixed(1)}% full (${usage.tokens}/${usage.contextWindow} tokens).\n` +
          `Consider running /compact soon to prevent overflow errors.`,
          "warning"
        );
      }
    }
  });

  // Reset retry count on successful turn end
  pi.on("turn_end", async (_event, ctx: ExtensionContext) => {
    const sessionKey = getSessionKey(ctx);
    if (retryAttempts.has(sessionKey)) {
      retryAttempts.delete(sessionKey);
      console.log(`[AutoCompactOnError] Reset retry count for session ${sessionKey}`);
    }
  });

  // Register command for manual triggering
  pi.registerCommand("compact-on-error", {
    description: "Configure auto-compaction on context overflow errors",
    handler: async (args: string, ctx: ExtensionContext) => {
      const parts = args.trim().split(" ");
      const subcommand = parts[0];

      if (subcommand === "status") {
        const sessionKey = getSessionKey(ctx);
        const attempts = retryAttempts.get(sessionKey) ?? 0;
        ctx.ui.notify(
          `Auto-compact on error:\n` +
          `  Max retries: ${MAX_RETRIES}\n` +
          `  Current attempts: ${attempts}\n` +
          `  Session: ${sessionKey}`,
          "info"
        );
        return;
      }

      if (subcommand === "reset") {
        const sessionKey = getSessionKey(ctx);
        retryAttempts.delete(sessionKey);
        ctx.ui.notify("Retry attempts reset for current session.", "info");
        return;
      }

      ctx.ui.notify(
        `Usage: /compact-on-error [status|reset]\n\n` +
        `Auto-compact is enabled by default and triggers when:\n` +
        `• "prompt too long" errors occur\n` +
        `• "context length exceeded" errors occur\n\n` +
        `Max ${MAX_RETRIES} automatic retries before giving up.`,
        "info"
      );
    },
  });

  console.log("[AutoCompactOnError] Extension initialized");
}
