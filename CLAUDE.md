# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

0xKobold is a personal AI assistant framework built on **Bun** and the **`@mariozechner/pi-coding-agent`** library. It features an **OpenClaw-style multi-agent orchestration system** with a hot-reloadable skill system, WebSocket gateway for agent spawning, Discord integration, and an event-driven architecture.

**Key Capabilities:**
- **Multi-Agent Orchestration** - Spawn specialized agents (coordinator, specialist, researcher, planner, reviewer) dynamically
- **Hot-Reload Skills** - Add capabilities without restart via `skills/` directory
- **WebSocket Gateway** - Real-time agent spawning and communication (port 18789)
- **Discord Integration** - Bot interface for remote interaction
- **Event-Driven Architecture** - Decoupled modules via event bus

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
./demo-multi-agent.sh  # Multi-agent demo (launches gateway + TUI)
./launch.sh            # Production launcher

# Agent Commands (Runtime)
/agent-orchestrate spawn_main testing-coordinator     # Spawn main agent
/agent-orchestrate spawn_subagent worker "task"       # Spawn subagent
/agent-orchestrate list                               # List all agents
/agent-orchestrate analyze "complex task"             # Analyze task complexity
/agent-orchestrate delegate "big project"             # Auto-delegate workflow
```

## Multi-Agent System

0xKobold implements OpenClaw-style multi-agent orchestration with specialized agent types defined in the registry (`~/.0xkobold/agents.db`).

### Agent Types

| Type | Capabilities | Use For |
|------|--------------|---------|
| **coordinator** | task-delegation, planning, coordination | Breaking down complex requests, managing workflows |
| **specialist** | coding, refactoring, code-review, debugging | Implementation tasks, code generation |
| **researcher** | research, analysis, documentation, search | Exploring codebases, finding patterns |
| **planner** | planning, architecture-design, task-breakdown | Design phase, creating implementation plans |
| **reviewer** | code-review, quality-assurance, security-review | Final review before merging changes |

### Agent Commands (Runtime)

```bash
/agents                 # List all agent definitions
/agent-status           # Show running agents
/agent-tree            # Display agent hierarchy
/agent-cap <capability> # Find agents by capability (e.g., /agent-cap planning)

# Spawn agents
/agent-spawn coordinator "plan a feature"
/agent-spawn specialist "implement auth"
/agent-spawn researcher "analyze this codebase"
/agent-spawn planner "design a database schema"
/agent-spawn reviewer "check for security issues"
```

### Programmatic Agent Spawning

```typescript
// Spawn specific agent type
agent_spawn({
  agent_type: "specialist",
  task: "implement user authentication",
  capabilities_needed: ["coding", "security"]
})

// Delegate to best matching agent
agent_delegate({
  task: "optimize database queries",
  preferred_type: "specialist"
})

// List available agents
agent_list({})
```

### Agent Lifecycle

1. **Idle** → Agent created, waiting for task
2. **Working** → Processing task
3. **Completed/Error** → Task finished or failed

Agents spawn at depth 0 (root) or as children (depth > 0). Max depth prevents runaway spawning.

### Multi-Agent Workflow Example

```
User: "Build a user authentication system"

1. Spawn planner: "design auth system"
2. Planner returns architecture 
3. Spawn specialist: "implement login"
4. Specialist implements code
5. Spawn reviewer: "review auth code"
6. Reviewer approves
7. Integrate results
```

## Architecture

### Entry Points

- **`src/index.ts`** - Main server entry using `pi-coding-agent` Agent class
- **`cli/index.ts`** - CLI entry point using Commander.js
- **`tui/index.tsx`** - Terminal UI entry (React-based)

### Core Architecture Patterns

**1. Extension-Based Architecture**
The project extends `pi-coding-agent` via extensions in `src/extensions/core/` and integrates community extensions:

**Core Extensions:**
- `gateway-extension.ts` - WebSocket server for multi-agent spawning
- `discord-extension.ts` - Discord bot integration
- `fileops-extension.ts` - File operation tools
- `agent-orchestrator-extension.ts` - Unified agent orchestration (spawn_main, spawn_subagent)
- `generative-agents-extension.ts` - Memory stream, reflection, planning (Stanford HCI research)
- `perennial-memory-extension.ts` - Semantic memory with Ollama embeddings

**Community Extensions (PI Ecosystem):**
- `draconic-subagents-wrapper.ts` - Bridges pi-subagents to eventBus
- `pi-subagents`, `pi-messenger`, `pi-web-access`, `pi-memory-md`, `pi-librarian`

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

### Creating a New Skill

1. **Create file** in `skills/` (e.g., `skills/my-skill.ts`)
2. **Define the skill** with proper risk level:
   - `safe` - No approval (math, string ops, read-only)
   - `medium` - Confirmation required (file write, web requests)
   - `high` - Explicit approval (shell, delete, system changes)
3. **Export skill** object with `name`, `description`, `risk`, `toolDefinition`, `execute`
4. **Test immediately** - hot-reload is active, no build step needed

**Template:**
```typescript
import { Skill } from '../src/skills/types';

export const mySkill: Skill = {
  name: 'mySkill',
  description: 'Clear description of what this skill does',
  risk: 'medium',
  toolDefinition: {
    type: 'function',
    function: {
      name: 'mySkill',
      description: 'Description for the LLM',
      parameters: {
        type: 'object',
        properties: {
          param: { type: 'string', description: 'Parameter description' }
        },
        required: ['param']
      }
    }
  },
  async execute(args) {
    // Implementation
    return { success: true, data: result };
  }
};

