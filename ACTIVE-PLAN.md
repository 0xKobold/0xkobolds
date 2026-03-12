# Active Plan - Obsidian + Subagent Fix

**Created:** 2026-03-12  
**Status:** IN PROGRESS  
**Agent:** 0xKobold Agent

---

## Phase 1: Verify Obsidian Bridge + Heartbeat ✅

### Current State
- Obsidian Bridge Extension: **REGISTERED** in pi-config.ts
- Heartbeat Integration: **CONNECTED** via `registerWithHeartbeat()`
- Polling Strategy: On 'checkin' events matching `config.pollOn: ["morning", "periodic"]`
- Vault Location: `~/.0xkobold/obsidian_vault/`

### Verification Checklist
- [x] Extension loads on startup
- [x] Connects to Heartbeat scheduler
- [x] Listens for 'checkin' events
- [ ] Test actual poll on heartbeat event
- [ ] Verify task parsing from markdown
- [ ] Confirm task creation in kanban

### Heartbeat Event Types That Trigger Poll
1. `morning` - 09:00 daily
2. `evening` - 18:00 daily  
3. `periodic` - Every 30 min (configurable)
4. `idle` - After idle threshold (if enabled)

---

## Phase 2: Fix Subagent Spawning 🔧 CRITICAL

### Problem Statement
Subagents aren't working properly. Need to:
1. Diagnose WHY they're failing
2. Fix the root cause(s)
3. Test end-to-end
4. Add error handling

### Investigation Path

```
START → Check agent-orchestrator-extension.ts
            ↓
    ┌───────┴────────┐
    ↓                ↓
spawn_main      spawn_subagent
    ↓                ↓
Uses Bun.spawn   Uses Bun.spawn
    ↓                ↓
Check process   Check subagent
creation        result handling
    ↓                ↓
Check Draconic  Check gateway
wrapper         connection
    ↓                ↓
Verify eventBus  Verify port 18789
communication    availability
```

### Files to Examine & Fix

1. **agent-orchestrator-extension.ts**
   - `spawnMainAgent()` - Line ~300
   - `spawnSubagent()` - Line ~400
   - Error handling (currently minimal)
   - Process monitoring

2. **gateway-extension.ts**
   - WebSocket server on port 18789
   - Connection handling
   - Message routing

3. **draconic-subagents-wrapper.ts**
   - Bridge to pi-subagents
   - EventBus communication
   - Error translation

4. **gateway/index.ts**
   - Main gateway entry
   - Bun.serve() configuration
   - WebSocket handling

### Potential Issues to Fix

1. **Process Spawning**
   - Using `node:child_process` instead of Bun.spawn
   - Missing Bun-specific flags
   - No process.exit handling

2. **Port Conflicts**
   - Gateway port 18789 may be in use
   - Need retry logic

3. **Silent Failures**
   - spawn() errors not caught
   - No spawn error events logged

4. **Path Resolution**
   - Relative paths failing
   - ES module imports failing

---

## Phase 3: Testing & Validation

### Test Scenarios
1. `/agent-orchestrate spawn_main test-agent`
2. `/agent-orchestrate spawn_subagent worker "test task"`
3. `/agent-orchestrate delegate "complex task"`

### Validation Commands
```bash
/agent-status           # Check running agents
/agent-tree            # View hierarchy
/agent-cap planning     # Find by capability
ps aux | grep kobold    # Verify processes
lsof -i :18789          # Check gateway port
```

---

## Current Status Icons

| Task | Status |
|------|--------|
| Obsidian Bridge Setup | ✅ Complete |
| Heartbeat Connection | ✅ Active |
| Vault Creation | ✅ Done |
| Research Notes | ✅ In Vault |
| Subagent Diagnosis | 🔧 In Progress |
| Subagent Fix | ⏳ Pending |
| Testing | ⏳ Pending |

---

## Next Actions

1. **IMMEDIATE:** Debug spawn_main in agent-orchestrator-extension.ts
2. **NEXT:** Add error handling to all spawn operations  
3. **THEN:** Test with actual subagent spawn
4. **FINALLY:** Verify Obsidian polling works

---

*Plan updated in real-time as work progresses*
