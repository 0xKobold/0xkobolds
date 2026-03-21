# HEARTBEAT - 0xKobold Maintenance & Security Review

> Track package updates, security issues, incomplete implementations, and bugs

**Started:** 2026-03-17
**Owner:** Claude + moika

---

## 🎯 Project Overview

Maintain 0xKobold health: update packages, fix security vulnerabilities, complete incomplete implementations, and resolve bugs.

---

## 📋 Action Tasks

### 🔒 Security Issues (HIGH PRIORITY)

| Issue | Status | Severity | Notes |
|-------|--------|----------|-------|
| ~~Update vulnerable packages~~ | ✅ DONE | HIGH | Reduced from 21 → 4 vulnerabilities |
| ~~Update undici~~ | ✅ DONE | HIGH | Overrode to 7.24.4, fixes 6 CVEs |
| ~~Update file-type~~ | ✅ DONE | MEDIUM | Overrode to 21.3.1 |
| ~~Update fast-xml-parser~~ | ✅ DONE | MEDIUM | Overrode to 5.5.6 |
| ~~Update tough-cookie~~ | ✅ DONE | MEDIUM | Overrode to 4.1.4 |
| ~~Update qs~~ | ✅ DONE | MEDIUM | Overrode to 6.14.1 |
| ~~Update pi-coding-agent~~ | ✅ DONE | HIGH | Upgraded to 0.60.0 |
| ~~Update socket.io-parser~~ | ✅ DONE | HIGH | Overrode to 4.2.6, fixes binary attachment DoS |
| form-data (node-telegram-bot-api) | ⚠️ ACCEPT | CRITICAL | Deep dep, cannot override safely |
| music-metadata (baileys) | ⚠️ ACCEPT | HIGH | WhatsApp integration, deep dep |
| request (node-telegram-bot-api) | ⚠️ ACCEPT | MODERATE | Deep dep, cannot override safely |
| @mozilla/readability (pi-web-access) | ⚠️ ACCEPT | LOW | Deep dep, cannot override safely |
| ~~Review environment variable handling~~ | ✅ DONE | HIGH | No secrets logged to console |
| ~~Audit API key storage~~ | ✅ DONE | HIGH | DB empty, plaintext storage noted (MEDIUM risk) |
| ~~Review Discord token handling~~ | ✅ DONE | MEDIUM | Secure - only status messages logged |
| ~~Check SQL injection vectors~~ | ✅ DONE | MEDIUM | Minor LIKE pattern issues (LOW risk) |

### 📦 Package Updates

| Package | Current | Latest | Status | Notes |
|---------|---------|--------|--------|-------|
| ~~@mariozechner/pi-coding-agent~~ | ~~0.57.1~~ | 0.60.0 | ✅ UPDATED | Core framework |
| ~~@mariozechner/pi-tui~~ | ~~0.57.1~~ | 0.60.0 | ✅ UPDATED | Terminal UI |
| ~~@mariozechner/pi-agent-core~~ | ~~0.57.1~~ | 0.60.0 | ✅ UPDATED | Agent core |
| ~~undici~~ | ~~6.21.3~~ | 7.24.4 | ✅ OVERRIDDEN | Fixed 6 CVEs |
| ~~file-type~~ | ~~<21.3.1~~ | 21.3.1 | ✅ OVERRIDDEN | Fixed ASF/ZIP vulns |
| ~~fast-xml-parser~~ | ~~<=5.5.5~~ | 5.5.6 | ✅ OVERRIDDEN | Fixed entity expansion |
| ~~tough-cookie~~ | ~~<4.1.3~~ | 4.1.4 | ✅ OVERRIDDEN | Fixed prototype pollution |
| ~~qs~~ | ~~<6.14.1~~ | 6.14.1 | ✅ OVERRIDDEN | Fixed DoS vuln |
| ~~commander~~ | ~~11.1.0~~ | 14.0.3 | ✅ UPDATED | CLI framework |
| ~~glob~~ | ~~10.5.0~~ | 13.0.6 | ✅ UPDATED | File matching |
| ~~sharp~~ | ~~0.33.5~~ | 0.34.5 | ✅ UPDATED | Image processing |
| ~~zod~~ | ~~3.25.76~~ | 4.3.6 | ✅ UPDATED | Schema validation |
| ~~@types/node~~ | ~~20.19.37~~ | 25.5.0 | ✅ UPDATED | Dev types |
| bun | ~~1.3.10~~ | 1.3.11 | ✅ UPDATED | Runtime |
| discord.js | 14.25.1 | 14.25.1 | ✅ LATEST | Already latest |

### 🔧 Incomplete Implementations

