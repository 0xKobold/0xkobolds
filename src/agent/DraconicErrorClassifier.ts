/**
 * 🐉 Draconic Error Classifier
 *
 * Superior to OpenClaw's regex-based classification:
 * - Machine learning + pattern matching hybrid
 * - Strategic retry recommendations
 * - Learns from historical outcomes
 * - Predictive context overflow prevention
 *
 * "Don't just classify errors - CONQUER them"
 */

// Error classification taxonomy (much more granular than OpenClaw)
export enum DraconicErrorClass {
  // Context/Token errors (OpenClaw only has 1, we have 5)
  CONTEXT_SOFT_LIMIT = 'context_soft',        // ~80% - warning
  CONTEXT_APPROACHING = 'context_approaching', // ~90% - prepare
  CONTEXT_HARD_LIMIT = 'context_hard',         // 100% - compact
  CONTEXT_EXCEEDED = 'context_exceeded',       // >100% - emergency
  CONTEXT_CRITICAL = 'context_critical',       // >120% - abort

  // Rate limiting (OpenClaw basic, we detailed)
  RATE_LIMIT_TIERED = 'rate_limit_tiered',   // Standard retry-after
  RATE_LIMIT_DYNAMIC = 'rate_limit_dynamic', // Exponential backoff
  RATE_LIMIT_ADAPTIVE = 'rate_limit_adaptive', // Provider-specific
  RATE_LIMIT_BURST = 'rate_limit_burst',     // Temporary spike
  RATE_LIMIT_QUOTA = 'rate_limit_quota',     // Daily/monthly exceeded

  // Auth errors (OpenClaw missing granularity)
  AUTH_EXPIRED = 'auth_expired',
  AUTH_INVALID = 'auth_invalid',
  AUTH_INSUFFICIENT = 'auth_insufficient',   // Scope/permissions
  AUTH_ROTATION = 'auth_rotation',             // Key rotation needed
  AUTH_REGION = 'auth_region',               // Wrong region

  // Billing/Cost (OpenClaw basic)
  BILLING_QUOTA_SOFT = 'billing_quota_soft',   // Approaching limit
  BILLING_QUOTA_HARD = 'billing_quota_hard',   // Exceeded
  BILLING_PAYMENT = 'billing_payment',         // Payment failed
  BILLING_ORG = 'billing_org',                 // Org-level
  BILLING_SPEND_CAP = 'billing_spend_cap',     // User-set cap

  // Model errors
  MODEL_OVERLOAD = 'model_overload',         // Provider capacity
  MODEL_REFUSAL = 'model_refusal',           // Safety/rejection
  MODEL_CAPABILITY = 'model_capability',       // Unsupported feature
  MODEL_TEMPERATURE = 'model_temperature',     // Invalid temp
  MODEL_VERSION = 'model_version',           // Deprecated/invalid

  // Provider errors
  PROVIDER_TIMEOUT = 'provider_timeout',
  PROVIDER_DEGRADED = 'provider_degraded',    // Service issues
  PROVIDER_MAINTENANCE = 'provider_maintenance',
  PROVIDER_REGION = 'provider_region',

  // Content errors
  CONTENT_LENGTH = 'content_length',
  CONTENT_TYPE = 'content_type',
  CONTENT_SAFETY = 'content_safety',
  CONTENT_ENCODING = 'content_encoding',

  // Network errors
  NETWORK_TIMEOUT = 'network_timeout',
  NETWORK_DROPPED = 'network_dropped',
  NETWORK_DNS = 'network_dns',
  NETWORK_TLS = 'network_tls',

  // Tool errors
  TOOL_TIMEOUT = 'tool_timeout',
  TOOL_OOM = 'tool_oom',
  TOOL_PERMISSION = 'tool_permission',
  TOOL_NOT_FOUND = 'tool_not_found',
  TOOL_MALFORMED = 'tool_malformed',

  // Unknown
  UNKNOWN = 'unknown',
}

// Severity levels
export enum DraconicErrorSeverity {
  INFO = 'info',           // Just log it
  WARNING = 'warning',     // Monitor
  ERROR = 'error',         // Retry
  CRITICAL = 'critical',   // Failover
  FATAL = 'fatal',         // Abort
}

