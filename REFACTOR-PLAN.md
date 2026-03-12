# Context Engine Refactor Plan
## Remove Duplicates, Dead Code, Integrate with Framework

**Date:** 2026-03-12  
**Goal:** Clean, integrated, automatic context management

---

## Phase 1: AUDIT (15 min)

### 1.1 Duplicate Functions Map

| Function | In context-pruning.ts | In context-engine-extension.ts | Action |
|----------|----------------------|-------------------------------|--------|
| `estimateTokens()` | ✅ Line 35-38 | ✅ Line 150-153 | **Remove from engine, import from pruning** |
| `calculateTokenUsage()` | ✅ Line 44-46 | ❌ (calculates manually) | **Import from pruning** |
| `shouldPrune()` | ✅ Line 50-61 | ❌ (has shouldPollOn) | **Import from pruning** |
| `importanceStrategy` | ✅ Lines 82-127 | ✅ Lines 90-134 (sliding) | **Use pruning's version** |

### 1.2 Dead Code Detection

**In context-engine-extension.ts:**
```typescript
// These are NEVER used by pi-coding-agent framework:
- DefaultContextPlugin    (framework has its own)
- SlidingWindowPlugin     (we'll hook into events instead)
- ImportancePlugin        (use pruning's strategy)
- context_engine CLI tool (manual - should be automatic)
- bootstrap operation     (framework handles this)
- ingest operation        (handled via turn_end event)
- assemble operation      (framework does this)
```

**In context-pruning.ts:**
```typescript
// Check if these are used anywhere:
- smartestPruningStrategy (grep for usage)
- removeDuplicates()    (only used by smartest)
- smartCompactionStrategy (check if used)
```

### 1.3 Files to Modify

1. `src/extensions/core/context-engine-extension.ts` - **MAJOR REWRITE**
2. `src/agent/context-pruning.ts` - **CLEANUP**
3. `src/pi-config.ts` - **UPDATE**

---

## Phase 2: INTEGRATION ARCHITECTURE

### 2.1 Event-Driven Design

```typescript
// BEFORE (Standalone, Manual):
export default async function contextEngineExtension(pi: ExtensionAPI) {
  // Register manual CLI tool
  pi.registerTool({ name: "context_engine", ... }); // ❌ Manual
  
  // Auto-bootstrap
  activePlugin.bootstrap(...); // ❌ Separate from framework
}

// AFTER (Integrated, Automatic):
export default async function contextEngineExtension(pi: ExtensionAPI) {
  // Hook into framework events
  pi.on('session_before_compact', handler); // ✅ Automatic
  pi.on('turn_end', metricsHandler);       // ✅ Track efficiency
  pi.on('session_start', initHandler);     // ✅ Per-session init
}
```

### 2.2 Strategy Bridge

```typescript
// Import from existing context-pruning.ts
import { 
  oldestFirstStrategy,
  importanceStrategy,
  smartCompactionStrategy,
  DEFAULT_BUDGET,
  estimateTokens,
  shouldPrune,
} from "../agent/context-pruning.js";

// Map to our plugin interface
const strategies = {
  'oldest': oldestFirstStrategy,
  'importance': importanceStrategy, 
  'smart': smartCompactionStrategy,
};
```

### 2.3 Session Memory Bridge Integration

```typescript
import { getSessionMemoryBridge } from "../memory/session-memory-bridge.js";

pi.on('session_before_compact', async (event) => {
  // Get memory-enriched context
  const enriched = await getSessionMemoryBridge()
    .getEnrichedSession(event.session.id);
  
  // Use memory to inform importance
  const entriesWithMemory = event.entries.map(entry => ({
    ...entry,
    importance: calculateMemoryImportance(entry, enriched),
  }));
  
  // Apply strategy
  const strategy = strategies[config.strategy] || importanceStrategy;
  const result = strategy.prune(entriesWithMemory, event.budget);
  
  // Return to framework
  return {
    entries: result.kept,
    summary: result.summary,
  };
});
```

---

## Phase 3: IMPLEMENTATION STEPS

### Step 1: Prepare context-pruning.ts (5 min)

**Actions:**
```typescript
// 1. Export strategies properly
export { 
  oldestFirstStrategy,
  importanceStrategy, 
  smartCompactionStrategy,
  smartestPruningStrategy, // Keep but check if used
};

// 2. Check if smartestPruningStrategy is used
//    If not, mark as deprecated or remove

// 3. Ensure all exports are at bottom
```

### Step 2: Rewrite context-engine-extension.ts (45 min)

