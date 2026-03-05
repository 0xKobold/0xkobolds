# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

0xKobold is a personal AI assistant framework built on **Bun** and the **`@mariozechner/pi-coding-agent`** library. It provides a hot-reloadable skill system, multi-agent WebSocket gateway, Discord integration, and an event-driven architecture.

**Key Dependencies:**
- `@mariozechner/pi-coding-agent` - Core agent framework
- `@mariozechner/pi-tui` - Terminal UI
- `commander` - CLI framework
- `bun:sqlite` - SQLite via Bun
- `discord.js` - Discord bot integration

## Development Commands

```bash
# Development
bun run start          # Start the main server/agent
bun run dev            # TypeScript watch mode (tsc --watch)
bun run build          # Compile TypeScript to dist/

# CLI & TUI
bun run cli            # Run CLI commands
bun run tui            # Start Terminal UI
bun run init           # Initialize 0xKobold workspace (~/.0xkobold/)

# Testing
bun test               # Run all tests with Bun test runner
bun test <pattern>     # Run specific test file (e.g., bun test tui)

# Demo scripts
bun run demo           # Run demo.ts
./demo-multi-agent.sh  # Multi-agent demo
./demo-openclaw.sh     # OpenClaw compatibility demo
```

## Architecture

### Entry Points

- **`src/index.ts`** - Main server entry using `pi-coding-agent` Agent class
- **`cli/index.ts`** - CLI entry point using Commander.js
- **`tui/index.tsx`** - Terminal UI entry (React-based)

### Core Architecture Patterns

**1. Extension-Based Architecture**
The project extends `pi-coding-agent` via extensions in `src/extensions/core/`:
- `gateway-extension.ts` - WebSocket server for multi-agent spawning
- `discord-extension.ts` - Discord bot integration
- `fileops-extension.ts` - File operation tools

Extensions are registered in `src/pi-config.ts` and loaded via `src/extensions/loader.ts`.

**2. Hot-Reload Skill System**
Skills are plain TypeScript files in the `skills/` directory:
```typescript
export const mySkill: Skill = {
  name: 'mySkill',
  description: 'What it does',
  risk: 'safe' | 'medium' | 'high',
  toolDefinition: { /* OpenAI function format */ },
  async execute(args) { return result; }
};
export default mySkill;
```

Skills auto-reload on file change via `src/skills/loader.ts`. Built-in skills are in `src/skills/builtin/`.

**3. Event Bus**
Decoupled module communication via `src/event-bus/index.ts`:
```typescript
eventBus.emit('agent.spawned', payload);
eventBus.on('agent.spawned', handler);
```

**4. Risk-Based Approval**
Skills have risk levels that determine approval requirements:
- `safe` - No approval (math, strings)
- `medium` - Confirmation required (file write, web requests)
- `high` - Explicit approval (shell, delete)

### Directory Structure

```
src/
├── agent/           # PI Agent Core adapter with subagent support
├── approval/        # Risk-based approval queue
├── channels/        # Discord integration
├── config/          # Zod-based configuration
├── discord/         # Discord bot implementation
├── event-bus/       # Decoupled event system (index.ts)
├── extensions/      # PI framework extensions
│   ├── core/        # Built-in extensions
│   └── loader.ts    # Extension loader
├── gateway/         # WebSocket gateway for multi-agent
├── llm/             # LLM providers (Ollama, Anthropic, router)
├── memory/          # Persistence layer
├── skills/          # Hot-reload skill system
│   ├── builtin/     # Built-in skills (file, shell, subagent)
│   ├── types.ts     # Skill interface definitions
│   └── loader.ts    # Hot-reload loader
├── tui/             # Terminal UI components
└── pi-config.ts     # PI framework configuration

cli/                 # CLI implementation
├── index.ts         # CLI entry
├── commands/        # CLI subcommands (init, daemon, chat, agent, status)
├── client.ts        # Daemon client
└── repl.ts          # Interactive REPL

tui/                 # Terminal UI (React-based)
skills/              # User-defined skills (hot-reloaded)
config/              # Agent configuration files
test/                # Test suite
```

### Configuration

Global config stored in `~/.0xkobold/config.json`:
```json
{
  "daemon": { "port": 3456, "host": "localhost" },
  "agents": { "default": "assistant", "maxConcurrent": 5 },
  "llm": { "provider": "ollama", "model": "minimax-m2.5:cloud" },
  "memory": { "maxConversations": 1000, "retentionDays": 90 }
}
```

Project-local workspace in `.0xkobold/` (created by `bun run init`).

### Key Files

- **`src/pi-config.ts`** - PI framework configuration with extensions and keybindings
- **`src/skills/types.ts`** - Skill interface definition
- **`src/skills/loader.ts`** - Hot-reload implementation using `fs.watch`
- **`src/event-bus/index.ts`** - Domain event system with typed events
- **`cli/commands/init.ts`** - Workspace initialization logic

### Testing

Uses Bun's built-in test runner (`bun:test`):
```typescript
import { test, expect } from "bun:test";
test("name", () => { expect(true).toBe(true); });
```

Test utilities in `test/setup.ts` include `createMockLogger()`, `delay()`, `retry()`.

### TypeScript Configuration

- Target: ES2022, Module: ESNext
- Strict mode disabled (relaxed type checking)
- Bun types included (`bun-types`)
- Source maps enabled

## Important Notes

- **Always use Bun**, not Node.js. This project depends on Bun-specific APIs (`bun:sqlite`, `import.meta.main`, etc.)
- The project uses `pi-coding-agent` framework - don't reinvent agent loop logic, extend via the extension system
- Skills auto-reload on save - no build step needed for skill development
- The gateway uses WebSocket protocol (port 18789 by default) for agent spawning
- Extensions are loaded dynamically from paths in `pi-config.ts`
