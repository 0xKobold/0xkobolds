# 0xKobold 🐲

> *Your digital familiar - a personal AI assistant that learns, evolves, and helps you code 24/7*

## Hybrid Architecture

Best of both worlds:
- **Bun + Elysia** for blazing fast gateway
- **@mariozechner/pi-agent-core** for proven agent loop
- **Event bus** for decoupled architecture
- **Hot-reload skills** - just edit .ts files
- **Approval queue** for safety
- **Multi-provider LLM** (Ollama default, Anthropic supported)
- **Subagents** for parallel work

## Quick Start

```bash
# Install dependencies
bun install

# Start Ollama (in another terminal)
ollama run kimi-k2.5:cloud

# Start the server
bun run start
```

## Project Structure

```
0xkobold/
├── src/
│   ├── agent/          # Pi Agent Core adapter with subagent support
│   ├── approval/       # Approval queue for risky operations
│   ├── channels/       # Discord integration
│   ├── config/         # Zod config system
│   ├── discord/        # Discord bot
│   ├── event-bus/      # Decoupled event system
│   ├── gateway/        # Elysia WebSocket gateway
│   ├── llm/            # Ollama + Anthropic providers
│   ├── memory/         # JSON persistence
│   ├── skills/         # Hot-reload skill system
│   └── index.ts        # Main entry
├── skills/             # Your custom skills (hot-reloaded)
└── package.json
```

## Creating Skills

Skills are plain TypeScript files in the `skills/` folder:

```typescript
// skills/hello.ts
import type { Skill } from '../src/skills/types';

export const helloSkill: Skill = {
  name: 'hello',
  description: 'Say hello to someone',
  risk: 'safe',

  toolDefinition: {
    type: 'function',
    function: {
      name: 'hello',
      description: 'Say hello to someone',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name to greet' },
        },
        required: ['name'],
      },
    },
  },

  async execute(args) {
    return { message: `Hello, ${args.name}!` };
  },
};

export default helloSkill;
```

The skill is automatically hot-reloaded when you save!

## Safety

Risk levels:
- `safe` - No approval needed (math, string operations)
- `medium` - Confirmation for write operations (file write, web requests)
- `high` - Explicit approval for dangerous operations (shell, delete)

## Subagents

Spawn child agents for parallel work:

```typescript
const result = await agent.spawn('Research this topic');
```

The `spawn_subagent` skill is built-in and lets agents create child agents automatically.

## Commands

```bash
bun run start     # Start server
bun run tui       # Start TUI
bun run cli       # CLI commands
```

## Configuration

Config is stored in `~/.0xkobold/config.json5`:

```json5
{
  agents: {
    default: {
      model: 'ollama/kimi-k2.5:cloud',
      capabilities: ['chat', 'code'],
    },
  },
  gateway: {
    enabled: true,
    port: 18789,
  },
  discord: {
    enabled: false,
    token: '${DISCORD_BOT_TOKEN}',
  },
}
```

## Architecture Differences from OpenClaw

| Aspect | OpenClaw | 0xKobold |
|--------|----------|----------|
| **Gateway** | Bun.serve | Elysia.js (3x faster) |
| **Orchestration** | Tight coupling | Event bus (decoupled) |
| **Agent Loop** | Custom | @mariozechner/pi-agent-core |
| **Skills** | Compiled | Hot-reload .ts files |
| **Approval** | Basic | Risk-based queue |
| **Dependencies** | Many | Minimal (~10) |

## License

MIT
