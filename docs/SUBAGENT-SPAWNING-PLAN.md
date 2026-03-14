# Subagent Spawning Architecture Plan

## Problem Statement

The current subagent spawning implementation is broken:
1. `spawn_subagent` operation uses CLI args (`--mode subagent`) that don't exist
2. `delegate` operation returns text only, doesn't actually spawn agents
3. Subagents are exposed as user-facing tools when they should be internal

## Desired Architecture

```
User Request
     ↓
Main Agent (analyzes task)
     ↓
┌─────────────────────────────────────┐
│ delegate(operation="delegate")      │
│   - Analyzes complexity             │
│   - Decides: spawn scouts/planners? │
│   - Spawns subagents INTERNALLY      │
│   - Aggregates results               │
└─────────────────────────────────────┘
     ↓
Final Result shown to User
```

**Subagents are implementation details, not user commands.**

## Implementation Plan

### Phase 1: Internal Spawning API

**Task: Create internal subagent spawning API**

Create a new function in `agent-orchestrator-extension.ts`:

```typescript
// Internal subagent spawning - no CLI, no user access
async function spawnSubagentInternal(
  agentType: "scout" | "planner" | "worker" | "reviewer",
  task: string,
  context: { parentAgent?: string; workspace?: string }
): Promise<SubagentResult> {
  // Option A: Use gateway API
  const response = await fetch(`http://localhost:${gatewayPort}/spawn`, {
    method: "POST",
    body: JSON.stringify({ agentType, task, context })
  });
  
  // Option B: Direct function call
  const subagent = subagentRegistry.get(agentType);
  return subagent.execute(task, context);
}
```

**Key decisions:**
- Gateway-based spawning (recommended): Uses existing HTTP server
- Direct function call: Simpler, but less isolated
- No CLI dependency: Subagents run in same process or via HTTP

### Phase 2: Fix Delegate Operation

**Task: Fix delegate operation to spawn subagents**

Current broken `delegate`:
```typescript
case "delegate": {
  // Returns text, doesn't actually spawn anything
  return { content: [{ type: "text", text: "Delegation plan..." }] };
}
```

Fixed `delegate`:
```typescript
case "delegate": {
  const task = params.task as string;
  const analysis = analyzeTask(task);
  
  if (!shouldDelegate(analysis, strategy)) {
    return { content: [{ type: "text", text: "Task simple enough to handle directly." }] };
  }
  
  // ACTUALLY SPAWN SUBAGENTS
  const results: SubagentResult[] = [];
  
  if (analysis.complexity === "medium") {
    // Medium: Scout → Worker
    results.push(await spawnSubagentInternal("scout", task, ctx));
    results.push(await spawnSubagentInternal("worker", task, ctx));
  } else if (analysis.complexity === "complex") {
    // Complex: Scout → Planner → Worker(s) → Reviewer
    results.push(await spawnSubagentInternal("scout", task, ctx));
    results.push(await spawnSubagentInternal("planner", task, ctx));
    // ... spawn workers for each component
    results.push(await spawnSubagentInternal("reviewer", task, ctx));
  }
  
  return {
    content: [{ type: "text", text: aggregateResults(results) }],
    details: { analysis, results }
  };
}
```

### Phase 3: Remove Public spawn_subagent

**Task: Remove spawn_subagent from public API**

Remove from `agent_orchestrate` tool:
```typescript
// REMOVE THIS:
case "spawn_subagent": {
  // ...broken code...
}
```

Update valid operations:
```typescript
description: "Operations: list, status, stop, analyze, delegate"
// Removed: spawn_main, spawn_subagent (internal only)
```

### Phase 4: Documentation

**Task: Document subagent spawning architecture**

Update `AGENTS.md` or create new docs:

```markdown
## Subagent Architecture

Subagents are internal implementation details that the main agent uses to:
- Scout: Find relevant code/context (short-running, read-only)
- Planner: Create implementation plans (reasoning-heavy)
- Worker: Execute implementation tasks (write code)
- Reviewer: Review code quality and security (analysis)

### For Users

Just ask the agent to do something complex. The agent will automatically:
1. Analyze task complexity
2. Spawn appropriate subagents
3. Aggregate results
4. Return final solution

You don't need to manage subagents manually.

### For Developers

The `delegate` operation in `agent_orchestrate` tool handles spawning.
It uses the internal `spawnSubagentInternal()` function.
Subagents run via gateway HTTP API or direct function call.
```

## Subagent Definitions

Current definitions in `agent-orchestrator-extension.ts`:

| Type | Scope | Purpose | Priority |
|------|-------|---------|----------|
| scout | small | Find code patterns, search files | High (quick) |
| planner | medium | Design implementation | Medium |
| worker | large | Execute implementation | High |
| reviewer | small | Review code, security check | Medium |

## Delegation Strategy

| Complexity | Subagents Spawned | Flow |
|------------|-------------------|------|
| simple | None | Handle directly |
| medium | Scout + Worker | Find → Implement |
| complex | Scout + Planner + Worker + Reviewer | Full workflow |

## Technical Details

### Why Not CLI?

The old approach tried:
```bash
bun run src/cli/index.ts --mode subagent --agent scout --task "..."
```

Problems:
1. CLI doesn't support `--mode` flag
2. Spawns separate process (slow, complex)
3. Requires process management
4. Logging/monitoring difficult

### Why Internal API?

```typescript
// Internal spawning (no CLI)
const result = await spawnSubagentInternal("scout", task, context);
```

Benefits:
1. Same process or gateway HTTP
2. Shared context and state
3. Better error handling
4. Faster (no process spawn)

### Gateway Approach (Recommended)

The gateway server already exists on port 7777. Add endpoint:

```typescript
// gateway-server.ts
app.post('/spawn', async (req, res) => {
  const { agentType, task, context } = req.body;
  const result = await executeSubagent(agentType, task, context);
  res.json(result);
});
```

## Testing Plan

1. **Unit tests**: Test `analyzeTask()` complexity scoring
2. **Integration tests**: Test `spawnSubagentInternal()` via gateway
3. **End-to-end tests**: Test `delegate` operation spawns correctly
4. **Manual test**: Ask agent to do complex task, verify subagents spawn

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Subagents fail silently | Add proper error handling + logging |
| Gateway not running | Fall back to direct function call |
| Subagent hangs | Add timeout (default: 60s for scout, 5min for worker) |
| Context not passed | Ensure context includes parent agent info |

## Success Metrics

- [ ] `delegate` spawns subagents automatically
- [ ] No `--mode` CLI usage required
- [ ] Users don't need to know about subagents
- [ ] Subagent results are aggregated correctly
- [ ] Error handling is robust

## Timeline

- **Task 1**: Internal spawning API - 2 hours
- **Task 2**: Fix delegate operation - 1 hour
- **Task 3**: Remove spawn_subagent - 15 min
- **Task 4**: Update documentation - 30 min
- **Task 5**: Testing - 1 hour
- **Task 6**: Architecture docs - 30 min

**Total estimated: ~5-6 hours**

## References

- Current code: `src/extensions/core/agent-orchestrator-extension.ts`
- Task breakdown: Bug report at `~/.0xkobold/obsidian_vault/Research/Subagent-Spawning-Architecture.md`
- Related: `AGENTS.md` - Agent architecture docs