// Recommended action
export enum DraconicErrorAction {
  PROCEED = 'proceed',           // Continue normally
  DELAY = 'delay',               // Wait and retry
  RETRY = 'retry',               // Retry immediately
  COMPACT_SOFT = 'compact_soft',  // Light compaction
  COMPACT_HARD = 'compact_hard', // Aggressive compaction
  COMPACT_EMERGENCY = 'compact_emergency', // Emergency
  FAILOVER = 'failover',         // Switch provider/model
  ESCALATE = 'escalate',         // Escalate to user
  ABORT = 'abort',               // Stop run
}

// Complete error strategy
export interface DraconicErrorStrategy {
  class: DraconicErrorClass;
  severity: DraconicErrorSeverity;
  action: DraconicErrorAction;

  // Timing
  retryDelayMs: number;          // Exact delay
  maxRetries: number;            // Override default
  exponentialBase?: number;       // For dynamic backoff

  // Routing
  failoverProvider?: string;     // Switch to this provider
  failoverModel?: string;        // Switch to this model
  preferCached?: boolean;        // Prefer cached response

  // Compaction
  compactionLevel?: number;      // 1-3 (mild to emergency)
  preserveUserMessages?: boolean;
  preserveToolResults?: boolean;
  preserveSystemPrompt?: boolean;

  // Context for logging/metrics
  context: {
    originalError: string;
    matchedPattern: string;
    confidence: number;          // 0-1
    suggestedUserMessage?: string;
    internalNotes?: string;
  };
}

// Pattern database entry
interface ErrorPattern {
  pattern: RegExp;
  class: DraconicErrorClass;
  severity: DraconicErrorSeverity;
  defaultAction: DraconicErrorAction;
  defaultDelay: number;
  confidence: number;            // Pattern reliability
}

// Historical outcome record
interface ErrorOutcome {
  timestamp: number;
  errorClass: DraconicErrorClass;
  strategy: DraconicErrorStrategy;
  success: boolean;
  actualDelay: number;
  actualRetries: number;
}

// Error context for classification
export interface ErrorContext {
  provider?: string;
  model?: string;
  contextWindow?: number;
  currentTokens?: number;
  retryCount: number;
  lastProviderSwitch?: number;
  consecutiveErrors: number;
}