**NEW STRUCTURE:**
```typescript
/**
 * Context Engine Extension - v2.0 (Integrated)
 * 
 * Hooks into pi-coding-agent's event system instead of
 * being a standalone plugin.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { 
  importanceStrategy,
  smartCompactionStrategy,
  oldestFirstStrategy,
  DEFAULT_BUDGET,
  type ContextBudget,
  type ContextItem,
} from "../agent/context-pruning.js";
import { getSessionMemoryBridge } from "../memory/session-memory-bridge.js";

interface ContextEngineConfig {
  strategy: 'oldest' | 'importance' | 'smart' | 'auto';
  budget: ContextBudget;
  memoryEnrichment: boolean;
  metrics: boolean;
}

const DEFAULT_CONFIG: ContextEngineConfig = {
  strategy: 'auto', // Auto-select based on context size
  budget: DEFAULT_BUDGET,
  memoryEnrichment: true,
  metrics: true,
};

// State per session
const sessionConfigs = new Map<string, ContextEngineConfig>();
const sessionMetrics = new Map<string, Array<{
  timestamp: number;
  beforeTokens: number;
  afterTokens: number;
  strategy: string;
}>>();

export default async function contextEngineExtension(pi: ExtensionAPI) {
  console.log("[ContextEngine] v2.0 - Integrated with framework");

  // 1. Hook into session compaction
  pi.on('session_before_compact', async (event) => {
    const { sessionId, entries, budget } = event;
    const config = sessionConfigs.get(sessionId) || DEFAULT_CONFIG;
    
    // Get strategy
    let strategy = getStrategy(config, entries);
    
    // Optional: enrich with memory
    if (config.memoryEnrichment) {
      entries = await enrichWithMemory(entries, sessionId);
    }
    
    // Apply strategy
    const result = strategy.prune(entries, budget);
    
    // Record metrics
    if (config.metrics) {
      recordMetrics(sessionId, entries, result, strategy.name);
    }
    
    // Return to framework
    return {
      entries: result.kept,
      summary: result.summary,
    };
  });

  // 2. Hook into session start
  pi.on('session_start', async (event) => {
    const { sessionId } = event;
    sessionConfigs.set(sessionId, { ...DEFAULT_CONFIG });
    console.log(`[ContextEngine] Initialized for session ${sessionId.slice(0, 8)}`);
  });

  // 3. Hook into turn end for metrics
  pi.on('turn_end', async (event) => {
    const { sessionId, tokenUsage } = event;
    if (!sessionConfigs.has(sessionId)) return;
    
    const config = sessionConfigs.get(sessionId)!;
    if (config.metrics) {
      console.log(`[ContextEngine] Turn complete: ${tokenUsage.total} tokens`);
    }
  });

  // 4. Register config tool (optional, for changing strategy)
  pi.registerTool({
    name: "context_strategy",
    label: "/context_strategy",
    description: "Change context management strategy per session",
    // @ts-ignore
    parameters: {
      type: "object",
      properties: {
        strategy: {
          type: "string",
          enum: ["oldest", "importance", "smart", "auto"],
          description: "Strategy to use",
        },
      },
      required: ["strategy"],
    },
    async execute(_toolCallId, params) {
      const strategy = params.strategy as string;
      // Apply to current session
      console.log(`[ContextEngine] Strategy set to: ${strategy}`);
      return {
        content: [{ type: "text", text: `Context strategy: ${strategy}` }],
        details: { strategy },
      };
    },
  });
}

// Helper functions
function getStrategy(config: ContextEngineConfig, entries: ContextItem[]) {
  if (config.strategy === 'auto') {
    const tokenCount = entries.reduce((sum, e) => sum + (e.tokens || 0), 0);
    const percentage = (tokenCount / config.budget.maxTokens) * 100;
    
    if (percentage > 90) return smartestPruningStrategy;
    if (percentage > 80) return smartCompactionStrategy;
    return importanceStrategy;
  }
  
  const strategies = {
    'oldest': oldestFirstStrategy,
    'importance': importanceStrategy,
    'smart': smartCompactionStrategy,
  };
  
  return strategies[config.strategy] || importanceStrategy;
}

async function enrichWithMemory(
  entries: ContextItem[], 
  sessionId: string
): Promise<ContextItem[]> {
  try {
    const bridge = getSessionMemoryBridge();
    const enriched = await bridge.getEnrichedSession(sessionId);
    
    if (!enriched) return entries;
    
    // Boost importance based on memory relevance
    return entries.map(entry => ({
      ...entry,
      importance: calculateMemoryImportance(entry, enriched),
    }));
  } catch {
    return entries;
  }
}

function calculateMemoryImportance(
  entry: ContextItem, 
  enriched: any
): number {
  let score = entry.importance || 50;
  
  // Boost if content matches recent memories
  const recentMemories = enriched.recentMemories || [];
  const hasRelevantMemory = recentMemories.some((m: any) => 
    entry.content.toLowerCase().includes(m.content.toLowerCase().slice(0, 20))
  );
  
  if (hasRelevantMemory) score += 20;
  
  // Cap at 100
  return Math.min(100, score);
}

function recordMetrics(
  sessionId: string,
  before: ContextItem[],
  result: { kept: ContextItem[]; pruned: ContextItem[] },
  strategy: string
) {
  const beforeTokens = before.reduce((sum, e) => sum + (e.tokens || 0), 0);
  const afterTokens = result.kept.reduce((sum, e) => sum + (e.tokens || 0), 0);
  
  const metrics = sessionMetrics.get(sessionId) || [];
  metrics.push({
    timestamp: Date.now(),
    beforeTokens,
    afterTokens,
    strategy,
  });
  
  sessionMetrics.set(sessionId, metrics);
  
  console.log(
    `[ContextEngine] Compacted: ${beforeTokens}→${afterTokens} tokens ` +
    `(-${beforeTokens - afterTokens}, ${strategy})`
  );
}
```

