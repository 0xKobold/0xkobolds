# Agent Persistence Implementation Plan

**Goal:** Make Gateway agents survive PC restarts
**Status:** In Progress
**Sub-agents:** Spawned for parallel implementation

---

## Executive Summary

Currently, Gateway agents are stored in-memory only (`Map<string, Agent>`) and are completely lost when the process exits. This implementation adds SQLite persistence so agents survive restarts.

### Current State
```typescript
const agents = new Map<string, Agent>(); // Lost on exit!
```

### Target State
```typescript
const agents = new Map<string, Agent>(); // Runtime cache
const agentStore = new AgentStore();   // Persistent storage
// Changes sync to DB, restored on startup
```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│           Gateway Extension                 │
│                                             │
│  ┌─────────────┐    ┌──────────────────┐   │
│  │ agents Map  │    │   Commands       │   │
│  │ (runtime)   │    │   /agent-*       │   │
│  └──────┬──────┘    └────────┬─────────┘   │
│         │                    │             │
│         ▼                    ▼             │
│  ┌──────────────────────────────────────┐  │
│  │        AgentStore                    │  │
│  │  ┌──────────┐    ┌──────────────┐   │  │
│  │  │  SQLite  │    │  JSON        │   │  │
│  │  │  Agents  │    │  Serialize   │   │  │
│  │  │  Table   │    │  Arrays      │   │  │
│  │  └──────────┘    └──────────────┘   │  │
│  │  ┌──────────┐                       │  │
│  │  │  Events  │    ← Lifecycle log    │  │
│  │  │  Table   │                       │  │
│  │  └──────────┘                       │  │
│  └──────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## Phase 1: Database Schema ✅

**File:** `src/gateway/persistence/schema.sql`
**Assigned:** Scout (reconnaissance)

### Schema Design

```sql
-- Main agents table
CREATE TABLE IF NOT EXISTS persisted_agents (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES persisted_agents(id) ON DELETE CASCADE,
  session_key TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK(type IN ('primary', 'orchestrator', 'worker')),
  capabilities TEXT NOT NULL, -- JSON array
  status TEXT NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'error')),
  task TEXT,
  model TEXT NOT NULL DEFAULT 'ollama/minimax-m2.5:cloud',
  workspace TEXT NOT NULL,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  stats_runtime INTEGER DEFAULT 0,
  stats_tool_calls INTEGER DEFAULT 0,
  spawned_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Agent lifecycle events (audit log)
CREATE TABLE IF NOT EXISTS agent_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES persisted_agents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('spawned', 'status_change', 'killed', 'completed', 'resumed', 'tokens_updated')),
  previous_status TEXT,
  new_status TEXT,
  timestamp INTEGER NOT NULL,
  metadata TEXT -- JSON
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agents_status ON persisted_agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_parent ON persisted_agents(parent_id);
CREATE INDEX IF NOT EXISTS idx_agents_updated ON persisted_agents(updated_at);
CREATE INDEX IF NOT EXISTS idx_events_agent ON agent_events(agent_id, timestamp);

-- Trigger to auto-update updated_at
CREATE TRIGGER IF NOT EXISTS agents_updated_trigger
AFTER UPDATE ON persisted_agents
BEGIN
  UPDATE persisted_agents SET updated_at = (strftime('%s', 'now') * 1000) WHERE id = NEW.id;
END;
```

---

## Phase 2: AgentStore Implementation ✅

**File:** `src/gateway/persistence/AgentStore.ts`
**Assigned:** Worker (implementation)

### Class Interface

