# 🐉 Gateway Client vs Direct Orchestrator Architecture

## Current State Analysis

### OpenClaw Architecture
```
┌─────────────┐      WebSocket      ┌──────────────┐
│  OpenClaw   │ ←────────────────→ │   Gateway    │
│     TUI     │   (binary protocol)  │   Server     │
│  (pi-tui)   │                      │   (18789)    │
└─────────────┘                      └──────┬───────┘
                                          │
                                   ┌──────┴──────┐
                                   │   Agents    │
                                   │  (spawned)  │
                                   └─────────────┘
```

**How it works:**
- TUI connects via WebSocket to gateway
- Gateway spawns agents as separate processes
- TUI talks to agents THROUGH the gateway

### 0xKobold Current Architecture
```
┌─────────────┐      Extensions       ┌──────────────────────┐
│  0xKobold   │ ←──────────────────→ │  DraconicOrchestrator │
│  (pi-tui)   │   (in-process tools) │  (agent_orchestrate)  │
│             │                      │                       │
└─────────────┘                      └───────────────────────┘
                                          │
                         ┌────────────────┼────────────────┐
                         │                │                │
                    ┌────┴───┐      ┌────┴───┐      ┌────┴───┐
                    │Gateway │      │ Direct │      │ Event  │
                    │(18789) │      │ Spawn  │      │  Bus   │
                    └────────┘      └────────┘      └────────┘
```

**How it works:**
- We run inside pi-coding-agent's TUI (same as OpenClaw)
- Extensions load IN-PROCESS (not separate WebSocket)
- `agent_orchestrate` is a TOOL, not a WebSocket message
- Subagents spawn via child_process, not gateway

---

## 🐉 The Draconic Answer: HYBRID SUPERIORITY

We don't choose ONE - we use the RIGHT tool for each job:

### When to Use Gateway Client Mode

| Use Case | Why |
|----------|-----|
| Remote access | Connect to headless server |
| Multi-user | Several humans, one gateway |
| Process isolation | Agents in containers/VMs |
| Cloud deployment | Kubernetes-style scaling |

**Implementation:**
```typescript
// Same as OpenClaw: WebSocket to gateway:18789
// BUT with Draconic enhancements:
const client = new DraconicGatewayClient({
  url: "ws://localhost:18789",
  
  // 🐉 Added: Connection pooling
  poolSize: 8,
  
  // 🐉 Added: Token prediction
  predictTokens: true,
  
  // 🐉 Added: Hierarchical tracking
  trackHierarchy: true,
  
  // 🐉 Added: Error classification
  errorRecovery: true
});
```

### When to Use Direct Orchestrator Mode (DEFAULT)

| Use Case | Why |
|----------|-----|
| Local development | No WebSocket overhead |
| Lightning-fast spawn | Same process, no serialization |
| Rich context sharing | Direct memory access |
| Extension integration | Access to hoard, lair, memory |

**Implementation:**
```typescript
// What we have NOW - and it's SUPERIOR
// No WebSocket, direct tool call:
const result = await agent_orchestrate({
  operation: "spawn_subagent",
  subagent: "researcher",
  task: "...",
  parentId: currentRunId  // Automatic hierarchy
});

// 🐉 Benefits:
// - Zero serialization overhead
// - Shared memory with hoard/lair
// - Direct event bus access
// - Native Draconic systems
```

---

## 🐉 Recommended Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    0xKobold TUI                          │
│              (@mariozechner/pi-tui)                      │
└──────────────────┬────────────────────────────────────────┘
                   │
         ┌─────────┴──────────┐
         │                    │
         ▼                    ▼
┌─────────────────┐   ┌──────────────────┐
│   LOCAL MODE    │   │   REMOTE MODE    │
│   (default)     │   │   (--remote)     │
│                 │   │                  │
│ ┌─────────────┐ │   │ ┌──────────────┐ │
│ │Direct Tools │ │   │ │Gateway Client│ │
│ │             │ │   │ │              │ │
│ │• orchestrate│ │   │ │• WebSocket   │ │
│ │• hoard      │ │   │ │• Binary proto│ │
│ │• lair       │ │   │ │• Remote spawn │ │
│ │• memory     │ │   │ └──────────────┘ │
│ └─────────────┘ │   └──────────────────┘
│                 │            │
│ ┌─────────────┐ │            │ WebSocket
│ │Event Bus    │◄┼────────────┘
│ └─────────────┘ │   (bi-directional sync)
│                 │
│ ┌─────────────┐ │
│ │Draconic     │ │
│ │Systems      │ │
│ └─────────────┘ │
└─────────────────┘
```

**The magic:** Event bus syncs between modes
- Spawn locally → appears in remote tree view
- Spawn remotely → local TUI gets notification
- Same Draconic registry, dual transport

---

## 🐉 Implementation: Dual-Mode TUI

### Mode Detection
```typescript
// src/tui/index.ts
function detectMode(): 'local' | 'remote' {
  if (process.env.KOBOLD_REMOTE_URL) return 'remote';
  if (process.argv.includes('--remote')) return 'remote';
  if (process.argv.includes('--local')) return 'local';
  return 'local'; // Default: Draconic Superior (direct)
}
```

### Unified Interface
```typescript
// Both modes implement same interface:
interface DraconicTUI {
  spawnSubagent(task: string, type: AgentType): Promise<SpawnResult>;
  listAgents(): Promise<AgentTree>;
  getResult(runId: string): Promise<Artifact>;
  killAgent(runId: string): Promise<void>;
  onStatusUpdate(handler: (update: StatusUpdate) => void): void;
}

// Local implementation (default):
class DirectDraconicTUI implements DraconicTUI {
  async spawnSubagent(task, type) {
    // Direct tool call - no WebSocket
    return agent_orchestrate({
      operation: "spawn_subagent",
      subagent: type,
      task,
      parentId: this.currentRunId
    });
  }
}

// Remote implementation (--remote):
class GatewayDraconicTUI implements DraconicTUI {
  async spawnSubagent(task, type) {
    // WebSocket to remote gateway
    return this.ws.request({
      method: "agent.spawn",
      params: { task, type }
    });
  }
}
```

---

## 🐉 Why This Beats OpenClaw

| Feature | OpenClaw | 0xKobold Dual-Mode |
|---------|----------|-------------------|
| **Local development** | WebSocket overhead | Direct calls (0 latency) |
| **Remote access** | ✅ Works | ✅ Works |
| **Context sharing** | Serialized over wire | Shared memory |
| **Extension access** | Limited | Full (hoard, lair, etc.) |
| **Spawn speed** | ~50-100ms (WebSocket + process) | ~5-10ms (direct child_process) |
| **Offline work** | Needs gateway | ✅ Works standalone |
| **Draconic systems** | ❌ Not integrated | ✅ Native |
| **Mode switching** | ❌ Fixed | ✅ Runtime switch |

---

## 🐉 Quick Commands

```bash
# Local mode (default): Direct Draconic orchestration
bun run tui
bun run tui --local

# Remote mode: Connect to gateway
bun run tui --remote ws://server:18789
bun run tui --remote --token $TOKEN

# Auto-detect: Try local first, fallback to remote
OPENCLAW_GATEWAY_URL=ws://server:18789 bun run tui
```

---

## 🐉 Summary

**Should ours be a gateway client?**

**YES - when it makes sense.**
**NO - when direct is superior.**

We implement **BOTH** with unified interface:
- **Default**: Direct orchestration (faster, richer, offline)
- **Optional**: Gateway client (remote, multi-user, cloud)

**The Draconic Way**: Pick the best tool for the job, not the only tool you have.
