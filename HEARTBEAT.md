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
| ~~@mariozechner/pi-coding-agent~~ | ~~0.57.1~~ → **0.61.1** | 0.61.1 | ✅ UPDATED | Core framework |
| ~~@mariozechner/pi-tui~~ | ~~0.57.1~~ → **0.61.1** | 0.61.1 | ✅ UPDATED | Terminal UI |
| ~~@mariozechner/pi-agent-core~~ | ~~0.57.1~~ → **0.61.1** | 0.61.1 | ✅ UPDATED | Agent core |
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
| **Community Analytics CLI** | src/cli/commands/community.ts | ✅ DONE | Enable/disable, sync, publish, link-eth, trust-stats, export, merge |
| **Wallet CLI** | src/cli/commands/wallet.ts | ✅ DONE | Status, import (key/mnemonic/address), address, chains, help-import |
| **Telemetry v2** | src/telemetry/ | ✅ DONE | Unified tracker: gateway, llm, session, skill, agent, storage, websocket, channel, cron, system |
| **DB SDK** | src/db/ | ✅ DONE | Unified DAOs: telemetry, cron, cross-DB queries |

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
- ~~Performance profiling~~ | ✅ DONE | Incremental builds: 22s → 7.3s (67% faster)
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

### 2026-03-21 Session Notes

26. **COMMUNITY ANALYTICS STRENGTHENING** - Enhanced spam protection in `src/llm/community-analytics.ts`:
    - Added reputation system with 8-point spam detection
    - Outlier filtering (Z-score >2.5 std dev)
    - Reputation-weighted contributions (max 30% influence per contributor)
    - Minimum thresholds: 3+ contributors, 3+ usage for inclusion
    - Trust scores calculated from: account age, validation ratio, model diversity, consistency

27. **ERC-8004 CRYPTECONOMIC BRIDGE** - Created `src/llm/erc8004-community-bridge.ts` (v2 - PRIVACY-PRESERVING):
    - Privacy-preserving: Nostr pubkey stays anonymous, no addresses published
    - Trust claims in Nostr tags: `['trust', 'gold'], ['verified', '1'], ['nonce', 'xyz']`
    - Server-side verification: claims verified against on-chain data without address exposure
    - Fraudulent claims detected and penalized (weight → 0.01)
    - Trust levels: none/bronze/silver/gold/platinum
    - Max weight capped at 35% per contributor
    - Configuration: `erc8004Enabled`, `erc8004MinTrust`, `erc8004Chain`

28. **COMMUNITY CLI COMMANDS** - Created `src/cli/commands/community.ts`:
    - `community enable [--erc8004] [--min-trust bronze]` - Enable sharing
    - `community disable` - Disable sharing
    - `community status` - Show status and trust level
    - `community sync [--nostr|--github]` - Sync from Nostr or GitHub
    - `community publish` - Publish stats to Nostr
    - `community link-eth <address>` - Link Ethereum address
    - `community trust-stats` - Show trust statistics
    - `community export` - Export for manual sharing
    - `community merge` - Show merged community + local stats

29. **WALLET CLI COMMANDS** - Created `src/cli/commands/wallet.ts`:
    - `wallet status` - Show current wallet config
    - `wallet import --type ethers --key 0x...` - Import from private key
    - `wallet import --type ethers --mnemonic "..."` - Import from recovery phrase
    - `wallet import --type readonly --address 0x...` - Read-only watch wallet
    - `wallet address` - Show active address
    - `wallet chains` - List supported chains

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

# Telemetry v2
bun run cli telemetry summary     # 7-day dashboard summary
bun run cli telemetry stats <metric>  # Detailed stats
bun run cli telemetry benchmark   # Generate anonymous payload
bun run cli telemetry cleanup     # Remove old data
bun run cli system health   # Detailed health check
bun run cli system diagnose "why is my agent slow?"  # Diagnose issues

