# Agent & Sub-Agent Spawn Implementation

## Overview

This document outlines the implementation of agent and sub-agent spawning in 0xKobold, including:
- Gateway WebSocket server for spawning
- Agent persistence (survive restarts)
- Sub-agent hierarchy tracking
- Commands and tools available

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Gateway (Port 18789)                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  WebSocket Server                                     │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐               │  │
│  │  │ Client  │  │ Client  │  │ Client  │  (TUI/Discord)│  │
│  │  │   #1    │  │   #2    │  │   #3    │               │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘               │  │
│  └───────┼────────────┼────────────┼────────────────────┘  │
│          │            │            │                        │
│          ▼            ▼            ▼                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │          Agent Registry (Map + SQLite)                │   │
│  │                                                       │   │
│  │  Main Agent          ├─▶ Sub-Agent (worker)          │   │
│  │  "dev-assistant"     │                              │   │
│  │       │              ├─▶ Sub-Agent (scout)           │   │
│  │       │              │                              │   │
│  │       └──────────────┼─▶ Sub-Agent (planner)       │   │
│  │                      │                              │   │
│  │  Main Agent          ├─▶ Sub-Agent                  │   │
│  │  "ops-monitor"       │                              │   │
│  │                      └─▶ Sub-Agent                  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow

### 1. Spawn Request
```
Client (TUI) ──WS──▶ Gateway ──▶ spawnAgent() ──▶ AgentStore.save()
                                      │
                                      ▼
                              Persist to SQLite
                              Emit agent.spawned event
                              Broadcast to clients
```

### 2. Agent Hierarchy
```
main-agent (depth: 0)
├── worker-1 (depth: 1, parent: main-agent)
├── worker-2 (depth: 1, parent: main-agent)
│   └── scout-1 (depth: 2, parent: worker-2)
│   └── scout-2 (depth: 2, parent: worker-2)
└── planner-1 (depth: 1, parent: main-agent)
    └── reviewer-1 (depth: 2, parent: planner-1)
```

### 3. Persistence Flow
```
Agent Spawned
     │
     ▼
┌─────────────┐
│ agents-runtime.db
│             │
│ persisted_agents
│ ───────────
│ id          
│ parent_id   
│ type        
│ status      
│ task        
│ tokens_*    
│ workspace   
│ spawned_at  
└─────────────┘
     │
     ▼
On Restart: Load from DB
     │
     ▼
Restore Agent Objects
```

---

## Quick Start

### 1. Start 0xKobold
```bash
cd ~/Documents/code/0xKobolds
bun run start
```

### 2. Test Gateway Commands
Once the TUI loads:

```
> /gateway-status
> /gateway-start
> /gateway-status        # Should show "running: true"
```

### 3. Spawn First Agent
```
> /agent-spawn worker "Hello, test task!"
> /agents               # Should show 1 agent
> /agent-status          # Shows status summary
> /agent-tree            # Shows hierarchy
```

### 4. Test WebSocket Client
In another terminal:
```bash
# Install wscat if needed
bun install -g wscat

# Connect to gateway
wscat -c ws://localhost:18789

# Send connect frame
{"type":"connect","id":"conn-1","params":{"role":"client","client":"test-cli"}}

# Check status
{"type":"req","id":"req-1","method":"status"}

# Spawn via WebSocket
{"type":"req","id":"req-2","method":"agent.spawn","params":{"task":"WebSocket test"}}
```

### 5. Test Persistence
```
> /exit                  # Quit 0xKobold
$ bun run start          # Restart
> /agents               # Agents should still be there
```

---

## Current Implementation Status

| Component | File | Status | Notes |
|-----------|------|--------|-------|
| Gateway Server | `gateway-extension.ts` | ✅ Ready | WebSocket on port 18789 |
| Agent Store | `gateway/persistence/AgentStore.ts` | ✅ Ready | SQLite persistence |
| Session Bridge | `UnifiedSessionBridge.ts` | ✅ Ready | Session management |
| Spawn Logic | `gateway-extension.ts:272` | ✅ Ready | `spawnAgent()` function |
| Swarm Spawn | `gateway-extension.ts:398` | ✅ Ready | `spawnSwarm()` function |
| WebSocket API | `gateway-extension.ts:500-700` | ✅ Ready | Message handlers |
| CLI Commands | `gateway-extension.ts:800+` | ✅ Ready | `/gateway-*` commands |

---

## API Specification

### WebSocket Frame Types

#### 1. Spawn Agent (Request)
```json
{
  "type": "req",
  "id": "req-123",
  "method": "agent.spawn",
  "params": {
    "task": "Implement authentication",
    "parentId": "main-agent-id",
    "label": "AuthWorker",
    "capabilities": ["coding", "security"],
    "model": "ollama/deepseek-coder",
    "maxWorkers": 1
  }
}
```

#### 2. Spawn Response
```json
{
  "type": "res",
  "id": "req-123",
  "ok": true,
  "payload": {
    "id": "agent-456",
    "type": "worker",
    "status": "idle",
    "depth": 1,
    "task": "Implement authentication"
  }
}
```

#### 3. Agent Spawned Event (Broadcast)
```json
{
  "type": "event",
  "event": "agent.spawned",
  "payload": {
    "id": "agent-456",
    "parentId": "main-agent-id",
    "type": "worker",
    "task": "Implement authentication"
  },
  "seq": 42
}
```

