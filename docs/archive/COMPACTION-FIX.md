# Compaction Safeguard: OpenClaw Research & Fix

## Problem: Terminal Freezing

Our original `auto-compact-on-error-extension.ts` was causing terminal freezes because:
- Hooked into **`turn_end` event** (runs on EVERY turn)
- Performed regex matching on every message
- No token estimation - just error detection

## OpenClaw's Correct Approach

After researching `koclaw/src/agents/pi-extensions/compaction-safeguard.ts`:

### Key Differences

| Aspect | **OpenClaw** ✅ | **Our Old** ❌ |
|--------|-----------------|---------------|
| **Event** | `session_before_compact` | `turn_end` |
| **Runs When** | Only when compaction triggered | Every single turn |
| **Token Estimation** | Sophisticated calculation | None |
| **History Pruning** | Adaptive based on context | None |
| **Quality Guard** | Multiple retry logic | None |
| **Cancellation** | Can cancel if unsafe | Always retries |

### OpenClaw Architecture

```
Event: session_before_compact
    │
    ▼
┌────────────────────────────────┐
│ Compaction Safeguard Extension │
│                                │
│ 1. Check messages exist        │
│ 2. Estimate tokens             │
│ 3. Calculate context budget    │
│ 4. Prune history if needed     │
│ 5. Modify instructions         │
│ 6. Return cancel/modified      │
└────────────────────────────────┘
    │
    ▼
Event: session_compact (if not cancelled)
    │
    ▼
Summary Generated
```

## Our Fix: Version 2

### Changes Made

**File:** `src/extensions/core/compaction-safeguard-v2.ts`

```typescript
// OLD (BROKEN) - Every turn
pi.on("turn_end", async (event) => {
  // Check EVERY message for errors
  // Regex on all content
  // May trigger unnecessary compaction
});

// NEW (FIXED) - Only when needed
pi.on("session_before_compact", async (event) => {
  // Called ONLY when compaction triggered
  // Token estimation
  // Cancel if unsafe
  // Modify instructions if near limit
});
```

### Key Implementation Details

```typescript
// Token estimation
function estimateTokens(messages: unknown[]): number {
  const text = JSON.stringify(messages);
  return Math.ceil(text.length / 4); // ~4 chars per token
}

// Context window lookup
const CONTEXT_WINDOWS = {
  "gpt-4": 8192,
  "gpt-4-turbo": 128000,
  "claude-3-opus": 200000,
  "ollama": 128000,
};

// Safety checks
if (tokensBefore > contextWindow) {
  return { cancel: true }; // Preserve history
}

if (tokensBefore > safetyLimit) {
  return { modifiedInstructions: "..." }; // Aggressive compaction
}
```

## Files Changed

| File | Change |
|------|--------|
| `compaction-safeguard-v2.ts` | ✅ NEW - Uses correct event |
| `auto-compact-on-error-extension.ts` | ❌ DISABLED - Old broken version |
| `pi-config.ts` | ✅ Updated to use v2 |

## Configuration

**Old:**
```typescript
// auto-compact-on-error-extension.ts
// - Loads on startup
// - Monitors every turn
// - May freeze terminal
```

**New:**
```typescript
// compaction-safeguard-v2.ts
// - Loads on startup
// - Only runs when compaction triggered
// - Respects context limits
```

## Testing

Build verification:
```bash
✅ bun build src/extensions/core/compaction-safeguard-v2.ts
   Output: 2.55 KB (clean build)
```

## Next Steps

1. **Test with compaction**: Use a model until context fills
2. **Verify event fires**: Check logs for "session_before_compact"
3. **Monitor performance**: Should no longer freeze on every turn

## OpenClaw Features We Could Add

| Feature | OpenClaw | Our v2 |
|---------|----------|--------|
| Quality guard retries | ✅ Yes | ❌ No |
| File operations summary | ✅ Yes | ❌ No |
| Tool failure tracking | ✅ Yes | ❌ No |
| Exact identifier extraction | ✅ Yes | ❌ No |
| Runtime registry | ✅ Yes | ❌ No |
| Config-based enable | ✅ Yes | ❌ No |

Future improvements could add these advanced features.
