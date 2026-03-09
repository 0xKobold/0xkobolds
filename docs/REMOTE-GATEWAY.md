# 0xKobold Remote Gateway Architecture

## Overview

The Remote Gateway Architecture enables **distributed deployment** where the TUI runs locally on your development machine, but the AI processing (gateway, LLM calls, agent logic) runs on a remote VPS.

**Use Case:** Run heavy AI processing on a powerful VPS while keeping the familiar TUI on your laptop, with files synchronized between them.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    YOUR LAPTOP (Local)                       │
│  ┌─────────────────┐        ┌──────────────────────────┐    │
│  │   TUI (Bun)     │◄──►│   GatewayClient (WS)     │    │
│  │   - Terminal    │        │   - Remote Connection    │    │
│  │   - File Ops    │        │   - Auth Tokens          │    │
│  │   - ~/projects  │        │   - Auto-reconnect       │    │
│  └─────────────────┘        └────────────┬─────────────┘    │
│         │                                │                   │
│         │  Local Files                   │  WebSocket        │
│         │                                │                   │
│  ┌──────▼──────────────────┐   ┌─────────▼──────────┐       │
│  │  .0xkobold/ (project)   │   │  ~/.0xkobold/        │       │
│  │  - workspace.db         │   │  - config.json       │       │
│  │  - MEMORY.md (local)    │   │  - identity          │       │
│  └────────────────────────┘   └──────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
                              │
                              │  wss://vps.com:7777 (secure)
                              │  ws://vps.com:7777 (dev)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    VPS (Remote)                             │
│  ┌────────────────────────────────────────────────────┐    │
│  │   Gateway Server (Bun)                             │    │
│  │   - WebSocket Server                               │    │
│  │   - Authenticated Sessions                         │    │
│  │   - Multi-client Support                           │    │
│  └────────────────┬───────────────────────────────────┘    │
│                   │                                         │
│         ┌─────────┼─────────┐                               │
│         ▼         ▼         ▼                               │
│  ┌──────────┐ ┌────────┐ ┌──────────┐                      │
│  │  Claude  │ │ Docker │ │ Channels │                      │
│  │  API     │ │ Sandbox│ │ (WhatsApp│                      │
│  │          │ │        │ │  etc.)   │                      │
│  └──────────┘ └────────┘ └──────────┘                      │
│                                                             │
│  ~/.0xkobold/ (server)                                      │
│  - Agent memory                                             │
│  - Long-running sessions                                    │
│  - API keys (kept on server)                                │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Concepts

### 1. Local Mode (Default)

**Use when:** Coding on single machine, no VPS

```bash
0xkobold tui                    # Global workspace
0xkobold tui --local             # Current project
```

**Components all local:**
- TUI runs on localhost
- Gateway runs on localhost:7777
- LLM API calls from your machine
- Files are local

**Pros:**
- ✅ Simple, no network dependencies
- ✅ Works offline with Ollama
- ✅ Lower latency

**Cons:**
- ❌ Requires powerful local machine
- ❌ API keys on every device

---

### 2. Remote Gateway Mode

**Use when:** You have a VPS for AI processing

```bash
# On VPS
0xkobold gateway start --host 0.0.0.0

# On Laptop
0xkobold tui --local --remote wss://vps.example.com:7777
```

**Components:**
- **TUI** runs locally (your laptop)
- **Gateway** runs on VPS
- **AI calls** happen from VPS
- **Files** stay on laptop (local editing)

**Pros:**
- ✅ TUI feels lightweight (just websocket client)
- ✅ API keys secure on VPS
- ✅ VPS can have GPU/accelerated compute
- ✅ One VPS serves multiple clients

**Cons:**
- ❌ Requires network connection
- ❌ Need to handle file sync (separate from this)

---

## Configuration

### Step 1: VPS Setup

```bash
# On your VPS
npm install -g 0xkobold

# Edit config
nano ~/.0xkobold/config.json
```

```json
{
  "version": "0.3.0",
  "gateway": {
    "enabled": true,
    "port": 7777,
    "host": "0.0.0.0",
    "cors": ["*"]
  },
  "llm": {
    "provider": "claude",
    "apiKey": "sk-ant-...",
    "model": "claude-3-sonnet-20240229"
  },
  "security": {
    "deviceAuth": true,
    "dockerSandbox": true
  }
}
```

```bash
# Start gateway (use systemd for persistence)
0xkobold gateway start --host 0.0.0.0

# Or run as systemd service
0xkobold start --daemon
```

---

### Step 2: Laptop Setup

```bash
# Install globally
npm install -g 0xkobold

# Edit config
nano ~/.0xkobold/config.json
```

```json
{
  "version": "0.3.0",
  "gateway": {
    "enabled": false,
    "remote": {
      "enabled": true,
      "url": "wss://vps.example.com:7777",
      "autoReconnect": true,
      "reconnectDelay": 1000
    }
  },
  "llm": {
    "provider": "remote"
  }
}
```

