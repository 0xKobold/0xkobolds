# Extension Patterns Quick Reference

## Minimal Extension Template

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

// Module-level state (survives hot reloads)
const myState = new Map<string, any>();

export default async function register(pi: ExtensionAPI) {
  console.log("[MyExtension] Loading...");
  
  // ─── CLEAR STALE STATE ───
  // Do this first before setting up anything new
  myState.clear(); // Or selectively clear based on status
  
  // ─── SETUP ───
  pi.registerCommand("my-command", {
    description: "Does something",
    async handler(args, ctx) {
      ctx.ui.notify("Hello!", "info");
    },
  });
  
  // ─── CLEANUP ON SHUTDOWN ───
  pi.on("session_shutdown", () => {
    console.log("[MyExtension] Shutting down");
    // Cleanup here
  });
}
```

## Lifecycle Events

```typescript
// Runs once on initial load
const ONE_TIME_INIT = (() => {
  console.log("This logs once");
  return true;
})();

export default async function register(pi: ExtensionAPI) {
  // Runs on EVERY hot reload
  console.log("This logs on every reload");
  
  // Event: Before shutdown
  pi.on("session_shutdown", async () => {
    // Cleanup
  });
}
```

## Command Registration

```typescript
pi.registerCommand("name", {
  description: "What it does",
  async handler(args: string, ctx: any) {
    // args = everything after command name
    // ctx.ui.notify(msg, type) - show notification
    // ctx.chatLog.addSystem(msg) - add to chat
  },
});

// With arguments
pi.registerCommand("spawn", {
  description: "Spawn agent",
  async handler(args: string, ctx: any) {
    if (!args) {
      ctx.ui.notify("Usage: /spawn <type>", "error");
      return;
    }
    // args contains "specialist" for input: "/spawn specialist"
  },
});
```

## Tool Registration

```typescript
pi.registerTool({
  name: "myTool",
  label: "📦 My Tool", // Shown in UI
  description: "What this tool does",
  parameters: Type.Object({
    param: Type.String({ description: "Parameter description" }),
  }),
  async execute(toolId: string, params: Record<string, unknown>) {
    const value = params.param as string;
    
    return {
      content: [{ type: "text", text: "Result here" }],
      details: { custom: "data" },
    };
  },
});
```

## Listening to Events

```typescript
// pi events
pi.events.on("subagent:started", (data) => {
  console.log("Subagent started:", data.id);
});

pi.events.on("subagent:complete", (data) => {
  console.log("Subagent done:", data.id, data.success);
});

// Custom event bus (cross-extension communication)
import { eventBus } from "../event-bus/index.js";

eventBus.on("agent.spawned", (event) => {
  console.log("Agent spawned:", event.runId);
});

eventBus.emit("my.event", { custom: "data" });
```

## Working with Registry

```typescript
import { getDraconicRunRegistry } from "../agent/DraconicRunRegistry";

// Get singleton
const registry = getDraconicRunRegistry();

// Query
const all = registry.query({}).runs;
const running = registry.query({ status: "running" }).runs;
const byType = registry.query({ type: "specialist" }).runs;

// Get single
const run = registry.get(runId);

// Create (auto-assigned ID)
const newRun = registry.create({
  type: "specialist",
  task: "Do something",
  agentType: "specialist",
  parentId: undefined,
});

// Update status
registry.updateStatus(newRun.id, "running");  // → triggers auto-cleanup in 30s
registry.updateStatus(newRun.id, "completed"); // → auto-deletes in 30s
registry.updateStatus(newRun.id, "error");      // → auto-deletes in 30s

// Manual delete
registry.delete(runId);

// Stats
const stats = registry.getStats();
console.log(`${stats.activeRuns} running, ${stats.totalRuns} total`);
```

## Extension Settings

```typescript
// Add to ~/.0xkobold/config.json
{
  "extensions": {
    "myExtension": {
      "option": "value"
    }
  }
}

// Access in extension
const config = ctx.workspace?.config?.extensions?.myExtension;
```

## Error Handling

```typescript
async function register(pi: ExtensionAPI) {
  try {
    // Setup
  } catch (err) {
    console.error("[Extension] Failed to load:", err);
    // Extension partially loaded - may need manual restart
  }
}

// In commands/tools
async handler(args, ctx) {
  try {
    // Do work
  } catch (err) {
    ctx.ui.notify(`Error: ${err.message}`, "error");
  }
}
```

## Testing Reload

```bash
# In TUI, trigger reload
/reload

# Watch console output for cleanup messages:
# [🧹 TUI Reload] Cleared X stale agents
# [🧹 Wrapper] Cleared X stale jobs

# Check current state
/agent-tree
```

## Common Mistakes

### ❌ Static state persists
```typescript
// BAD: Survives reload
class MyExtension {
  static instances = new Map(); // Survives!
}
```

### ✅ Clear on register
```typescript
// GOOD: Clean slate on reload
const instances = new Map(); // Module-level, survives

export default async function register(pi) {
  instances.clear(); // Clear on reload
}
```

### ❌ Event listener leaks
```typescript
// BAD: Accumulates listeners on reload
pi.events.on("event", handler); // Never removed!
```

### ✅ Cleanup on shutdown
```typescript
// GOOD: Proper cleanup
const handlers = [];

export default async function register(pi) {
  const handler = (data) => { /* ... */ };
  pi.events.on("event", handler);
  handlers.push(handler);
  
  pi.on("session_shutdown", () => {
    // Remove listeners
    handlers.forEach(h => pi.events.off("event", h));
  });
}
```

## See Also

- [Hot Reload & Singletons](./HOT-RELOAD-SINGLETONS.md) - Detailed singleton patterns
- [Full pi extensions docs](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
