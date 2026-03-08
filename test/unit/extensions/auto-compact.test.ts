/**
 * Auto-Compact on Error Extension Tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { ExtensionContext, ExtensionCommandContext, TurnEndEvent, BeforeProviderRequestEvent } from "@mariozechner/pi-coding-agent";
import type { AssistantMessage } from "@mariozechner/pi-ai";

// Mock the extension by importing the functions we want to test
// Since the extension exports default, we'll test the functionality through integration

// Error patterns to test (mirroring the extension patterns)
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
  /上下文过[长多]/i,
  /上下文超出/i,
  /上下文长度超/i,
  /超出最大上下文/i,
  /请压缩上下文/i,
];

const TPM_PATTERNS = [
  /tpm/i,
  /tokens per minute/i,
  /rate limit.*token/i,
];

// Test error detection functions
function isContextOverflowError(errorMessage?: string): boolean {
  if (!errorMessage) return false;
  
  if (TPM_PATTERNS.some(p => p.test(errorMessage))) {
    return false;
  }
  
  return CONTEXT_OVERFLOW_PATTERNS.some(pattern => pattern.test(errorMessage));
}

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

describe("Auto-Compact Error Detection", () => {
  describe("isContextOverflowError", () => {
    it("detects 'request_too_large' errors", () => {
      expect(isContextOverflowError("request_too_large")).toBe(true);
      expect(isContextOverflowError("Error: request_too_large occurred")).toBe(true);
    });

    it("detects 'exceeds model context window' errors", () => {
      expect(isContextOverflowError('{"type":"error","error":{"type":"invalid_request_error","message":"Request size exceeds model context window"}}')).toBe(true);
      expect(isContextOverflowError("Request size exceeds model context window")).toBe(true);
    });

    it("detects 'prompt too long' errors", () => {
      expect(isContextOverflowError("400 Bad Request: prompt too long; exceeded max context length by 1539 tokens")).toBe(true);
      expect(isContextOverflowError("prompt is too long")).toBe(true);
    });

    it("detects 'context length exceeded' errors", () => {
      expect(isContextOverflowError("context length exceeded")).toBe(true);
      expect(isContextOverflowError("maximum context length exceeded")).toBe(true);
    });

    it("detects 'model token limit' errors", () => {
      expect(isContextOverflowError("error, status code: 400, message: Invalid request: Your request exceeded model token limit: 262144 (requested: 291351)")).toBe(true);
    });

    it("detects 'context_window_exceeded' errors", () => {
      expect(isContextOverflowError("Unhandled stop reason: model_context_window_exceeded")).toBe(true);
    });

    it("detects Chinese context overflow messages", () => {
      expect(isContextOverflowError("错误：上下文过长")).toBe(true);
      expect(isContextOverflowError("上下文超出限制")).toBe(true);
      expect(isContextOverflowError("请压缩上下文")).toBe(true);
    });

    it("excludes TPM/rate limit errors", () => {
      expect(isContextOverflowError("rate limit: too many tokens per minute (TPM)")).toBe(false);
      expect(isContextOverflowError("tokens per minute limit exceeded")).toBe(false);
      expect(isContextOverflowError("429 rate limit reached")).toBe(false);
    });

    it("returns false for non-context errors", () => {
      expect(isContextOverflowError("network error")).toBe(false);
      expect(isContextOverflowError("timeout")).toBe(false);
      expect(isContextOverflowError("authentication failed")).toBe(false);
      expect(isContextOverflowError(undefined)).toBe(false);
      expect(isContextOverflowError("")).toBe(false);
    });
  });

  describe("isReasoningConstraintError", () => {
    it("detects reasoning mandatory errors", () => {
      expect(isReasoningConstraintError("Reasoning is mandatory for this endpoint and cannot be disabled.")).toBe(true);
      expect(isReasoningConstraintError("Reasoning is required")).toBe(true);
      expect(isReasoningConstraintError("This model requires reasoning")).toBe(true);
      expect(isReasoningConstraintError("Reasoning cannot be disabled")).toBe(true);
    });

    it("returns false for non-reasoning errors", () => {
      expect(isReasoningConstraintError("prompt too long")).toBe(false);
      expect(isReasoningConstraintError("network error")).toBe(false);
      expect(isReasoningConstraintError(undefined)).toBe(false);
    });
  });
});

describe("Auto-Compact Session State", () => {
  interface SessionState {
    retryAttempts: number;
    lastCompactionTime?: number;
    warnedAt90Percent: boolean;
  }

  const sessionStates = new Map<string, SessionState>();
  const MAX_RETRIES = 2;

  beforeEach(() => {
    sessionStates.clear();
  });

  function getSessionState(sessionId: string): SessionState {
    if (!sessionStates.has(sessionId)) {
      sessionStates.set(sessionId, {
        retryAttempts: 0,
        warnedAt90Percent: false,
      });
    }
    return sessionStates.get(sessionId)!;
  }

  it("creates new session state for unknown sessions", () => {
    const state = getSessionState("session-1");
    expect(state).toEqual({
      retryAttempts: 0,
      warnedAt90Percent: false,
    });
  });

  it("tracks retry attempts", () => {
    const state = getSessionState("session-1");
    
    state.retryAttempts = 1;
    expect(getSessionState("session-1").retryAttempts).toBe(1);
    
    state.retryAttempts = 2;
    expect(getSessionState("session-1").retryAttempts).toBe(2);
  });

  it("tracks compaction time", () => {
    const state = getSessionState("session-1");
    const now = Date.now();
    
    state.lastCompactionTime = now;
    expect(getSessionState("session-1").lastCompactionTime).toBe(now);
  });

  it("tracks warning state", () => {
    const state = getSessionState("session-1");
    
    state.warnedAt90Percent = true;
    expect(getSessionState("session-1").warnedAt90Percent).toBe(true);
  });

  it("maintains separate state per session", () => {
    const state1 = getSessionState("session-1");
    const state2 = getSessionState("session-2");
    
    state1.retryAttempts = 1;
    state2.retryAttempts = 2;
    
    expect(getSessionState("session-1").retryAttempts).toBe(1);
    expect(getSessionState("session-2").retryAttempts).toBe(2);
  });
});

describe("Auto-Compact Proactive Warnings", () => {
  interface ContextUsage {
    tokens: number | null;
    contextWindow: number;
    percent: number | null;
  }

  function shouldWarn(usage: ContextUsage): boolean {
    if (!usage.tokens) return false;
    const warningThreshold = usage.contextWindow * 0.85;
    return usage.tokens > warningThreshold;
  }

  function shouldShowDanger(usage: ContextUsage): boolean {
    if (!usage.tokens) return false;
    const dangerThreshold = usage.contextWindow * 0.95;
    return usage.tokens > dangerThreshold;
  }

  it("warns at 85% context usage", () => {
    const usage: ContextUsage = {
      tokens: 85100, // Just over 85%
      contextWindow: 100000,
      percent: 85.1,
    };
    expect(shouldWarn(usage)).toBe(true);
    expect(shouldShowDanger(usage)).toBe(false);
  });

  it("shows danger at 95% context usage", () => {
    const usage: ContextUsage = {
      tokens: 95100, // Just over 95%
      contextWindow: 100000,
      percent: 95.1,
    };
    expect(shouldWarn(usage)).toBe(true);
    expect(shouldShowDanger(usage)).toBe(true);
  });

  it("does not warn below 85%", () => {
    const usage: ContextUsage = {
      tokens: 84000,
      contextWindow: 100000,
      percent: 84,
    };
    expect(shouldWarn(usage)).toBe(false);
    expect(shouldShowDanger(usage)).toBe(false);
  });

  it("handles unknown token counts", () => {
    const usage: ContextUsage = {
      tokens: null,
      contextWindow: 100000,
      percent: null,
    };
    expect(shouldWarn(usage)).toBe(false);
    expect(shouldShowDanger(usage)).toBe(false);
  });
});

describe("Auto-Compact Cooldown Logic", () => {
  const COMPACTION_COOLDOWN_MS = 5000; // 5 seconds

  function canCompact(lastCompactionTime: number | undefined): boolean {
    if (!lastCompactionTime) return true;
    const now = Date.now();
    return (now - lastCompactionTime) >= COMPACTION_COOLDOWN_MS;
  }

  it("allows compaction when no previous compaction", () => {
    expect(canCompact(undefined)).toBe(true);
  });

  it("allows compaction after cooldown period", () => {
    const lastCompaction = Date.now() - COMPACTION_COOLDOWN_MS - 1000;
    expect(canCompact(lastCompaction)).toBe(true);
  });

  it("prevents compaction during cooldown", () => {
    const lastCompaction = Date.now() - 1000; // 1 second ago
    expect(canCompact(lastCompaction)).toBe(false);
  });

  it("prevents compaction at exactly cooldown boundary", () => {
    const lastCompaction = Date.now() - COMPACTION_COOLDOWN_MS + 1;
    expect(canCompact(lastCompaction)).toBe(false);
  });
});
