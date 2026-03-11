# 0xKobold Roadmap: OpenClaw-Inspired Features

## Research Summary

Based on comprehensive extraction of OpenClaw documentation, here are features to implement for 0xKobold v0.3.0+ to enhance our AI assistant/digital familiar.

---

## 🎯 Priority: HIGH (Core Architecture)

### 1. Multi-Agent Routing System
**Status:** Planned | **Effort:** High | **Impact:** High

**Description:** Support multiple isolated agents (personas) with separate workspaces, sessions, and configurations.

**Key Features:**
- [ ] Multiple agent personas (e.g., "coding", "social", "research")
- [ ] Per-agent workspaces with isolated files and memory
- [ ] Session isolation per agent (separate session stores)
- [ ] Routing rules based on context/workspace/channel
- [ ] Agent switching via commands or automatic routing

**Config Structure:**
```json
{
  "agents": {
    "list": [
      { "id": "main", "workspace": "~/.0xkobold/workspace", "default": true },
      { "id": "coding", "workspace": "~/.0xkobold/workspace-coding", "model": "claude-code" },
      { "id": "social", "workspace": "~/.0xkobold/workspace-social", "personality": "friendly" }
    ]
  }
}
```

**Reference:** `docs/research/openclaw/multi-agent-routing.md`

---

### 2. Streaming & Chunking for Responses
**Status:** Planned | **Effort:** Medium | **Impact:** High

**Description:** Stream assistant responses in chunks for better UX, especially for long outputs.

**Key Features:**
- [ ] Block streaming: emit completed blocks as they're written
- [ ] Configurable chunk size (min/max characters)
- [ ] Break preferences: paragraph → newline → sentence → whitespace
- [ ] Coalescing: merge consecutive chunks with idle timeout
- [ ] Human-like pacing: randomized delays between blocks
- [ ] Preview streaming (for Discord/Telegram): live updating messages

**Config:**
```json
{
  "streaming": {
    "blockStreamingDefault": "on",
    "blockStreamingBreak": "text_end",
    "blockStreamingChunk": { "minChars": 800, "maxChars": 1200 },
    "humanDelay": { "mode": "natural", "minMs": 800, "maxMs": 2500 }
  }
}
```

**Reference:** `docs/research/openclaw/streaming-chunking.md`

---

### 3. Agent Bridge for Pi in RPC Mode
**Status:** Research | **Effort:** High | **Impact:** Medium

**Description:** Support running Pi agent in RPC mode for external harness integration (similar to ACP for Claude/Codex).

**Key Features:**
- [ ] RPC mode agent bridge with tool streaming
- [ ] External coding harness support (ACP-like interface)
- [ ] Session bridging between external agents and 0xKobold
- [ ] Tool result relay from external harnesses
- [ ] Compatible with Codex, Claude Code, Gemini CLI

---

## 🎯 Priority: MEDIUM (Channel & Communication)

### 4. Discord Bot Support
**Status:** Planned | **Effort:** Medium | **Impact:** Medium

**Description:** Full Discord integration with bot support.

**Key Features:**
- [ ] Discord bot using discord.js
- [ ] Multi-guild support
- [ ] Channel-specific configurations
- [ ] Mention-based activation
- [ ] Thread support for persistent sessions
- [ ] Slash commands integration
- [ ] Role-based access control

**Config:**
```json
{
  "discord": {
    "guilds": {
      "guild-id": {
        "channels": {
          "channel-id": { "allow": true, "requireMention": false }
        }
      }
    }
  }
}
```

---

### 5. Group Chat Support with Mention Activation
**Status:** Planned | **Effort:** Low | **Impact:** Medium

**Description:** Enhanced group chat behavior with mention-based responses.

**Key Features:**
- [ ] Mention-based activation (@0xKobold)
- [ ] Group reply threading
- [ ] Context tracking in groups
- [ ] Direct message vs group message handling
- [ ] Broadcast/multicast support

---

### 6. Media Support (Images, Audio, Documents)
**Status:** Research | **Effort:** Medium | **Impact:** Medium

**Description:** Support media input and output for richer interactions.

**Key Features:**
- [ ] Image input (vision models)
- [ ] Image generation/output
- [ ] Audio/voice note transcription
- [ ] Document processing (PDF, etc.)
- [ ] Streaming media support

---

## 🎯 Priority: MEDIUM (Advanced Features)

### 7. Sub-Agents with Thread Binding
**Status:** Planned | **Effort:** High | **Impact:** High

