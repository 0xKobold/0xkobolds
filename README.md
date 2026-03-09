# 0xKobold v0.3.0 "The Gap Closer"

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
      . ^>^.^~fbXXdZf_,, Il .         I~d@@#MOIY>l[ZoW@@@@@@@@@UIMO{.   .
        `I!<` ,lllll :,i;,^`    ...~+<d#oJQQbIIJdUB@@@@@@@#%OU8WW@@81+,`
       .,i[l:i!, `:I<-l<-, ^^`  ..:]ZodXIdbC1i1Z#@@@@@@%%BWWoO%@@@@%bQf[^.
       .J-I ~I!.iCU->-1_<`ii>~:....:_1}It}!.::+tX%#@%MbMBQ%@@@@@@%%WbY]+-~`.
        XWOUMO{,Z@B-;1B]:I_->i^      ...   `;;JOB#QB#M8@@@@@@8OOOQdZ{~i!i!:.
       ..iJB@@M[1@%Y<X@o][]]>:III,^,    ....,Z@@@@@@@@@@@@@@8#WOMoZI~~~~+I..
           `~M@8X#@8Zf#@BUWb1{1?]1}]<!^ ...:b@@@@@@@@@@@@@8BW#dXZf[?-+l:`. ..
         ..  :JB@@@@%%@@@B#@%W%OQ8BMQbU> ..>M%@@@@@@@@@@@#%W8##OoXZXQCi^ ...
           ..  ^?1YbMWO#@@@@@@@@@@@@@@OZ-` d@#@@@@@@@@#%W8##OoXZXQCi^ ...
             ..     .`.:!~-CXd%@@@@@@@8oQ}}%@@@@@@@@@@@BWWBWMMdbf[->>^..
               .....          :{@@@@@@@OYUCQ8@@@@@@@@8BB8WMQModU?++:!I..
                    ..........  _@@B8%@#QMdYJO@@@@%BB%obO%obbXZ{?-~l,;..
                              .. {ooQB%o@%OO-{Z@%oOooWOXZYYII}?_~iiI.`
                              . ^+IoQWQbOQXdJbfU#BdUZYJI[{[--l>:`
                                `><+-]1??_~>++~!]J{}~>i>>;!;`     ..
                                                   `         . ..
                                 ........ ......... .........
```

> *"Your digital familiar - a personal AI assistant that learns, evolves, and helps you Build 24/7"*

**v0.3.0 "The Gap Closer"** — Multi-channel, secure, distributed, and packed with features.

---

## What's New in v0.3.0

### 🚀 Major Features (12 Total)

| Feature | Status | Description |
|---------|--------|-------------|
| **WhatsApp** | ✅ | Baileys integration with QR pairing |
| **Telegram** | ✅ | Complete bot with webhooks |
| **Slack** | ✅ | Webhook & slash commands |
| **Docker Sandbox** | ✅ | Secure container execution |
| **Device Auth** | ✅ | Multi-device token management |
| **Vision (AI)** | ✅ | Claude Vision image analysis |
| **Audio** | ✅ | Whisper transcription |
| **PDF** | ✅ | Text extraction & metadata |
| **Remote Gateway** | ✅ | Connect TUI to VPS |
| **Tailscale** | ✅ | Zero-config VPN for remote access |
| **Duplicate Detection** | ✅ | Self-check before adding code |
| **OpenClaw Migration** | ✅ | Full migration tool |

---

## Installation

### Via NPM (Recommended)

```bash
# Install Bun if needed
curl -fsSL https://bun.sh/install | bash

# Install 0xKobold
npm install -g 0xkobold

# Setup
0xkobold setup

# Start
0xkobold
```

### Quick Start

```bash
npx 0xkobold setup
npx 0xkobold
```

---

## Multi-Channel Support 📱

Use your AI across multiple messaging platforms:

```bash
# WhatsApp
0xkobold whatsapp start              # Scan QR code
0xkobold whatsapp send 123456 "Hello"

# Telegram
TELEGRAM_BOT_TOKEN=xxx 0xkobold telegram start

# Slack
0xkobold slack send "Hello team!"

# Discord
0xkobold gateway start --discord
```

---

## Remote/VPS Deployment 🌐

Run AI on VPS, use lightweight TUI locally:

### VPS Side
```bash
# On your VPS
0xkobold gateway start --host 0.0.0.0

# Or with Tailscale (no port forwarding!)
0xkobold tailscale start
```

### Laptop Side
```bash
# Direct connection
0xkobold tui --remote wss://vps.example.com:7777

# Via Tailscale (secure, private)
0xkobold tui --remote $(0xkobold tailscale url)
```

---

## Security Features 🛡️

