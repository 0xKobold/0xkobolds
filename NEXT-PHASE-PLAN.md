# Next Phase Plan - Post Subagent Fix

**Date:** 2026-03-12  
**Phase:** Implementation & Testing  
**Goal:** Complete next 3 high-priority tasks

---

## Immediate Actions (Next 30 min)

### 1. ✅ Test Subagent Spawning (Verify Fix)
- [ ] Run `/agent-orchestrate spawn_subagent worker "test task"`
- [ ] Verify output appears in console
- [ ] Check process exits cleanly
- [ ] Mark as DONE if successful

### 2. 🔄 Enable Obsidian Bridge in Config
- [ ] Read current `~/.0xkobold/config.json`
- [ ] Add `"0xkobold.obsidian.enabled": true`
- [ ] Verify extension loads on restart
- [ ] Check `/obsidian_status` command works

### 3. 🐉 Context Engine Plugin (HIGH PRIORITY)
**Port from Koclaw PR #22201**

Reference Features:
- `bootstrap` - Initialize context at start
- `ingest` - Process messages/tool results
- `assemble` - Build prompt from context
- `compact` - Compress when token limit hit
- `afterTurn` - Post-processing

Plugin Interface:
```typescript
interface ContextEnginePlugin {
  name: string;
  bootstrap(): Promise<ContextState>;
  ingest(message: Message): Promise<void>;
  assemble(turn: number): Promise<AssembledContext>;
  compact(targetTokens: number): Promise<CompactionResult>;
  afterTurn(turn: number): Promise<void>;
  getState(): ContextState;
}
```

---

## Execution Steps

```
START
  │
  ▼
┌─────────────────────┐
│ Test Subagent Spawn │ ← IMMEDIATE
└─────────────────────┘
  │
  ├─ Success → Continue
  └─ Fail → Debug logs

  ▼
┌─────────────────────┐
│ Enable Obsidian     │ ← CONFIG UPDATE
└─────────────────────┘
  │
  ▼
┌─────────────────────┐
│ Context Engine      │ ← BIG FEATURE
│ Plugin              │
└─────────────────────┘
```

---

## Testing Commands

### Subagent Test
```bash
# Test basic spawn
/agent-orchestrate spawn_subagent worker "analyze src/utils"

# Test with real task
/agent-orchestrate spawn_subagent scout "find auth code"

# Check list
/agent-orchestrate list

# Check status
/agent-orchestrate status
```

### Obsidian Test
```bash
# After enabling config
/obsidian_status
/obsidian_poll
/obsidian_tasks
```

---

## Quick Decision Point

**Should I:**

1. ✅ **Start with testing subagents** (verify fix works)
2. ✅ **Then enable Obsidian Bridge** (config update)
3. ⚡ **Then Context Engine** (biggest impact feature)
4. ⏳ **Then Cloudflare skill** (research tool)

**OR do you want to prioritize differently?**

Let me know which to begin first!