**Description:** Spawn background sub-agents for parallel task execution.

**Key Features:**
- [ ] Background sub-agent spawning
- [ ] Thread-bound sessions for isolated contexts
- [ ] Configurable depth levels (nesting)
- [ ] Cost controls (cheaper models for sub-agents)
- [ ] Result announcement back to parent
- [ ] Concurrency limiting

**Session Format:** `agent:<id>:subagent:<uuid>`

**Reference:** `docs/research/openclaw/subagents.md`

---

### 8. Queue Modes for Message Handling
**Status:** Planned | **Effort:** Medium | **Impact:** Medium

**Description:** Different strategies for handling queued messages during agent runs.

**Modes:**
- [ ] **Steer:** Interrupt current run, inject new message
- [ ] **Followup:** Queue for next turn after current completes
- [ ] **Collect:** Batch messages with debounce/cap

---

### 9. Multi-Agent Sandbox & Tool Restrictions
**Status:** Research | **Effort:** High | **Impact:** Medium

**Description:** Per-agent sandboxing and tool restrictions for security.

**Key Features:**
- [ ] Per-agent sandbox configuration
- [ ] Tool allowlist/denylist per agent
- [ ] Group-based tool policies (group:fs, group:runtime)
- [ ] Elevated mode for privileged operations
- [ ] Docker/container sandboxing
- [ ] Read-only agent mode

---

### 10. Hooks System
**Status:** Planned | **Effort:** Medium | **Impact:** High

**Description:** Event-driven hooks for extending agent behavior.

**Hook Points:**
- [ ] `before_model_resolve` - Override provider/model
- [ ] `before_prompt_build` - Inject context
- [ ] `before_tool_call` - Intercept tool params
- [ ] `after_tool_call` - Transform results
- [ ] `tool_result_persist` - Modify before persistence
- [ ] `message_received/sent` - Inbound/outbound interception
- [ ] `session_start/end` - Lifecycle management
- [ ] `before_compaction` - Custom compaction logic

---

## 🎯 Priority: LOW (Nice to Have)

### 11. Android Node Integration
**Status:** Future | **Effort:** High | **Impact:** Low

**Description:** Mobile node support for Android with rich device commands.

**Features:**
- [ ] Android app with pairing
- [ ] Canvas/camera integration
- [ ] Device commands (notifications, SMS)
- [ ] Photos/media access
- [ ] Motion sensors
- [ ] Calendar/contacts integration

---

### 12. Web Control UI
**Status:** Future | **Effort:** Medium | **Impact:** Low

**Description:** Web-based control panel for managing the agent.

**Features:**
- [ ] Session management
- [ ] Agent configuration
- [ ] Chat history viewer
- [ ] Tool usage analytics
- [ ] Real-time monitoring

---

### 13. Voice Note Transcription
**Status:** Future | **Effort:** Low | **Impact:** Low

**Description:** Optional hook for voice note transcription.

**Features:**
- [ ] Audio file processing
- [ ] Whisper integration
- [ ] Automatic transcription before agent processing

---

## 📋 Implementation Phases

### Phase 1: Core (v0.3.0)
1. Multi-Agent Routing
2. Streaming & Chunking
3. Hooks System (basic)

### Phase 2: Channels (v0.4.0)
4. Discord Bot Support
5. Group Chat Enhancements
6. Media Support (basic)

### Phase 3: Advanced (v0.5.0)
7. Sub-Agents
8. Queue Modes
9. Sandboxing

### Phase 4: Mobile & UI (v0.6.0+)
10. Android Node
11. Web Control UI
12. Voice Transcription

---

## 🔗 References

All research extracted from OpenClaw documentation:
- `docs/research/openclaw/pi-integration.md`
- `docs/research/openclaw/agent-runtime.md`
- `docs/research/openclaw/agent-loop.md`
- `docs/research/openclaw/subagents.md`
- `docs/research/openclaw/multi-agent-routing.md`
- `docs/research/openclaw/streaming-chunking.md`
- `docs/research/openclaw/system-prompt.md`

---

## 🎯 Current Status

✅ **Implemented:**
- Basic subagent spawning
- Web scraping with queue/retry
- Browser pooling
- Multi-agent orchestration (unified extension)

🚧 **In Progress:**
- WebSocket gateway
- Channel extensions

📋 **Next Priority:**
1. Multi-agent routing with isolated sessions
2. Streaming & chunking for responses
3. Discord bot integration
4. Hooks system

---

*Generated: $(date)*
*Research: OpenClaw features extraction via web_fetch*
