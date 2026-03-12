# 0xKobold

<!-- Banner Image Placeholder - Consider creating a PNG/SVG version of the ASCII art below -->
<pre align="center">
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
                                 ........ ......... ..........
</pre>

<p align="center">
  <strong>Your Digital Familiar—A Personal AI Assistant That Connects, Persists, and Evolves</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#multi-agent-system">Multi-Agent</a> •
  <a href="#documentation">Docs</a> •
  <a href="#architecture">Architecture</a>
</p>

<!-- Badges -->
<p align="center">
  <img src="https://img.shields.io/badge/version-0.6.11-blue.svg" alt="Version">
  <img src="https://img.shields.io/badge/bun-1.0+-black.svg" alt="Bun">
  <img src="https://img.shields.io/badge/typescript-5.0+-blue.svg" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
</p>

---

## 📖 Table of Contents

- [Quick Start](#quick-start)
- [What is 0xKobold?](#what-is-0xkobold)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Multi-Agent System](#multi-agent-system)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Contributing](#contributing)
- [License](#license)

---

## 🚀 Quick Start

```bash
# Install Bun (required)
curl -fsSL https://bun.sh/install | bash

# Clone and install
git clone https://github.com/MoikasLabs/0xkobold.git
cd 0xkobold
bun install

# Initialize workspace
bun run init

# Start your familiar
bun run start
```

**That's it!** 0xKobold will guide you through first-time setup.

---

## 🤔 What is 0xKobold?

0xKobold is a **personal AI assistant framework** built on open standards. Think of it as a digital familiar that:

- **Remembers** everything (semantic memory with Ollama embeddings)
- **Multiplies** itself (spawn specialized agent subordinates)
- **Connects** everywhere (WebSocket gateway, Discord, Telegram, WhatsApp)
- **Evolve** its skills (hot-reload TypeScript extensions)
- **Secures** your secrets (automatic redaction)

**Built for:** Developers who want their AI to *actually* understand their codebase, remember their preferences, and work autonomously.

---

## ✨ Features

### 🎯 Multi-Agent Orchestration
Spawn specialized agents that collaborate:

```bash
# Spawn agents for specific tasks
/agent-orchestrate spawn coordinator "plan a feature"
/agent-orchestrate spawn specialist "implement auth"
/agent-orchestrate spawn researcher "analyze codebase"

# Or use natural language
spawn a worker to fix the database connection
```

| Type | Best For |
|------|----------|
| 🎯 **Coordinator** | Task decomposition, managing workflows |
| 🧠 **Specialist** | Deep domain expertise (security, architecture) |
| 🔍 **Researcher** | Information gathering, analysis |
| ⚒️ **Worker** | Implementation, coding |
| 👁️ **Reviewer** | Code review, validation |

### 🧠 Generative Agents (Stanford HCI Research)

Agents that **remember, reflect, and plan** like humans:

```bash
# Automatic memory capture
- Every interaction
- Every tool execution
- Every decision

# Reflection (auto-triggered)
/agent-reflections              # Show insights from memory

# Planning
/agent-plans                   # View hierarchical plans
/generative_plan daily         # Create action plan
```

**Memory Categories:** `observation` → `thought` → `action` → `reflection`

### 🌐 Koclaw Gateway (v0.6.0)

JSON-RPC gateway for multi-channel integration:

```typescript
// Connect via WebSocket
const ws = new WebSocket('ws://localhost:7777/ws');

// Protocol frames
{ type: "hello", protocol: "1", version: "2" }
{ type: "connect", sessionKey: "...", agent: "..." }
{ type: "request", id: "...", method: "agent.run", params: {...} }
{ type: "response", id: "...", result: {...} }
```

**Features:**
- Session persistence across restarts
- Multi-provider auth profiles (auto-rotation)
- Real-time events

### 🔧 Hot-Reload Skills

Add capabilities without restarting:

```typescript
// skills/my-skill.ts
export const mySkill: Skill = {
  name: 'mySkill',
  description: 'What it does',
  risk: 'medium',
  toolDefinition: {
    type: 'function',
    function: {
      name: 'mySkill',
      parameters: {
        type: 'object',
        properties: { param: { type: 'string' } }
      }
    }
  },
  async execute(args) {
    return { success: true, data: result };
  }
};
```

**Changes appear immediately**—no rebuild required.

### 🔐 Secret Management

Automatic redaction of sensitive values:

```bash
# Show env vars (secrets redacted)
0xkobold env show
# TOKEN=***
# API_KEY=***

# Show with secrets (careful!)
0xkobold env show --show-secrets
```

**Auto-redacted:** `TOKEN`, `KEY`, `SECRET`, `PASSWORD`, `API_KEY`, `WEBHOOK_URL`

---

## 📦 Installation

### Prerequisites

| Dependency | Version | Install |
|------------|---------|---------|
| **Bun** | 1.0+ | `curl -fsSL https://bun.sh/install \| bash` |
| **Ollama** | Latest | `curl -fsSL https://ollama.com/install.sh \| sh` |

### Full Setup

```bash
# 1. Clone repository
git clone https://github.com/MoikasLabs/0xkobold.git
cd 0xkobold

# 2. Install dependencies
bun install

# 3. Initialize workspace (~/.0xkobold/)
bun run init

# 4. Pull recommended models (optional)
ollama pull qwen2.5-coder:14b
ollama pull nomic-embed-text  # For semantic memory

# 5. Start 0xKobold
bun run start
```

### Development Mode

```bash
# Watch mode for development
bun run dev

# Or manually rebuild
bun run build
bun run start
```

---

## 💻 Usage

### Basic Commands

```bash
/agent-orchestrate list                    # List all agents
/agent-orchestrate spawn_main coordinator  # Spawn main agent
/agent-orchestrate delegate "complex task" # Auto-delegate

# Memory
/remember "User prefers TypeScript"
/recall "what was the database decision"

# Gateway (if enabled)
0xkobold gateway status
0xkobold gateway connections list
```

### Natural Language

0xKobold understands natural commands:

```
User: "spawn a worker to fix the database connection"
→ Interprets as: /agent-orchestrate spawn_subagent worker "fix database connection"

User: "analyze this complex architecture problem"
→ Interprets as: /agent-orchestrate analyze "complex architecture problem"
```

### CLI vs TUI

| Mode | Command | Use Case |
|------|---------|----------|
| **TUI** | `bun run start` | Interactive terminal UI |
| **CLI** | `bun run cli <command>` | Scripting, automation |
| **Dev** | `bun run dev` | Development with hot reload |

---

## 🏛️ Architecture

### Extension-Based Architecture

```
src/extensions/
├── core/
│   ├── agent-orchestrator-extension.ts    # Multi-agent orchestration
│   ├── generative-agents-extension.ts     # Memory, reflection, planning
│   ├── perennial-memory-extension.ts      # Semantic memory (Ollama)
│   ├── cloudflare-browser-extension.ts    # Web rendering, screenshots, PDFs
│   ├── gateway-extension.ts               # WebSocket gateway
│   └── discord-extension.ts               # Discord bot integration
└── community/
    └── draconic-subagents-wrapper.ts      # PI ecosystem bridge
```

### Key Components

| Component | Purpose | File |
|-----------|---------|------|
| **Agent Runtime** | Core agent loop with subagent support | `src/agent/` |
| **Koclaw Gateway** | JSON-RPC WebSocket/HTTP server | `src/gateway/` |
| **Event Bus** | Decoupled event system | `src/event-bus/` |
| **Memory Layer** | SQLite persistence, session resume | `src/memory/` |
| **Skills System** | Hot-reload capabilities | `src/skills/` |
| **TUI** | React-based terminal UI | `src/tui/` |

### Event-Driven Design

```typescript
// Emit events
eventBus.emit('agent.spawned', payload);

// Listen for events
eventBus.on('agent.spawned', handler);
```

**Benefits:**
- Loose coupling between components
- Testable, observable system
- Easy to extend with new features

---

## 🔧 Configuration

Global config location: `~/.0xkobold/config.json`

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
  "obsidian": {
    "enabled": true,
    "vault": "obsidian_vault"
  }
}
```

### Environment Variables

Create `~/.0xkobold/.env`:

```bash
# Ollama Cloud (optional)
OLLAMA_API_KEY=your_key_here

# Cloudflare Browser (optional)
CLOUDFLARE_API_TOKEN=your_token
CLOUDFLARE_ACCOUNT_ID=your_account_id

# Discord bot (optional)
DISCORD_TOKEN=your_token
```

---

## 📚 Documentation

- **[Architecture Guide](docs/architecture.md)** — System design and patterns
- **[Skills Guide](docs/skills.md)** — Creating custom capabilities
- **[API Reference](docs/api.md)** — Gateway protocol and methods
- **[Contributing](CONTRIBUTING.md)** — Development guidelines

**Research & Analysis:**
- [Research/8004-Protocol-Research.md](RESEARCH-8004.md) — ERC-8004 integration plan
- [Research/x402-Protocol-Research.md](research/x402-protocol.md) — Payment protocol analysis

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

**Quick contribution workflow:**

```bash
# 1. Fork and clone
git clone https://github.com/YOUR_USERNAME/0xkobold.git

# 2. Create feature branch
git checkout -b feature/amazing-feature

# 3. Install pre-commit hooks
bun install

# 4. Make changes (tests run automatically on commit)
git add .
git commit -m "feat: add amazing feature"

# 5. Push and create PR
git push origin feature/amazing-feature
```

### Code Standards

- **TypeScript** — Strict mode enabled
- **Bun** — Required runtime
- **Pre-commit hooks** — Auto-run tests and build
- **Semantic commits** — `feat:`, `fix:`, `docs:`, etc.

### Testing

```bash
# Run all tests
bun test

# Specific suites
bun test test/unit/
bun test test/integration/

# With coverage
bun test --coverage
```

---

## 🗺️ Roadmap

| Version | Features | Status |
|---------|----------|--------|
| **v0.6.x** | Context pruning, Web tools, ERC-8004 research | 🟡 In Progress |
| **v0.7.0** | ERC-8004 identity integration | 🔴 Planned |
| **v0.8.0** | Agent marketplace (x402 + ERC-8004) | 🔴 Planned |
| **v1.0.0** | Stable API, plugin ecosystem | 🔴 Future |

**Active Research:**
- 🌐 [x402 Protocol](RESEARCH-8004.md) — Internet-native payments
- 🔐 [ERC-8004](RESEARCH-8004.md) — Trustless agent identity
- ☁️ [Cloudflare Browser](src/extensions/core/cloudflare-browser-extension.ts) — Web rendering

---

## 🙏 Acknowledgments

- **Stanford HCI Lab** — Generative Agents research
- **PI Community** — Extension ecosystem patterns
- **Coinbase** — x402 protocol inspiration
- **Contributors** — See [Contributors](https://github.com/MoikasLabs/0xkobold/graphs/contributors)

---

## 📄 License

MIT © 2026 — See [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Built while you sleep by your Digital Familiar 🐉</strong>
</p>

<p align="center">
  <a href="https://github.com/MoikasLabs/0xkobold">GitHub</a> •
  <a href="https://github.com/MoikasLabs/0xkobold/issues">Issues</a> •
  <a href="https://github.com/MoikasLabs/0xkobold/discussions">Discussions</a>
</p>
