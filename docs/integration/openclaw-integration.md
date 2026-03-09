# OpenClaw Integration Guide

## What is OpenClaw?

OpenClaw (https://docs.openclaw.ai) is a framework for multi-agent systems that defines:
1. Persona templates (IDENTITY, SOUL, MEMORY, etc.)
2. Agent specialization and coordination
3. Tool ecosystems
4. State management

## 0xKobold's OpenClaw Implementation

### Persona Layer (Template-Based)

Located in `~/.0xkobold/`, these files define the primary agent's identity:

| File | Purpose |
|------|---------|
| **IDENTITY.md** | Core identity and communication style |
| **SOUL.md** | Values, personality, emotional responses |
| **MEMORY.md** | Persistent memory/context |
| **AGENT.md** | Self-awareness and role definition |
| **USER.md** | User preferences and history |
| **AGENTS.md** | **Multi-agent collaboration** rules |
| **AGENTS.default** | Default agent configuration |
| **BOOT.md** | Startup behavior |
| **HEARTBEAT.md** | Health/status checking |
| **TOOLS.md** | Available tools and capabilities |

### Agent Registry Layer (Code-Based)

The `agent-registry-extension.ts` implements OpenClaw-style agent management:

```
┌─────────────────────────────────────────┐
│  Persona Files (Markdown)               │
│  - Define primary agent identity        │
│  - Loaded at startup                    │
│  - Human-readable/editable              │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│  Agent Registry Extension (SQLite)      │
│  - Defines agent *types*                 │
│  - Spawns agent *instances*              │
│  - Manages lifecycle                     │
│  - Tracks hierarchy                      │
└─────────────────────────────────────────┘
```

## Key OpenClaw Features Implemented

### 1. Agent Specialization

OpenClaw concept: Different agents for different tasks
Implementation:
```typescript
type AgentType = 
  | "coordinator"    // Orchestrates others
  | "specialist"     // Deep expertise
  | "worker"         // General tasks
  | "reviewer"       // QA
  | "researcher"     // Information gathering
  | "planner"        // Task breakdown
  | "executor";      // Execution focused
```

### 2. Capability System

OpenClaw concept: Agents advertise capabilities
Implementation:
```typescript
interface AgentDefinition {
  capabilities: string[]; // e.g., ["coding", "debugging"]
}

// Find by capability
/agent-cap coding
agent_spawn({ capabilities_needed: ["architecture"] })
```

### 3. Hierarchical Spawning

OpenClaw concept: Agents spawn children
Implementation:
```
Coordinator (depth: 0)
  └── Specialist (depth: 1)
       └── Worker (depth: 2)
            └── max_depth prevents infinite nesting
```

### 4. Inter-Agent Communication

OpenClaw concept: Agents talk to each other
Implementation:
```typescript
// Message storage in SQLite
sendMessage(from, to, type, content)
getMessages(agentId, since)
```

### 5. Lifecycle Management

OpenClaw concept: Proper agent lifecycle
Implementation:
```
idle → working → completed/error/terminated
      ↗︎
   spawned
```

## Usage Comparison

### OpenClaw (from docs.openclaw.ai)
```python
# Spawn specialized agent
claw.spawn("researcher", task="analyze codebase")

# Agent has capabilities
agent.capabilities = ["search", "analysis"]

# Results returned to parent
parent.receive(result)
```

### 0xKobold Implementation
```bash
# Spawn specialized agent
/agent-spawn researcher "analyze codebase"

# Or via tool
agent_spawn({
  agent_type: "researcher",
  task: "analyze codebase"
})

# Agents have capabilities (find matching)
/agent-cap research

# Results tracked
/agent-tree
```

## Integration with Existing Systems

### Session Manager
Each spawned agent has sessionId → isolated conversations

### Task Manager
Spawned agents can create/move tasks:
```
Agent spawn → creates task in "in-progress" → completes → moves to "done"
```

### MCP Extension
Agents can use MCP tools via the primary agent's MCP connections

### Web Search
Agents can call `web_search`, `web_qa` for research tasks

## Workflow Example

OpenClaw-style workflow in 0xKobold:

```
User: "Build a feature"

0xKobold [coordinator]:
  1. Analyzes request
  2. spawns planner: "design feature architecture"
  3. planner completes → result stored
  4. spawns specialist: "implement feature"
  5. specialist completes
  6. spawns reviewer: "review implementation"
  7. reviewer approves
  8. Integrates results → presents to user

Commands used:
  /task "Build feature" ← creates task
  /agent-spawn planner "design..." ← spawns agent
  /agent-tree ← shows hierarchy
  /tasks ← shows on kanban
```

## Database Schema

Agent data stored in `~/.0xkobold/agents.db`:

```sql
-- Static definitions
agent_definitions (id, name, type, capabilities, model...)

-- Active instances
running_agents (id, definition_id, session_id, parent_id, task, status...)

-- Communication
agent_messages (id, from_agent, to_agent, type, content...)
```

## Extending

Add new agent types by editing the extension:

```typescript
// In agent-registry-extension.ts
defaults.push({
  name: "my-agent",
  type: "specialist",
  capabilities: ["custom-task"],
  model: "ollama/llama3.2"
});
```

Or via commands (future):
```bash
/agent-define --name deployer --type specialist --capabilities "docker,kubectl"
```

## References

- OpenClaw: https://docs.openclaw.ai
- 0xKobold persona: ~/.0xkobold/ (all .md files)
- Agent registry: `src/extensions/core/agent-registry-extension.ts`
- Database: ~/.0xkobold/agents.db

## Summary

0xKobold implements OpenClaw's multi-agent philosophy:

1. **Persona templates** define the *primary* agent ( markdown files )
2. **Agent registry** manages *specialized* agents ( SQLite + code )
3. **Capability system** routes tasks to appropriate agents
4. **Hierarchical spawning** enables complex workflows
5. **Lifecycle management** ensures proper cleanup

Use `/agents` and `/agent-spawn` to start working with the system.