---

## Commands

### Gateway Commands
```bash
/gateway-start           # Start WebSocket server
/gateway-stop            # Stop server  
/gateway-status          # Show status and connected clients
/gateway-port [port]     # Get/set port
/gateway-tree            # Display agent hierarchy

/agents                  # List all agents
/agent-status            # Show running agents
/agent-tree             # Display hierarchy with indentation
/agent-cap <cap>         # Find agents by capability

/agent-spawn <type> <task>      # Spawn specific agent type
/agent-spawn coordinator "plan"
/agent-spawn specialist "implement auth"
/agent-spawn researcher "analyze"
/agent-spawn planner "design"
/agent-spawn reviewer "check code"
```

### Session Commands
```bash
/session                 # Show current unified session
/sessions                # List all sessions
/session-resume <id>     # Resume a previous session
```

---

## Testing Plan

### Phase 1: Basic Spawn
1. Start 0xKobold: `bun run start`
2. Check gateway status: `/gateway-status`
3. Start gateway: `/gateway-start`
4. Spawn test agent: `/agent-spawn specialist "Hello test"`
5. Verify: `/agents`, `/agent-tree`

### Phase 2: WebSocket Client Test
```bash
# In terminal 2: Connect WebSocket client
wscat -c ws://localhost:18789

# Send spawn request
{"type":"req","id":"test-1","method":"agent.spawn","params":{"task":"Test task","parentId":"main"}}
```

### Phase 3: Sub-Agent Hierarchy
1. Spawn main agent: `/agent-spawn coordinator "Plan feature"`
2. From main agent, spawn worker: `/agent-spawn specialist "Implement"`
3. Verify depth tracking: `/agent-tree`
4. Check parent-child relationships in DB

### Phase 4: Persistence Test
1. Spawn agents
2. Kill 0xKobold process
3. Restart: `bun run start`
4. Check if agents restored from SQLite

### Phase 5: Concurrent Agents
1. Spawn 3-4 main agents
2. Each spawning 2-3 sub-agents
3. Monitor in TUI
4. Check performance

---

## Database Schema

```sql
-- persisted_agents: Stores agent state
CREATE TABLE persisted_agents (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES persisted_agents(id) ON DELETE SET NULL,
  session_key TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK(type IN ('primary', 'orchestrator', 'worker')),
  capabilities TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'error')),
  task TEXT,
  model TEXT NOT NULL DEFAULT 'ollama/minimax-m2.5:cloud',
  workspace TEXT NOT NULL,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  stats_runtime INTEGER NOT NULL DEFAULT 0,
  stats_tool_calls INTEGER NOT NULL DEFAULT 0,
  spawned_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- agent_events: Audit log
CREATE TABLE agent_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES persisted_agents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  timestamp INTEGER NOT NULL,
  metadata TEXT DEFAULT '{}'
);
```

---

## Files Modified

| File | Purpose |
|------|---------|
| `src/extensions/core/gateway-extension.ts` | Main WebSocket gateway |
| `src/gateway/persistence/AgentStore.ts` | SQLite persistence |
| `src/gateway/persistence/schema.sql` | DB schema |
| `src/sessions/UnifiedSessionBridge.ts` | Session management |
| `src/sessions/SessionStore.ts` | Session persistence |

---

## Next Implementation Steps

1. ✅ Fix build errors (Map iterations, missing deps)
2. ⏳ **Start gateway and test basic connectivity**
3. ⏳ **Spawn first agent via CLI**
4. ⏳ **Spawn sub-agent and verify hierarchy**
5. ⏳ **Test persistence (restart and restore)**
6. ⏳ **Multi-agent concurrent test**
7. ⏳ **Discord integration test**

---

## Known Issues

| Issue | File | Status | Fix |
|-------|------|--------|-----|
| Map iteration TS errors | gateway-extension.ts | ✅ Fixed | Added `.entries()` |
| Missing node-machine-id | SessionStore.ts | ✅ Fixed | `bun install` |
| 

---

## Usage Example: Full Workflow

```bash
# 1. Start 0xKobold
$ bun run start

# 2. Check gateway
> /gateway-status
Gateway: 127.0.0.1:18789
Status: offline

# 3. Start gateway
> /gateway-start
✅ Gateway started on 127.0.0.1:18789

# 4. Create a planning agent
> /agent-spawn coordinator "Design user authentication system"
> Agent spawned: agent-123
> Type: coordinator
> Task: Design user authentication system

# 5. Create worker agents from coordinator
> /agent-spawn specialist "Implement login endpoint"
> /agent-spawn specialist "Implement JWT middleware"
> /agent-spawn reviewer "Review authentication code"

# 6. Check hierarchy
> /agent-tree
🌳 Agent Hierarchy
─────────────────
📦 agent-123 (coordinator, running)
  └─┬── agent-456 (worker, running) "Implement login..."
    ├── agent-457 (worker, running) "Implement JWT..."
    └── agent-458 (reviewer, idle) "Review auth..."

# 7. Check status
> /agent-status
📊 Agent Status
───────────────
Total: 4 | Running: 3 | Idle: 1 | Completed: 0 | Error: 0

# 8. Tokens used
Input: 12,450 | Output: 8,230 | Runtime: 45s | Tool Calls: 23
```

---

**Status**: Ready to start testing! 🚀
