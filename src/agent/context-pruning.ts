/**
 * Context Pruning System - v0.2.0
 * 
 * Automatic context management with token budget awareness.
 * Part of Phase 1.3: Context Pruning
 */

export interface ContextBudget {
  maxTokens: number;
  warningThreshold: number; // percentage (0-100)
  criticalThreshold: number; // percentage (0-100)
}

export interface ContextItem {
  id: string;
  type: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tokens: number;
  importance: number; // 0-100, higher = more important
  timestamp: number;
  isEssential?: boolean; // never prune
}

export interface PruningStrategy {
  name: string;
  description: string;
  prune: (items: ContextItem[], budget: ContextBudget) => PruningResult;
}

export interface PruningResult {
  kept: ContextItem[];
  pruned: ContextItem[];
  totalTokens: number;
  savedTokens: number;
  strategy: string;
}

export const DEFAULT_BUDGET: ContextBudget = {
  maxTokens: 128000, // Default for high-context models
  warningThreshold: 80,
  criticalThreshold: 95,
};

/**
 * Token estimation (rough approximation)
 */
export function estimateTokens(text: string): number {
  // ~4 chars per token on average
  return Math.ceil(text.length / 4);
}

/**
 * Calculate current token usage
 */
export function calculateTokenUsage(items: ContextItem[]): number {
  return items.reduce((sum, item) => sum + item.tokens, 0);
}

/**
 * Check if pruning is needed
 */
export function shouldPrune(
  items: ContextItem[],
  budget: ContextBudget = DEFAULT_BUDGET
): { needed: boolean; usage: number; percentage: number } {
  const usage = calculateTokenUsage(items);
  const percentage = (usage / budget.maxTokens) * 100;
  
  return {
    needed: percentage >= budget.warningThreshold,
    usage,
    percentage,
  };
}

/**
 * Strategy: Remove oldest non-essential items first
 */
export const oldestFirstStrategy: PruningStrategy = {
  name: 'oldest-first',
  description: 'Remove oldest non-essential context items',
  prune(items, budget) {
    const essential = items.filter(i => i.isEssential);
    const nonEssential = items.filter(i => !i.isEssential);
    
    // Sort by timestamp (newest first, so oldest get pruned first)
    const sorted = [...nonEssential].sort((a, b) => b.timestamp - a.timestamp);
    
    const kept: ContextItem[] = [...essential];
    const pruned: ContextItem[] = [];
    
    const buffer = budget.maxTokens * (budget.warningThreshold / 100);
    
    // Keep newest non-essential items until budget reached
    for (const item of sorted) {
      const projected = calculateTokenUsage(kept) + item.tokens;
      
      if (projected <= buffer) {
        kept.push(item);
      } else {
        pruned.push(item);
      }
    }
    
    return {
      kept: kept.sort((a, b) => a.timestamp - b.timestamp),
      pruned,
      totalTokens: calculateTokenUsage(kept),
      savedTokens: calculateTokenUsage(pruned),
      strategy: this.name,
    };
  },
};

/**
 * Strategy: Remove lowest importance items first
 */
export const importanceStrategy: PruningStrategy = {
  name: 'importance-based',
  description: 'Remove least important context items first',
  prune(items, budget) {
    // Sort by importance (highest first, so lowest importance gets pruned first)
    const sorted = [...items].sort((a, b) => b.importance - a.importance);
    
    const kept: ContextItem[] = [];
    const pruned: ContextItem[] = [];
    
    const target = budget.maxTokens * (budget.warningThreshold / 100);
    
    for (const item of sorted) {
      if (item.isEssential) {
        kept.push(item);
        continue;
      }
      
      const projected = calculateTokenUsage(kept) + item.tokens;
      
      if (projected <= target) {
        kept.push(item);
      } else {
        pruned.push(item);
      }
    }
    
    return {
      kept: kept.sort((a, b) => a.timestamp - b.timestamp),
      pruned,
      totalTokens: calculateTokenUsage(kept),
      savedTokens: calculateTokenUsage(pruned),
      strategy: this.name,
    };
  },
};

/**
 * Strategy: Smart compaction (summarize old content)
 */