### Docker Sandboxing
```typescript
import { getDockerRunner } from "0xkobold/sandbox";

const runner = getDockerRunner({
  image: "node:20-slim",
  memoryLimit: "512m",
  network: "none",  // Isolated
});

await runner.run({
  command: "node",
  args: ["-e", "console.log('Safe execution')"],
});
```

### Device Authentication
```bash
0xkobold device init "My Laptop"
0xkobold device token generate
0xkobold device list
```

---

## Media Support 🖼️

### Vision (Image Analysis)
```typescript
import { VisionAnalyzer } from "0xkobold/media";

const vision = new VisionAnalyzer({
  provider: "claude",
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const result = await vision.analyzeImage("./image.png");
console.log(result.description);
console.log(result.objects);
```

### Audio Transcription
```typescript
import { AudioTranscriber } from "0xkobold/media";

const audio = new AudioTranscriber({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY,
});

const result = await audio.transcribeFile("./voice.mp3");
console.log(result.text);
console.log(result.segments);  // Timestamps
```

### PDF Processing
```typescript
import { extractPDF } from "0xkobold/documents";

const result = await extractPDF("./document.pdf");
console.log(result.text);
console.log(result.metadata.title);
console.log(result.pages);
```

---

## Duplicate Detection 🔍

Check before adding to avoid duplication:

```bash
# Check before implementing
0xkobold check "WhatsApp integration"

# Check specific function
0xkobold check -f calculateSum

# Check class
0xkobold check -c UserManager
```

**Output:**
```
⚡ SIMILAR IMPLEMENTATIONS FOUND
   Best match: 90% at src/channels/whatsapp/integration.ts

Suggestion: Review existing code before creating new implementation.
```

---

## Migration from OpenClaw 🔄

Migrating from OpenClaw (koclaw)? We got you:

```bash
# Preview migration
0xkobold migrate --dry-run

# Execute migration (with automatic backup)
0xkobold migrate --live
```

**Migrated:**
- ✅ Configuration (with `.bak` backups)
- ✅ Agents
- ✅ Identity (both formats)
- ✅ Browser data
- ✅ Canvas/visual data
- ✅ Credentials (secure)
- ✅ Media files
- ✅ Cron jobs
- ✅ Workspace & databases
- ✅ Channel sessions

---

## Project Structure

```
0xkobold/
├── src/
│   ├── agent/           # Agent runtime
│   ├── approval/        # Safety approvals
│   ├── auth/            # Device authentication
│   ├── channels/        # WhatsApp, Telegram, Slack
│   ├── cli/             # CLI commands
│   ├── config/          # Configuration management
│   ├── discord/          # Discord bot
│   ├── documents/        # PDF processing
│   ├── gateway/          # WebSocket gateway
│   │   ├── client.ts     # Remote client
│   │   └── server.ts     # Server
│   ├── infra/            # Infrastructure (Tailscale)
│   ├── media/            # Vision, Audio
│   ├── migration/        # OpenClaw migration
│   ├── sandbox/          # Docker isolation
│   ├── skills/           # Skills framework
│   │   └── builtin/
│   │       └── duplicate-detector.ts
│   └── workspace/        # Workspace management
├── skills/              # Your custom skills
└── package.json
```

---

## Configuration

Global config: `~/.0xkobold/config.json`

### Option 1: Ollama (Local - Default)

```json
{
  "version": "0.3.0",
  "llm": {
    "provider": "ollama",
    "model": "qwen2.5-coder:14b",
    "baseUrl": "http://localhost:11434",
    "maxTokens": 4000,
    "temperature": 0.7
  },
  "gateway": {
    "port": 7777,
    "host": "localhost"
  }
}
```

**Setup:**
```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull qwen2.5-coder:14b

# Start Ollama
ollama serve
```

### Option 2: Claude (Cloud)

```json
{
  "version": "0.3.0",
  "llm": {
    "provider": "claude",
    "model": "claude-3-sonnet-20240229",
    "apiKey": "sk-ant-xxx",
    "maxTokens": 4000,
    "temperature": 0.7
  }
}
```

**Setup:**
```bash
# Get API key from https://console.anthropic.com
export ANTHROPIC_API_KEY=sk-ant-xxx
```

### Option 3: OpenAI (Cloud)

```json
{
  "version": "0.3.0",
  "llm": {
    "provider": "openai",
    "model": "gpt-4",
    "apiKey": "sk-xxx",
    "maxTokens": 4000,
    "temperature": 0.7
  }
}
```

### Full Example with All Features

