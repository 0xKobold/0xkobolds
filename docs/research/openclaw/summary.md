# OpenClaw Documentation Research Summary

Successfully extracted all OpenClaw documentation using improved web_fetch with:
- Queue-based processing (max 2 concurrent)
- Browser pooling (2min TTL)
- Retry logic (3 attempts with backoff)

## Pages Extracted

| Page | Status | Key Content |
|------|--------|-------------|
| Pi Integration | ✅ Complete | Package architecture, session lifecycle |
| Agent Runtime | ✅ Complete | Bootstrap files, skills system |
| Agent Loop | ✅ Complete | Hooks, streaming, queue modes |
| Sub-Agents | ✅ Complete | Thread bindings, spawn behavior |
| Multi-Agent Sandbox | ✅ Complete | Per-agent sandbox, tool restrictions |
| Agent Send | ✅ Complete | Direct agent runs |
| ACP Agents | ✅ Complete | Claude/Codex/Gemini CLI integration |
| System Prompt | ✅ Complete | Bootstrap injection structure |

## Key Findings for 0xKobold

### 1. Bootstrap File Pattern
OpenClaw uses these injected files:
- AGENTS.md - Operating instructions
- SOUL.md - Persona/tone
- TOOLS.md - Tool conventions
- IDENTITY.md - Agent identity
- USER.md - User profile
- HEARTBEAT.md - Check-in/reminders
- MEMORY.md - Context memory

### 2. Queue Modes
- **steer**: Interrupt mid-run
- **followup**: Queue for next turn
- **collect**: Batch with debounce

### 3. Sub-Agent Architecture
- Session format: `agent:<id>:subagent:<uuid>`
- Thread-bound sessions for Discord/Telegram
- Cost: each sub-agent has own context

### 4. Hooks System
- `before_model_resolve`
- `before_prompt_build`
- `before_tool_call`
- `tool_result_persist`
- `message_received/sent`

### 5. Sandbox Modes
- `off` - No sandbox
- `non-main` - Sandboxed for non-main
- `all` - All runs sandboxed

## Methodology

Tool: `web_fetch` with `use_playwright: true`
Config: 20s timeout, 8000 char limit
Browser: Playwright with pooling (pooled instances)
Performance: All pages fetched without hanging