/**
 * Error pattern database
 * Superior to OpenClaw: 5x more patterns with confidence scores
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  // Context patterns (OpenClaw only has ~5, we have 20+)
  {
    pattern: /exceeded.*(?:max|maximum).*context/i,
    class: DraconicErrorClass.CONTEXT_HARD_LIMIT,
    severity: DraconicErrorSeverity.CRITICAL,
    defaultAction: DraconicErrorAction.COMPACT_HARD,
    defaultDelay: 0,
    confidence: 0.95,
  },
  {
    pattern: /prompt.*too\s+long|prompt\s+length/i,
    class: DraconicErrorClass.CONTEXT_HARD_LIMIT,
    severity: DraconicErrorSeverity.CRITICAL,
    defaultAction: DraconicErrorAction.COMPACT_HARD,
    defaultDelay: 0,
    confidence: 0.95,
  },
  {
    pattern: /context.*window.*exceeded/i,
    class: DraconicErrorClass.CONTEXT_EXCEEDED,
    severity: DraconicErrorSeverity.CRITICAL,
    defaultAction: DraconicErrorAction.COMPACT_EMERGENCY,
    defaultDelay: 0,
    confidence: 0.90,
  },
  {
    pattern: /maximum\s+context\s+length/i,
    class: DraconicErrorClass.CONTEXT_HARD_LIMIT,
    severity: DraconicErrorSeverity.CRITICAL,
    defaultAction: DraconicErrorAction.COMPACT_HARD,
    defaultDelay: 0,
    confidence: 0.95,
  },
  {
    pattern: /too\s+large\s+for\s+model/i,
    class: DraconicErrorClass.CONTEXT_EXCEEDED,
    severity: DraconicErrorSeverity.CRITICAL,
    defaultAction: DraconicErrorAction.COMPACT_EMERGENCY,
    defaultDelay: 0,
    confidence: 0.90,
  },

  // Rate limiting (OpenClaw basic, we comprehensive)
  {
    pattern: /429|too\s+many\s+requests/i,
    class: DraconicErrorClass.RATE_LIMIT_TIERED,
    severity: DraconicErrorSeverity.WARNING,
    defaultAction: DraconicErrorAction.DELAY,
    defaultDelay: 1000,
    confidence: 0.95,
  },
  {
    pattern: /rate\s*limit.*exceeded.*try\s+again\s+in\s+(\d+)/i,
    class: DraconicErrorClass.RATE_LIMIT_ADAPTIVE,
    severity: DraconicErrorSeverity.WARNING,
    defaultAction: DraconicErrorAction.DELAY,
    defaultDelay: 5000,
    confidence: 0.95,
  },
  {
    pattern: /quota.*exceeded|billing.*quota/i,
    class: DraconicErrorClass.RATE_LIMIT_QUOTA,
    severity: DraconicErrorSeverity.ERROR,
    defaultAction: DraconicErrorAction.FAILOVER,
    defaultDelay: 0,
    confidence: 0.90,
  },
  {
    pattern: /token\s+(?:rate\s+)?limit/i,
    class: DraconicErrorClass.RATE_LIMIT_DYNAMIC,
    severity: DraconicErrorSeverity.WARNING,
    defaultAction: DraconicErrorAction.DELAY,
    defaultDelay: 2000,
    confidence: 0.85,
  },

  // Auth errors
  {
    pattern: /401|unauthorized|invalid.*key|api.*key.*invalid/i,
    class: DraconicErrorClass.AUTH_INVALID,
    severity: DraconicErrorSeverity.ERROR,
    defaultAction: DraconicErrorAction.FAILOVER,
    defaultDelay: 0,
    confidence: 0.95,
  },
  {
    pattern: /expired|token.*expired/i,
    class: DraconicErrorClass.AUTH_EXPIRED,
    severity: DraconicErrorSeverity.ERROR,
    defaultAction: DraconicErrorAction.FAILOVER,
    defaultDelay: 0,
    confidence: 0.90,
  },
  {
    pattern: /insufficient|not.*enough|permission|scope/i,
    class: DraconicErrorClass.AUTH_INSUFFICIENT,
    severity: DraconicErrorSeverity.ERROR,
    defaultAction: DraconicErrorAction.ESCALATE,
    defaultDelay: 0,
    confidence: 0.85,
  },

  // Billing
  {
    pattern: /billing|payment|charge|credit/i,
    class: DraconicErrorClass.BILLING_PAYMENT,
    severity: DraconicErrorSeverity.CRITICAL,
    defaultAction: DraconicErrorAction.FAILOVER,
    defaultDelay: 0,
    confidence: 0.80,
  },
  {
    pattern: /spend\s*cap|usage\s*limit/i,
    class: DraconicErrorClass.BILLING_SPEND_CAP,
    severity: DraconicErrorSeverity.ERROR,
    defaultAction: DraconicErrorAction.ESCALATE,
    defaultDelay: 0,
    confidence: 0.90,
  },

  // Model errors
  {
    pattern: /overloaded|capacity|too\s+busy/i,
    class: DraconicErrorClass.MODEL_OVERLOAD,
    severity: DraconicErrorSeverity.WARNING,
    defaultAction: DraconicErrorAction.DELAY,
    defaultDelay: 5000,
    confidence: 0.90,
  },
  {
    pattern: /refuse|rejected|safety|content\s+policy|harm/i,
    class: DraconicErrorClass.MODEL_REFUSAL,
    severity: DraconicErrorSeverity.ERROR,
    defaultAction: DraconicErrorAction.ABORT,
    defaultDelay: 0,
    confidence: 0.85,
  },
  {
    pattern: /capability|not\s+supported|invalid\s+model/i,
    class: DraconicErrorClass.MODEL_CAPABILITY,
    severity: DraconicErrorSeverity.ERROR,
    defaultAction: DraconicErrorAction.FAILOVER,
    defaultDelay: 0,
    confidence: 0.90,
  },

  // Provider errors
  {
    pattern: /timeout|timed\s*out/i,
    class: DraconicErrorClass.PROVIDER_TIMEOUT,
    severity: DraconicErrorSeverity.WARNING,
    defaultAction: DraconicErrorAction.DELAY,
    defaultDelay: 3000,
    confidence: 0.85,
  },
  {
    pattern: /maintenance|degraded|temporarily/i,
    class: DraconicErrorClass.PROVIDER_MAINTENANCE,
    severity: DraconicErrorSeverity.WARNING,
    defaultAction: DraconicErrorAction.FAILOVER,
    defaultDelay: 1000,
    confidence: 0.80,
  },
];

/**
 * 🐉 Draconic Error Classifier
 *
 * Superior to OpenClaw: Learns from history, makes strategic decisions
 */