export default mySkill;
```

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

## 🧠 Generative Agents Extension

Implements Stanford HCI research: "Generative Agents: Interactive Simulacra of Human Behavior"

**Features:**
- **Memory Stream** - Complete record of agent experiences (observations, thoughts, actions)
- **Reflection** - Periodic synthesis of memories into higher-level insights
- **Planning** - Daily plans with hierarchical action steps
- **Retrieval** - Context-aware memory retrieval (recency × importance × relevance)

**Tools:**
- `generative_observe` - Add observation to memory stream
- `generative_think` - Add internal thought
- `generative_recall` - Retrieve relevant memories
- `generative_reflect` - Generate insights from memories
- `generative_plan` - Create daily/action plans
- `generative_decide` - Use memories to decide action

**CLI Commands:**
- `/agent-memories` - Show recent memory stream
- `/agent-reflections` - Show generated insights
- `/agent-plans` - Show current plans
- `/agent-status` - Show agent stats

**Database Schema:**
- `generative/agents.db` with tables: `agents`, `memory_stream`, `reflections`, `plans`

**Auto-observation:** Records user input, tool executions, and agent completions automatically.

### Key Files

- **`src/pi-config.ts`** - PI framework configuration with extensions and keybindings
- **`src/skills/types.ts`** - Skill interface definition
- **`src/skills/loader.ts`** - Hot-reload implementation using `fs.watch`
- **`src/event-bus/index.ts`** - Domain event system with typed events
- **`cli/commands/init.ts`** - Workspace initialization logic
- **`~/.0xkobold/agents.db`** - Agent registry database (agent definitions, running agents, messages)
- **`src/utils/nl-patterns.ts`** - Natural language command pattern matching
- **`AGENTS.md`** - Detailed multi-agent system documentation

### Testing

Uses Bun's built-in test runner (`bun:test`):
```typescript
import { test, expect } from "bun:test";
test("name", () => { expect(true).toBe(true); });
```

Test utilities in `test/setup.ts` include `createMockLogger()`, `delay()`, `retry()`.

### Test Suites

| Suite | File | Coverage |
|-------|------|----------|
| Unit | `test/unit/extensions/generative-agents.test.ts` | Importance scoring, relevance, recency, reflection parsing |
| Integration | `test/integration/generative-agents.integration.test.ts` | Database persistence, memory CRUD, reflection triggers |
| E2E | `test/e2e/generative-agents.e2e.test.ts` | Full lifecycle: observe → think → act → reflect → plan |

### TypeScript Configuration

- Target: ES2022, Module: ESNext
- Strict mode disabled (relaxed type checking)
- Bun types included (`bun-types`)
- Source maps enabled

## Common Workflows

### Add a New Skill
1. Create file in `skills/<name>.ts`
2. Import `Skill` type from `../src/skills/types`
3. Export skill with `name`, `description`, `risk`, `toolDefinition`, `execute`
4. Test immediately via REPL or TUI (hot-reload active)

### Spawn a Sub-Agent
```typescript
// Direct spawn
agent_spawn({
  agent_type: "specialist",
  task: "implement user authentication"
})

// Capability-based routing
agent_delegate({
  task: "optimize database queries",
  preferred_type: "specialist"
})
```

### Create a New Extension
1. Create file in `src/extensions/core/<name>-extension.ts`
2. Implement extension interface (see existing extensions for patterns)
3. Register in `src/pi-config.ts`
4. Restart to load (extensions not hot-reloaded)

### Add Natural Language Pattern
```typescript
// src/utils/nl-patterns.ts
{
  regex: /^(?:spawn|create)\s+a\s+(\w+)\s+agent/i,
  description: "Spawn specific agent type",
  action: (match) => ({
    tool: "agent_orchestrate",
    params: { operation: "spawn_subagent", subagent: match[1], task: "..." }
  })
}
```

### Debug Agent Issues
```bash
/agent-tree           # View hierarchy
/agent-status         # Check running agents
# Or check ~/.0xkobold/agents.db for agent state
```

## Important Notes

### Runtime Requirements
- **Bun only** - Not Node.js compatible. Uses Bun-specific APIs (`bun:sqlite`, `import.meta.main`, etc.)
- **SQLite** - Agent registry and memory stored in `~/.0xkobold/agents.db`

### Development Patterns
- **Extend, don't reinvent** - Use `pi-coding-agent` extension system; don't write custom agent loops
- **Skills auto-reload** - No build step needed for skill changes
- **Extensions require restart** - Not hot-reloaded like skills

### Gateway & Multi-Agent
- **WebSocket gateway** runs on port 18789 by default for agent spawning
- **Agent registry** in SQLite database tracks definitions, running instances, and messages
- **Max depth** prevents runaway agent spawning (hierarchical depth limit)

### Configuration
- **Global config**: `~/.0xkobold/config.json`
- **Project workspace**: `.0xkobold/` (created by `bun run init`)
- **Extensions**: Registered in `src/pi-config.ts`

## See Also

- **`AGENTS.md`** - Detailed multi-agent orchestration documentation (OpenClaw-style, registry database, agent lifecycle)
- **`README.md`** - Project overview and quick start
- **Skills directory** - `skills/` for user-defined skills
- **Built-in skills** - `src/skills/builtin/` for reference implementations