# Twitch Integration (requires config in ~/.0xkobold/config.json)
# Add: "twitch": { "username": "BotName", "oauthToken": "oauth:xxx", "channels": ["#channel1"], "enabled": true }
bun run cli twitch:connect    # Connect to Twitch IRC
bun run cli twitch:disconnect # Disconnect from Twitch
bun run cli twitch:status     # Show connection status
bun run cli twitch:say channel="#channel" message="Hello!" # Send message

# Community Analytics (ERC-8004 privacy-preserving trust)
bun run cli community status        # Show sharing status and trust level
bun run cli community enable        # Enable anonymous stats sharing
bun run cli community enable --erc8004 --min-trust bronze  # Enable with ERC-8004
bun run cli community sync          # Sync from Nostr
bun run cli community publish       # Publish your stats to Nostr
bun run cli community link-eth 0x...  # Link Ethereum for trust
bun run cli community trust-stats   # View trust statistics
bun run cli community merge         # Show merged community + local stats

# Wallet Management
bun run cli wallet status          # Show wallet status
bun run cli wallet address         # Show active wallet address
bun run cli wallet import --type readonly --address 0x...  # Watch-only
bun run cli wallet chains          # List supported chains
bun run cli wallet help-import     # Show import guide

# In pi-coding-agent (for secure key import):
# /wallet-import --type ethers --key 0x...     # From private key
# /wallet-import --type ethers --mnemonic "..." # From recovery phrase

# DB SDK (new!)
bun run src/db/index.ts stats  # Cross-DB dashboard stats

# Telemetry History (new!)
bun run src/telemetry/cli.ts history   # Show system metrics history
```

---

## Note 30: Telemetry v2 + Collector (2026-03-22)

Telemetry v2 is integrated across key infrastructure components:

### Components Instrumented
- **Gateway** (`src/gateway/gateway-server.ts`): connect, disconnect, request (latency, method)
- **LLM Router** (`src/llm/multi-provider.ts`): request (latency, tokens, success, provider)
- **Sessions** (`src/sessions/SessionManager.ts`): create, resume, fork, complete
- **Skills** (`src/skills/framework.ts`): invoke, execution (duration, success)
- **Agents** (`src/agent/tools/spawn-agent.ts`): spawn (id, type, parentRunId)
- **Cron** (`src/cron/scheduler.ts`): job (name, job_id, cron_expression, triggered_by)

### TelemetryCollector (NEW!)
Centralized system monitoring with auto-polling:
- **Location:** `src/telemetry/collector.ts`
- **Wired to:** Gateway start/stop
- **Tracks:** Memory (heap, RSS, system %), CPU (load averages)
- **Interval:** 60s (configurable)
- **CLI:** `collector start|stop|poll|history`

### 10 Tracker Categories
gateway, llm, session, skill, agent, storage, websocket, channel, cron, system

### Cron Tracking Enhancements
- Added job_id, cron_expression, triggered_by metadata to cron events
- CLI now shows which cron job ran and whether manual/scheduled

---

## Note 31: DB SDK (2026-03-22)

Centralized database SDK unifying all 0xKobold databases:

### Structure
```
src/db/
  index.ts         # Main SDK export (db singleton)
  daos/
    telemetry.ts   # TelemetryDAO
    cron.ts        # CronDAO
  queries/
    index.ts      # Cross-DB queries
```

### Usage
```typescript
import { db } from './db';

// DAO access
db().telemetry().trackCronJob({ name: 'Moltx', duration: 1000 });
db().cron().getAllJobs();

// Cross-DB query
const perf = db().queries().cronJobPerformance(7);
const stats = db().queries().dashboardStats(7);
```

### Key Feature: Cross-DB Queries
```typescript
// Correlate cron job names with telemetry
const perf = db().queries().cronJobPerformance(7);
// Returns: name, job_id, total_runs, success_rate, avg_duration_ms, cron_expression

// Dashboard stats
const stats = db().queries().dashboardStats(7);
// Returns: total_events, by_category, by_success, top_events, avg_latency_by_category
```

### Status
- ✅ COMPLETE - Basic SDK with telemetry/cron DAOs and cross-DB queries

---

*Last Updated: 2026-03-22 EDT*
---
Check interval: 30m
Delivery target: none