/**
 * 🔮 Draconic Token Predictor
 *
 * Superior to OpenClaw (which has no prediction):
 * - Estimates tokens before API call
 * - Prevents context overflow pro-actively
 * - Suggests actions (proceed/compact/split)
 * - Model-aware pricing
 *
 * "Predict the future, control the present"
 */

// Token estimate result
export interface TokenEstimate {
  // Input side
  input: {
    total: number;
    system: number;
    history: number;
    currentPrompt: number;
  };

  // Output side
  output: {
    min: number;
    expected: number;
    max: number;
    confidence: number; // 0-1
  };

  // Context window usage
  contextWindow: {
    total: number;
    used: number;
    remaining: number;
    percent: number;
  };

  // Decision
  willFit: boolean;
  suggestedAction: "proceed" | "compact" | "split" | "abort";
  reason: string;

  // Cost estimate
  cost?: {
    currency: string;
    input: number;
    output: {
      min: number;
      expected: number;
      max: number;
    };
    total: {
      min: number;
      expected: number;
      max: number;
    };
  };
}

// Input to estimate
export interface PredictionInput {
  systemPrompt?: string;
  history: Array<{ role: string; content: string }>;
  currentPrompt: string;
  expectedOutputLength?: "short" | "medium" | "long" | "very_long";
  contextWindow: number;
  model: string;
}

// Model tokenization info
interface ModelTokenization {
  tokensPerChar: number;
  tokensPerWord: number;
  overheadPerMessage: number;
  overheadPerTool: number;
  outputMultiplier: number; // Expected output/input ratio
}

// Cost per 1K tokens
interface ModelPricing {
  input: number;
  output: number;
  currency: string;
}

/**
 * 🐉 Draconic Token Predictor
 *
 * Superior to OpenClaw: Predicts BEFORE sending
 */
