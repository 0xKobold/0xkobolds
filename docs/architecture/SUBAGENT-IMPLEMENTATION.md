# Subagent System Implementation Plan (0.0.5)

## Overview

Spawn parallel sub-agents with isolated context windows, inspired by pi-mono's subagent extension.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                0xKobold Master Agent                     │
│                    (Your Session)                        │
│                         │                                │
│              ┌──────────┴──────────┐                    │
│              ▼                     ▼                     │
│    ┌─────────────────┐   ┌─────────────────┐            │
│    │   Subagent #1   │   │   Subagent #2   │            │
│    │   (pi process)  │   │   (pi process)  │            │
│    │   Isolated ctx  │   │   Isolated ctx  │            │
│    └────────┬────────┘   └────────┬────────┘            │
│              │                     │                     │
│              └──────────┬──────────┘                     │
│                         ▼                                │
│              ┌─────────────────┐                        │
│              │  Result Merger  │                        │
│              └─────────────────┘                        │
└─────────────────────────────────────────────────────────┘
```

## Three Execution Modes

### 1. Single Agent
```typescript
await agent_spawn({
  agent: "scout",
  task: "Find all auth code in the codebase",
});
```

### 2. Parallel Execution
```typescript
await agent_spawn({
  tasks: [
    { agent: "scout", task: "Find models" },
    { agent: "scout", task: "Find providers" },
    { agent: "diagnostics-expert", task: "Create metrics" },
  ]
});
// Runs 3 agents concurrently (max 4 concurrent, 8 total)
```

### 3. Chained Workflow
```typescript
await agent_spawn({
  chain: [
    { agent: "scout", task: "Find auth code" },
    { agent: "planner", task: "Plan improvements for: {previous}" },
    { agent: "worker", task: "Implement: {previous}" },
  ]
});
// Sequential with results passed via {previous}
```

## Agent Definition Format

```markdown
---
name: scout
description: Fast codebase reconnaissance
tools: read, grep, find, ls, bash
model: qwen2.5-coder:14b
---

You are a fast reconnaissance agent. Your job:
1. Quickly scan the codebase
2. Find relevant files with grep/find
3. Read key files to understand context
4. Return COMPRESSED summary (max 500 tokens)

Be fast. Be concise. Focus on facts.
```

## Built-in Agent Types

| Agent | Purpose | Tools | Model |
|-------|---------|-------|-------|
| `scout` | Fast recon | read, grep, find, ls, bash | fast |
| `planner` | Implementation plans | read, grep, find | smart |
| `reviewer` | Code review | read, grep, find, bash | smart |
| `worker` | Full implementation | all | smart |
| `tester` | Test writing | read, write | smart |
| `docs` | Documentation | read, write | smart |

## Workflow Presets

```bash
/implement add Redis caching
# → scout → planner → worker

/scout-and-plan refactor auth to OAuth
# → scout → planner (no implementation)

/implement-and-review add validation
# → worker → reviewer → worker (fixes)

/parallel "Create diagnostics" "Create memory" "Write tests"
# → All agents run simultaneously
```

## Implementation Steps

### Phase 1: Core Infrastructure
1. Create `subagent-extension.ts` with spawn tool
2. Agent discovery from `~/.0xkobold/agents/`
3. Single mode execution
4. Basic stream handling

### Phase 2: Parallel Execution
1. `tasks` array support
2. Concurrency limiting (4 concurrent, 8 max)
3. Parallel status display
4. Result aggregation

### Phase 3: Chained Workflows
1. `chain` array support
2. `{previous}` placeholder replacement
3. Step-by-step execution
4. Error handling (stop on failure)

### Phase 4: Workflows
1. `/implement` command
2. `/scout-and-plan` command
3. `/implement-and-review` command
4. `/parallel` command

## Files to Create

```
src/extensions/core/
├── subagent-extension.ts          # Main extension
├── subagent/
│   ├── agent-runner.ts            # Spawns pi processes
│   ├── parallel-controller.ts     # Manages concurrent agents
│   ├── chain-controller.ts        # Sequential execution
│   ├── result-merger.ts           # Combines results
│   └── stream-handler.ts          # TUI streaming
└── agents/
    ├── scout-agent.md             # Default agents
    ├── planner-agent.md
    ├── reviewer-agent.md
    └── worker-agent.md
```

## Commands

```typescript
// Register as tool
pi.registerTool({
  name: "agent_spawn",
  label: "Spawn Subagent",
  description: "Spawn single, parallel, or chained subagents",
  parameters: Type.Object({
    // Single mode
    agent: Type.Optional(Type.String()),
    task: Type.Optional(Type.String()),
    // Parallel mode
    tasks: Type.Optional(Type.Array(Type.Object({
      agent: Type.String(),
      task: Type.String(),
    }))),
    // Chain mode
    chain: Type.Optional(Type.Array(Type.Object({
      agent: Type.String(),
      task: Type.String(),
    }))),
  }),
});

// Commands
pi.registerCommand("implement", {
  description: "Implement with workflow: scout → planner → worker",
  handler: async (args, ctx) => { /* ... */ }
});

pi.registerCommand("parallel", {
  description: "Run agents in parallel: /parallel \"task1\" \"task2\"",
  handler: async (args, ctx) => { /* ... */ }
});
```

## Security Model

- User agents: `~/.0xkobold/agents/*.md` (always trusted)
- Project agents: `.0xkobold/agents/*.md` (prompt for confirmation)
- Scope: `agentScope: "user" | "project" | "both"`

## Next Actions

1. ✅ Review this plan
2. 🔄 Create `subagent-extension.ts` skeleton
3. 🔄 Implement single agent spawn
4. 🔄 Add default agent definitions
5. 🔄 Build parallel execution
6. 🔄 Build chain execution
7. 🔄 Add workflow commands

**Ready to start implementation?** 🚀