export const smartCompactionStrategy: PruningStrategy = {
  name: 'smart-compaction',
  description: 'Summarize old content instead of removing',
  prune(items, budget) {
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;
    
    const essential = items.filter(i => i.isEssential || i.type === 'system');
    const recent = items.filter(i => 
      !i.isEssential && 
      i.type !== 'system' && 
      (now - i.timestamp) < fiveMinutes
    );
    const old = items.filter(i => 
      !i.isEssential && 
      i.type !== 'system' && 
      (now - i.timestamp) >= fiveMinutes
    );
    
    const kept = [...essential, ...recent];
    const summarized: ContextItem[] = [];
    
    // Summarize old items
    if (old.length > 0) {
      const summaryContent = summarizeContext(old);
      const summary: ContextItem = {
        id: `summary-${Date.now()}`,
        type: 'system',
        content: summaryContent,
        tokens: estimateTokens(summaryContent),
        importance: 50,
        timestamp: Date.now(),
      };
      summarized.push(summary);
    }
    
    // Check if we need further pruning
    const totalKept = [...kept, ...summarized];
    const usage = calculateTokenUsage(totalKept);
    
    if (usage > budget.maxTokens * 0.8) {
      // Fall back to oldest-first for remaining
      const extraPruning = oldestFirstStrategy.prune(totalKept, budget);
      return {
        ...extraPruning,
        kept: [...extraPruning.kept, ...summarized],
        pruned: [...extraPruning.pruned, ...old],
        strategy: this.name,
      };
    }
    
    return {
      kept: [...kept, ...summarized],
      pruned: old,
      totalTokens: calculateTokenUsage([...kept, ...summarized]),
      savedTokens: calculateTokenUsage(old) - calculateTokenUsage(summarized),
      strategy: this.name,
    };
  },
};

/**
 * Summarize old context items
 */
function summarizeContext(items: ContextItem[]): string {
  const byType: Record<string, ContextItem[]> = {};
  
  for (const item of items) {
    if (!byType[item.type]) byType[item.type] = [];
    byType[item.type].push(item);
  }
  
  const parts: string[] = ['[Context Summary: Previous conversation condensed]'];
  
  if (byType['tool']) {
    const toolCount = byType['tool'].length;
    parts.push(`- Executed ${toolCount} tool calls`);
  }
  
  if (byType['user']) {
    const userCount = byType['user'].length;
    parts.push(`- ${userCount} user messages`);
  }
  
  if (byType['assistant']) {
    const assistantCount = byType['assistant'].length;
    parts.push(`- ${assistantCount} assistant responses`);
  }
  
  parts.push('Details available in full context if needed.');
  
  return parts.join('\n');
}

/**
 * Prune context with specified strategy
 */
export function pruneContext(
  items: ContextItem[],
  strategy: PruningStrategy,
  budget: ContextBudget = DEFAULT_BUDGET
): PruningResult {
  return strategy.prune(items, budget);
}

/**
 * Get recommended strategy based on context state
 */
export function recommendStrategy(
  items: ContextItem[],
  budget: ContextBudget = DEFAULT_BUDGET
): PruningStrategy {
  const { percentage } = shouldPrune(items, budget);
  
  if (percentage >= budget.criticalThreshold) {
    return smartestPruningStrategy;
  }
  
  if (percentage >= budget.warningThreshold) {
    return smartCompactionStrategy;
  }
  
  return importanceStrategy;
}

/**
 * Auto-prune if needed
 */
export function autoPrune(
  items: ContextItem[],
  budget: ContextBudget = DEFAULT_BUDGET
): { 
  result: PruningResult | null; 
  wasPruned: boolean; 
  metrics: { before: number; after: number; percentage: number };
} {
  const { needed, usage, percentage } = shouldPrune(items, budget);
  
  if (!needed) {
    return {
      result: null,
      wasPruned: false,
      metrics: { before: usage, after: usage, percentage },
    };
  }
  
  const strategy = recommendStrategy(items, budget);
  const result = pruneContext(items, strategy, budget);
  
  return {
    result,
    wasPruned: true,
    metrics: {
      before: usage,
      after: result.totalTokens,
      percentage: (result.totalTokens / budget.maxTokens) * 100,
    },
  };
}

/**
 * Advanced strategy: Smartest pruning (combines multiple techniques)
 */
export const smartestPruningStrategy: PruningStrategy = {
  name: 'smartest',
  description: 'Most aggressive pruning with multi-pass approach',
  prune(items, budget) {
    // First pass: remove duplicates and near-duplicates
    const unique = removeDuplicates(items);
    
    // Second pass: compact old items
    const compacted = smartCompactionStrategy.prune(unique, budget);
    
    // Third pass: importance-based if still over budget
    if (compacted.totalTokens > budget.maxTokens * 0.95) {
      return importanceStrategy.prune(compacted.kept, budget);
    }
    
    return {
      ...compacted,
      strategy: this.name,
    };
  },
};

/**
 * Remove duplicate content
 */
function removeDuplicates(items: ContextItem[]): ContextItem[] {
  const seen = new Set<string>();
  const unique: ContextItem[] = [];
  
  for (const item of items) {
    // Simple hash of content
    const hash = item.content.slice(0, 100);
    
    if (!seen.has(hash) || item.isEssential || item.type === 'system') {
      seen.add(hash);
      unique.push(item);
    }
  }
  
  return unique;
}

/**
 * Context budget presets
 */
export const BUDGET_PRESETS: Record<string, ContextBudget> = {
  conservative: {
    maxTokens: 32000,
    warningThreshold: 70,
    criticalThreshold: 85,
  },
  balanced: DEFAULT_BUDGET,
  aggressive: {
    maxTokens: 200000,
    warningThreshold: 90,
    criticalThreshold: 98,
  },
};
