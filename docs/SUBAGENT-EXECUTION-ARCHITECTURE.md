# Subagent Execution Architecture

## Overview

Subagents are ephemeral agents spawned by the main agent to handle specific tasks. They run in the same process as the main agent, sharing context and tools.

## Key Discovery: No Double-Dipping!

We already have a complete agent execution infrastructure that was NOT being used:

### Existing Infrastructure

| Component | Purpose | Status |
|-----------|---------|--------|
| `src/agent/types/definitions.ts` | Agent type definitions (coordinator, specialist, researcher, worker, reviewer) | ✅ Complete |
| `src/agent/tools/spawn-agent.ts` | Spawn agent tool with auto-routing | ✅ Complete |
| `src/agent/embedded-runner.ts` | `runEmbeddedAgent()` - Execute agent with TUI settings | ✅ Complete |
| `src/gateway/methods/agent.ts` | Gateway `agent.run` method | ✅ Complete |
| `src/extensions/core/agent-orchestrator-extension.ts` | Orchestrator with `delegate` operation | ⚠️ Was simulating |

### What Was Wrong

The orchestrator had `spawnSubagentInternal()` that:
1. Tried to call `POST /spawn` (endpoint doesn't exist)
2. Falls back to simulated responses (fake Scout output)

```typescript
// WRONG - gateway doesn't have /spawn
const response = await fetch(`http://localhost:${port}/spawn`, ...);

// WRONG - fake simulation
async function simulateScout(task: string): Promise<string> {
  return `🔍 Scout Results...\nFound ${Math.floor(Math.random() * 10)} files`;
}
```

### What We Should Do

Use `runEmbeddedAgent()` directly - no HTTP, no simulation:

```typescript
import { runEmbeddedAgent } from "../../agent/embedded-runner";

// Map subagent types to agent types
const AGENT_TYPE_MAP = {
  scout: "researcher",    // Scout = fast information gathering
  planner: "coordinator",  // Planner = coordination/planning
  worker: "worker",        // Worker = implementation
  reviewer: "reviewer",    // Reviewer = validation
};

async function spawnSubagentInternal(
  agentName: string,
  task: string,
  ctx: ExtensionContext
): Promise<SubagentResult> {
  const agentConfig = subagentAgents.get(agentName);
  const agentType = AGENT_TYPE_MAP[agentName] || "worker";
  const agentTypeDef = AGENT_TYPES[agentType];
  
  const result = await runEmbeddedAgent({
    prompt: task,
    cwd: process.cwd(),
    systemPrompt: agentConfig.systemPrompt,
    model: agentConfig.model,
    extensions: [], // Use filtered extensions
  });
  
  return {
    agent: agentName,
    task,
    exitCode: result.text ? 0 : 1,
    output: result.text,
    duration: result.metadata.duration,
  };
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Main Agent (pi-coding-agent)                               │
│                                                             │
│  /agent_orchestrate operation="delegate" task="..."        │
│                     │                                       │
│                     ▼                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  spawnSubagentInternal("scout", task, ctx)         │   │
│  │                                                     │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │ runEmbeddedAgent({                          │   │   │
│  │  │   prompt: task,                              │   │   │
│  │  │   cwd: process.cwd(),                        │   │   │
│  │  │   systemPrompt: AGENT_TYPES.researcher,     │   │   │
│  │  │   model: "kimi-k2.5:cloud",                  │   │   │
│  │  │ })                                            │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │                       │                             │   │
│  │                       ▼                             │   │
│  │  Ephemeral agent runs, returns result              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Result: { agent, task, exitCode, output, duration }       │
│                                                             │
│  Next subagent: planner → worker → reviewer               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Subagent Types Mapping

| Orchestrator Type | AGENT_TYPES | Purpose | Tools |
|-------------------|-------------|---------|-------|
| `scout` | `researcher` | Fast reconnaissance | read, search, list |
| `planner` | `coordinator` | Planning/coordination | agent_orchestrate, task_breakdown |
| `worker` | `worker` | Implementation | read, write, edit, bash |
| `reviewer` | `reviewer` | Code review | read, bash, security_scan |

## Agent Type Definitions

From `src/agent/types/definitions.ts`:

```typescript
AGENT_TYPES = {
  coordinator: {
    capabilities: ["task-decomposition", "agent-delegation", ...],
    tools: ["agent_orchestrate", "task_breakdown", ...],
    maxIterations: 20,
    thinkLevel: "deep",
  },
  specialist: {
    capabilities: ["deep-domain-knowledge", "best-practices", ...],
    tools: ["read", "edit", "write", ...],
    maxIterations: 15,
  },
  researcher: {
    capabilities: ["information-gathering", "web-research", ...],
    tools: ["web_search", "web_fetch", "read", ...],
    maxIterations: 12,
  },
  worker: {
    capabilities: ["implementation", "code-generation", ...],
    tools: ["read", "edit", "write", "bash", ...],
    maxIterations: 15,
  },
  reviewer: {
    capabilities: ["code-review", "validation", ...],
    tools: ["read", "bash", "security_scan", ...],
    maxIterations: 10,
  },
}
```

## Implementation Plan

### Phase 1: Basic Execution
1. Import `runEmbeddedAgent` from `src/agent/embedded-runner`
2. Import `AGENT_TYPES` from `src/agent/types/definitions`
3. Replace simulation with actual execution
4. Map subagent types to agent types

### Phase 2: Context Sharing
1. Pass parent context to subagents
2. Share file reads/writes between main and subagents
3. Aggregate results from multiple subagents

### Phase 3: Optimization
1. Parallel subagent execution (Scout + Planner together)
2. Result caching
3. Incremental context

## Benefits

| Before | After |
|--------|-------|
| ❌ Simulated responses | ✅ Real execution |
| ❌ HTTP overhead | ✅ Direct function call |
| ❌ Gateway dependency | ✅ Works without gateway |
| ❌ No tool access | ✅ Full tool access |
| ❌ No context sharing | ✅ Shared context |

## Testing

```bash
# Test delegate with medium complexity
/agent_orchestrate operation="delegate" task="Implement user authentication" strategy="always"

# Expected: Scout actually searches files, Worker actually writes code
# Verify: Check logs for [Embedded] agent execution
```

## Files

| File | Purpose |
|------|---------|
| `src/agent/types/definitions.ts` | Agent type definitions |
| `src/agent/tools/spawn-agent.ts` | Spawn agent configuration |
| `src/agent/embedded-runner.ts` | `runEmbeddedAgent()` function |
| `src/extensions/core/agent-orchestrator-extension.ts` | Orchestrator with delegate |
| `src/gateway/methods/agent.ts` | Gateway agent.run method |