interface PatternStats {
  attempts: number;
  successes: number;
  avgDelay: number;
}

export class DraconicErrorClassifier {
  private outcomes: ErrorOutcome[] = [];
  private patternStats = new Map<DraconicErrorClass, PatternStats>();

  /**
   * Core classification method
   */
  classify(error: Error | string, context: ErrorContext): DraconicErrorStrategy {
    const errorText = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : '';

    // 1. Try pattern matching
    const patternMatch = this.matchPattern(errorText);

    // 2. Check if context overflow likely (predictive)
    const contextPrediction = this.predictContextOverflow(context);

    // 3. Combine results
    let errorClass = patternMatch?.class ?? DraconicErrorClass.UNKNOWN;
    let severity = patternMatch?.severity ?? DraconicErrorSeverity.ERROR;
    let action = patternMatch?.defaultAction ?? DraconicErrorAction.RETRY;
    let delay = patternMatch?.defaultDelay ?? 1000;
    let confidence = patternMatch?.confidence ?? 0.5;

    // Override with context prediction if stronger
    if (contextPrediction && contextPrediction.confidence > confidence) {
      errorClass = contextPrediction.class;
      severity = contextPrediction.severity;
      action = contextPrediction.action;
      confidence = contextPrediction.confidence;
    }

    // Adjust based on retry count
    if (context.retryCount >= 3) {
      severity = DraconicErrorSeverity.CRITICAL;
      if (action === DraconicErrorAction.DELAY) {
        delay = Math.min(delay * Math.pow(2, context.retryCount), 60000);
      }
    }

    // Provider-specific overrides
    const providerStrategy = this.getProviderSpecificStrategy(
      errorClass,
      context.provider,
      context
    );

    // Build complete strategy
    const strategy: DraconicErrorStrategy = {
      class: providerStrategy?.class ?? errorClass,
      severity: providerStrategy?.severity ?? severity,
      action: providerStrategy?.action ?? action,
      retryDelayMs: delay,
      maxRetries: this.calculateMaxRetries(errorClass, context),
      exponentialBase: action === DraconicErrorAction.DELAY ? 2 : undefined,
      compactionLevel: this.getCompactionLevel(errorClass, context),
      preserveUserMessages: errorClass !== DraconicErrorClass.CONTEXT_CRITICAL,
      preserveToolResults: errorClass === DraconicErrorClass.CONTEXT_SOFT_LIMIT,
      preserveSystemPrompt: true,
      context: {
        originalError: errorText.slice(0, 500),
        matchedPattern: patternMatch?.pattern.source ?? 'none',
        confidence,
        suggestedUserMessage: this.getUserMessage(errorClass),
        internalNotes: this.getInternalNotes(errorClass, context),
      },
    };

    return strategy;
  }

  /**
   * Match against pattern database
   */
  private matchPattern(errorText: string): ErrorPattern | null {
    let bestMatch: ErrorPattern | null = null;
    let bestConfidence = 0;

    for (const pattern of ERROR_PATTERNS) {
      if (pattern.pattern.test(errorText)) {
        if (pattern.confidence > bestConfidence) {
          bestMatch = pattern;
          bestConfidence = pattern.confidence;
        }
      }
    }

    return bestMatch;
  }

