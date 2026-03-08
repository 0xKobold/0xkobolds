# Parallel Agent Coordination Pattern

## Architecture

```
Coordinator (You)
    │
    ├──► Agent #1 (Diagnostics) ────┐
    ├──► Agent #2 (Memory-Synth) ───┼──► Result Queue
    ├──► Agent #3 (Testing) ────────┤
    └──► Agent #4 (Docs) ───────────┘
                                          │
                                          ▼
                                   Integration Phase
```

## Implementation Options

### Option A: Fire-and-Forget (Simplest)
```typescript
// Spawn agents without awaiting
const promises = [
  spawnAgent("diagnostics").then(r => ({ type: "diagnostics", result: r })),
  spawnAgent("memory").then(r => ({ type: "memory", result: r })),
  spawnAgent("testing").then(r => ({ type: "testing", result: r })),
  spawnAgent("docs").then(r => ({ type: "docs", result: r })),
];

// Wait for all
const results = await Promise.all(promises);

// Integrate
results.forEach(r => {
  if (r.type === "diagnostics") integrateDiagnostics(r.result);
  // ...
});
```

### Option B: Message Queue (Robust)
```typescript
// Agents report progress to queue
agent.onProgress = (msg) => queue.push({ agent: "diagnostics", ...msg });

// Coordinator polls queue
while (pendingAgents > 0) {
  const msg = await queue.next();
  updateStatus(msg.agent, msg.status);
  if (msg.status === "complete") pendingAgents--;
}
```

### Option C: Checkpoints (Our Current Pattern)
```
Phase 1: Spawn all agents with task files
  ├─ Each agent writes to: .agents/results/<agent>-result.md
  └─ Signals completion via file: .agents/status/<agent>-done

Phase 2: Coordinator polls status files
  ├─ Wait for all *.done files
  └─ Read all *-result.md files

Phase 3: Integration
  └─ Combine results, resolve conflicts, commit
```

## Current 0xKobold Pattern

We're using **Option C: Checkpoints** because:
1. ✅ Survives disconnects
2. ✅ Agents work independently
3. ✅ Easy to debug (files are inspectable)
4. ✅ No complex infrastructure

## Parallel Execution Now

```bash
# Terminal 1: Agent 1 works
cd /home/moika/Documents/code/0xKobolds
echo "working" > .agents/status/diagnostics-working
# ... do work ...
echo "done" > .agents/status/diagnostics-done

# Terminal 2: Agent 2 works simultaneously
cd /home/moika/Documents/code/0xKobolds
echo "working" > .agents/status/memory-working
# ... do work ...
echo "done" > .agents/status/memory-done

# Terminal N: Coordinator waits
cd /home/moika/Documents/code/0xKobolds
while [ ! -f .agents/status/diagnostics-done ] || \
      [ ! -f .agents/status/memory-done ]; do
  sleep 5
done
echo "All agents complete! Integrating..."
```

## For Immediate Use

Want me to:

1. **Spawn parallel processes** using `bash` (background tasks)
2. **Use task files** (our current pattern)
3. **Implement async coordination** (if supported)

Which approach?
