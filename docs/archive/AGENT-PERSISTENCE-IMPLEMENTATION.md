# Agent Persistence Implementation Complete ✅

**Date:** 2025-03-09
**Files Created:**
- `src/gateway/persistence/schema.sql` (2.3KB)
- `src/gateway/persistence/AgentStore.ts` (15KB)
- `src/gateway/persistence/index.ts` (0.4KB)

**File Modified:**
- `src/extensions/core/gateway-extension.ts` - Persistence integration

---

## What Works Now

### Before (Data Lost on Restart)
```typescript
const agents = new Map<string, Agent>(); // Gone when process exits!
```

### After (Data Survives Restart)
```typescript
const agents = new Map<string, Agent>(); // Runtime cache
const agentStore = new AgentStore();      // SQLite persistence

// Agents auto-persist on spawn/status change
// Agents auto-restore on startup
```

---

## New Features

### 1. Automatic Persistence
Every agent operation syncs to SQLite:
- **spawn** → Creates record in `persisted_agents` table
- **status change** → Updates status, logs event to `agent_events`
- **completion** → Syncs final tokens/stats
- **shutdown** → Syncs all agents, checkpoints WAL

### 2. Automatic Restore
On Gateway startup:
1. Loads agents with status 'running' or 'idle'
2. Loads recently completed agents (<24h)
3. Rebuilds parent-child relationships
4. Logs 'resumed' events
5. Sets 'running' agents to 'idle' (ready to resume)

### 3. New Commands

| Command | Description |
|---------|-------------|
| `/agent:resume [id]` | Resume specific agent by ID (or 'all' for recent) |
| `/agent:cleanup [hours]` | Delete agents older than N hours (default 24) |
| `/agent:events <id>` | Show event log for an agent |
| `/gateway:status` | Now shows runtime + persisted agent counts |

### 4. Health Endpoint
```
GET /health → 
{
  "status": "ok",
  "agents": 3,        // Runtime count
  "persisted": 15,    // Database count
  "clients": 1
}
```

---

## Database Schema

### `persisted_agents` table
Stores complete agent state:
- id, parent_id (tree structure)
- session_key, depth, type
- status, capabilities, task
- tokens (input/output), stats (runtime/toolCalls)
- timestamps (spawned_at, updated_at)

### `agent_events` table
Audit log for debugging:
- Agent lifecycle: spawned, status_change, completed
- Resume tracking: resumed (manual/auto)
- Operations: killed, tokens_updated, checkpoint

---

## Usage Examples

### Check persisted agents
```
/gateway:status
→ Gateway: 🟢 runtime: 2, persisted: 5, clients: 1
```

### Restore all recent agents
```
/agent:resume all
→ Restored 3 agents. Use /agent-tree to see them.
```

### Restore specific agent
```
/agent:resume agent-1234567890-abc
→ Resumed worker agent: agent-1234...
→ Task: implement authentication
```

### View agent history
```
/agent:events agent-1234 10
→ Events for agent-1234... (last 10):
  [10:15:30] spawned
  [10:15:31] status_change (idle → running)
  [10:18:45] status_change (running → completed)
  [10:20:12] resumed (idle → resumed)
```

### Cleanup old agents
```
/agent:cleanup 168
→ Cleaned up 12 old agent(s)
```

---

## Where Data is Stored

```
~/.0xkobold/
├── agents-runtime.db          ← NEW: Persisted agent data
│   ├── persisted_agents     ← All agent records
│   ├── agent_events           ← Lifecycle audit log
│   └── (WAL files)
├── agents/                    ← Agent workspaces (unchanged)
└── ...
```

---

## Testing

### Simulated Restart (without actual restart)
1. Spawn some agents: `/agent-spawn coordinator "test task"`
2. Stop gateway gracefully: `/gateway:stop`
3. The stop syncs all agents to database
4. Start gateway: `/gateway:start` or restart the process
5. Agents auto-restore from database
6. Verify: `/agent-tree` shows restored agents

### Actual PC Restart Test
1. Start 0xKobold, spawn some agents
2. Gracefully exit (or kill -15 for simulated power loss)
3. Restart PC
4. Start 0xKobold again
5. Agents should restore within 5 seconds of Gateway starting
6. `/agent:resume all` to restore any that didn't auto-restore

---

## Edge Cases Handled

1. **Missing workspace** - Restores agent but warns if workspace deleted
2. **Agent ID collision** - Skips if already in memory
3. **Partial corruption** - Individual agent failures don't break restore
4. **Parent missing** - Child agents restore as orphans (no parent ref)
5. **DB locks** - WAL mode prevents lock issues
6. **Large data** - VACUUM after cleanup, indexed queries

---

## Next Steps (Optional Enhancements)

1. **Token threshold** - Auto-save agents only if they used >X tokens
2. **Workspace snapshots** - Save/restore agent workspace state too
3. **Diff sync** - Only sync changed fields for performance
4. **Agent templates** - Save completed agents as templates for reuse
5. **Cross-session resume** - Resume agent tasks from where they left off

---

## Implementation Summary

| Component | Lines | Purpose |
|-----------|-------|---------|
| schema.sql | 30 | DB structure |
| AgentStore.ts | 450 | CRUD + queries |
| index.ts | 15 | Module exports |
| gateway-ext.ts changes | ~200 | Integration |
| **Total** | **~695** | **Complete persistence** |

---

**Status:** ✅ Ready to test
**Risk:** Low (non-breaking, backwards compatible)
**Impact:** High (agents survive restarts)
