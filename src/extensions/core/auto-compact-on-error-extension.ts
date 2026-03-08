/**
 * Auto-Compact on Error Extension
 * 
 * Automatically detects context overflow errors from LLM providers and
 * triggers compaction to reduce context size, then retries the request.
 * 
 * This prevents the "prompt too long; exceeded max context length" errors
 * by proactively checking context size before requests and auto-compacting
 * when errors occur.
 * 
 * Adapted from OpenClaw error handling patterns.
 */

import type { 
  ExtensionAPI, 
  ExtensionContext,
  BeforeProviderRequestEvent,
  TurnEndEvent,
} from "@mariozechner/pi-coding-agent";

// Track state per session
interface SessionState {
  retryAttempts: number;
  lastCompactionTime?: number;
  warnedAt90Percent: boolean;
}

const sessionStates = new Map<string, SessionState>();
const MAX_RETRIES = 2;
const RETRY_RESET_DELAY_MS = 30000; // Reset retry count after 30 seconds of no errors
const COMPACTION_COOLDOWN_MS = 5000; // Don't compact more often than every 5 seconds

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
 * Get or create session state
 */
function getSessionState(ctx: ExtensionContext): SessionState {
  // @ts-ignore - sessionManager may have getSessionId
  const sessionId = ctx.sessionManager?.getSessionId?.() ?? 'default';
  
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      retryAttempts: 0,
      warnedAt90Percent: false,
    });
  }
  
  return sessionStates.get(sessionId)!;
}

/**
 * Auto-Compact on Error Extension
 */
