# 0xKobold Extensions

Extensions add new capabilities to 0xKobold through commands, tools, and lifecycle hooks.

## Quick Start: Creating Extensions

The **Extension Scaffold Extension** (`ext-scaffold-extension.ts`) makes it easy to create new extensions.

### Commands

```
/ext-scaffold [name] [description] [--type=full|tool|command]
```

**Examples:**
```
# Create a full extension (commands + tools + hooks)
/ext-scaffold my-extension "A cool new extension"

# Create a tool-only extension
/ext-scaffold image-resizer "Resize images" --type=tool

# Create a command-only extension
/ext-scaffold db-query "Query the database" --type=command

# List all built-in extensions
/ext-list

# Show development help
/ext-help
```

### Agent Tools

```
create_extension - Create a new extension scaffold
list_extensions  - List all available extensions
```

## Extension Types

### `--type=full` (default)
Complete extension with:
- Lifecycle hooks (session_start, session_end, turn_start, turn_end)
- User commands (`/my-extension`)
- Agent tools (`my_extension_tool`)

### `--type=tool`
Tool-only extension for:
- New agent capabilities
- External API integrations
- Data processing utilities

### `--type=command`
Command-only extension for:
- Quick user commands
- Utility functions
- Status checks

## Extension Structure

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function myExtension(pi: ExtensionAPI) {
    // Lifecycle hooks
    pi.on("session_start", async (event, ctx) => { ... });
    
    // User commands
    pi.registerCommand("my-cmd", {
        description: "Does something",
        handler: async (args, ctx) => { ... }
    });
    
    // Agent tools
    pi.registerTool({
        name: "my_tool",
        description: "A tool",
        parameters: { ... },
        execute: async (...args) => { ... }
    });
}
```

## Extension Directory

- **Built-in:** `src/extensions/core/` - Auto-loaded on startup
- **Custom:** Can be loaded via config

## Built-in Extensions

See `/ext-list` for the current list of built-in extensions.

## Lifecycle Hooks

| Hook | When It Fires |
|------|---------------|
| `session_start` | When 0xKobold session begins |
| `session_end` | When session ends |
| `turn_start` | When agent starts thinking |
| `turn_end` | When agent finishes |
| `agent_end` | When agent completes and waits for user |

## Best Practices

1. **Name files:** `{name}-extension.ts`
2. **Use kebab-case:** `my-tool`, not `myTool`
3. **Document:** Add JSDoc comments describing what the extension does
4. **Error handling:** Wrap in try/catch, return proper error responses for tools
5. **Logging:** Use `console.log("[MyExtension] message")` for debugging
6. **User feedback:** Always use `ctx.ui.notify()` for user-facing messages

## Examples

Look at existing extensions in `src/extensions/core/`:

- `session-name-extension.ts` - Simple tool + command
- `onboarding-extension.ts` - Lifecycle hooks + file operations
- `pi-notify-extension.ts` - Desktop notifications
- `onboarding-extension.ts` - Complex extension with file I/O
