# Tmux Terminal Node

A desktop terminal application that connects to the 0xKobold gateway and exposes tmux sessions to the agent.

## Overview

Tmux Terminal is a node in the 0xKobold infrastructure that:
- Connects to the gateway via WebSocket (Tailscale-ready)
- Exposes tmux commands to the agent
- Provides a desktop UI for session management

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Gateway (port 7777)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐             │
│  │ FamiliarNode│  │ TmuxNode    │  │ Agent    │             │
│  │ (desktop)   │  │ (terminal)  │  │ (Claude) │             │
│  └──────┬──────┘  └──────┬──────┘  └────┬─────┘             │
└─────────┼────────────────┼───────────────┼──────────────────┘
          │                │               │
    Tailscale         Tailscale       Agent commands
          │                │               │
    ┌─────▼─────┐    ┌─────▼─────┐    ┌────▼─────┐
    │  Desktop  │    │ TmuxTerm  │    │  Claude  │
    │  Familiar │    │  (Electron)│    │Interface│
    └───────────┘    └─────┬─────┘    └──────────┘
                             │
                       ┌─────▼─────┐
                       │   tmux    │
                       │  sessions │
                       └───────────┘
```

## Features

- **Remote Terminal Access** - Agent can create and interact with tmux sessions
- **Tailscale Transport** - Secure connection over Tailscale network
- **Persistent Sessions** - tmux sessions survive app restarts
- **Session Management** - Create, list, rename, kill sessions
- **Real-time Events** - Session creation/destruction events via gateway

## Agent Commands

| Command | Params | Description |
|---------|--------|-------------|
| `tmux.check` | none | Check if tmux is available |
| `tmux.list` | none | List all tmux sessions |
| `tmux.create` | `name`, `command?` | Create new named session |
| `tmux.send` | `session`, `keys` | Send keystrokes to session |
| `tmux.capture` | `session`, `lines?` | Capture pane output |
| `tmux.kill` | `session` | Kill session |
| `tmux.rename` | `session`, `newName` | Rename session |
| `tmux.exists` | `session` | Check if session exists |
| `tmux.info` | `session` | Get session details |

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Build for production
bun run build

# Type check
bun run typecheck
```

## Configuration

Environment variables:
- `GATEWAY_URL` - WebSocket URL for gateway (default: `ws://localhost:7777`)

## Requirements

- Node.js 18+
- Electron
- tmux 3.0+
- Tailscale (for remote access)

## Usage

### Start the Gateway

```bash
# On your main machine
cd /path/to/0xkobolds
bun run start
# Gateway runs on port 7777
```

### Start Tmux Terminal

```bash
# Local
cd packages/tmux-terminal
bun run dev

# Via Tailscale (from remote machine)
GATEWAY_URL=ws://100.65.167.97:7777 bun run dev
```

### Example: Agent Commands

```typescript
// From Claude/Agent
await node.call('tmux.create', { name: 'work', command: 'bun run dev' });
await node.call('tmux.send', { session: 'work', keys: 'ls -la', enter: true });
const output = await node.call('tmux.capture', { session: 'work', lines: 50 });
console.log(output);
```

## License

MIT