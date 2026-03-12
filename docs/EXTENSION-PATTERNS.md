# Extension Patterns Guide

Quick reference for building 0xKobold extensions.

---

## Basic Extension Template

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function myExtension(pi: ExtensionAPI) {
  // Commands
  pi.registerCommand("my-command", {
    description: "What this does",
    handler: async (args: string, ctx: any) => {
      // Use ctx.ui?.notify?(message, type)
      ctx.ui?.notify?.("Hello!", "success");
    },
  });

  // Tools
  pi.registerTool({
    // @ts-ignore
    name: "my_tool",
    label: "/my_tool",
    description: "What this tool does",
    // @ts-ignore TypeBox
    parameters: Type.Object({
      param: Type.String(),
    }),
    // @ts-ignore
    async execute(_id: string, args: any, _signal: any, _onUpdate: any, _ctx: any) {
      return {
        content: [{ type: "text", text: "Result" }],
        details: { success: true },
      };
    },
  });

  console.log("[MyExtension] Loaded");
}
```

---

## Commands vs Tools

| Feature | Commands | Tools |
|---------|----------|-------|
| **Called by** | User (`/command`) | Agent (LLM) |
| **Returns** | `void` | `{ content, details }` |
| **Output** | `ctx.ui?.notify?.(msg, type)` | `return { content: [...] }` |
| **Types** | `"success" | "error" | "warning" | "info"` | `{ type: "text" | "image" }` |

---

## Command Pattern

```typescript
pi.registerCommand("my-command", {
  description: "What it does",
  handler: async (args: string, ctx: any) => {
    // Parse args
    const email = args.match(/--email\s+(\S+)/)?.[1];
    
    if (!email) {
      ctx.ui?.notify?.("Usage: /my-command --email me@example.com", "warning");
      return;
    }
    
    try {
      // Do work
      const result = await doSomething(email);
      ctx.ui?.notify?.(`Success: ${result}`, "success");
    } catch (error: any) {
      ctx.ui?.notify?.(`Failed: ${error.message}`, "error");
    }
  },
});
```

---

## Tool Pattern

```typescript
pi.registerTool({
  // @ts-ignore
  name: "my_tool",
  label: "/my_tool",
  description: "What this tool does",
  // @ts-ignore TypeBox
  parameters: Type.Object({
    param1: Type.String({ description: "What this is" }),
    param2: Type.Optional(Type.Number({ default: 5 })),
  }),
  // @ts-ignore Tool signature
  async execute(_id: string, args: any, _signal: any, _onUpdate: any, _ctx: any) {
    try {
      const result = await doWork(args.param1, args.param2);
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        details: result,
      };
    } catch (error: any) {
      return {
        content: [{ type: "text", text: `Error: ${error.message}` }],
        details: { error: error.message },
      };
    }
  },
});
```

---

## Tool Result Format

```typescript
{
  content: [
    { type: "text", text: "String result" },
    { type: "image", data: base64String, mimeType: "image/png" },
  ],
  details: {
    // Any structured data for agent
    success: true,
    metadata: {...}
  }
}
```

---

## Common Patterns

### Parsing Args

```typescript
// Positional: /cmd arg1 arg2
const [arg1, arg2] = args.trim().split(/\s+/);

// Named: /cmd --email me@example.com --chain base
const email = args.match(/--email\s+(\S+)/)?.[1];
const chain = args.match(/--chain\s+(\S+)/)?.[1] || "base";

// Mixed
const parts = args.trim().split(/\s+--/);
const positional = parts[0].split(/\s+/);
const named = parts.slice(1);
```

### Running Shell Commands

```typescript
import { $ } from "bun";

// Simple
const output = await $`npx awal status`.text();
const result = await $`command`.json();

// With timeout
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

const { stdout } = await execAsync("command", { timeout: 30000 });
```

### Persistent Storage

```typescript
import { join } from "path";
import { homedir } from "os";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const DATA_DIR = join(homedir(), ".0xkobold", "my-extension");
const CONFIG_FILE = join(DATA_DIR, "config.json");

function loadConfig() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(CONFIG_FILE)) return {};
  return JSON.parse(readFileSync(CONFIG_FILE, "utf-8"));
}

function saveConfig(cfg: any) {
  ensureDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}
