# Unified Agent Orchestration System

## Problem: Three Overlapping Systems

| System | Extension | Purpose | Status |
|--------|-----------|---------|--------|
| `agent_spawn` | agent-registry | Gateway-based agents (coordinator/specialist/worker) | Legacy |
| `subagent_spawn` | subagent | Ephemeral pi processes (scout/planner/worker/reviewer) | Current |
| `agent_start` | agent-lifecycle | Persistent main agents with workspaces | New |

**Goal:** Unify into one coherent system.

---

## Solution: Hierarchical Orchestration

```
┌─────────────────────────────────────────────┐
│           ORCHESTRATOR (Gateway)           │
│           (1 instance, always on)            │
└──────────────┬─────────────────┬────────────┘
               │                 │
    ┌──────────▼────────┐  ┌─────▼──────┐
    │  MAIN AGENTS      │  │ SUBAGENTS │
    │  (Persistent)     │  │(Ephemeral)│
    ├───────────────────┤  └────────────┘
    │ • dev-agent       │        │
    │ • ops-agent       │        │ spawned by
    │ • docs-agent      │        │ main agents
    └─────────┬─────────┘        │
              │                  │
    ┌─────────▼─────────┐       │
    │ WORKSPACE         │       │
    │ ~/.0xkobold/      │       │
    │   agents/         │       │
    │     dev-agent/    │       │
    │       config.json │       │
    │       workspace/  │       │
    │       memory/     │◄──────┘
    │       logs/       │ (subagent
    │       agents/     │  results)
    │         (custom   │
    │          subagents)│
    └───────────────────┘
```

## Unified Model

### Agent Types (Hierarchical)

```
Orchestrator (1)
    ├── Main Agents (N)
    │     ├── Subagents (M per Main)
    │     └── Tools/Skills
    └── Direct Tools
```

**Orchestrator:**
- Always running
- Routes messages
- Manages connections
- Tracks all agents

**Main Agents:**
- Persistent processes
- Own workspace
- Can spawn subagents
- Have lifecycle (start/stop/restart)

**Subagents:**
- Ephemeral (spawned per task)
- No persistence
- Return results to parent
- Types: scout, planner, worker, reviewer

## Unified API

### Single Tool: `agent_orchestrate`

```typescript
// All operations through one tool
await agent_orchestrate({
  operation: "spawn" | "list" | "status" | "stop" | "delegate",
  
  // For spawning
  agentType: "main" | "subagent",
  
  // Main agent config
  mainConfig: {
    name: "dev-agent",
    workspace: "~/projects/dev",
    model: "qwen2.5-coder:14b",
    autoStart: false,
  },
  
  // Subagent config
  subagentConfig: {
    agent: "scout",  // or "planner", "worker", "reviewer"
    task: "Find auth code",
    mode: "single" | "parallel" | "chain",
    strategy: "simple" | "medium" | "complex",
  },
  
  // For delegation
  task: "Implement auth system",
  autoDelegate: true,  // Agent decides complexity
});
```

### Simplified Commands

```bash
# Main Agents (Persistent)
/agent create <name>           # Create main agent
/agent start <name>            # Start agent process
/agent stop <name>             # Stop agent process
/agent status [name]         # Check status
/agents                        # List all agents

# Subagents (Ephemeral)
/agent spawn <type> <task>     # Spawn subagent
/agent spawn scout "Find code" # Spawn specific agent
/agent parallel "task1" "task2" # Parallel execution
/agent implement <feature>     # Auto-delegate workflow

# Delegation
/autonomous [on|off|simple|medium|complex]
/analyze <task>                # Preview delegation
```

## Implementation Plan

### Phase 1: Deprecate Old Systems

1. Mark `agent_spawn` (agent-registry) as deprecated
2. Keep `subagent_spawn` but wrap it
3. Keep `agent_start/stop` but integrate

### Phase 2: Create Unified Extension

**File:** `src/extensions/core/agent-orchestrator-extension.ts`

```typescript
export default async function agentOrchestratorExtension(pi: ExtensionAPI) {
  // Single registration point
  pi.registerTool({
    name: "agent_orchestrate",
    // Unified API
  });
  
  // Register all commands
  // /agent create/start/stop/status
  // /agent spawn/parallel/implement
  // /autonomous
}
```

### Phase 3: Migration Strategy

**Backwards Compatibility:**
```typescript
// Old API redirects to new
pi.registerTool({
  name: "agent_spawn",  // Legacy
  async execute(...) {
    console.log("[DEPRECATED] Use agent_orchestrate instead");
    return agent_orchestrate({ operation: "spawn", ... });
  }
});

pi.registerTool({
  name: "subagent_spawn",  // Legacy
  async execute(...) {
    return agent_orchestrate({ operation: "spawn", agentType: "subagent", ... });
  }
});
```

## Configuration Schema

```json
{
  "orchestrator": {
    "enabled": true,
    "port": 18789,
    "autoStart": true
  },
  "agents": {
    "dev-agent": {
      "type": "main",
      "enabled": true,
      "workspace": "~/.0xkobold/agents/dev-agent",
      "model": "qwen2.5-coder:14b",
      "autoStart": false,
      "cron": ["0 9 * * 1-5"],
      "capabilities": ["read", "write", "edit", "subagent"]
    }
  },
  "subagents": {
    "scout": {
      "type": "ephemeral",
      "tools": ["read", "search", "list"],
      "systemPrompt": "..."
    },
    "planner": { /* ... */ },
    "worker": { /* ... */ },
    "reviewer": { /* ... */ }
  },
  "delegation": {
    "mode": "medium",
    "autoAnalyze": true,
    "maxConcurrent": 4
  }
}
```

## New README Structure

```markdown
## Agent Orchestration System

0xKobold provides a unified agent orchestration layer with three levels:

### 1. Orchestrator (Always Running)
The central hub that coordinates all agents.
- Routes messages between agents
- Manages WebSocket connections
- Tracks agent states

### 2. Main Agents (Persistent)
Your persistent AI assistants with isolated workspaces.
```bash
/agent create dev-agent     # Create new agent
/agent start dev-agent      # Start agent
/agent select dev-agent     # Switch to agent
```

### 3. Subagents (Ephemeral)
Specialized agents spawned for specific tasks.
```bash
/agent spawn scout "Find auth code"
/agent implement feature   # Auto-detects complexity
/agent parallel "task1" "task2"
```

### Auto-Delegation
Enable automatic task analysis:
```bash
/autonomous medium  # Delegate medium+complex tasks
/implement "Add caching"  # Agent decides workflow
```
```

## Migration Checklist

- [ ] Create `agent-orchestrator-extension.ts`
- [ ] Implement unified `agent_orchestrate` tool
- [ ] Add `/agent` command family
- [ ] Deprecate but keep backwards compat for old tools
- [ ] Update agent-registry to use orchestrator
- [ ] Update subagent-extension to use orchestrator
- [ ] Update agent-lifecycle to use orchestrator
- [ ] Update README
- [ ] Add migration guide
- [ ] Tests

## Benefits

1. **Single Mental Model** - One API for all agent operations
2. **Clear Hierarchy** - Main agents → Subagents → Tools
3. **Simpler Commands** - `/agent` for everything
4. **Backwards Compatible** - Old code still works
5. **Better Architecture** - Clean separation of concerns