export class DraconicTokenPredictor {
  // Model-specific tokenization characteristics
  private readonly modelCharacteristics = new Map<string, ModelTokenization>([
    // Anthropic Models
    [
      "claude-3-opus",
      {
        tokensPerChar: 0.25, // ~4 chars per token
        tokensPerWord: 1.3,
        overheadPerMessage: 4,
        overheadPerTool: 10,
        outputMultiplier: 2.0,
      },
    ],
    [
      "claude-3-sonnet",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 4,
        overheadPerTool: 10,
        outputMultiplier: 1.5,
      },
    ],
    // OpenAI Models
    [
      "gpt-4",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.8,
      },
    ],
    [
      "gpt-4-turbo",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.5,
      },
    ],
    // Ollama Models (Llama-based)
    [
      "llama3.1",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.5,
      },
    ],
    [
      "llama3.1:8b",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.2,
      },
    ],
    [
      "llama3.1:70b",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.8,
      },
    ],
    [
      "llama3.2",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.3,
      },
    ],
    [
      "qwen2.5",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.4,
      },
    ],
    [
      "qwen2.5:14b",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.5,
      },
    ],
    [
      "mistral",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.4,
      },
    ],
    [
      "mistral-nemo",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.3,
      },
    ],
    [
      "gemma2",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.3,
      },
    ],
    [
      "deepseek-coder",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 4,
        overheadPerTool: 10,
        outputMultiplier: 1.8,
      },
    ],
    [
      "deepseek-coder-v2",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 4,
        overheadPerTool: 10,
        outputMultiplier: 2.0,
      },
    ],
    // Cloud Ollama Models
    [
      "llama3.1:cloud",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.5,
      },
    ],
    [
      "llama3.2:cloud",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.3,
      },
    ],
    [
      "qwen2.5:cloud",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.4,
      },
    ],
    [
      "minimax-m2.5:cloud",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.4,
      },
    ],
    [
      "kimi-k2.5:cloud",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 4,
        overheadPerTool: 10,
        outputMultiplier: 1.8,
      },
    ],
    // Default for unknown Ollama models
    [
      "ollama",
      {
        tokensPerChar: 0.25,
        tokensPerWord: 1.3,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.3,
      },
    ],
    [
      "default",
      {
        tokensPerChar: 0.3,
        tokensPerWord: 1.5,
        overheadPerMessage: 3,
        overheadPerTool: 8,
        outputMultiplier: 1.5,
      },
    ],
  ]);

  // Model pricing (per 1K tokens)
  // Ollama models are free (local compute only)
  private readonly modelPricing = new Map<string, ModelPricing>([
    // Anthropic Models
    ["claude-3-opus", { input: 15.0, output: 75.0, currency: "USD" }],
    ["claude-3-sonnet", { input: 3.0, output: 15.0, currency: "USD" }],
    ["claude-3-haiku", { input: 0.25, output: 1.25, currency: "USD" }],
    // OpenAI Models
    ["gpt-4", { input: 30.0, output: 60.0, currency: "USD" }],
    ["gpt-4-turbo", { input: 10.0, output: 30.0, currency: "USD" }],
    ["gpt-3.5-turbo", { input: 0.5, output: 1.5, currency: "USD" }],
    // Ollama Models (Free - Local compute)
    ["llama3.1", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["llama3.1:8b", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["llama3.1:70b", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["llama3.2", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["qwen2.5", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["qwen2.5:14b", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["mistral", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["mistral-nemo", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["gemma2", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["deepseek-coder", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["deepseek-coder-v2", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    // Cloud Ollama Models
    ["llama3.1:cloud", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["llama3.2:cloud", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["qwen2.5:cloud", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["minimax-m2.5:cloud", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["kimi-k2.5:cloud", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["ollama", { input: 0.0, output: 0.0, currency: "LOCAL" }],
    ["default", { input: 3.0, output: 6.0, currency: "USD" }],
  ]);

  private static instance: DraconicTokenPredictor | null = null;

  static getInstance(): DraconicTokenPredictor {
    if (!DraconicTokenPredictor.instance) {
      DraconicTokenPredictor.instance = new DraconicTokenPredictor();
    }
    return DraconicTokenPredictor.instance;
  }

  /**
   * Estimate tokens for a request
   * OpenClaw does NOT have this - it just sends and hopes
   */
  estimate(input: PredictionInput): TokenEstimate {
    const characteristics = this.getModelCharacteristics(input.model);

    // Calculate input tokens
    const systemTokens = this.estimateTokens(input.systemPrompt ?? "", characteristics);

    const historyTokens = input.history.reduce((sum, msg) => {
      const contentTokens = this.estimateTokens(msg.content || "", characteristics);
      return sum + contentTokens + characteristics.overheadPerMessage;
    }, 0);

    const currentTokens =
      this.estimateTokens(input.currentPrompt, characteristics) +
      characteristics.overheadPerMessage;

    const totalInput = systemTokens + historyTokens + currentTokens;

    // Calculate output estimate
    const outputStrategy = this.getOutputEstimate(
      input.expectedOutputLength ?? "medium",
      currentTokens,
      characteristics
    );

    // Context analysis
    const used = totalInput;
    const remaining = input.contextWindow - used;
    const percent = (used / input.contextWindow) * 100;

    // Decide action
    const suggestion = this.suggestAction(percent, remaining, outputStrategy.expected);

    // Cost calculation
    const pricing = this.getModelPricing(input.model);
    const cost = this.calculateCost(totalInput, outputStrategy, pricing);

    return {
      input: {
        total: totalInput,
        system: systemTokens,
        history: historyTokens,
        currentPrompt: currentTokens,
      },
      output: outputStrategy,
      contextWindow: {
        total: input.contextWindow,
        used,
        remaining,
        percent,
      },
      willFit: suggestion.willFit,
      suggestedAction: suggestion.action,
      reason: suggestion.reason,
      cost,
    };
  }

  /**
   * Estimate tokens for text
   * Uses character-based approximation (fast) with word fallback
   */
  estimateTokens(text: string, characteristics: ModelTokenization): number {
    // Character-based estimate (most accurate for quick estimation)
    const charTokens = Math.ceil(text.length * characteristics.tokensPerChar);

    // Word-based estimate (backup)
    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
    const wordTokens = Math.ceil(wordCount * characteristics.tokensPerWord);

    // Use character estimate as primary (more reliable for code)
    // Average with word estimate for accuracy
    return Math.round((charTokens * 0.7 + wordTokens * 0.3));
  }

  /**
   * Get output token estimates
   */
  private getOutputEstimate(
    length: "short" | "medium" | "long" | "very_long",
    inputTokens: number,
    characteristics: ModelTokenization
  ): TokenEstimate["output"] {
    const baseMultiplier = {
      short: 0.5,
      medium: 1.0,
      long: 3.0,
      very_long: 8.0,
    }[length];

    const expectedMultiplier = characteristics.outputMultiplier * baseMultiplier;
    const expected = Math.round(inputTokens * expectedMultiplier);

    return {
      min: Math.round(expected * 0.2), // Could be very short
      expected,
      max: Math.round(expected * 3), // Could expand significantly
      confidence: {
        short: 0.9, // More predictable
        medium: 0.8,
        long: 0.6, // Less predictable
        very_long: 0.4, // Hard to predict
      }[length],
    };
  }

  /**
   * Suggest action based on context usage
   */
  private suggestAction(
    percent: number,
    remaining: number,
    expectedOutput: number
  ): { willFit: boolean; action: TokenEstimate["suggestedAction"]; reason: string } {
    if (percent >= 100) {
      return {
        willFit: false,
        action: "abort",
        reason: `Context window exceeded (${percent.toFixed(1)}%). Cannot proceed.`,
      };
    }

    if (percent > 95) {
      return {
        willFit: false,
        action: "compact",
        reason: `Context at ${percent.toFixed(1)}% - emergency compaction needed.`,
      };
    }

    if (percent > 85) {
      return {
        willFit: false,
        action: "compact",
        reason: `Context at ${percent.toFixed(1)}% - compaction recommended.`,
      };
    }

    if (remaining < expectedOutput) {
      return {
        willFit: false,
        action: "split",
        reason: `Only ${remaining} tokens left but expect ${expectedOutput} output. Split request.`,
      };
    }

    if (percent > 70) {
      return {
        willFit: true,
        action: "proceed",
        reason: `Context at ${percent.toFixed(1)}% - will fit but monitor closely.`,
      };
    }

    return {
      willFit: true,
      action: "proceed",
      reason: `Context at ${percent.toFixed(1)}% - safe to proceed.`,
    };
  }

  /**
   * Calculate cost estimate
   */
  private calculateCost(
    inputTokens: number,
    output: TokenEstimate["output"],
    pricing: ModelPricing
  ): TokenEstimate["cost"] {
    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputMin = (output.min / 1000) * pricing.output;
    const outputExpected = (output.expected / 1000) * pricing.output;
    const outputMax = (output.max / 1000) * pricing.output;

    return {
      currency: pricing.currency,
      input: Math.round(inputCost * 10000) / 10000,
      output: {
        min: Math.round(outputMin * 10000) / 10000,
        expected: Math.round(outputExpected * 10000) / 10000,
        max: Math.round(outputMax * 10000) / 10000,
      },
      total: {
        min: Math.round((inputCost + outputMin) * 10000) / 10000,
        expected: Math.round((inputCost + outputExpected) * 10000) / 10000,
        max: Math.round((inputCost + outputMax) * 10000) / 10000,
      },
    };
  }

  /**
   * Quick estimate (for rapid checks)
   */
  quickEstimate(text: string, model: string): number {
    const characteristics = this.getModelCharacteristics(model);
    return this.estimateTokens(text, characteristics);
  }

  /**
   * Estimate multiple messages
   */
  estimateMessages(
    messages: Array<{ role: string; content: string }>,
    model: string
  ): { total: number; byMessage: number[] } {
    const characteristics = this.getModelCharacteristics(model);
    const byMessage = messages.map((m) => this.estimateTokens(m.content || "", characteristics));
    const total = byMessage.reduce((a, b) => a + b, 0);

    return { total, byMessage };
  }

  /**
   * Get model characteristics
   */
  private getModelCharacteristics(model: string): ModelTokenization {
    // Find best match
    for (const [key, value] of this.modelCharacteristics) {
      if (model.toLowerCase().includes(key)) {
        return value;
      }
    }
    return this.modelCharacteristics.get("default")!;
  }

  /**
   * Get model pricing
   */
  private getModelPricing(model: string): ModelPricing {
    for (const [key, value] of this.modelPricing) {
      if (model.toLowerCase().includes(key)) {
        return value;
      }
    }
    return this.modelPricing.get("default")!;
  }

  /**
   * Estimate if compaction is needed
   */
  shouldCompact(estimate: TokenEstimate): boolean {
    return estimate.suggestedAction === "compact" || estimate.suggestedAction === "abort";
  }

  /**
   * Estimate how much to compact
   */
  getCompactionTarget(estimate: TokenEstimate): number {
    const targetPercent = 50; // Aim for 50% usage
    const targetTokens = (estimate.contextWindow.total * targetPercent) / 100;
    return Math.max(0, estimate.contextWindow.used - targetTokens);
  }
}

// Singleton
export const getDraconicTokenPredictor = DraconicTokenPredictor.getInstance;

// Convenience functions
export function estimateTokens(text: string, model = "default"): number {
  return getDraconicTokenPredictor().quickEstimate(text, model);
}

export function estimateMessages(
  messages: Array<{ role: string; content: string }>,
  model: string
): { total: number; byMessage: number[] } {
  return getDraconicTokenPredictor().estimateMessages(messages, model);
}