```

### Using SQLite (bun:sqlite)

```typescript
import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";

const DB_PATH = join(homedir(), ".0xkobold", "my-extension.db");
const db = new Database(DB_PATH);
db.run("PRAGMA journal_mode = WAL;");

// Create tables
db.run(`
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

// Query
const items = db.query("SELECT * FROM items WHERE id = ?").all(id);

// Insert
db.run("INSERT INTO items VALUES (?, ?, ?)", [id, data, Date.now()]);
```

---

## Events

```typescript
// Session lifecycle
pi.on("session_start", async (_event, ctx) => {
  const sessionId = ctx.sessionManager.getSessionId();
  console.log(`Session started: ${sessionId}`);
});

pi.on("session_switch", async (event, ctx) => {
  console.log(`Switched to: ${event.sessionId}`);
});

// Context compaction
pi.on("session_before_compact", async (event, ctx) => {
  // Log or handle pre-compaction
});
```

---

## Full Example: Simple Extension

```typescript
/**
 * Simple Extension
 * Demonstrates patterns
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { $ } from "bun";

// State
let count = 0;

export default function simpleExtension(pi: ExtensionAPI) {
  // Command: /simple-count
  pi.registerCommand("simple-count", {
    description: "Show count",
    handler: async (_args, ctx) => {
      ctx.ui?.notify?.(`Count: ${count}`, "info");
    },
  });

  // Command: /simple-increment
  pi.registerCommand("simple-increment", {
    description: "Increment count",
    handler: async (_args, ctx) => {
      count++;
      ctx.ui?.notify?.(`Incremented! Now: ${count}`, "success");
    },
  });

  // Tool: simple_get_weather
  pi.registerTool({
    // @ts-ignore
    name: "simple_get_weather",
    label: "/simple_get_weather",
    description: "Get weather for city",
    // @ts-ignore
    parameters: Type.Object({
      city: Type.String({ description: "City name" }),
    }),
    // @ts-ignore
    async execute(_id, args, _signal, _onUpdate, _ctx) {
      try {
        // Mock API call
        const temp = Math.floor(Math.random() * 30) + 10;
        return {
          content: [{ type: "text", text: `${args.city}: ${temp}°C` }],
          details: { city: args.city, temp },
        };
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Error: ${e.message}` }],
          details: { error: e.message },
        };
      }
    },
  });

  console.log("[Simple] Extension loaded");
}
```

---

## Registering in pi-config.ts

```typescript
export const config = {
  extensions: [
    // ... other extensions
    './src/extensions/core/my-extension.ts',
  ],
  // ... rest of config
};
```

---

## Debug/Development

```typescript
// Console logs show in TUI/developer tools
console.log("[Extension] Debug message", data);
console.error("[Extension] Error:", error);

// Build with watch mode
// bun run dev

// Check for errors
// bun run build
```

---

## Best Practices

1. **Use TypeBox** for tool parameters (`Type.Object`, `Type.String`, etc.)
2. **Always add @ts-ignore** for TypeBox schemas and tool signatures
3. **Return details** in tool results for agent context
4. **Use notify types**: `"success"`, `"error"`, `"warning"`, `"info"`
5. **Store config** in `~/.0xkobold/` with mode `0o600`
6. **Handle errors** gracefully with try/catch
7. **Log loading** with `console.log("[ExtensionName] Loaded")`
8. **Prefix console logs** with `[ExtensionName]`

---

## Common Pitfalls

1. **Wrong return type**: Commands return `void`, Tools return `{ content, details }`
2. **Wrong notify method**: Use `ctx.ui?.notify?.(msg, type)` not `ctx.respond`
3. **Missing @ts-ignore**: Required for TypeBox schemas
4. **Async in handler**: Commands/tools are async, use `async`/`await`
5. **Wrong execute signature**: Tools need 5 params: `(id, args, signal, onUpdate, ctx)`

---

## Resources

- **Task Manager**: `src/extensions/core/task-manager-extension.ts` - Complete example with SQLite
- **Wallet**: `src/extensions/core/wallet-extension.ts` - External CLI integration
- **Ollama**: `src/extensions/core/ollama-extension.ts` - Complex tool patterns
- **TypeBox**: https://github.com/sinclairzx81/typebox
- **PI Framework**: See node_modules/@mariozechner/pi-coding-agent