```bash
# Start TUI with remote gateway
0xkobold tui --local --remote wss://vps.example.com:7777

# Or if configured in ~/.0xkobold/config.json
0xkobold tui --local
```

---

## Security (Important)

### Authentication Methods

**Option 1: Token-based (Recommended)**

```bash
# On VPS, generate device token
0xkobold device auth generate

# Copy token to laptop
0xkobold device auth save "token-here"
```

**Option 2: Password (Simple)**

```json
{
  "gateway": {
    "remote": {
      "password": "your-secure-password"
    }
  }
}
```

**Option 3: Device Identity (Advanced)**

Uses public/private key pairs similar to SSH.

---

## File Syncing (For Remote Mode)

**The Remote Gateway does NOT sync files automatically.**

### Option A: Manual Sync (Current)
```bash
# Edit locally
0xkobold tui --local --remote wss://vps.com:7777
# File operations happen on laptop
# AI processing happens on VPS
```

### Option B: SSHFS (Recommended)
```bash
# Mount VPS directory locally
sshfs user@vps:/projects ~/remote-projects

# Work on mounted directory
0xkobold tui --local ~/remote-projects --remote wss://vps.com:7777
```

### Option C: Syncthing (Future Enhancement)
Install Syncthing on both sides for real-time sync.

---

## Backward Compatibility

**✅ Local mode unchanged - existing users unaffected**

Old behavior (still works):
```bash
0xkobold tui          # Still runs everything locally
0xkobold tui --local  # Still uses local gateway
```

**New capability added:**
```bash
0xkobold tui --remote wss://...  # New: Connect to VPS
```

**Config migration:**
- Existing configs work without changes
- New `remote` field is optional
- Default is local mode

---

## Protocol (Technical)

### Connection Flow

```
1. Client opens WebSocket to wss://vps:7777
2. Server sends "hello" with capabilities
3. Client sends auth (token + device info)
4. Server validates, sends "auth_ok"
5. Bidirectional messages begin
6. Heartbeat/ping every 30s
```

### Message Format

```typescript
interface GatewayMessage {
  id: string;
  type: "request" | "response" | "event" | "ping" | "pong";
  channel?: string;
  payload: unknown;
  timestamp: number;
}

// Example: Chat request
{
  "id": "msg-123456",
  "type": "request",
  "channel": "chat",
  "payload": {
    "message": "Help me refactor this",
    "context": { "file": "src/index.ts" }
  },
  "timestamp": 1234567890
}
```

---

## Comparison with kod/OpenClaw

| Feature | kod | 0xKobold v0.3.0 |
|---------|-----|------------------|
| Protocol Complexity | High (frames, seq, ack) | Simple (JSON messages) |
| Auth | Device certs + tokens | Tokens + simple passwords |
| Encryption | TLS 1.3 | WSS (TLS 1.2+) |
| Channels | 5+ | 4 (Discord, WhatsApp, Telegram, Slack) |
| Code Size | 60k lines | 7k lines |
| Setup Time | 30 mins | 5 mins |

**Philosophy:** kod is "enterprise"; 0xKobold is "10x simpler but gets the job done"

---

## Deployment Examples

### Development VPS (Hetzner/Digital Ocean)

```bash
# 1. Set up VPS
curl -fsSL https://bun.sh/install | bash
npm install -g 0xkobold

# 2. Configure
0xkobold init
nano ~/.0xkobold/config.json

# 3. Run with systemd
0xkobold start --daemon

# 4. Open firewall
ufw allow 7777/tcp
```

### On Laptop

```bash
# Just connect
0xkobold tui --local --remote wss://vps.example.com:7777 --token "xxx"
```

---

## Troubleshooting

### Connection Refused
```
Check: VPS firewall, gateway running, correct port
```

### Auth Failed
```
Check: Token valid, not expired, device approved on VPS
```

### High Latency
```
- Use local LLM (Ollama) if close enough
- VPS geographically close to you
- Check network connection with ping
```

### File Not Found (Remote Mode)
```
The AI runs on VPS and can't see your local files.
Solution: Use SSHFS or sync files to VPS first.
```

---

## Future Enhancements

1. **File watcher** - Auto-sync changed files to VPS
2. **Collaborative editing** - Multiple clients, same session
3. **Voice mode** - Stream audio to VPS for processing
4. **Canvas** - Shared visual workspace

---

## Summary

**Remote Gateway Mode enables:**
- ✅ Lightweight TUI on any device
- ✅ Powerful AI processing on VPS
- ✅ Secure credential storage
- ✅ Same great 0xKobold experience

**Backward Compatible:**
- ✅ Existing local users unaffected
- ✅ New feature is opt-in
- ✅ Default behavior unchanged

---

*This architecture allows 0xKobold to scale from personal laptop to team VPS deployment.* 🐉🌐
