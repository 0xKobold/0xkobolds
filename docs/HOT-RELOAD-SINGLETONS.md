# Hot Reload & Singleton Persistence

**Problem:** Module-level code doesn't re-execute on hot reload if the module is cached. Singleton instances stored in static class properties or module-level variables survive reloads.

## The Issue

When you write module-level cleanup code like this:

```typescript
// This runs ONCE when module is first loaded
const registry = getDraconicRunRegistry();
const stale = registry.query({}).runs.filter(r => r.status !== "running");
for (const run of stale) registry.delete(run.id);

export default async function register(pi: ExtensionAPI) {
  // This runs on EVERY reload
}
```

The cleanup only runs once when the module is first required. On hot reload, if the module system caches the module, the singleton persists and the cleanup never re-runs.

## The Solution

Add cleanup **inside** the `register()` function, which executes on every reload:

```typescript
export default async function register(pi: ExtensionAPI) {
  // 🧹 AGGRESSIVE CLEAR: Remove ALL stale agents on every reload
  const { getDraconicRunRegistry } = await import("../agent/DraconicRunRegistry");
  const registry = getDraconicRunRegistry();
  const allRuns = registry.query({}).runs;
  const nonRunning = allRuns.filter(r => r.status !== "running");
  for (const run of nonRunning) registry.delete(run.id);
  
  if (nonRunning.length > 0) {
    console.log(`[🧹 Reload] Cleared ${nonRunning.length} stale agents`);
  }
  
  // ... rest of extension setup
}
```

## Pattern: Ephemeral State

For state that should NOT persist across reloads:

### 1. Module-level Maps (Bad - persists)
```typescript
// ❌ BAD: This Map survives hot reloads
const activeJobs = new Map<string, Job>();
```

### 2. Register-level initialization (Good - clears on reload)
```typescript
// ✅ GOOD: Cleared on every reload
export default async function register(pi: ExtensionAPI) {
  // Clear stale entries from module-level map
  for (const [id, job] of activeJobs) {
    if (job.status !== "running") activeJobs.delete(id);
  }
}
```

### 3. Auto-clear after completion (Best)
```typescript
// ✅ BEST: Self-cleaning with timeout
function onJobComplete(id: string) {
  setTimeout(() => {
    activeJobs.delete(id);
  }, 30000); // 30 seconds visible, then gone
}
```

## Full Example: Ephemeral Agent Tracking

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { eventBus } from "../event-bus/index.js";

// Module-level state (survives reloads)
interface TrackedAgent {
  id: string;
  status: "running" | "completed" | "error";
  startedAt: number;
}
const trackedAgents = new Map<string, TrackedAgent>();

export default async function register(pi: ExtensionAPI) {
  console.log("[Extension] Loading...");
  
  // ─────────────────────────────────────────
  // STEP 1: Clear stale state from reload
  // ─────────────────────────────────────────
  const registry = getRegistry(); // your singleton
  const allAgents = registry.query({}).runs;
  
  // Remove non-running from registry
  const staleAgents = allAgents.filter(a => a.status !== "running");
  for (const agent of staleAgents) {
    registry.delete(agent.id);
  }
  
  // Clear module-level map too
  for (const [id, tracked] of trackedAgents) {
    if (tracked.status !== "running") trackedAgents.delete(id);
  }
  
  if (staleAgents.length > 0) {
    console.log(`[🧹 Reload] Cleared ${staleAgents.length} stale agents`);
  }
  
  // ─────────────────────────────────────────
  // STEP 2: Set up event handlers
  // ─────────────────────────────────────────
  eventBus.on("agent.spawned", (event) => {
    trackedAgents.set(event.runId, {
      id: event.runId,
      status: "running",
      startedAt: Date.now(),
    });
  });
  
  eventBus.on("agent.completed", (event) => {
    const agent = trackedAgents.get(event.runId);
    if (agent) {
      agent.status = event.status; // "completed" or "error"
      
      // Auto-delete after display period
      setTimeout(() => {
        trackedAgents.delete(event.runId);
        registry.delete(event.runId); // Clean registry too
      }, 30000);
    }
  });
}
```

## When State SHOULD Persist

Some state legitimately needs to survive reloads:

| State Type | Persistence | Example |
|-----------|-------------|---------|
| User preferences | ✅ Persist | `config.json` |
| Running agents | ✅ Persist | Long-running tasks |
| Messages/artifacts | ✅ Persist | Saved to disk |
| Completed agents | ❌ Ephemeral | Auto-clear after 30s |
| UI temp state | ❌ Ephemeral | Toggle states |
| Event handlers | ❌ Re-register | Set up fresh on reload |

## Debugging Tips

Check if state is persisting:

```typescript
export default async function register(pi: ExtensionAPI) {
  const registry = getDraconicRunRegistry();
  const runs = registry.query({}).runs;
  
  console.log("[Debug] On reload:");
  console.log(`  Total runs: ${runs.length}`);
  console.log(`  Running: ${runs.filter(r => r.status === "running").length}`);
  console.log(`  Completed: ${runs.filter(r => r.status === "completed").length}`);
  console.log(`  Error: ${runs.filter(r => r.status === "error").length}`);
}
```

## See Also

- [pi-coding-agent extensions](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- `src/extensions/core/tui-integration-extension.ts` - Real example
- `src/extensions/community/draconic-subagents-wrapper.ts` - Real example
