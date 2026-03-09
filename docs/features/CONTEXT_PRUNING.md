# Context Management Extensions - OpenClaw Integration

## Overview

Integrated OpenClaw's production-tested context management extensions to solve context overflow issues.

## Extensions Added

### 1. Context Pruning (`src/extensions/core/context-pruning/`)

**Files:**
- `extension.ts` - Main extension entry point
- `pruner.ts` - Intelligent message pruning logic
- `runtime.ts` - Session state management
- `settings.ts` - Configuration types and defaults

**Features:**
- **Soft Trimming**: Reduces large tool results by keeping head + tail with `[...]` placeholder
- **Hard Clearing**: Completely removes old tool results when context exceeds threshold
- **Image Protection**: Never prunes results containing images
- **Cache TTL**: Avoids unnecessary pruning within TTL window (default: 5 minutes)
- **Assistant Protection**: Keeps last N assistant messages (default: 3)
- **Bootstrap Safety**: Never prunes before first user message

**Configuration:**
```javascript
{
  mode: "cache-ttl",           // "off" or "cache-ttl"
  ttl: "5m",                 // Duration string
  keepLastAssistants: 3,      // Number of recent assistants to protect
  softTrimRatio: 0.3,         // Trigger soft trim at 30% of context
  hardClearRatio: 0.5,      // Trigger hard clear at 50% of context
  softTrim: {
    maxChars: 4000,          // Start trimming at 4k chars
    headChars: 1500,         // Keep first 1500 chars
    tailChars: 1500,         // Keep last 1500 chars
  },
  hardClear: {
    enabled: true,
    placeholder: "[Old tool result content cleared]"
  }
}
```

### 2. Compaction Safeguard (`src/extensions/core/compaction-safeguard.ts`)

**Features:**
- **Tool Failure Tracking**: Captures and summarizes tool failures during compaction
- **File Operations Preserved**: Tracks read and modified files
- **Failure Summary**: Includes tool failures in compaction summaries
- **Structured Output**: Returns organized file lists and failure details

**How Tool Failures Work:**
```
## Tool Failures
- read_file(status=404): File not found
- bash(exitCode=1): Command failed
- ...and 3 more
```

## Usage

### TUI Commands

```
/pruning-config status     - Show current settings
/pruning-config disable    - Disable pruning
```

### Automatic Behavior

1. **Cache TTL Mode** (default):
   - First request: Full context, marks cache
   - Within 5 minutes: Uses cached context, no pruning
   - After TTL expires: Prunes context, updates cache

2. **Soft Trimming**:
   - When context exceeds 30% of window
   - Trims large tool results to head + placeholder + tail
   - Example: "ls -la" output of 10k chars → "first 1.5k + [...] + last 1.5k"

3. **Hard Clearing**:
   - When context exceeds 50% of window
   - Replaces old tool results entirely with placeholder
   - Preserves recent assistants and user messages

## Integration

Extensions are registered in `src/index.ts`:

```typescript
// Context management (OpenClaw-style)
'--extension', resolve(packageRoot, 'src/extensions/core/context-pruning/extension.ts'),
'--extension', resolve(packageRoot, 'src/extensions/core/compaction-safeguard.ts'),
```

## Benefits

1. **No More Context Crashes**: Automatic pruning prevents hitting token limits
2. **Smart Preservation**: Critical info (recent work, files, failures) is kept
3. **Transparent**: Tool results show when they've been trimmed/cleared
4. **Configurable**: TTL, ratios, and thresholds can be tuned
5. **Safe**: Images and recent assistants are always protected

## Testing

To test the extensions:

```bash
# Reload extensions
/reload

# Check pruning status
/pruning-config status

# Run a session with many tool calls
# Large outputs will be automatically managed
```

## Comparison: 0xKobold vs OpenClaw

| Feature | Before | After (OpenClaw) |
|---------|--------|------------------|
| Soft Trimming | ❌ | ✅ |
| Hard Clearing | ❌ | ✅ |
| Image Protection | ⚠️ Basic | ✅ Robust |
| Tool Failures Tracking | ❌ | ✅ |
| Adaptive Chunking | ❌ | ✅ |
| Cache TTL | ❌ | ✅ |
| File Ops in Compaction | ❌ | ✅ |

## Notes

- Extensions are loaded after task-manager and before safety extensions
- Pruning runs on every context event when cache expires
- Compaction safeguard runs during session_before_compact
- Both extensions work together with existing pi-mono compaction
