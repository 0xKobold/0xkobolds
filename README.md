# 0xKobold

```
                         ..
            .                                        ..
                 . ,^   .                   .   .....          ......
            ,^ ... :: .  .                   ...     ,;.    ...
           .lI^ I.`I,.. ;;..             . `l}^ ^:;+td]^..      ^:!!i .
           . ,:^I^I< . :+,..             ..l+tI`!?o@f,     .,~fWQft?<..
        `:. ^<l>,!I>^`<!^              .. `?_-11COQYI:;l!l+1o@#[l
         !<`l.ii,~l^iI-,`!I..   .. ...   ^l>??}JOoUUZ1]-fYXB@fl    ,+i..
     . `.:<+:<ll>~l>+-<:~!^    .      I_>_?<+?}Bb+M8%oOf}-_+_!~~+[CQJ:..
     `:,lI,:Ii!<:`!iii>_+^ :!^  ^``^,l+?<_}+fJ?1ItJ1<>?[?JX1YdOOodtl  ..
    . li:^~Il, :Il`::,:i!,I>I`^l_~--<i_<>?+~?_-CY}~i+-?~]fO@@@@@Ml
     ..,!``I,!]JZXJ{]I,,~~;,  I[_<-t}1doCdfdQCOB%oJ{+?{ddMO@@@#@o>` .:-< .
      .``l;;{QW%###WQZ+;>>I ...<YfZ{]}Xb!IQ@@8%W@@QJ{[-JJZ@@@@@@%dZbMX[,..
     . II ,I]bo%8%%MQd?>;  .    ;li   . ,Z@@@@#@MI]~ZUOX}YB@@@@@8oQY};
      . ^>^.^~fbXXdZf_,, Il .         I~d@@#MOIY>l[ZoW@@@@@@@@@UIMO{.   
        `I!<` ,lllll :,i;,^`    ...~+<d#oJQQbIIJdUB@@@@@@@#%OU8WW@@81+,`
       .,i[l:i!, `:I<-l<-, ^^`  ..:]ZodXIdbC1i1Z#@@@@@@%%BWWoO%@@@@%bQf[^.
       .J-I ~I!.iCU->-1_<`ii>~:....:_1}It}!.::+tX%#@%MbMBQ%@@@@@@%%WbY]+-~`.
        XWOUMO{,Z@B-;1B]:I_->i^      ...   `;;JOB#QB#M8@@@@@@8OOOQdZ{~i!i!:.
       ..iJB@@M[1@%Y<X@o][]]>:III,^,    ....,Z@@@@@@@@@@@@@@8#WOMoZI~~~~+I..
           `~M@8X#@8Zf#@BUWb1{1?]1}]<!^ ...:b@@@@@@@@@@@@@8BW#dXZf[?-+l:`. ..
         ..  :JB@@@@%%@@@B#@%W%OQ8BMQbU> ..>M%@@@@@@@@@@@BWW8##OoXZXQCi^ ...
           ..  ^?1YbMWO#@@@@@@@@@@@@@@OZ-` d@#@@@@@@@@#%W8##OoXZXQCi^ ...
             ..     .`.:!~-CXd%@@@@@@@8oQ}}%@@@@@@@@@@@BWWBWMMdbf[->>^..
               .....          :{@@@@@@@OYUCQ8@@@@@@@@8BB8WMQModU?++:!I..
                    ..........  _@@B8%@@#QMdYJO@@@@%BB%obO%obbXZ{?-~l,;..
                              .. {ooQB%o@%OO-{Z@%oOooWOXZYYII}?_~iiI.`
                              . ^+IoQWQbOQXdJbfU#BdUZYJI[{[--l>:`
                                `><+-]1??_~>++~!]J{}~>i>>;!;`     ..
                                                   `         . ..
                                 ........ ......... .........
```

> *"Your digital familiar - a personal AI assistant that connects, persists, and evolves"*

## 🔥 Latest: v0.7.0 "NPM Release"

**v0.7.0** — Published to npm! `@0xkobold/pi-*` extension packages available  
**v0.6.11** — Automatic secret redaction in env commands, README restructure  
**v0.6.10** — Gateway auto-starts by default for TUI (detects existing)  
**v0.6.9** — Fix gateway detection when dev already running  
**v0.6.8** — Add /lair-sync command to bridge local/global context  
**v0.6.7** — Auto-detect and notify about project lairs in local mode  
**v0.6.6** — Enforce global workspace sandboxing, proper CWD isolation  
**v0.6.5** — Clean dist/ before build, removes ghost extensions  
**v0.6.4** — Fix workspace detection from home directory  
**v0.6.3** — Workspace-aware footer, cleaner gateway display  
**v0.6.2** — Gateway auto-start opt-in (fixes port conflicts)  
**v0.6.0** — JSON-RPC gateway, session persistence, multi-channel

> **New in v0.6.0:** Koclaw Gateway (JSON-RPC), Session Management, Auth Profiles, Session Resume  
> **From v0.5.0:** Generative Agents, Semantic Memory, Multi-agent Orchestration  
> **From v0.3.0:** Multi-channel (WhatsApp, Telegram, Slack), Docker Sandbox

---

## ✨ Features

### v0.6.3 - Workspace Fix
| Feature | Status | Description |
|---------|--------|-------------|
| **Path Resolution** | ✅ | Fixed workspace detection from home directory |
| **startsWith Fix** | ✅ | Correctly handles paths like /home/user vs /home/user/.0xkobold |

### v0.6.2 - Workspace Aware
| Feature | Status | Description |
|---------|--------|-------------|
| **Workspace Footer** | ✅ | Shows 🏠 ~/.0xkobold (global) or 📁 /path (local) |
| **Gateway Indicator** | ✅ | Only shows when gateway is running (cleaner footer) |
| **/workspace Command** | ✅ | Display current workspace info |

### v0.6.0 - Koclaw Gateway
| Feature | Status | Description |
|---------|--------|-------------|
| **Koclaw Gateway** | ✅ | JSON-RPC WebSocket/HTTP gateway with method handlers |
| **Session Management** | ✅ | SQLite-based session persistence with metadata |
| **Session Resume** | ✅ | Auto-save on shutdown, restore previous sessions |
| **Auth Profiles** | ✅ | Multiple API keys per provider with automatic rotation |
| **Gateway Auto-Start** | ✅ | Gateway starts automatically with TUI |
| **Gateway Protocol** | ✅ | Hello/Connect/Request/Response/Event frame protocol |

### v0.5.0 - Draconic Intelligence
| Feature | Status | Description |
|---------|--------|-------------|
| **Multi-Agent Orchestration** | ✅ | Spawn specialized agents with unified `/agent-orchestrate` API |
| **Generative Agents** | ✅ | Memory stream, reflection, planning (Stanford HCI research) |
| **Semantic Memory** | ✅ | Ollama-powered embeddings with hybrid search |
| **Natural Language Commands** | ✅ | Parse "spawn a worker" → structured commands |

### v0.3.0 - The Gap Closer
| Feature | Status | Description |
|---------|--------|-------------|
| **WhatsApp** | ✅ | Baileys integration with QR pairing |
| **Telegram** | ✅ | Complete bot with webhooks |
| **Slack** | ✅ | Webhook & slash commands |
| **Docker Sandbox** | ✅ | Secure container execution |
| **Tailscale** | ✅ | Zero-config VPN for remote access |
| **Vision (AI)** | ✅ | Claude Vision image analysis |
| **Audio** | ✅ | Whisper transcription |
| **PDF** | ✅ | Text extraction & metadata |
| **Hot-Reload Skills** | ✅ | Add capabilities without restart |
| **Discord Integration** | ✅ | Bot interface |
| **WebSocket Gateway** | ✅ | Real-time communication (port 18789) |

### v0.7.0 - NPM Extensions
| Feature | Status | Description |
|---------|--------|-------------|
| **Pi Ollama** | ✅ | `@0xkobold/pi-ollama` - Local + Cloud Ollama models |
| **Pi Wallet** | ✅ | `@0xkobold/pi-wallet` - CDP Agentic Wallet + x402 payments |
| **Pi ERC-8004** | ✅ | `@0xkobold/pi-erc8004` - Agent identity + reputation |

---

## Quick Start

### Prerequisites

```bash
# Install Bun (required)
curl -fsSL https://bun.sh/install | bash

# Install Ollama (for local LLM)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5-coder:14b
ollama pull nomic-embed-text  # For semantic memory
```

### Install & Run

#### Option 1: Install from npm (Recommended)

```bash
# Install globally
npm install -g 0xkobold

# Initialize workspace
0xkobold init

# Start 0xKobold (reduce extension logs with env var)
KOBOLD_EXTENSION_LOGS=false 0xkobold start
```

#### Option 2: Clone from source

```bash
# Clone repository
git clone https://github.com/kobolds/0xKobolds.git
cd 0xKobolds

# Install dependencies
bun install

# Initialize workspace
bun run init

# Start 0xKobold (reduce extension logs with env var)
KOBOLD_EXTENSION_LOGS=false bun run start
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `KOBOLD_EXTENSION_LOGS` | Set to `false` to reduce extension loading logs | `true` |

---

## Multi-Agent System 🎯

Spawn specialized agents for different tasks:

```bash
# Spawn via commands
/agent-spawn coordinator "plan a feature"
/agent-spawn specialist "implement auth"
/agent-spawn researcher "analyze codebase"
/agent-spawn reviewer "check for security issues"

# Or natural language
spawn a worker to fix the database connection
analyze this complex architecture problem
delegate the user authentication project
```

### Agent Types

| Type | Emoji | Best For |
|------|-------|----------|
| coordinator | 🎯 | Task decomposition, delegation |
| specialist | 🧠 | Deep domain expertise |
| researcher | 🔍 | Information gathering |
| worker | ⚒️ | Implementation |
| reviewer | 👁️ | Code review, validation |

---

## Model Scoring & Rankings 📊

0xKobold tracks model performance and generates AI-powered tier lists.

### Commands

```bash
/rate <1-5>                           # Rate last response
/model-rankings [day|week|month|all]  # Show leaderboard
/tier-list [day|week|month|all]       # AI-generated tier list
/popularity [--refresh]                # Ollama pull counts
/router stats <model>                 # Per-model statistics
/router history                        # Recent performance

/best-for [code|chat|vision|reasoning|all]  # Best models per task
/community enable                     # Enable anonymous sharing
/community export                     # Generate submission file
/community fetch                      # Fetch community stats
/community merge                       # Merge local + community
/community tier-list                  # Show community tiers
```

### Task-Specific Rankings

The `/best-for` command shows which models perform best for specific tasks:

```bash
/best-for code      # Best models for coding
/best-for chat      # Best for general conversation
/best-for vision    # Best for image analysis
/best-for reasoning # Best for complex reasoning
/best-for all       # Show all categories
```

### How It Works

| Factor | Weight | Description |
|--------|--------|-------------|
| Quality | 40% | User ratings (1-5) |
| Success Rate | 30% | Response success/failure |
| Latency | 20% | Response time |
| Popularity | 10% | Community usage |

### Tier System

| Tier | Score | Description |
|------|-------|-------------|
| 🥇 S | ≥0.85 | Excellent - Top performers |
| 🥈 A | ≥0.70 | Great - Reliable choices |
| 🥉 B | ≥0.55 | Good - Solid performers |
| ⭐ C | ≥0.40 | Fair - Acceptable |
| · D | <0.40 | Needs improvement |

### Community Stats

Share anonymized data to help everyone:

```bash
# Enable sharing
/community enable

# Use models and rate them
/rate 4

# Generate submission file
/community export

# File saved to ~/.0xkobold/community-submission.json
# Submit to: https://github.com/kobolds/0xKobolds/tree/main/community
```

### Data Tracked per Task

| Metric | Code | Chat | Vision | Reasoning |
|--------|------|------|--------|------------|
| Rating | ✅ | ✅ | ✅ | ✅ |
| Latency | ✅ | ✅ | ✅ | ✅ |
| Success Rate | ✅ | ✅ | ✅ | ✅ |
| Usage Count | ✅ | ✅ | ✅ | ✅ |

### Privacy

- ✅ **Local only** - All data stored in `~/.0xkobold/`
- ✅ **No prompts/responses stored** - Only metrics
- ✅ **No user identity tracked** - Anonymous session IDs
- ✅ **Community sharing opt-in** - Disabled by default
- ✅ **See exactly what's shared** - `/community export` shows all data

### Example Output

```
🏆 AI-Generated Model Tier List

🥇 Tier S - Excellent (score ≥ 0.85)
   qwen3-coder:14b - 0.87 █████████ [Reliable, Fast]

🥈 Tier A - Great (score ≥ 0.70)
   llama3.1:8b - 0.78 ███████▊ [Well-tested]

🥉 Tier B - Good (score ≥ 0.55)
   mistral:7b - 0.62 ██████▎ [Fast]
```

---

## Koclaw Gateway 🌐

JSON-RPC style gateway for multi-channel integration with session persistence.

```bash
# Gateway API endpoints
GET  /health          # Health check
GET  /protocol        # List available methods
WS   /ws              # WebSocket endpoint

# Protocol frames
{ type: "hello", protocol: "1", version: "2" }
{ type: "connect", sessionKey: "...", agent: "..." }
{ type: "request", id: "...", method: "agent.run", params: {...} }
{ type: "response", id: "...", result: {...} }
{ type: "event", event: "agent.spawned", data: {...} }
```

### Session Management

Sessions automatically persist across restarts:

```bash
# Sessions auto-save on shutdown
Ctrl+C → Session saved → Restart → Resume from previous

# List active sessions via CLI
0xkobold gateway connections list
```

### Auth Profiles

Multiple API keys per provider with automatic rotation:

```bash
# Use auth profiles automatically
Config → Detect provider → Load profile → Rotate on failure
```

---

## Generative Agents 🧠

Based on Stanford HCI research. Agents that remember, reflect, and plan:

```bash
# Automatic memory capture
- User interactions
- Tool executions
- Agent decisions

# Reflection (auto-triggered every 20 observations)
/agent-reflections              # Show insights

# Planning
/agent-plans                    # View plans
/agent-status                   # Agent stats

# Manual memory operations
remember "User prefers TypeScript"
recall "what was the database decision"
```

**Memory Categories:** observation, thought, action, reflection  
**Retrieval:** Combines recency × importance × relevance

---

## Secret Management 🔐

Environment variables with automatic redaction:

```bash
# Show env vars (secrets automatically redacted)
0xkobold env show

# Show with secrets revealed (careful!)
0xkobold env show --show-secrets

# Show entire .env file (redacted)
0xkobold env show --file

# Check status
0xkobold env status
```

**Auto-redacted:** TOKEN, KEY, SECRET, PASSWORD, API_KEY, WEBHOOK_URL, and token-like values

---

## Skills System 🔧

Create custom capabilities without restarting:

```typescript
// skills/my-skill.ts
import { Skill } from '../src/skills/types';

export const mySkill: Skill = {
  name: 'mySkill',
  description: 'What it does',
  risk: 'medium',  // safe | medium | high
  toolDefinition: {
    type: 'function',
    function: {
      name: 'mySkill',
      description: 'For the LLM',
      parameters: {
        type: 'object',
        properties: {
          param: { type: 'string' }
        },
        required: ['param']
      }
    }
  },
  async execute(args) {
    return { success: true, data: result };
  }
};
```

**Auto-reload enabled** - changes appear immediately!

---

## NPM Extension Packages 📦

Official Pi extensions published to npm:

### `@0xkobold/pi-ollama`
Local + Cloud Ollama models with auto-discovery
```bash
pi install npm:@0xkobold/pi-ollama
```

### `@0xkobold/pi-wallet`
CDP Agentic Wallet + x402 payments + Ethers.js backup
```bash
pi install npm:@0xkobold/pi-wallet
```

### `@0xkobold/pi-erc8004`
ERC-8004 identity + reputation on Base L2
```bash
pi install npm:@0xkobold/pi-erc8004
```

**Note:** Pi extensions use the `pi install` CLI, not npm directly.

---

## Commands

### Core
```bash
bun run start          # Start main server
bun run dev            # TypeScript watch mode
bun run build          # Compile to dist/
bun run tui            # Start Terminal UI
bun run cli            # Run CLI commands
bun run init           # Initialize workspace
```

### Agent Orchestration
```bash
/agent-orchestrate list                    # List all agents
/agent-orchestrate spawn_main coordinator  # Spawn main agent
/agent-orchestrate spawn_subagent worker "task"
/agent-orchestrate analyze "complex task"  # Analyze complexity
/agent-orchestrate delegate "big project"  # Auto-delegate
```

### Generative Agents
```bash
/agent-memories         # Show memory stream
/agent-reflections      # Show insights
/agent-plans           # Show plans
/agent-status          # Agent stats
/generative_observe "what happened"
/generative_reflect    # Generate insights
/generative_plan daily # Create daily plan
```

### Memory
```bash
/remember "Content" --category fact --importance 0.9
/recall "vague description"
/memories              # List recent
/memory-export         # Export to file
```

### Gateway Commands
```bash
# Start/stop gateway
0xkobold gateway start           # Start gateway server
0xkobold gateway stop            # Stop gateway
0xkobold gateway status          # Show gateway status

# List connections
0xkobold gateway connections list
0xkobold gateway health
```

### Environment
```bash
0xkobold env status              # Check environment status
0xkobold env show                # Show env vars (redacted)
0xkobold env show --show-secrets # Show with secrets visible
0xkobold env show --file         # Show .env file contents
```

---

## Configuration

Global config: `~/.0xkobold/config.json`

```json
{
  "version": "0.6.0",
  "llm": {
    "provider": "ollama",
    "model": "qwen2.5-coder:14b",
    "baseUrl": "http://localhost:11434"
  },
  "agents": {
    "default": "assistant",
    "maxConcurrent": 5
  },
  "memory": {
    "enabled": true,
    "semanticSearch": true
  },
  "gateway": {
    "enabled": true,
    "port": 7777,
    "host": "0.0.0.0"
  },
  "channels": {
    "discord": { "enabled": false }
  }
}
```

---

## Architecture

### Extension-Based

```
src/extensions/
├── core/
│   ├── agent-orchestrator-extension.ts    # Multi-agent orchestration
│   ├── generative-agents-extension.ts     # Memory, reflection, planning
│   ├── perennial-memory-extension.ts      # Semantic memory (Ollama)
│   ├── gateway-extension.ts               # WebSocket server (v0.6.0)
│   ├── gateway-status-extension.ts        # Gateway TUI integration
│   ├── discord-extension.ts               # Discord bot
│   └── ...
└── community/
    ├── draconic-subagents-wrapper.ts      # PI ecosystem bridge
    └── ...
```

### Event-Driven

```typescript
eventBus.emit('agent.spawned', payload);
eventBus.on('agent.spawned', handler);
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `src/agent/` | Agent runtime with subagent support |
| `src/gateway/` | Koclaw JSON-RPC gateway (port 7777) |
| `src/gateway/protocol/` | Frame types (Hello, Connect, Request, Response, Event) |
| `src/gateway/methods/` | Method handlers (agent.run, agent.status, etc.) |
| `src/node/` | Node system for external devices (see `docs/NODE-SYSTEM-DESIGN.md`) |
| `src/memory/` | Conversation persistence & session management |
| `src/memory/session-store.ts` | SQLite session persistence |
| `src/memory/session-resume.ts` | Auto-save/restore sessions |
| `src/memory/memory-integration.ts` | Gateway + generative agents bridge |
| `src/skills/` | Hot-reload skill system |
| `src/tui/` | Terminal UI (React-based) |
| `src/event-bus/` | Decoupled event system |
| `src/cli/extensions/env.ts` | Secret management with auto-redaction |

---

## Testing

```bash
# Run all tests
bun test

# Specific test suites
bun test test/unit/extensions/generative-agents.test.ts
bun test test/integration/
bun test test/e2e/

# Test coverage
bun test --coverage
```

**Test Suites:**
- Unit: Core logic (scoring, relevance, parsing)
- Integration: Database operations, persistence
- E2E: Full agent lifecycle (observe → reflect → plan)

---

## Project Structure

```
0xKobold/
├── src/
│   ├── agent/              # Agent runtime & orchestration
│   ├── approval/           # Risk-based approval
│   ├── channels/           # Discord integration
│   ├── cli/                # CLI commands
│   ├── config/             # Configuration
│   ├── discord/            # Discord bot
│   ├── event-bus/          # Event system
│   ├── extensions/         # Extensions
│   │   ├── core/           # Built-in extensions
│   │   └── community/      # Community wrappers
│   ├── gateway/            # WebSocket gateway
│   ├── llm/                # LLM providers (Ollama)
│   ├── memory/             # Persistence layer
│   ├── skills/             # Skill system
│   │   ├── builtin/        # Built-in skills
│   │   └── loader.ts       # Hot-reload logic
│   ├── tui/                # Terminal UI
│   └── utils/              # Utilities (nl-patterns.ts, redact.ts)
├── skills/                 # Your custom skills (hot-reloaded)
├── test/                   # Test suites
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/                   # Documentation
│   ├── archive/            # Historical docs
│   ├── research/             # Research notes
│   └── usage.md, workflow.md # Living docs
└── scripts/                # Deployment scripts
```

---

## Packages

The project includes several packages in `packages/`:

| Package | Description |
|---------|-------------|
| `kobold-desktop-pet` | 3D animated desktop pet (VRM + Mixamo) - see `packages/kobold-desktop-pet/README.md` |
| `mission-control` | Web dashboard for monitoring agents |
| `pi-cloudflare-browser` | Cloudflare browser automation |

### Desktop Pet

The `kobold-desktop-pet` package connects as a **node** to the gateway:
- Shows agent status (idle, working, thinking, sleeping)
- Draggable, always-on-top transparent window
- System tray integration
- Custom VRM avatars with Mixamo animations

See `docs/NODE-SYSTEM-DESIGN.md` for node architecture.

---

## Key Files

- `src/pi-config.ts` - PI framework configuration
- `src/gateway/gateway-server.ts` - Koclaw gateway server
- `src/gateway/protocol/` - JSON-RPC protocol frames
- `src/gateway/methods/agent.ts` - Gateway agent handlers
- `src/memory/session-store.ts` - Session persistence
- `src/memory/session-resume.ts` - Auto-save/restore
- `src/memory/memory-integration.ts` - Gateway + memory bridge
- `src/agent/auth-profiles.ts` - Auth profile management
- `src/extensions/core/generative-agents-extension.ts` - Generative agents
- `src/utils/nl-patterns.ts` - Natural language parsing
- `src/utils/redact.ts` - Secret redaction utilities
- `src/cli/extensions/env.ts` - Environment & secrets management
- `~/.0xkobold/config.json` - User configuration
- `~/.0xkobold/memory/perennial/knowledge.db` - Semantic memory
- `CLAUDE.md` - AI assistant context

---

## License

MIT © 2026

---

**Built while you sleep by your Digital Familiar** 🐉

*Join the evolution on [Github](https://github.com/MoikasLabs/0xkobold)*
