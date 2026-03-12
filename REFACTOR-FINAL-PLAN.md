# FINAL Refactor Plan - Clean Implementation
## Remove Dead Code, Consolidate, Integrate

**Date:** 2026-03-12  
**Status:** CRITICAL DISCOVERY - Multiple competing implementations

---

## 🚨 THE SITUATION

### Current State (Chaos)
```
src/
├── agent/
│   └── context-pruning.ts          ✅ ACTIVE - Used by agent logic
│
├── extensions/core/
│   ├── context-pruning/            ❌ DEAD - Not in pi-config.ts
│   │   ├── extension.ts            ❌ Never loaded
│   │   ├── pruner.ts               ❌ Never loaded
│   │   ├── runtime.ts              ❌ Never loaded
│   │   └── settings.ts             ❌ Never loaded
│   │
│   └── context-engine-extension.ts ❌ DUPLICATE - I just created this!
│                                     (duplicates agent/context-pruning.ts)
```

### What's Actually Working
- `src/agent/context-pruning.ts` - **Exported and used**
- `src/agent/index.ts` - **Re-exports the utilities**
- Other code imports from `../agent/context-pruning.js`

### What's Dead
- `src/extensions/core/context-pruning/` - **Entire folder is dead**
  - Files exist but never registered in `pi-config.ts`
  - Extension never loads
  - Code is orphaned

### What I Just Created (Mistake)
- `src/extensions/core/context-engine-extension.ts` - **Duplicates agent/context-pruning.ts**
  - Has its own token estimation
  - Has its own importance scoring
  - Has its own strategies
  - **NEEDS TO BE DELETED AND REPLACED**

---

## 🎯 THE SOLUTION

### Step 1: DELETE Dead Code (5 min)

**Remove entire folder:**
```bash
rm -rf src/extensions/core/context-pruning/
# Or keep if there's useful code to salvage
```

**Why:** Folder exists but extension never registered in pi-config.ts

---

### Step 2: DELETE My Duplicate (5 min)

**Remove:**
```bash
rm src/extensions/core/context-engine-extension.ts
```

**Why:** Duplicates functionality in src/agent/context-pruning.ts

---

### Step 3: Create NEW Integrated Extension (30 min)

**Create:** `src/extensions/core/intelligent-context-extension.ts`

This extension will:
1. **Hook into pi-coding-agent events** (not manual CLI)
2. **Use existing strategies** from `agent/context-pruning.ts`
3. **Add Session Memory Bridge integration**
4. **Provide automatic strategy selection**

```typescript
/**
 * Intelligent Context Extension - v1.0
 * 
 * Integrates with pi-coding-agent's compaction events
 * Uses battle-tested strategies from agent/context-pruning.ts
 * Adds Session Memory Bridge enrichment
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { 
  importanceStrategy,
  smartCompactionStrategy,
  oldestFirstStrategy,
  autoPrune,
  recommendStrategy,
  DEFAULT_BUDGET,
  estimateTokens,
  type ContextBudget,
  type ContextItem,
} from "../../agent/context-pruning.js";

interface ContextConfig {
  enabled: boolean;
  strategy: 'auto' | 'oldest' | 'importance' | 'smart';
  memoryEnrichment: boolean;
  budget: ContextBudget;
}

const DEFAULT_CONFIG: ContextConfig = {
  enabled: true,
  strategy: 'auto',
  memoryEnrichment: true,
  budget: DEFAULT_BUDGET,
};

export default async function intelligentContextExtension(pi: ExtensionAPI) {
  console.log("[IntelligentContext] Extension loaded");

  // Hook into framework's compaction event
  pi.on('session_before_compact', async (event) => {
    const { sessionId, entries } = event;
    
    // Convert to ContextItem format
    const items = entries.map(e => ({
      id: e.id,
      type: e.role as any,
      content: typeof e.content === 'string' ? e.content : JSON.stringify(e.content),
      tokens: estimateTokens(typeof e.content === 'string' ? e.content : JSON.stringify(e.content)),
      importance: 50, // Default
      timestamp: Date.now(),
    }));
    
    // Use auto-prune with recommendation
    const result = autoPrune(items, DEFAULT_CONFIG.budget);
    
    if (result.wasPruned) {
      console.log(
        `[IntelligentContext] ${sessionId.slice(0, 8)}: ` +
        `${result.metrics.before}→${result.metrics.after} tokens ` +
        `(${result.result?.strategy || 'unknown'})`
      );
      
      return {
        entries: result.result?.kept || entries,
        summary: result.result?.summary,
      };
    }
    
    return undefined; // No changes
  });

  // Optional: Register strategy switching tool
  pi.registerTool({
    name: "context_strategy",
    label: "/context_strategy",
    description: "Switch context pruning strategy",
    // @ts-ignore
    parameters: {
      type: "object",
      properties: {
        strategy: {
          type: "string",
          enum: ["auto", "oldest", "importance", "smart"],
        },
      },
      required: ["strategy"],
    },
    async execute(_id, params) {
      // Store in session config
      return {
        content: [{ type: "text", text: `Strategy: ${params.strategy}` }],
        details: { strategy: params.strategy },
      };
    },
  });
}
```

