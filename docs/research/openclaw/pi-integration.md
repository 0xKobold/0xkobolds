# OpenClaw Pi Integration Architecture

Extracted from: https://docs.openclaw.ai/pi
Method: Playwright (JavaScript rendering)
Date: $(date -I)

## Key Findings for 0xKobold Implementation

### 1. Package Dependencies
OpenClaw uses pi SDK packages:
- `@mariozechner/pi-agent-core`
- `@mariozechner/pi-ai`
- `@mariozechner/pi-coding-agent`
- `@mariozechner/pi-tui`

### 2. Session Architecture
- Uses `createAgentSession()` for embedded agents
- Direct import/integration (not subprocess/RPC)
- Full control over session lifecycle and events
- Custom tool injection support
- Session persistence with compaction

### 3. Workspace Structure
```
workspace/
├── AGENTS.md    # Operating instructions + memory
├── SOUL.md      # Persona, boundaries, tone
├── TOOLS.md     # Tool notes conventions
├── BOOTSTRAP.md # First-run ritual (auto-deleted)
├── IDENTITY.md  # Agent name/vibe/emoji
└── USER.md      # User profile + preferred address
```

### 4. Session Management
- Stored as JSONL: `~/.openclaw/agents/<agentId>/sessions/<SessionId>.jsonl`
- Queue modes: steer | followup | collect
- Block streaming configurable per channel

### 5. Tool Architecture
- Core tools (read/exec/edit/write) always available
- Custom tools via `createOpenClawCodingTools()`
- Tool policy: allowlist/denylist
- Channel-specific tool injection

### 6. Our Alignment
✅ Similar workspace structure with AGENTS.md/IDENTITY.md
✅ Session persistence with compaction
✅ Tool injection architecture
✅ Multi-provider model support

### 7. Areas to Improve
- Add queue modes (steer/followup/collect)
- Implement block streaming responses
- Add channel-specific tool policies
- Consider skills system
