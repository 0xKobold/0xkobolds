# Unified Agent Spawning

## Overview

Agent spawning is now **unified** - no more conflicts!

### Single Source of Truth: `agent-orchestrator-extension.ts`

| Method | Use Case | Command |
|--------|----------|---------|
| **CLI/Chat** | Day-to-day spawning | `/agent-spawn <type> <task>` |
| **WebSocket** | Remote clients | `agent.spawn` via WS |
| **Tool Call** | Programmatic | `agent_orchestrate()` |
| **Natural Chat** | Easy conversation | "spawn a worker to review this" |

---

## How It Works

### Architecture (Unified)

```
┌─────────────────────────────────────────────────────────────┐
│                    ENTRY POINTS                             │
├─────────────────┬─────────────────┬──────────────────────────┤
│   CLI(Chat)     │   WebSocket     │   Tool Call             │
│   /agent-spawn  │   ws.send(...)  │   agent_orchestrate()   │
└───────┬─────────┴────────┬────────┴──────────┬───────────────┘
        │                  │                   │
        └──────────────────┼───────────────────┘
                           ▼
              ┌──────────────────────┐
              │  Agent Orchestrator  │
              │  (Single Source)     │
              │                      │
              │ • Spawns subprocess  │
              │ • Manages lifecycle  │
              │ • Tracks status      │
              └──────────┬───────────┘
                         ▼
              ┌──────────────────────┐
              │   Child Process      │
              │   Bun sub-process    │
              └──────────────────────┘
```

---

## Commands

### Primary: `/agent-spawn` (Orchestrator)
Spawn agents via the unified orchestrator:

```
/agent-spawn worker "Implement authentication"
/agent-spawn scout "Research this codebase"
/agent-spawn planner "Design the database schema"
/agent-spawn reviewer "Check for security issues"
/agent-spawn coordinator "Plan the feature implementation"
```

Types available: `worker`, `scout`, `planner`, `reviewer`, `coordinator`

### Status: `/agents` 
List all managed agents:

```
/agents
> Running main agents:
> dev-agent: running (PID 1234)
> ops-agent: idle
```

### Tree: `/agent-tree`
Show agent hierarchy:

```
/agent-tree
> dev-agent/
>   ├── worker-1 [coding]
>   └── planner-1 [designing]
```

---

## WebSocket API (Gateway)

Connect to `ws://localhost:18789` and spawn via WebSocket:

```json
// Connect
{"type":"connect","id":"c1","params":{"role":"client","client":"myapp"}}

// Spawn agent (delegates to orchestrator)
{"type":"req","id":"r1","method":"agent.spawn","params":{
  "type": "worker",
  "task": "Review the authentication code"
}}

// Response
{"type":"res","id":"r1","ok":true,"payload":{
  "result": {"agent":"worker","exitCode":0,"output":"..."},
  "note": "Spawned via agent_orchestrate (unified method)"
}}
```

---

## Natural Language (Auto-Detect)

The system detects spawn requests in chat:

| You Type | System Does |
|----------|-------------|
| "spawn a worker to fix the bug" | Calls `/agent-spawn worker "fix the bug"` |
| "create agent to research this" | Calls `/agent-spawn scout "research this"` |
| "spawn coordinator to plan this" | Calls `/agent-spawn coordinator "plan this"` |

---

## Tool API

Use `agent_orchestrate` tool for programmatic access:

```typescript
// Spawn subagent
await agent_orchestrate({
  operation: "spawn_subagent",
  agent: "worker",
  task: "Implement feature X"
});

// List agents
await agent_orchestrate({
  operation: "list"
});

// Check status
await agent_orchestrate({
  operation: "status",
  agent: "worker"
});
```

---

## Gateway Commands (WebSocket-Specific)

Gateway provides WebSocket infrastructure only:

| Command | Purpose |
|---------|---------|
| `/gateway-start` | Start WebSocket server |
| `/gateway-stop` | Stop server |
| `/gateway-status` | Check status |
| `/gateway-tree` | Show WebSocket agent view |
| `/gateway-broadcast` | Broadcast to all clients |

**Note:** Agent spawning now goes through `/agent-spawn` (orchestrator), not gateway commands.

---

## What Changed

### Before (Conflicting)
- ❌ `gateway-extension.ts` had `/agent-spawn`
- ❌ `agent-orchestrator.ts` had `/agent-spawn`
- ❌ **Conflict!** Only one loaded

### After (Unified)
- ✅ `agent-orchestrator.ts` handles **all** spawning
- ✅ `gateway-extension.ts` provides WebSocket **access** to orchestrator
- ✅ **No conflicts**

---

## Quick Reference

```bash
# 1. Start 0xKobold
bun run start

# 2. Start gateway (for WebSocket access)
/gateway-start

# 3. Spawn agent (CLI method)
/agent-spawn worker "Implement JWT auth"

# 4. Check status
/agents

# 5. Via WebSocket (separate terminal)
wscat -c ws://localhost:18789
{"type":"connect","id":"c1","params":{"role":"client","client":"test"}}
{"type":"req","id":"r1","method":"agent.spawn","params":{"type":"worker","task":"test"}}
```

---

**Result**: Single unified spawning system, accessible via CLI, WebSocket, or tools. No conflicts! 🎉