| Feature | Location | Status | Notes |
|---------|----------|--------|-------|
| Kobold Desktop Pet | packages/kobold-desktop-pet/ | 🔄 IN PROGRESS | Tests created, TypeScript compiles, Phase 5 needs desktop-pet integration |
| ~~Agent Activity WebSocket~~ | packages/mission-control/ | ✅ DONE | useGateway hook wired to AgentActivityView, real-time events |
| ~~Tmux Terminal Node~~ | packages/tmux-terminal/ | ✅ WORKING | Node on Dasua connects to Pi gateway via Tailscale |
| ~~Moltube Skill~~ | ~~~/.0xkobold/skills/moltube/~~ | ✅ FIXED | Description field now present in SKILL.md |
| **Agent Body Interface** | src/body/ | ✅ INTEGRATED | All 5 phases + CLI + gateway wiring + WAL + Working Buffer |
| **Body State API** | packages/mission-control/api/body-state | ✅ DONE | GET /api/body-state endpoint |
| **System Monitor Skill** | src/skills/builtin/system-monitor.ts | ✅ DONE | Built-in health & diagnostics skill |
| **Orchestrate Skill** | src/skills/builtin/orchestrate.ts | ✅ DONE | Multi-agent orchestration strategies |
| **Twitch Extension** | src/extensions/core/twitch-extension.ts | ✅ DONE | Twitch IRC chat integration |

### 🐛 Known Bugs

| Bug | Location | Status | Notes |
|-----|----------|--------|-------|
| Pixel art sprite quality | kobold-desktop-pet | 🔄 IMPROVING | ASCII art style, needs proper pixel rendering |

### Recently Fixed (2026-03-17)

| Bug | Location | Fix |
|-----|----------|-----|
| Desktop Familiar infinite loop | kobold-desktop-pet/main.ts | Fixed `petNode` → `familiarNode` variable names |
| Uncleared intervals | kobold-desktop-pet | Added cleanup functions and interval tracking |
| App won't close on Ctrl+C | kobold-desktop-pet | Added proper quit handlers |
| Moltube SKILL.md missing description | ~/.0xkobold/skills/moltube/ | Description field added |
| TypeScript compilation errors | kobold-desktop-pet | Fixed `parseAnimationClips` and private `client` access |

---

## 🔍 Current Issues to Investigate

### ~~Skill Configuration Issues~~ ✅ RESOLVED

The Moltube skill now has the required `description` field in its SKILL.md frontmatter.

### Security Vulnerabilities (from `bun audit`)

**Resolved (17 vulnerabilities fixed):**
- ✅ `undici` 6.21.3 → 7.24.4 (fixed 6 WebSocket/memory CVEs)
- ✅ `file-type` <21.3.1 → 21.3.1 (fixed ASF/ZIP CVEs)
- ✅ `fast-xml-parser` ≤5.5.5 → 5.5.6 (fixed entity expansion)
- ✅ `tough-cookie` <4.1.3 → 4.1.4 (fixed prototype pollution)
- ✅ `qs` <6.14.1 → 6.14.1 (fixed DoS vuln)

**Accepted Risk (4 remaining - deep transitive deps):**
- ⚠️ `form-data` <2.5.4 (CRITICAL) - node-telegram-bot-api deep dep
- ⚠️ `music-metadata` ≤11.12.1 (HIGH) - baileys/WhatsApp deep dep
- ⚠️ `request` ≤2.88.2 (MODERATE) - node-telegram-bot-api deep dep
- ⚠️ `@mozilla/readability` <0.6.0 (LOW) - pi-web-access deep dep

**Override Configuration (package.json):**
```json
"overrides": {
  "undici": "^7.24.4",
  "file-type": "^21.3.1",
  "fast-xml-parser": "^5.5.6",
  "tough-cookie": "^4.1.4",
  "qs": "^6.14.1",
  "socket.io-parser": "^4.2.6"
}
```

---

## 📊 Recently Completed (Historical)

### Architecture Consolidation (2026-03-14)

| Phase | Status |
|-------|--------|
| Memory Consolidation | ✅ COMPLETE |
| Safety Extension | ✅ COMPLETE |
| Router Provider | ✅ COMPLETE |
| Event Cleanup | ✅ COMPLETE |
| Dialectic Memory | ✅ COMPLETE |

### Mission Control Dashboard (2026-03-16 to 2026-03-17)

| Feature | Status |
|---------|--------|
| SSE real-time stats | ✅ COMPLETE |
| Collapsible sidebar | ✅ COMPLETE |
| Network view | ✅ COMPLETE |
| Perennial browser | ✅ COMPLETE |
| Dialectic logs | ✅ COMPLETE |
| Sessions view | ✅ COMPLETE |
| Logs browser | ✅ COMPLETE |
| Alerts view | ✅ COMPLETE |
| Tasks (Kanban) | ✅ COMPLETE |
| Agent Activity | ✅ COMPLETE |
| Settings view | ✅ COMPLETE |
| UI component library | ✅ COMPLETE |
| **Historical Charts** | ✅ COMPLETE |
| **JSON Metrics Persistence** | ✅ COMPLETE |
| **Smart Task Search** | ✅ COMPLETE |
| **Advanced Task Filters** | ✅ COMPLETE |
| **Enhanced Agent Animations (10 states)** | ✅ COMPLETE |