```json
{
  "version": "0.3.0",
  "persona": {
    "name": "0xKobold",
    "emoji": "🐉"
  },
  "llm": {
    "provider": "ollama",
    "model": "qwen2.5-coder:14b",
    "baseUrl": "http://localhost:11434",
    "maxTokens": 4000,
    "temperature": 0.7
  },
  "gateway": {
    "enabled": true,
    "port": 7777,
    "host": "localhost",
    "remote": {
      "enabled": false
    }
  },
  "channels": {
    "discord": { "enabled": false },
    "whatsapp": { "enabled": true },
    "telegram": { "enabled": false },
    "slack": { "enabled": false }
  }
}
```

---

## CLI Commands

### Core
```bash
0xkobold setup                    # Interactive setup
0xkobold tui                      # Start TUI (default)
0xkobold tui --local              # Local project mode
0xkobold tui --remote <url>       # Connect to remote gateway
```

### Channels
```bash
0xkobold whatsapp start|stop|status|send
0xkobold telegram start|stop|status
0xkobold slack webhook <message>
```

### Gateway & Networking
```bash
0xkobold gateway start|stop|status
0xkobold tailscale status         # Check Tailscale IP
0xkobold tailscale url            # Get gateway URL
```

### Security
```bash
0xkobold device init <name>
0xkobold device token generate
0xkobold device list
```

### Development
```bash
0xkobold check <description|function|class>
0xkobold migrate --dry-run|live
0xkobold status
0xkobold logs
```

---

## Compared to OpenClaw

| Metric | OpenClaw | 0xKobold v0.3.0 | Advantage |
|--------|----------|-----------------|-----------|
| **Lines of Code** | ~60,000 | ~8,000 | 7.5x simpler |
| **Dependencies** | 100+ | ~20 | 5x lighter |
| **Setup Time** | 30 min | 5 min | 6x faster |
| **Channels** | 5 | 4 | Feature parity |
| **Security** | ✅ | ✅ | Feature parity |
| **Media** | ✅ | ✅ | Feature parity |
| **Remote/VPS** | ✅ | ✅ | Feature parity |
| **Tailscale** | ✅ | ✅ | Feature parity |

**Our Philosophy:** OpenClaw power, 10x simpler.

---

## API Usage

### Gateway Client (Remote)
```typescript
import { GatewayClient } from "0xkobold/gateway";

const client = new GatewayClient({
  url: "wss://your-vps.com:7777",
  token: "xxx",
  autoReconnect: true,
});

await client.connect();
client.chat("Hello from my laptop");
```

### Sandbox
```typescript
import { getDockerRunner } from "0xkobold/sandbox";

const runner = getDockerRunner({
  memoryLimit: "256m",
  cpuLimit: "0.5",
  network: "none",
});

const result = await runner.run({
  command: "node",
  args: ["script.js"],
});
```

### Duplicate Detection
```typescript
import { getDuplicateDetector } from "0xkobold/skills";

const detector = getDuplicateDetector();
const result = await detector.check("New feature");

if (result.exists) {
  console.log("Already exists!", result.matches[0].file);
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    YOUR LAPTOP (Local)                       │
│  ┌─────────────────┐        ┌──────────────────────────┐    │
│  │   TUI (Bun)     │◄──────►│   GatewayClient (WS)     │    │
│  │   - Terminal    │        │   - Remote Connection    │    │
│  │   - File Ops    │        │   - Auth Tokens          │    │
│  └─────────────────┘        └────────────┬─────────────┘    │
│         │                                │                   │
│         │  Local Files                   │  WebSocket        │
│         │                                │                   │
│  ┌──────▼──────────────────┐   ┌─────────▼──────────┐       │
│  │  .0xkobold/ (project)   │   │  ~/.0xkobold/        │       │
│  │  - workspace.db         │   │  - config.json       │       │
│  │  - MEMORY.md            │   │  - identity          │       │
│  └────────────────────────┘   └──────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              │  wss:// or Tailscale
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    VPS (Remote) OR Local                     │
│  ┌────────────────────────────────────────────────────┐    │
│  │   Gateway Server (Bun)                             │    │
│  │   - WebSocket Server                               │    │
│  │   - Multi-client Support                           │    │
│  └────────────────┬───────────────────────────────────┘    │
│                   │                                         │
│         ┌─────────┼─────────┐                               │
│         ▼         ▼         ▼                               │
│  ┌──────────┐ ┌────────┐ ┌──────────┐                      │
│  │  Claude  │ │ Docker │ │ Channels │                      │
│  │  API     │ │ Sandbox│ │ (Discord│                      │
│  │          │ │        │ │ WhatsApp│                      │
│  └──────────┘ └────────┘ └──────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

---

## License

MIT © 2025

---

**Built while you sleep by your Digital Familiar** 🐉

*Join the future of personal AI at [0xkobold](https://github.com/moikapy/0xkobold)*
