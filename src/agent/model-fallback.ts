/**
 * Model Fallback (Phase 3)
 *
 * Automatic retry with fallback models when primary fails.
 * Similar to koclaw's runWithModelFallback pattern.
 */

import { eventBus } from "../event-bus";

export interface ModelRef {
  provider: string;
  model: string;
}

export interface FallbackResult {
  provider: string;
  model: string;
  result: unknown;
  usedFallback: boolean;
}

export interface FallbackConfig {
  primary: ModelRef;
  fallbacks: ModelRef[];
  maxRetries: number;
  retryDelayMs: number;
}

export interface FallbackError {
  provider: string;
  model: string;
  error: Error;
  isRetryable: boolean;
}

export class FailoverError extends Error {
  readonly provider: string;
  readonly model: string;
  readonly reason: string;
  readonly isRetryable: boolean;

  constructor({
    provider,
    model,
    message,
    reason,
    isRetryable,
  }: {
    provider: string;
    model: string;
    message: string;
    reason: string;
    isRetryable: boolean;
  }) {
    super(message);
    this.name = "FailoverError";
    this.provider = provider;
    this.model = model;
    this.reason = reason;
    this.isRetryable = isRetryable;
  }
}

// Classify errors for retryability
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Network errors (retryable)
  if (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("econnrefused") ||
    message.includes("econnreset") ||
    message.includes("socket hang up") ||
    message.includes("temporary")
  ) {
    return true;
  }

  // Rate limits (retryable with backoff)
  if (
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("429") ||
    message.includes("throttled")
  ) {
    return true;
  }

  // Auth errors (not retryable with same key - but might be with different key)
  if (
    message.includes("unauthorized") ||
    message.includes("invalid api key") ||
    message.includes("authentication")
  ) {
    return true;
  }

  // Context overflow (retryable after compaction)
  if (
    message.includes("context length") ||
    message.includes("token limit") ||
    message.includes("maximum context length") ||
    message.includes("too many tokens")
  ) {
    return true;
  }

  // Billing errors (not retryable without payment)
  if (message.includes("billing") || message.includes("payment") || message.includes("quota")) {
    return false;
  }

  // Default: retryable
  return true;
}

export function classifyFailoverReason(error: Error): {
  retryable: boolean;
  code: string;
} {
  const message = error.message.toLowerCase();

  if (message.includes("rate limit") || message.includes("429")) {
    return { retryable: true, code: "RATE_LIMITED" };
  }
  if (message.includes("timeout")) {
    return { retryable: true, code: "TIMEOUT" };
  }
  if (message.includes("context length") || message.includes("token limit")) {
    return { retryable: true, code: "CONTEXT_OVERFLOW" };
  }
  if (message.includes("unauthorized") || message.includes("api key")) {
    return { retryable: true, code: "AUTH_ERROR" };
  }
  if (message.includes("billing") || message.includes("quota")) {
    return { retryable: false, code: "BILLING_ERROR" };
  }
  if (message.includes("not found") || message.includes("404")) {
    return { retryable: false, code: "NOT_FOUND" };
  }

  return { retryable: true, code: "UNKNOWN" };
}

// Exponential backoff
export function computeBackoff(attempt: number, baseMs = 1000, maxMs = 30000): number {
  const jitter = Math.random() * 200;
  return Math.min(baseMs * Math.pow(2, attempt), maxMs) + jitter;
}

// Main fallback runner
export async function runWithModelFallback<T>({
  config,
  run,
  signal,
  onAttempt,
}: {
  config: FallbackConfig;
  run: (provider: string, model: string, attempt: number) => Promise<T>;
  signal?: AbortSignal;
  onAttempt?: (attempt: {
    provider: string;
    model: string;
    attempt: number;
    status: "starting" | "success" | "failed";
    error?: Error;
  }) => void;
}): Promise<FallbackResult> {
  const models = [config.primary, ...config.fallbacks];
  const errors: FallbackError[] = [];

  for (let i = 0; i < models.length; i++) {
    const { provider, model } = models[i];

    onAttempt?.({ provider, model, attempt: i, status: "starting" });

    // Emit event for tracking
    eventBus.emit("fallback.attempt", {
      provider,
      model,
      attempt: i,
      isPrimary: i === 0,
    });

    try {
      if (signal?.aborted) {
        throw new Error("Aborted");
      }

      const result = await run(provider, model, i);

      onAttempt?.({ provider, model, attempt: i, status: "success" });

      // Emit success event
      eventBus.emit("fallback.success", {
        provider,
        model,
        attempt: i,
        isPrimary: i === 0,
        errors: errors.map((e) => ({
          provider: e.provider,
          model: e.model,
          code: classifyFailoverReason(e.error).code,
        })),
      });

      return {
        provider,
        model,
        result: result as unknown,
        usedFallback: i > 0,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const { retryable, code } = classifyFailoverReason(err);

      errors.push({ provider, model, error: err, isRetryable: retryable });

      onAttempt?.({ provider, model, attempt: i, status: "failed", error: err });

      // Emit failure event
      eventBus.emit("fallback.failed", {
        provider,
        model,
        attempt: i,
        code,
        retryable,
      });

      // Don't retry on non-retryable errors unless we have fallbacks
      if (!retryable && i === models.length - 1) {
        break;
      }

      // Wait before next attempt (except on last)
      if (i < models.length - 1) {
        const delay = computeBackoff(i);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // All attempts failed
  const lastError = errors[errors.length - 1];
  throw new FailoverError({
    provider: lastError?.provider || "unknown",
    model: lastError?.model || "unknown",
    message: `All model attempts failed: ${errors.map((e) => `${e.provider}/${e.model} (${e.error.message})`).join(", ")}`,
    reason: classifyFailoverReason(lastError?.error || new Error()).code,
    isRetryable: errors.some((e) => e.isRetryable),
  });
}

// Simple fallback with default config
export async function runWithSimpleFallback<T>(
  primary: ModelRef,
  fallbacks: ModelRef[],
  run: (provider: string, model: string) => Promise<T>,
): Promise<FallbackResult> {
  return runWithModelFallback({
    config: {
      primary,
      fallbacks,
      maxRetries: 3,
      retryDelayMs: 1000,
    },
    run: (p, m) => run(p, m),
  });
}