```typescript
export type AgentStatus = 'idle' | 'running' | 'completed' | 'error';
export type AgentType = 'primary' | 'orchestrator' | 'worker';
export type AgentEventType = 'spawned' | 'status_change' | 'killed' | 'completed' | 'resumed' | 'tokens_updated';

export interface PersistedAgent {
  id: string;
  parentId?: string;
  sessionKey: string;
  depth: number;
  type: AgentType;
  capabilities: string[];
  status: AgentStatus;
  task?: string;
  model: string;
  workspace: string;
  tokens: { input: number; output: number };
  stats: { runtime: number; toolCalls: number };
  spawnedAt: number;
  updatedAt: number;
}

export class AgentStore {
  private db: Database;
  private dbPath: string;
  
  constructor(dbPath: string);
  
  // CRUD Operations
  async createAgent(agent: PersistedAgent): Promise<void>;
  async getAgent(id: string): Promise<PersistedAgent | null>;
  async updateAgent(id: string, updates: Partial<PersistedAgent>): Promise<void>;
  async updateStatus(id: string, status: AgentStatus, note?: string): Promise<void>;
  async deleteAgent(id: string): Promise<void>;
  
  // Query Operations
  async listAgents(filter?: { status?: AgentStatus; parentId?: string; type?: AgentType }): Promise<PersistedAgent[]>;
  async getChildren(parentId: string): Promise<PersistedAgent[]>;
  async getAgentTree(rootId: string): Promise<PersistedAgent[]>;
  async getActiveAgents(): Promise<PersistedAgent[]>;
  async getRecentCompleted(hours?: number): Promise<PersistedAgent[]>;
  
  // Restore Operations
  async restoreAgentsForResume(maxAgeHours?: number): Promise<PersistedAgent[]>;
  async cleanupOldAgents(maxAgeHours: number): Promise<number>;
  
  // Event Logging
  async logEvent(agentId: string, event: AgentEventType, metadata?: object): Promise<void>;
  async getAgentEvents(agentId: string, limit?: number): Promise<AgentEvent[]>;
  
  // Graceful Shutdown
  async checkpoint(): Promise<void>;
  async close(): Promise<void>;
}
```

---

## Phase 3: Gateway Integration ✅

**File:** `src/extensions/core/gateway-extension.ts` (modified)
**Assigned:** Worker (integration)

### Changes Required

1. **Initialize persistence on load:**
```typescript
import { AgentStore } from '../../gateway/persistence/AgentStore.js';

const KOBOLD_DIR = join(homedir(), '.0xkobold');
const AGENTS_DB_PATH = join(KOBOLD_DIR, 'agents-persisted.db');

let agentStore: AgentStore | null = null;

export default function gatewayExtension(pi: ExtensionAPI) {
  // Initialize persistence layer
  agentStore = new AgentStore(AGENTS_DB_PATH);
  
  // Restore agents from previous session
  restoreAgents();
  
  // ... rest of extension
}
```

2. **Sync on agent operations:**
```typescript
async function spawnAgent(pi: ExtensionAPI, params: SpawnParams): Promise<Agent> {
  // ... create agent ...
  
  // Persist to database
  if (agentStore) {
    await agentStore.createAgent({
      id: agent.id,
      parentId: agent.parentId,
      sessionKey: agent.sessionKey,
      depth: agent.depth,
      type: agent.type,
      capabilities: agent.capabilities,
      status: agent.status,
      task: agent.task,
      model: agent.model,
      workspace: agent.workspace,
      tokens: agent.tokens,
      stats: agent.stats,
      spawnedAt: agent.spawnedAt.getTime(),
      updatedAt: Date.now(),
    });
  }
  
  return agent;
}
```

3. **Restore on startup:**
```typescript
async function restoreAgents(): Promise<void> {
  if (!agentStore || agents.size > 0) return;
  
  const resumed = await agentStore.restoreAgentsForResume(24); // Last 24h
  console.log(`[Gateway] Restoring ${resumed.length} agents from previous session...`);
  
  for (const persisted of resumed) {
    // Convert PersistedAgent -> runtime Agent
    const agent: Agent = {
      ...persisted,
      spawnedAt: new Date(persisted.spawnedAt),
      status: persisted.status === 'running' ? 'idle' : persisted.status,
    };
    
    agents.set(agent.id, agent);
    
    // Log the resume event
    await agentStore.logEvent(agent.id, 'resumed', {
      previousStatus: persisted.status,
      resumedAt: Date.now(),
    });
  }
}
```

