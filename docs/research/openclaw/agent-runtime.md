# OpenClaw Agent Runtime

Extracted from: https://docs.openclaw.ai/concepts/agent
Method: Playwright (JavaScript rendering)
Date: $(date -I)

## Agent Runtime Features

### Bootstrap Files (Injected on First Turn)
1. **AGENTS.md** - Operating instructions + memory
2. **SOUL.md** - Persona, boundaries, tone
3. **TOOLS.md** - User-maintained tool notes
4. **BOOTSTRAP.md** - One-time first-run ritual (deleted after)
5. **IDENTITY.md** - Agent name/vibe/emoji
6. **USER.md** - User profile + preferred address

### Skills System
Loads from 3 locations (workspace wins on conflict):
- Bundled (shipped with install)
- Managed/local: ~/.openclaw/skills
- Workspace: <workspace>/skills

### pi-mono Integration Notes
- Reuses pi-mono models/tools
- OpenClaw owns session management and tool wiring
- No ~/.pi/agent settings consulted
- No separate pi-coding agent runtime

### Session Storage
- Format: JSONL at ~/.openclaw/agents/<agentId>/sessions/<SessionId>.jsonl
- Stable session ID chosen by OpenClaw

### Steering While Streaming
Three queue modes:
- **steer**: Inject mid-run, skip remaining tool calls
- **followup**: Hold until turn ends
- **collect**: Hold with debounce/cap

### Block Streaming
- Off by default
- Configurable: text_end vs message_end
- Chunk: 800-1200 chars
- Requires explicit *.blockStreaming: true

## Comparison with 0xKobold

| Feature | OpenClaw | 0xKobold |
|---------|----------|----------|
| Bootstrap files | ✅ JSONL | ✅ AGENTS.md |
| Skills | ✅ Multi-source | ✅ Extensions |
| Queue modes | ✅ steer/followup/collect | ❌ Not yet |
| Block streaming | ✅ Per-channel | ❌ Not yet |
| Session format | JSONL | In-memory + perennial |