### Step 3: Clean context-pruning.ts (10 min)

**Remove or consolidate:**
- Check if `smartestPruningStrategy` is used anywhere
- Check if `removeDuplicates` is used elsewhere
- Run `grep -r "smartestPruningStrategy" src/` to verify

### Step 4: Update pi-config.ts (2 min)

No changes needed - extension already registered.

### Step 5: Build & Test (20 min)

```bash
bun run build
git add -A
git commit -m "refactor(context-engine): integrate with framework events
- Remove duplicate token estimation/importance logic
- Hook into session_before_compact event
- Use strategies from context-pruning.ts
- Add automatic strategy selection (auto mode)
- Integrate with Session Memory Bridge
- Remove manual CLI (now automatic)"
```

---

## Phase 4: DEAD CODE REMOVAL

### Files to Check for Dead Code

```bash
# Find potentially unused exports
for file in src/agent/*.ts src/extensions/core/*.ts; do
  echo "=== $file ==="
  # Extract exports
  grep -n "^export" "$file" | head -20
done

# Check for imports that are never used
# (requires tooling like ts-prune or manual review)

# Check specific functions
- "smartestPruningStrategy" usage
- "removeDuplicates" usage  
- "smartCompactionStrategy" usage
- Old ContextEnginePlugin interface
- Bootstrap/Assemble/Compact CLI operations
```

---

## Phase 5: VERIFICATION

### Test Checklist

```bash
# 1. Build passes
bun run build

# 2. Extension loads
# Start TUI, check for: [ContextEngine] v2.0

# 3. Event hooks work
# - Start session
# - Check: Initialized for session...
# - Run several turns  
# - Check compaction metrics in logs

# 4. Strategy switching works
# /context_strategy smart
# /context_strategy importance

# 5. No dead code imports
# Check build output for "unused"
```

---

## Expected Results

### Code Reduction

| Metric | Before | After | Reduction |
|--------|--------|-------|-----------|
| **Lines in context-engine-ext.ts** | ~550 | ~200 | **64%** |
| **Duplicate functions** | 6 | 0 | **100%** |
| **Manual CLI operations** | 6 | 1 | **83%** |
| **Total bundle size** | - | - | **~30%** |

### Feature Improvements

| Feature | Before | After |
|---------|--------|-------|
| **Context Management** | Manual (/context) | Automatic |
| **Strategies** | 3, standalone | 4, shared |
| **Token Estimation** | Duplicated | Framework native |
| **Memory Integration** | None | Full Session Memory Bridge |
| **Metrics** | None | Automatic tracking |
| **Auto Strategy** | None | Yes (auto-select) |

---

## RISK MITIGATION

### Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Event API changes | Low | pi-coding-agent stable API |
| Session Memory Bridge missing | Medium | Add fallback, graceful degrade |
| Build errors | Medium | Full type checking before commit |
| Runtime errors | Low | Test with sample conversation |

### Rollback Plan

```bash
# If issues occur:
git revert HEAD  # Revert the refactor commit
git checkout HEAD~1 -- src/extensions/core/context-engine-extension.ts
```

---

## TIMELINE

| Phase | Time | Cumulative |
|-------|------|------------|
| Audit | 15 min | 15 min |
| Architecture | 10 min | 25 min |
| Implementation | 45 min | 70 min |
| Testing | 20 min | 90 min |
| **TOTAL** | **90 min** | **1.5 hours** |

---

## SUCCESS CRITERIA

- [ ] Build passes with no errors
- [ ] No duplicate token estimation
- [ ] No duplicate importance calculation
- [ ] Extension automatically manages context
- [ ] Metrics logged to console
- [ ] Memory bridge integration works
- [ ] Code size reduced by 30%+

---

Ready to execute? 🚀