4. **Graceful shutdown:**
```typescript
pi.on('shutdown', async () => {
  await stopGateway(pi);
  
  if (agentStore) {
    // Force checkpoint to ensure all data is synced
    await agentStore.checkpoint();
    await agentStore.close();
    console.log('[Gateway] Agent state persisted');
  }
});
```

---

## Phase 4: New Commands ✅

**Added to gateway-extension.ts:**

| Command | Description |
|---------|-------------|
| `/agent-resume <id>` | Manually resume a specific agent |
| `/agent-history [hours]` | Show completed agents in last N hours |
| `/agent-cleanup [hours]` | Delete agents older than specified |
| `/agent-events <id>` | Show event log for an agent |

### Implementation

```typescript
pi.registerCommand('agent-resume', {
  description: 'Resume a persisted agent',
  args: [{ name: 'id', required: true }],
  handler: async (args, ctx) => {
    const persisted = await agentStore?.getAgent(args.id);
    if (!persisted) {
      ctx.ui.notify('Agent not found in persisted storage', 'error');
      return;
    }
    
    // Create runtime agent from persisted data
    const agent: Agent = { ...persisted, spawnedAt: new Date(persisted.spawnedAt) };
    agents.set(agent.id, agent);
    
    await agentStore?.logEvent(agent.id, 'resumed', { manual: true });
    ctx.ui.notify(`Resumed agent: ${agent.id.slice(0, 16)}...`, 'success');
  },
});
```

---

## Phase 5: Testing ✅

**File:** `test/unit/gateway/agent-persistence.test.ts`

### Test Cases

```typescript
describe('Agent Persistence', () => {
  test('createAgent persists to database', async () => {
    const store = new AgentStore(':memory:');
    const agent = createTestAgent();
    
    await store.createAgent(agent);
    const retrieved = await store.getAgent(agent.id);
    
    expect(retrieved).toEqual(agent);
  });
  
  test('restoreAgents returns running and recent agents', async () => {
    // Create agents with various states
    // Verify only appropriate ones are restored
  });
  
  test('parent-child relationships maintained after restore', async () => {
    // Create parent + children
    // Restore all
    // Verify children reference correct parent
  });
  
  test('status updates sync to database and log events', async () => {
    // Update status
    // Verify DB reflects change
    // Verify event was logged
  });
  
  test('simulated restart scenario', async () => {
    // Create store
    // Add agents
    // Close store
    // Recreate store (simulates restart)
    // Verify agents can be restored
  });
});
```

---

## Implementation Timeline

| Phase | Duration | Status |
|-------|----------|--------|
| Phase 1: Schema | 15 min | ✅ Complete |
| Phase 2: AgentStore | 30 min | 🔄 In Progress |
| Phase 3: Integration | 30 min | ⏳ Pending |
| Phase 4: Commands | 15 min | ⏳ Pending |
| Phase 5: Tests | 20 min | ⏳ Pending |
| **Total** | **~2 hours** | 🔄 Active |

---

## Migration Considerations

1. **Existing agents.db** - New schema uses `persisted_agents` table (doesn't conflict)
2. **Workspace continuity** - Keep existing paths to avoid breaking file references
3. **Agent IDs** - Current format (`agent-{timestamp}-{random}`) is preserved
4. **Backwards compat** - Gateway works without persistence if DB unavailable

---

## Success Criteria

- [ ] Agents survive process restart
- [ ] Running agents resume as 'idle' (ready to continue)
- [ ] Agent tree relationships preserved
- [ ] Event log available for debugging
- [ ] Cleanup mechanism exists for old agents
- [ ] Tests pass with 90%+ coverage
- [ ] No regression in existing gateway functionality

---

*Plan created by coordinating sub-agents for parallel implementation*
