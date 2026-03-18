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
| ~~Update pi-coding-agent~~ | ✅ DONE | HIGH | upgraded to 0.59.0 |
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
| ~~@mariozechner/pi-coding-agent~~ | ~~0.57.1~~ | 0.59.0 | ✅ UPDATED | Core framework |
| ~~@mariozechner/pi-tui~~ | ~~0.57.1~~ | 0.59.0 | ✅ UPDATED | Terminal UI |
| ~~@mariozechner/pi-agent-core~~ | ~~0.57.1~~ | 0.59.0 | ✅ UPDATED | Agent core |
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
| bun | Check | Latest | ⬜ TODO | Runtime |
| discord.js | 14.25.1 | 14.25.1 | ✅ LATEST | Already latest |

### 🔧 Incomplete Implementations

| Feature | Location | Status | Notes |
|---------|----------|--------|-------|
| Kobold Desktop Pet | packages/kobold-desktop-pet/ | 🔄 IN PROGRESS | Tests created, TypeScript compiles, needs sprite refinement |
| Agent Activity WebSocket | packages/mission-control/ | ⬜ TODO | Connect to gateway ws://100.65.167.97:7777 |
| **Tmux Terminal Node** | packages/tmux-terminal/ | 🆕 PHASE 1 DONE | Core implementation complete, needs Electron build fix |
| ~~Moltube Skill~~ | ~~~/.0xkobold/skills/moltube/~~ | ✅ FIXED | Description field now present in SKILL.md |

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
  "qs": "^6.14.1"
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

- [ ] Run `bun audit` to check for vulnerabilities
- [ ] Run `bun outdated` to check for updates
- [ ] Review logs for errors
- [ ] Check disk usage (~/.0xkobold/)

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

### Priorities Next Session

1. **WebSocket for Mission Control** - Real-time agent events from gateway
2. **Create systemd service** - Auto-start Mission Control on boot
3. **Tmux Terminal Node** - Fix Electron build, test with gateway
4. **Continue Desktop Pet** - Sprite refinement
5. **Fix Desktop Pet vitest** - Resolve test runner compatibility issue

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

# View metrics
cat ~/.0xkobold/metrics.json | jq . 
```

---

*Last Updated: 2026-03-17 EDT*
---
Check interval: 30m
Delivery target: none