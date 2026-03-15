# 0xKobold Architecture

> Multi-Agent AI Assistant Framework built on Bun + PI Framework

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ENTRY POINT                                     │
│  src/index.ts ──▶ PI Framework ──▶ Event Bus ──▶ Config ──▶ Extensions       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│   AGENT LAYER       │ │    LLM LAYER         │ │   MEMORY LAYER      │
│                     │ │                      │ │                      │
│ agent-orchestrator  │ │  ┌────────────────┐  │ │ ┌────────────────┐  │
│ gateway (WS:18789)  │ │  │ model-discovery│  │ │  │perennial-memory│  │
│ draconic-systems    │ │  │     (API)      │  │ │  │  (long-term)   │  │
│  • lair (workspaces)│ │  └───────┬────────┘  │ │  ├────────────────┤  │
│  • hoard (snippets) │ │          │           │ │  │learning-extension│ │
│  • safety           │ │  ┌───────▼────────┐  │ │  │ (stream+reflect)│  │
│ sessions            │ │  │  router-core   │  │ │  ├────────────────┤  │
│ (unified)           │ │  │(scoring+learn)  │  │ │  │ session-store  │  │
│                     │ │  └───────┬────────┘  │ │  │ (conversations)│  │
│                     │ │          │           │ │  └────────────────┘  │
│                     │ │  ┌───────▼────────┐  │ │                      │
│                     │ │  │router-commands │  │ │  ~/.0xkobold/       │
│                     │ │  │ (singleton)    │  │ │  ├── config.json    │
│                     │ │  └────────────────┘  │ │  ├── agents.db       │
│                     │ │                      │ │  ├── sessions.db     │
│                     │ │  ollama │ anthropic  │ │  └── memory.db       │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
                    │               │                   │
                    └───────────────┼───────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DATA LAYER                                          │
│                                                                              │
│  ~/.0xkobold/          Ollama API          Discord          WebSocket        │
│  (SQLite storage)      (LLM provider)      (bot)            (agent spawn)    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Entry Layer (`src/index.ts`)

| Component | Purpose |
|-----------|---------|
| PI Framework | Core agent framework from `@mariozechner/pi-coding-agent` |
| Event Bus | Inter-module communication (`src/event-bus/`) |
| Config | Extension loading + settings (`src/pi-config.ts`) |

### 2. Agent Layer (`src/extensions/core/`)

| Extension | Purpose |
|-----------|---------|
| `agent-orchestrator` | Spawn/manage agents, hierarchy, lifecycle |
| `gateway` | WebSocket server for agent spawning (port 18789) |
| `draconic-lair` | Project workspaces (`.0xkobold/`) |
| `draconic-hoard` | Code snippet library |
| `draconic-safety` | Protected paths, destructive action guards |
| `sessions` | Unified session persistence |

### 3. LLM Layer (`src/llm/`)

| File | Purpose |
|------|---------|
| `model-discovery.ts` | Fetch models from Ollama API, classify capabilities |
| `router-core.ts` | Adaptive routing: scoring + performance learning |
| `router-commands.ts` | Singleton init, CLI commands (`/router`, `/models`) |
| `ollama.ts` | Ollama provider (local + cloud) |
| `anthropic.ts` | Claude API provider |

### 4. Memory Layer

| Module | Purpose |
|--------|---------|
| `perennial-memory` | Long-term semantic memory with embeddings |
| `learning-extension` | Stanford-style memory stream + reflection |
| `session-store` | Conversation persistence (SQLite) |

### 5. Extension System

35+ extensions in `src/extensions/core/`:

**Infrastructure:**
- `routed-ollama-extension` - Adaptive model routing
- `config-extension` - `/config` commands
- `onboarding-extension` - First-run setup

**Communication:**
- `discord-extension` - Discord bot
- `multi-channel-extension` - Unified channel management

**Developer Tools:**
- `fileops-extension` - File operations
- `git-commit-extension` - Git integration
- `diagnostics-extension` - Telemetry/health
- `mcp-extension` - Model Context Protocol

**Integrations:**
- `perennial-memory-extension` - Long-term memory
- `learning-extension` - Memory stream
- `obsidian-bridge` - Obsidian vault sync

## Data Flow

```
User Input
    │
    ▼
┌─────────────────┐
│  PI Framework   │ ◀── Agent orchestration
│  (entry point)  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Event Bus      │ ◀── Domain events
│  (dispatcher)   │
└────────┬────────┘
         │
    ┌────┼────┐
    ▼    ▼    ▼
  Agent LLM  Memory
         │
         ▼
┌─────────────────┐
│  router-core    │ ◀── Model selection
│  (adaptive)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Ollama/Anthropic│ ◀── LLM API
└─────────────────┘
```

## Key Files

```
0xKobolds/
├── src/
│   ├── index.ts              # Entry point
│   ├── pi-config.ts           # Extension loading config
│   ├── event-bus/             # Domain event system
│   ├── llm/
│   │   ├── router-core.ts     # Adaptive routing (scoring)
│   │   ├── router-commands.ts # Singleton + CLI
│   │   ├── model-discovery.ts # API fetch + classify
│   │   ├── ollama.ts          # Provider
│   │   └── anthropic.ts       # Provider
│   ├── extensions/core/       # 35+ extensions
│   ├── memory/                # Storage modules
│   ├── gateway/               # WebSocket server
│   ├── agent/                 # Agent management
│   └── skills/                # Hot-reloadable skills
├── src/cli/                   # CLI commands
├── src/tui/                   # Terminal UI (React)
└── ~/.0xkobold/               # User data
    ├── config.json            # Runtime config
    ├── agents.db              # Agent registry
    ├── sessions.db            # Conversations
    └── memory.db              # Long-term memory
```

## Event Types

```typescript
// Key domain events (src/event-bus/index.ts)
type DomainEventType =
  | 'agent.spawned' | 'agent.completed' | 'agent.error'
  | 'discord.message.received'
  | 'gateway.client.connected'
  | 'config.changed'
  | 'memory.session_saved'
  | 'perennial.save'
  | 'system.shutdown'
  // ... 50+ event types
```

## Agent Lifecycle

```
1. User sends message
2. PI Framework receives
3. Event Bus dispatches
4. Agent Orchestrator manages
5. Router selects model
6. LLM responds
7. Memory stores (perennial + generative)
8. Response to user
```

## Extension Loading Order

Defined in `src/pi-config.ts`:

1. **Infrastructure** (first)
   - config, pi-ollama, routed-ollama
   - UnifiedSessionBridge

2. **Core Features**
   - memory-bootstrap, persona-loader
   - task-manager, heartbeat

3. **Draconic Systems**
   - agent-orchestrator, gateway
   - draconic-lair, draconic-hoard, draconic-safety

4. **Integrations**
   - discord, obsidian-bridge, wallet

---

*Last updated: March 2025*