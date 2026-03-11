# Root Shell Script Audit

**Total Scripts**: 15 shell scripts (3 in root, 12 in scripts/)  
**Audit Date**: 2026-03-11

---

## 📁 Scripts in Root (3 files)

### KEEP - Essential Runtime

| File | Status | Purpose |
|------|--------|---------|
| `demo-multi-agent.sh` | ✅ KEEP | Demo script for multi-agent system (launches gateway + TUI) |
| `demo-openclaw.sh` | ⚠️ QUESTION | Demo for OpenClaw-style TUI - **Is this still relevant?** |
| `launch.sh` | ✅ KEEP | Production launcher (starts gateway + TUI automatically) |

### Recommendation
- **demo-openclaw.sh** - Consider archiving if OpenClaw migration is complete

---

## 📁 Scripts in scripts/ (12 files)

### ✅ KEEP - Essential

| File | Purpose | Notes |
|------|---------|-------|
| `deploy-vps.sh` | VPS deployment with Tailscale | Production deployment script, well-documented |
| `install.sh` | Global npm install | Simple installer, references `0xkobold` globally |
| `install-hooks.sh` | Git hooks for code quality | pre-commit, pre-push, commit-msg validation |
| `migrate-from-openclaw.sh` | Migration script | Comprehensive migration from OpenClaw (12KB) |
| `test-agent-spawn.sh` | Gateway/agent testing | Manual test instructions for agent system |

### ⚠️ REVIEW - May Be Outdated

| File | Purpose | Action |
|------|---------|--------|
| `test-unified-agents.sh` | Test unified agent spawn | **Verify if unified agents still exist** |
| `cleanup-dead-code.sh` | Dead code cleanup | **One-time script, may be done** |
| `cleanup-old-code.sh` | Old code cleanup | **One-time script, may be done** |
| `diagnose-freezing.sh` | Diagnose TUI freezing | **Check if issue still exists** |
| `link-pi-extensions.js` | Link PI community extensions | **May be part of install process now** |

### 📝 Non-Executable Support Files

| File | Type | Purpose |
|------|------|---------|
| `postinstall.js` | JS | npm postinstall hook |
| `minimal-config.ts` | TS | Minimal configuration template |
| `scrape-openclaw.py` | Python | OpenClaw scraper for migration |
| `cloud-init.yaml` | YAML | VPS cloud-init configuration |

---

## 📊 Recommendations

### 1. Root Scripts (./)
```bash
# KEEP:
./demo-multi-agent.sh
./launch.sh

# REVIEW - Consider archive/:
./demo-openclaw.sh  # If OpenClaw migration complete
```

### 2. Scripts Directory Cleanup
```bash
# Archive one-time scripts (if cleanup complete):
git mv scripts/cleanup-dead-code.sh docs/archive/scripts/
git mv scripts/cleanup-old-code.sh docs/archive/scripts/

# Archive if unified agents deprecated:
git mv scripts/test-unified-agents.sh docs/archive/scripts/

# Keep (essential):
scripts/deploy-vps.sh
scripts/install.sh
scripts/install-hooks.sh
scripts/migrate-from-openclaw.sh
scripts/test-agent-spawn.sh
```

### 3. Delete If Safe
```bash
# Remove if freezing is fixed:
scripts/diagnose-freezing.sh

# Remove if postinstall handles this:
scripts/link-pi-extensions.js
```

---

## ⚡ Quick Fix

```bash
# Create archive directory for scripts
mkdir -p docs/archive/scripts

# Move outdated scripts
git mv scripts/cleanup-*.sh docs/archive/scripts/ 2>/dev/null || true

# Keep only essential scripts
# Essential: deploy-vps.sh, install.sh, install-hooks.sh, migrate-from-openclaw.sh
# Testing: test-agent-spawn.sh (verify unified-agents still needed)
```

---

## 🎯 Summary

| Category | Count | Action |
|----------|-------|--------|
| Keep | 7 | Essential runtime, deployment, migration |
| Archive | 3 | One-time cleanup/migration scripts |
| Review | 2 | May need updates or deletion |
| Support Files | 4 | JS/TS/Python/YAML helpers |

**Estimated cleanup**: Move 3-4 scripts to archive
