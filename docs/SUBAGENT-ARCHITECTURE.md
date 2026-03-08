# 0xKobold Subagent Architecture

Based on pi-mono's subagent example, adapted for 0xKobold's agent registry.

## Three Execution Modes

### 1. Single Agent
```typescript
// One agent, one task
await agent_spawn({
  agent: "scout",
  task: "Find all authentication code in the codebase",
});
```

### 2. Parallel Execution
```typescript
// Multiple agents run concurrently (4 at a time, max 8 total)
await agent_spawn({
  tasks: [
    { agent: "scout", task: "Find models" },
    { agent: "scout", task: "Find providers" },
    { agent: "diagnostics-expert", task: "Create metrics extension" },
    { agent: "memory-expert", task: "Create synthesis extension" },
  ]
});
```

### 3. Chained Workflow
```typescript
// Sequential execution with {previous} placeholder
await agent_spawn({
  chain: [
    { agent: "scout", task: "Find the read tool implementation" },
    { agent: "planner", task: "Suggest improvements for: {previous}" },
    { agent: "worker", task: "Implement the plan: {previous}" },
    { agent: "reviewer", task: "Review changes: {previous}" },
  ]
});
```

## Agent Definitions

### Location
- `~/.0xkobold/agents/*.md` - User-level agents (always available)
- `.0xkobold/agents/*.md` - Project-level agents (repo-controlled)

### Format
```markdown
---
name: scout
description: Fast codebase reconnaissance
tools: read, grep, find, ls, bash
model: qwen2.5-coder:14b
---

You are a fast reconnaissance agent. Your job is to:
1. Quickly scan the codebase structure
2. Find relevant files using grep/ls/find
3. Read key files to understand context
4. Return a COMPRESSED summary (max 500 tokens)

Be fast. Be concise. Focus on facts, not opinions.
```

## Built-in Agents

| Agent | Purpose | Tools | Model |
|-------|---------|-------|-------|
| `scout` | Fast recon | read, grep, find, ls | fast |
| `planner` | Implementation plans | read, grep | smart |
| `reviewer` | Code review | read, grep, bash | smart |
| `worker` | Full implementation | all | smart |
| `tester` | Test writing | read, write | smart |
| `docs` | Documentation | read, write | smart |

## Workflow Presets

```
/implement add Redis caching
  → scout → planner → worker

/scout-and-plan refactor auth to OAuth
  → scout → planner (no implementation)

/implement-and-review add input validation
  → worker → reviewer → worker (fixes)

/parallel "Create diagnostics" "Create memory synthesis" "Write tests"
  → All agents run simultaneously
```

## Implementation

```typescript
// src/extensions/core/subagent-extension.ts
interface SubagentSpawnParams {
  // Single mode
  agent?: string;
  task?: string;
  
  // Parallel mode
  tasks?: Array<{ agent: string; task: string }>;
  
  // Chain mode
  chain?: Array<{ agent: string; task: string }>;
  
  // Options
  agentScope?: "user" | "project" | "both";
  confirmProjectAgents?: boolean;
}

// Spawns separate pi-coding-agent subprocess
// Each gets isolated context window
// Results streamed back to parent
```

## Security Model

1. **User agents**: Always trusted (in `~/.0xkobold/`)
2. **Project agents**: Prompt for confirmation
3. **Capabilities**: Limited by agent definition
4. **Scope**: Only sees files agent is allowed to read

## Integration with Agent Registry

```typescript
// Our existing agent-registry gets new methods:
const registry = agentRegistryExtension(pi);

// Register as subagent
registry.registerSubagent({
  name: "diagnostics-expert",
  file: "~/.0xkobold/agents/diagnostics-expert.md",
  type: "specialist",
});

// Spawn via subagent tool
await tools.agent_spawn({
  tasks: [
    { agent: "diagnostics-expert", task: "Create metrics extension" },
    { agent: "docs-expert", task: "Update CHANGELOG" },
  ]
});
```

## 0.0.5 Roadmap: Subagent System

### Phase 1: Core Infrastructure
- [ ] `subagent-extension.ts` with spawn tool
- [ ] Agent discovery from `~/.0xkobold/agents/`
- [ ] Single mode execution
- [ ] Streaming results to TUI

### Phase 2: Parallel Execution
- [ ] `tasks` array support
- [ ] Concurrency limiting (4 concurrent, 8 max)
- [ ] Parallel status display
- [ ] Usage tracking per agent

### Phase 3: Chained Workflows
- [ ] `chain` array support
- [ ] `{previous}` placeholder
- [ ] Step-by-step execution
- [ ] Error handling (stop on failure)

### Phase 4: Workflows
- [ ] `/implement` command
- [ ] `/scout-and-plan` command
- [ ] `/implement-and-review` command
- [ ] `/parallel` command

## Example Use Cases

### Refactoring
```
/scout-and-plan refactor auth module to use JWT
→ Finds current auth code
→ Creates implementation plan
→ Ready for human review
```

### Multiple Features
```
/parallel "Create diagnostics" "Create memory synthesis" "Update docs"
→ All three agents work simultaneously
→ Results combined when all done
```

### Complete Implementation
```
/implement add Prometheus metrics endpoint to diagnostics
→ Scout finds relevant code
→ Planner creates step-by-step plan
→ Worker implements the code
→ Reviewer reviews and suggests fixes
→ Worker applies fixes
```

## Comparison

| Feature | pi-mono subagent | 0xKobold subagent |
|---------|------------------|-------------------|
| Spawn method | `pi` subprocess | `pi-coding-agent` |
| Context | Isolated windows | Isolated sessions |
| Tools | Limited set | Full registry |
| Models | Configurable | Via agent def |
| Agents | Markdown files | Markdown + registry |
| Workflows | Built-in presets | Customizable |
| Security | User/project scope | + capability-based |

---

**Next: Implement subagent extension for 0.0.5?** 🤖