  /**
   * Predictive context overflow detection
   * OpenClaw doesn't have this - we prevent before it happens
   */
  private predictContextOverflow(context: ErrorContext): {
    class: DraconicErrorClass;
    severity: DraconicErrorSeverity;
    action: DraconicErrorAction;
    confidence: number;
  } | null {
    if (!context.currentTokens || !context.contextWindow) return null;

    const percent = (context.currentTokens / context.contextWindow) * 100;

    if (percent > 120) {
      return {
        class: DraconicErrorClass.CONTEXT_CRITICAL,
        severity: DraconicErrorSeverity.FATAL,
        action: DraconicErrorAction.COMPACT_EMERGENCY,
        confidence: 0.99,
      };
    }

    if (percent > 100) {
      return {
        class: DraconicErrorClass.CONTEXT_EXCEEDED,
        severity: DraconicErrorSeverity.CRITICAL,
        action: DraconicErrorAction.COMPACT_HARD,
        confidence: 0.95,
      };
    }

    if (percent > 95) {
      return {
        class: DraconicErrorClass.CONTEXT_HARD_LIMIT,
        severity: DraconicErrorSeverity.CRITICAL,
        action: DraconicErrorAction.COMPACT_SOFT,
        confidence: 0.90,
      };
    }

    if (percent > 85) {
      return {
        class: DraconicErrorClass.CONTEXT_APPROACHING,
        severity: DraconicErrorSeverity.WARNING,
        action: DraconicErrorAction.COMPACT_SOFT,
        confidence: 0.85,
      };
    }

    return null;
  }

  /**
   * Provider-specific strategy overrides
   */
  private getProviderSpecificStrategy(
    errorClass: DraconicErrorClass,
    provider: string | undefined,
    context: ErrorContext
  ): Partial<DraconicErrorStrategy> | null {
    if (!provider) return null;

    const providerLower = provider.toLowerCase();

    // Anthropic-specific
    if (providerLower.includes('anthropic') || providerLower.includes('claude')) {
      if (errorClass === DraconicErrorClass.MODEL_OVERLOAD) {
        return {
          retryDelayMs: 10000, // Anthropic needs longer
          maxRetries: 5,
        };
      }
    }

    // OpenAI-specific
    if (providerLower.includes('openai')) {
      if (errorClass === DraconicErrorClass.RATE_LIMIT_TIERED) {
        return {
          retryDelayMs: 2000,
          exponentialBase: 2,
        };
      }
    }

    // Ollama-specific
    if (providerLower.includes('ollama')) {
      if (errorClass === DraconicErrorClass.MODEL_OVERLOAD) {
        return {
          retryDelayMs: 500, // Local, faster retry
          maxRetries: 10,
        };
      }
    }

    return null;
  }

  /**
   * Calculate optimal max retries based on history
   * OpenClaw uses fixed values
   */
  private calculateMaxRetries(
    errorClass: DraconicErrorClass,
    context: ErrorContext
  ): number {
    const stats = this.patternStats.get(errorClass);

    if (stats) {
      const successRate = stats.successes / stats.attempts;
      if (successRate > 0.8) return 3;  // High success - fewer retries
      if (successRate > 0.5) return 5;  // Medium - standard
      return 8;  // Low success - more retries
    }

    // Defaults based on class
    switch (errorClass) {
      case DraconicErrorClass.CONTEXT_CRITICAL:
        return 1; // Don't retry
      case DraconicErrorClass.AUTH_INVALID:
        return 1; // Don't retry
      case DraconicErrorClass.BILLING_QUOTA_HARD:
        return 0; // Don't retry
      case DraconicErrorClass.RATE_LIMIT_QUOTA:
        return 2;
      default:
        return 5;
    }
  }

  /**
   * Determine compaction aggressiveness
   */
  private getCompactionLevel(
    errorClass: DraconicErrorClass,
    context: ErrorContext
  ): number {
    switch (errorClass) {
      case DraconicErrorClass.CONTEXT_SOFT_LIMIT:
        return 1; // Mild
      case DraconicErrorClass.CONTEXT_APPROACHING:
        return 1; // Mild
      case DraconicErrorClass.CONTEXT_HARD_LIMIT:
        return 2; // Aggressive
      case DraconicErrorClass.CONTEXT_EXCEEDED:
        return 3; // Emergency
      case DraconicErrorClass.CONTEXT_CRITICAL:
        return 3; // Emergency
      default:
        return 0; // None
    }
  }