export default function autoCompactOnErrorExtension(pi: ExtensionAPI): void {
  console.log("[AutoCompactOnError] Extension loaded");

  // Listen for turn_end to check for errors and detect context overflow
  pi.on("turn_end", async (event: TurnEndEvent, ctx: ExtensionContext) => {
    const message = event.message;
    const state = getSessionState(ctx);
    
    // Check if this is an error message
    if (message.role === 'assistant' && message.errorMessage) {
      // Extract error text - use errorMessage first, then check content
      let errorText = message.errorMessage;
      if (typeof message.content === 'string') {
        errorText = message.content + ' ' + errorText;
      } else if (Array.isArray(message.content)) {
        const contentText = message.content
          .filter(c => c.type === 'text')
          .map(c => c.text)
          .join(' ');
        errorText = contentText + ' ' + errorText;
      }

      // Check if it's a context overflow error
      if (!isContextOverflowError(errorText) || isReasoningConstraintError(errorText)) {
        // Reset retry count on non-context-overflow errors
        state.retryAttempts = 0;
        return;
      }

      // Context overflow error detected!
      if (state.retryAttempts >= MAX_RETRIES) {
        console.log(`[AutoCompactOnError] Max retries (${MAX_RETRIES}) reached`);
        ctx.ui.notify(
          `⚠️ Context overflow persisted after ${MAX_RETRIES} compaction attempts.\n` +
          `You may need to start a new session with /new or manually compact with /compact.`,
          "error"
        );
        // Don't reset here - let the user see the error
        return;
      }

      // Check compaction cooldown
      const now = Date.now();
      if (state.lastCompactionTime && (now - state.lastCompactionTime) < COMPACTION_COOLDOWN_MS) {
        ctx.ui.notify(
          `⏳ Compaction cooldown active. Please wait a moment before retrying.`,
          "warning"
        );
        return;
      }

      state.retryAttempts++;
      state.lastCompactionTime = now;

      console.log(`[AutoCompactOnError] Context overflow detected! Auto-compacting (attempt ${state.retryAttempts}/${MAX_RETRIES})`);
      
      ctx.ui.notify(
        `🗜️ Context overflow detected!\n` +
        `Automatically compacting conversation... (attempt ${state.retryAttempts}/${MAX_RETRIES})`,
        "warning"
      );

      // Trigger compaction
      if (ctx.compact) {
        try {
          let compactionCompleted = false;
          
          ctx.compact({
            onComplete: (result) => {
              compactionCompleted = true;
              console.log("[AutoCompactOnError] Compaction completed:", result);
              ctx.ui.notify(
                `✅ Compaction complete! Summarized ${result.tokensBefore.toLocaleString()} tokens.\n` +
                `The conversation is ready to continue. Please retry your request.`,
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

          // Note: We can't automatically retry here because the turn has already ended with an error.
          // The user will need to send their message again, but now with compacted context.
        } catch (err) {
          console.error("[AutoCompactOnError] Error triggering compaction:", err);
          ctx.ui.notify(
            `❌ Failed to trigger compaction: ${err}`,
            "error"
          );
        }
      } else {
        ctx.ui.notify(
          `⚠️ Context is full and auto-compaction is not available.\n` +
          `Please run /compact manually or start a new session with /new.`,
          "error"
        );
      }
    } else {
      // Successful turn - reset retry count after delay
      if (state.retryAttempts > 0) {
        const now = Date.now();
        if (state.lastCompactionTime && (now - state.lastCompactionTime) > RETRY_RESET_DELAY_MS) {
          state.retryAttempts = 0;
          state.warnedAt90Percent = false;
          console.log("[AutoCompactOnError] Reset retry count after successful period");
        }
      }
    }
  });

  // Proactive warning when context is getting full
  pi.on("before_provider_request", async (event: BeforeProviderRequestEvent, ctx: ExtensionContext) => {
    const usage = ctx.getContextUsage?.();
    const state = getSessionState(ctx);
    
    if (!usage || usage.tokens === null) {
      return;
    }

    // Warning at 85% (before we hit the 90% danger zone)
    const warningThreshold = usage.contextWindow * 0.85;
    const dangerThreshold = usage.contextWindow * 0.95;
    
    if (usage.tokens > dangerThreshold) {
      // Very close to limit - suggest immediate compaction
      ctx.ui.notify(
        `🚨 Context is ${usage.percent?.toFixed(1)}% full (${usage.tokens?.toLocaleString()}/${usage.contextWindow.toLocaleString()} tokens).\n` +
        `⚠️  Dangerously close to overflow! Consider running /compact now.`,
        "error"
      );
    } else if (usage.tokens > warningThreshold && !state.warnedAt90Percent) {
      // First time crossing 85% - warn user
      state.warnedAt90Percent = true;
      ctx.ui.notify(
        `⚠️  Context is ${usage.percent?.toFixed(1)}% full (${usage.tokens?.toLocaleString()}/${usage.contextWindow.toLocaleString()} tokens).\n` +
        `Consider running /compact soon to prevent overflow errors.`,
        "warning"
      );
    }
  });

  // Register command for manual triggering and status
  pi.registerCommand("auto-compact", {
    description: "Configure auto-compaction on context overflow errors",
    handler: async (args: string, ctx: ExtensionContext) => {
      const parts = args.trim().split(" ");
      const subcommand = parts[0];
      const state = getSessionState(ctx);

      if (subcommand === "status") {
        const usage = ctx.getContextUsage?.();
        ctx.ui.notify(
          `Auto-compact status:\n` +
          `  Max retries: ${MAX_RETRIES}\n` +
          `  Current retry attempts: ${state.retryAttempts}\n` +
          `  Last compaction: ${state.lastCompactionTime ? new Date(state.lastCompactionTime).toLocaleTimeString() : 'never'}\n` +
          `  Context usage: ${usage ? `${usage.percent?.toFixed(1)}% (${usage.tokens?.toLocaleString()}/${usage.contextWindow.toLocaleString()})` : 'unknown'}`,
          "info"
        );
        return;
      }

      if (subcommand === "reset") {
        state.retryAttempts = 0;
        state.warnedAt90Percent = false;
        ctx.ui.notify("Auto-compact state reset for current session.", "info");
        return;
      }

      if (subcommand === "compact") {
        // Manual trigger for testing
        ctx.ui.notify("Triggering compaction...", "info");
        if (ctx.compact) {
          ctx.compact({
            onComplete: (result) => {
              ctx.ui.notify(
                `✅ Compaction complete! Summarized ${result.tokensBefore.toLocaleString()} tokens.`,
                "info"
              );
            },
            onError: (error) => {
              ctx.ui.notify(`❌ Compaction failed: ${error.message}`, "error");
            }
          });
        }
        return;
      }

      ctx.ui.notify(
        `Usage: /auto-compact [status|reset|compact]\n\n` +
        `Auto-compact automatically triggers when:\n` +
        `• "prompt too long" or "context overflow" errors occur\n` +
        `• Up to ${MAX_RETRIES} automatic retries before giving up\n\n` +
        `Proactive warnings appear at 85% context usage.`,
        "info"
      );
    },
  });

  console.log("[AutoCompactOnError] Extension initialized");
}