### Extension Loading (2026-03-17)

| Issue | Status | Notes |
|-------|--------|-------|
| routed-ollama-extension | ✅ RESOLVED | Exports exist and load correctly |
| perennial-memory-extension | ✅ RESOLVED | Exports exist and load correctly |

---

## 🛠️ Maintenance Tasks

### Weekly Tasks

- [x] Run `bun audit` to check for vulnerabilities
- [x] Run `bun outdated` to check for updates
- [x] Review logs for errors
- [x] Check disk usage (~/.0xkobold/)

### Monthly Tasks

- [ ] Update all dependencies
- [ ] Review security advisories
- [ ] Clean up old session data
- [ ] Backup databases

### Quarterly Tasks

- [ ] Full security audit
- [ ] Performance profiling
- [ ] Dependency cleanup (remove unused)
- [ ] Update documentation

---

## 📁 Key File Locations

### Configuration Files
- `~/.0xkobold/config.json` - Main configuration
- `~/.0xkobold/agents.db` - Agent registry
- `~/.0xkobold/sessions.db` - Session history
- `~/.0xkobold/tasks.db` - Kanban tasks
- `~/.0xkobold/metrics.json` - Historical system metrics (NEW)

### Extension Files
- `src/extensions/core/` - Core extensions
- `src/pi-config.ts` - Extension registration

### Skill Files
- `skills/` - Project-level skills
- `~/.0xkobold/skills/` - Global skills
- `~/.agents/skills/` - Agent skills

### Database Files
- `~/.0xkobold/dialectic/dialectic.db` - Dialectic reasoning
- `~/.0xkobold/memory/perennial/knowledge.db` - Perennial memory

### Twitch Integration
- `src/twitch/irc-client.ts` - Twitch IRC client
- `src/twitch/config.ts` - Configuration loading
- `src/extensions/core/twitch-extension.ts` - Extension
- `~/.0xkobold/config.json` - Twitch config (add `"twitch": {...}`)

### Dashboard Files
- `packages/mission-control/` - Mission Control dashboard
- `packages/mission-control/src/lib/metrics-db.ts` - Metrics storage
- `packages/mission-control/src/components/dashboard/` - UI components

---

## 🧪 Testing Status

| Test Suite | Status | Coverage |
|------------|--------|----------|
| Unit tests | ✅ Pass | Check with `bun test` |
| Integration tests | ✅ Pass | Check with `bun test` |
| E2E tests | ✅ Pass | Check with `bun test` |
| Security tests | ⬜ TODO | Need to add |
| Kobold Desktop Pet tests | ⚠️ Created | TypeScript compiles, vitest compatibility issue |
| Build | ✅ Pass | `bun run build` succeeds after security updates |

---

## 📝 Notes

### 2026-03-17 Session Notes

1. Reviewed HEARTBEAT status - consolidation phases complete
2. Identified extension loading issues at startup - NOW RESOLVED
3. Created Kobold Desktop Pet package with Pokemon-style dragon sprite
4. Installed pixel-art, game-engine, browser-use skills
5. Mission Control dashboard complete with all views
6. **Added historical charts** - recharts with 1min/10min/1hr/1day ranges
7. **Implemented metrics persistence** - JSON file at ~/.0xkobold/metrics.json
8. **Enhanced agent animations** - 10 states (idle, working, thinking, processing, sleeping, typing, reading, executing, error, success)
9. **Added smart task search** - Natural language parsing for "high priority tasks from yesterday"
10. **Added advanced filters** - Status, priority, date range filtering
11. Installed `jq` for better JSON parsing in shell commands
12. **Fixed Desktop Pet TypeScript errors** - parseAnimationClips, private client access
13. **Created Desktop Pet test suite** - Unit, integration, e2e tests (vitest has compatibility issue)
14. **Ran security audit** - Found 21 vulnerabilities (1 critical, 8 high)
15. **Checked package updates** - pi-coding-agent, commander, zod need updating
16. **SECURITY FIXES** - Upgraded packages, added overrides, reduced from 21 → 4 vulnerabilities
17. **PACKAGE UPDATES** - Updated all packages: commander 14.0.3, glob 13.0.6, sharp 0.34.5, zod 4.3.6, @types/node 25.5.0
18. **TMUX TERMINAL NODE** - Created new package with TmuxManager, TmuxNode, Electron app. Core implementation complete.
19. **SECURITY AUDIT** - Reviewed env vars, API key storage, Discord tokens, SQL injection. All clean except plaintext key storage.
20. **AGENT ACTIVITY WEBSOCKET** - Wired useGateway hook to AgentActivityView for real-time agent events. Added connection status.
21. **TMUX TERMINAL ON PI** - Node runs on Dasua (100.75.97.120), connects to Pi gateway (100.65.167.97:7777) via Tailscale. Fixed WebSocket URL format.
22. **AGENT BODY INTERFACE** - Implemented all 5 phases:
    - Phase 1: Sensors (CPU temp, load, memory, disk, network, uptime) + platform detection
    - Phase 2: Gateway integration - broadcasts body-state every 30s
    - Phase 3: Proactive messaging - daily reflection, morning briefing, health alerts
    - Phase 4: Environment scanner - Tailscale peers, services, temporal awareness
    - Phase 5: CLI commands (`body health`, `body feel`, `body scan`, `body sensors`, `body platform`)
    - Integrated into CLI (`src/cli/program.ts`) and gateway startup (`src/index.ts`)
    - Created `/api/body-state` endpoint for Mission Control
    - Works on Raspberry Pi: 56.75°C CPU, 2.14 load, 75.4% memory, 2d 6h uptime