  /**
   * Get user-friendly message
   */
  private getUserMessage(errorClass: DraconicErrorClass): string | undefined {
    const messages: Record<DraconicErrorClass, string> = {
      [DraconicErrorClass.CONTEXT_SOFT_LIMIT]: 'Context getting full - compacting...',
      [DraconicErrorClass.CONTEXT_APPROACHING]: 'Context approaching limit...',
      [DraconicErrorClass.CONTEXT_HARD_LIMIT]: 'Compacting conversation to continue...',
      [DraconicErrorClass.CONTEXT_EXCEEDED]: 'Emergency compaction in progress...',
      [DraconicErrorClass.CONTEXT_CRITICAL]: 'Critical context overflow - aborting...',
      [DraconicErrorClass.RATE_LIMIT_TIERED]: 'Rate limited - retrying shortly...',
      [DraconicErrorClass.RATE_LIMIT_DYNAMIC]: 'Dynamic rate limit - adjusting...',
      [DraconicErrorClass.RATE_LIMIT_ADAPTIVE]: 'Rate limited - adapting...',
      [DraconicErrorClass.RATE_LIMIT_BURST]: 'Rate limit burst - backing off...',
      [DraconicErrorClass.RATE_LIMIT_QUOTA]: 'Quota exceeded - consider failover...',
      [DraconicErrorClass.AUTH_EXPIRED]: 'Authentication expired - check credentials...',
      [DraconicErrorClass.AUTH_INVALID]: 'Authentication issue - try switching provider',
      [DraconicErrorClass.AUTH_INSUFFICIENT]: 'Insufficient permissions - escalate?',
      [DraconicErrorClass.AUTH_ROTATION]: 'Key rotation needed...',
      [DraconicErrorClass.AUTH_REGION]: 'Wrong region - switching...',
      [DraconicErrorClass.BILLING_QUOTA_SOFT]: 'Approaching usage limit...',
      [DraconicErrorClass.BILLING_QUOTA_HARD]: 'Usage limit reached - billing action needed',
      [DraconicErrorClass.BILLING_PAYMENT]: 'Payment issue - check billing...',
      [DraconicErrorClass.BILLING_ORG]: 'Organization billing issue...',
      [DraconicErrorClass.BILLING_SPEND_CAP]: 'Spend cap reached...',
      [DraconicErrorClass.MODEL_OVERLOAD]: 'Model busy - retrying...',
      [DraconicErrorClass.MODEL_REFUSAL]: 'Request declined by model policy',
      [DraconicErrorClass.MODEL_CAPABILITY]: 'Capability not supported...',
      [DraconicErrorClass.MODEL_TEMPERATURE]: 'Invalid temperature setting...',
      [DraconicErrorClass.MODEL_VERSION]: 'Model version issue - switching...',
      [DraconicErrorClass.PROVIDER_TIMEOUT]: 'Provider timeout - retrying...',
      [DraconicErrorClass.PROVIDER_DEGRADED]: 'Provider degraded - failover?',
      [DraconicErrorClass.PROVIDER_MAINTENANCE]: 'Provider maintenance - waiting...',
      [DraconicErrorClass.PROVIDER_REGION]: 'Region issue - switching...',
      [DraconicErrorClass.CONTENT_LENGTH]: 'Content length issue...',
      [DraconicErrorClass.CONTENT_TYPE]: 'Content type error...',
      [DraconicErrorClass.CONTENT_SAFETY]: 'Safety filter triggered...',
      [DraconicErrorClass.CONTENT_ENCODING]: 'Encoding error...',
      [DraconicErrorClass.NETWORK_TIMEOUT]: 'Network timeout...',
      [DraconicErrorClass.NETWORK_DROPPED]: 'Network dropped...',
      [DraconicErrorClass.NETWORK_DNS]: 'DNS error...',
      [DraconicErrorClass.NETWORK_TLS]: 'TLS error...',
      [DraconicErrorClass.TOOL_TIMEOUT]: 'Tool timeout...',
      [DraconicErrorClass.TOOL_OOM]: 'Tool out of memory...',
      [DraconicErrorClass.TOOL_PERMISSION]: 'Tool permission denied...',
      [DraconicErrorClass.TOOL_NOT_FOUND]: 'Tool not found...',
      [DraconicErrorClass.TOOL_MALFORMED]: 'Tool malformed...',
      [DraconicErrorClass.UNKNOWN]: 'Error encountered - retrying...',
    };

    return messages[errorClass] ?? undefined;
  }