---

### Step 4: Check pi-config.ts (2 min)

**Update extensions list if needed:**
```typescript
// Check if context-pruning was supposed to be here
grep -n "context" src/pi-config.ts

// If not, add our new one:
// './src/extensions/core/intelligent-context-extension.ts',
```

---

### Step 5: Update index.ts References (3 min)

**Check if context-pruning/extension is needed:**
```typescript
// In src/index.ts around line 116:
'--extension', ext('context-pruning/extension'),

// This CLI option might be dead too
// Check if --extension is used anywhere
```

---

### Step 6: Build & Test (10 min)

```bash
bun run build
# Should compile without errors

# Verify:
# - No duplicate code
# - Extension hooks work
# - Strategies from agent/context-pruning.ts are used
```

---

## 📊 Code Cleanup Summary

| File/Folder | Action | Reason |
|-------------|--------|--------|
| `src/extensions/core/context-pruning/` | **DELETE** | Dead code, never registered |
| `src/extensions/core/context-engine-extension.ts` | **DELETE** | My duplicate, replaces with integrated version |
| `src/agent/context-pruning.ts` | **KEEP** | Working utilities, used elsewhere |
| `NEW: intelligent-context-extension.ts` | **CREATE** | Hooks into framework, uses existing strategies |

---

## 🎯 Benefits

### Before (Chaos)
- 3 competing implementations
- Dead code in repo
- Duplicated token estimation
- Unused extension folder

### After (Clean)
- 1 working utility library (`agent/context-pruning.ts`)
- 1 event-driven extension (`intelligent-context-extension.ts`)
- No dead code
- Single source of truth
- Automatic context management via events

---

## ⚠️ Risks

| Risk | Mitigation |
|------|------------|
| Deleting something needed | Double-check exports from agent/index.ts |
| Breaking imports | All imports go to agent/context-pruning.ts (stable) |
| Extension not loading | Register in pi-config.ts |

---

## 🚀 Implementation Order

1. [ ] **DELETE** `src/extensions/core/context-pruning/` folder
2. [ ] **DELETE** `src/extensions/core/context-engine-extension.ts`
3. [ ] **UPDATE** `src/pi-config.ts` (remove old refs if any)
4. [ ] **CREATE** `src/extensions/core/intelligent-context-extension.ts`
5. [ ] **BUILD** `bun run build`
6. [ ] **TEST** Start TUI, check logs for "[IntelligentContext]"

---

## 📝 Final Architecture

```
┌─────────────────────────────────────┐
│       pi-coding-agent Framework     │
│  ┌──────────────────────────────┐   │
│  │  'session_before_compact'    │   │
│  │  'turn_end'                   │   │
│  └────────────┬─────────────────┘   │
└───────────────┼───────────────────────┘
                │
┌───────────────▼───────────────────────┐
│  Intelligent Context Extension      │
│  ✓ Hooks into framework events      │
│  ✓ Calls agent/context-pruning.ts   │
└───────────────┬───────────────────────┘
                │ imports
┌───────────────▼───────────────────────┐
│  src/agent/context-pruning.ts         │
│  ✓ estimateTokens()                   │
│  ✓ importanceStrategy                 │
│  ✓ smartCompactionStrategy            │
│  ✓ autoPrune()                        │
└───────────────────────────────────────┘
```

---

## ✅ Success Criteria

- [ ] `context-pruning/` folder deleted
- [ ] `context-engine-extension.ts` deleted
- [ ] `intelligent-context-extension.ts` created and working
- [ ] Build passes with no errors
- [ ] Extension hooks into `session_before_compact`
- [ ] All strategies from `agent/context-pruning.ts` available
- [ ] Console logs show context compaction metrics

---

Ready to execute? 🧹✨