23. **BUILTIN SKILLS ADDED** - Created `system-monitor` and `orchestrate` skills:
    - `system-monitor`: Health checks, diagnostics, metrics, logs, actions (restart, cleanup)
    - `orchestrate`: Multi-agent strategies (research swarm, epic parallel build, sequential pipeline, parallel sweep, multi-dimensional audit, full lifecycle)
24. **WAL PROTOCOL & WORKING BUFFER** - Integrated proactive-agent patterns into Agent Body:
    - Write-Ahead Logging: Critical information logged before responding
    - Working Buffer: Captures exchanges during context transitions
    - Compaction Recovery: Recovery procedures after context loss
25. **TWITCH INTEGRATION** - Created Twitch IRC extension:
    - `src/twitch/irc-client.ts` - Twitch IRC client with rate limiting
    - `src/twitch/config.ts` - Configuration loading and validation
    - `src/extensions/core/twitch-extension.ts` - 0xKobold extension
    - Commands: `twitch:connect`, `twitch:disconnect`, `twitch:say`, `twitch:status`
    - Tools: `twitch_say`, `twitch_whisper`, `twitch_status` for agent use
    - Rate limited (20 msg/30s for non-mod, 100/30s for mods)
    - Event bus integration for messages, whispers, commands

### Priorities Next Session

1. **Create systemd service** - Auto-start Mission Control on boot
2. **Tmux Terminal on Dasua** - Run `connect-dasua.ts` to connect to Pi gateway
3. **Continue Desktop Pet** - Sprite refinement
4. **Fix Desktop Pet vitest** - Resolve test runner compatibility issue

### Open Questions

1. Should we migrate extension loading to ESM?
2. Do we need to pin dependency versions for stability?
3. Should Desktop Pet be a separate npm package?

---

## 🚀 Quick Reference Commands

```bash
# Security audit
bun audit

# Check outdated packages
bun outdated

# Update all packages
bun update

# Run tests
bun test

# Type check
bun run build

# Start development
bun run start

# Start Mission Control (production)
cd packages/mission-control && ./mc.sh start

# Start Mission Control (development)
cd packages/mission-control && ./mc.sh dev

# Check Mission Control status
cd packages/mission-control && ./mc.sh status

# Start Desktop Pet
cd packages/kobold-desktop-pet && bun run dev

# Test Tmux Terminal on Pi (connects to Dasua gateway)
cd packages/tmux-terminal && bun run src/cli.ts test

# Run Tmux Terminal Node on Pi
cd packages/tmux-terminal && GATEWAY_URL=ws://100.65.167.97:7777 bun run connect-pi.ts

# View metrics
cat ~/.0xkobold/metrics.json | jq . 

# Agent Body Commands
bun run cli body health    # Check system health
bun run cli body feel       # Interpret current state as mood
bun run cli body scan       # Scan environment (peers, services)
bun run cli body sensors    # List available sensors
bun run cli body platform   # Show platform information

# System Monitor Skill (builtin)
bun run cli system status   # Overview of all systems
bun run cli system health   # Detailed health check
bun run cli system diagnose "why is my agent slow?"  # Diagnose issues

# Twitch Integration (requires config in ~/.0xkobold/config.json)
# Add: "twitch": { "username": "BotName", "oauthToken": "oauth:xxx", "channels": ["#channel1"], "enabled": true }
bun run cli twitch:connect    # Connect to Twitch IRC
bun run cli twitch:disconnect # Disconnect from Twitch
bun run cli twitch:status     # Show connection status
bun run cli twitch:say channel="#channel" message="Hello!" # Send message
```

---

*Last Updated: 2026-03-18 EDT*
---
Check interval: 30m
Delivery target: none