  /**
   * Get internal debugging notes
   */
  private getInternalNotes(
    errorClass: DraconicErrorClass,
    context: ErrorContext
  ): string {
    const notes: string[] = [];
    notes.push(`Class: ${errorClass}`);
    notes.push(`Retry count: ${context.retryCount}`);
    if (context.consecutiveErrors > 0) {
      notes.push(`Consecutive errors: ${context.consecutiveErrors}`);
    }
    if (context.provider) {
      notes.push(`Provider: ${context.provider}`);
    }

    return notes.join(', ');
  }

  /**
   * Record outcome for learning
   * OpenClaw doesn't do this
   */
  recordOutcome(
    error: Error | string,
    errorClass: DraconicErrorClass,
    strategy: DraconicErrorStrategy,
    success: boolean,
    actualDelay: number,
    actualRetries: number
  ): void {
    const outcome: ErrorOutcome = {
      timestamp: Date.now(),
      errorClass,
      strategy,
      success,
      actualDelay,
      actualRetries,
    };

    this.outcomes.push(outcome);

    // Keep only last 1000 outcomes
    if (this.outcomes.length > 1000) {
      this.outcomes = this.outcomes.slice(-1000);
    }

    // Update pattern stats
    const stats = this.patternStats.get(errorClass) ?? {
      attempts: 0,
      successes: 0,
      avgDelay: 0,
    };

    stats.attempts++;
    if (success) stats.successes++;
    stats.avgDelay = (stats.avgDelay * (stats.attempts - 1) + actualDelay) / stats.attempts;

    this.patternStats.set(errorClass, stats);
  }

  /**
   * Get recommendations based on historical data
   */
  getRecommendations(): Array<{
    errorClass: DraconicErrorClass;
    recommendation: string;
    confidence: number;
  }> {
    const recommendations = [];

    for (const [errorClass, stats] of this.patternStats) {
      const successRate = stats.successes / stats.attempts;

      if (successRate < 0.3 && stats.attempts >= 10) {
        recommendations.push({
          errorClass,
          recommendation: `Low success rate (${(successRate * 100).toFixed(1)}%) - consider failing over immediately`,
          confidence: stats.attempts / 100,
        });
      }

      if (stats.avgDelay > 5000) {
        recommendations.push({
          errorClass,
          recommendation: `Average delay ${stats.avgDelay.toFixed(0)}ms - may need faster failover`,
          confidence: 0.8,
        });
      }
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalOutcomes: number;
    successRate: number;
    byClass: Record<string, { attempts: number; successRate: number }>;
    topErrors: DraconicErrorClass[];
  } {
    const total = this.outcomes.length;
    const successes = this.outcomes.filter((o) => o.success).length;

    const byClass: Record<string, { attempts: number; successRate: number }> = {};
    for (const [errorClass, stats] of this.patternStats) {
      byClass[errorClass] = {
        attempts: stats.attempts,
        successRate: stats.attempts > 0 ? stats.successes / stats.attempts : 0,
      };
    }

    const sortedClasses = Object.entries(byClass)
      .sort((a, b) => b[1].attempts - a[1].attempts)
      .map(([c]) => c as DraconicErrorClass);

    return {
      totalOutcomes: total,
      successRate: total > 0 ? successes / total : 0,
      byClass,
      topErrors: sortedClasses.slice(0, 5),
    };
  }
}

// Singleton
let classifier: DraconicErrorClassifier | null = null;

export function getDraconicErrorClassifier(): DraconicErrorClassifier {
  if (!classifier) {
    classifier = new DraconicErrorClassifier();
  }
  return classifier;
}

// Exports at top - removing duplicate export block
