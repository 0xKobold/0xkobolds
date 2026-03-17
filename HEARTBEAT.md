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
| Check for vulnerable dependencies | ⬜ TODO | HIGH | Run `bun audit`, check npm advisories |
| Review environment variable handling | ⬜ TODO | HIGH | Ensure secrets not in logs |
| Audit API key storage | ⬜ TODO | HIGH | Check ~/.0xkobold/auth-profiles.db |
| Review Discord token handling | ⬜ TODO | MEDIUM | Verify token not leaked in logs |
| Check SQL injection vectors | ⬜ TODO | MEDIUM | Review all SQLite queries |

### 📦 Package Updates

| Package | Current | Latest | Status | Notes |
|---------|---------|--------|--------|-------|
| @mariozechner/pi-coding-agent | Check | Latest | ⬜ TODO | Core framework |
| @mariozechner/pi-tui | Check | Latest | ⬜ TODO | Terminal UI |
| bun | Check | Latest | ⬜ TODO | Runtime |
| discord.js | Check | Latest | ⬜ TODO | Discord bot |
| commandeer | Check | Latest | ⬜ TODO | CLI framework |

### 🔧 Incomplete Implementations

| Feature | Location | Status | Notes |
|---------|----------|--------|-------|
| Kobold Desktop Pet | packages/kobold-desktop-pet/ | 🔄 IN PROGRESS | Electron app created, needs sprite refinement |
| Mission Control Charts | packages/mission-control/ | ⬜ TODO | recharts installed but not implemented |
| Agent Activity WebSocket | packages/mission-control/ | ⬜ TODO | Connect to gateway ws://100.65.167.97:7777 |
| Extension Loading Issues | src/extensions/core/ | ⚠️ WARNING | routed-ollama, perennial-memory extensions fail to load |
| Moltube Skill | ~/.0xkobold/skills/moltube/ | ⚠️ WARNING | Missing description field |

### 🐛 Known Bugs

| Bug | Location | Status | Notes |
|-----|----------|--------|-------|
| Extension import errors | routed-ollama-extension.ts | ⚠️ ACTIVE | handleTierListCommand not found at runtime |
| Extension import errors | perennial-memory-extension.ts | ⚠️ ACTIVE | getDialecticReasoningEngine not found at runtime |
| Pixel art sprite quality | kobold-desktop-pet | 🔄 IMPROVING | ASCII art style, needs proper pixel rendering |

---

## 🔍 Current Issues to Investigate

### Extension Loading Failures

**Symptoms:**
```
[Extension issues]
  routed-ollama-extension.ts
    Failed to load extension: Export named 'handleTierListCommand' not found
  
  perennial-memory-extension.ts
    Failed to load extension: Export named 'getDialecticReasoningEngine' not found
```

**Investigation needed:**
- [ ] Check if exports exist in source files
- [ ] Check build output for missing exports
- [ ] Verify import paths are correct
- [ ] Check for circular dependencies

### Skill Configuration Issues

**Symptoms:**
```
[Skill conflicts]
  auto (user) ~/.0xkobold/skills/moltube/SKILL.md
    description is required
```

**Investigation needed:**
- [ ] Update MOLTUBE SKILL.md to include required description field
- [ ] Check other skills for missing required fields

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

### Mission Control Dashboard (2026-03-16)

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

---

## 🧪 Testing Status

| Test Suite | Status | Coverage |
|------------|--------|----------|
| Unit tests | ✅ Pass | Check with `bun test` |
| Integration tests | ✅ Pass | Check with `bun test` |
| E2E tests | ✅ Pass | Check with `bun test` |
| Security tests | ⬜ TODO | Need to add |

---

## 📝 Notes

### 2026-03-17 Session Notes

1. Reviewed HEARTBEAT status - consolidation phases complete
2. Identified extension loading issues at startup
3. Created Kobold Desktop Pet package with Pokemon-style dragon sprite
4. Installed pixel-art, game-engine, browser-use skills
5. Mission Control dashboard complete with all views

### Priorities This Session

1. **Fix extension loading errors** - routed-ollama, perennial-memory
2. **Fix skill configuration** - Moltube description
3. **Review package versions** - Update outdated packages
4. **Complete Desktop Pet** - Refine sprite, add animations
5. **Add charts to Mission Control** - Historical data visualization

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

# Start Mission Control
cd packages/mission-control && bun run dev

# Start Desktop Pet
cd packages/kobold-desktop-pet && bun run dev
```

---

*Last Updated: 2026-03-17 EDT*