# OpenClaw to 0xKobold Migration Guide

## Overview

This guide helps you migrate from **OpenClaw (koclaw)** to **0xKobold** with minimal data loss.

**What Gets Migrated:**
- ✅ Configuration (config.json)
- ✅ LLM API keys (with review markers)
- ✅ Device identity
- ✅ Agent configurations
- ✅ Database (copied, converted on first run)
- ⚠️ Discord tokens (need review)
- ⚠️ Remote gateway URLs (need review)

**What Doesn't Migrate:**
- ❌ Complex extension configurations
- ❌ Runtime state (active sessions)
- ❌ Temporary caches

---

## Quick Migration

### Step 1: Dry Run (Preview)

```bash
# Preview what will be migrated
0xkobold migrate --dry-run

# Or simply (default is dry-run):
0xkobold migrate
```

This shows:
- What configuration will be migrated
- Any warnings
- Missing items
- Required manual reviews

### Step 2: Review Output

Check the output for:
- ✅ Items that will migrate
- ⚠️ Warnings (needs manual review)
- ❌ Errors (fix before migrating)

### Step 3: Live Migration

```bash
# Apply the migration
0xkobold migrate --live

# Or with force (skip confirmation):
0xkobold migrate --force
```

---

## Migration by Component

### 1. Configuration Migration

**Source:** `~/.openclaw/openclaw.json`
**Target:** `~/.0xkobold/config.json`

**Migrated Fields:**
- Gateway port
- Agent settings (max concurrent, compaction)
- LLM provider selection
- Discord enablement flags
- Tailscale settings

**Needs Review:**
- API keys (marked with `[MIGRATED - REVIEW NEEDED]`)
- Remote gateway URLs
- Discord tokens

**After Migration:**
```bash
# Edit and verify
nano ~/.0xkobold/config.json
```

### 2. Database Migration

**Source:** `~/.openclaw/workspace/*.db`
**Target:** `~/.0xkobold/kobold.db`

**What Happens:**
1. Copy raw database files
2. Mark for conversion
3. Convert on first run

**Note:** Due to schema differences, some data may not transfer perfectly.

### 3. Agent Migration

**Source:** `~/.openclaw/agents/`
**Target:** `~/.0xkobold/agents/`

Agent configurations are copied as-is. Review for compatibility.

### 4. Identity Migration

**Source:** `~/.openclaw/identity/`
**Target:** `~/.0xkobold/devices/`

Device identity and tokens are migrated.

---

## Configuration Mapping

### OpenClaw → 0xKobold

| OpenClaw Setting | 0xKobold Setting | Notes |
|------------------|------------------|-------|
| `gateway.port` | `gateway.port` | Direct |
| `gateway.mode` | `gateway.host` | Converted |
| `gateway.auth.token` | `gateway.auth.token` | Needs review |
| `agents.defaults.maxConcurrent` | `agents.maxConcurrent` | Direct |
| `agents.defaults.compaction.mode` | `agents.compaction.mode` | Direct |
| `channels.discord.enabled` | `channels.discord.enabled` | Direct |
| `channels.discord.token` | `channels.discord.token` | Needs review |
| `auth.profiles.anthropic:*.token` | `llm.apiKey` | Needs review |
| `gateway.tailscale.mode` | `gateway.tailscale.enabled` | Direct |
| `gateway.remote.url` | `gateway.remote.url` | Needs review |

---

## Post-Migration Checklist

### Configuration

- [ ] Review `~/.0xkobold/config.json`
- [ ] Verify API keys are correct
- [ ] Check gateway port settings
- [ ] Review remote gateway URL if using
- [ ] Verify Discord token if enabled

### First Run

```bash
# Test the migration
0xkobold status

# Start TUI
0xkobold tui

# Test a simple command
0xkobold --version
```

### Verify Data

```bash
# Check database
ls -la ~/.0xkobold/*.db

# Check config
cat ~/.0xkobold/config.json | grep version

# Check agents
ls -la ~/.0xkobold/agents/
```

---

## Troubleshooting

### Migration Failed

```bash
# Check backup
ls -la ~/.0xkobold.backup.*

# Restore from backup
cp -r ~/.0xkobold.backup.1234567890 ~/.0xkobold
```

### Config Errors

```bash
# Reset to defaults
0xkobold init --force

# Re-run migration
0xkobold migrate --live
```

### Database Conversion Failed

```bash
# Check for errors
0xkobold logs

# Manual conversion
0xkobold doctor --fix-database
```

---

## Differences to Be Aware Of

### Feature Parity

| Feature | OpenClaw | 0xKobold | Status |
|---------|----------|----------|--------|
| Multi-channel | ✅ | ✅ | Similar |
| Docker sandbox | ✅ | ✅ | Similar |
| Tailscale | ✅ | ✅ | Similar |
| Device auth | ✅ | ✅ | Similar |
| Plugins | Extensive | Simplified | 0xKobold simpler |
| Mobile | ✅ | ❌ | Not in 0xKobold |
| Voice | ✅ | ⚠️ | Partial |

### Behavioral Changes

1. **Config Structure**
   - OpenClaw: Nested deeply
   - 0xKobold: Flatter, simpler

2. **Database**
   - OpenClaw: Multiple per workspace
   - 0xKobold: Single unified

3. **Agents**
   - OpenClaw: Complex registry
   - 0xKobold: Simpler skill system

4. **Extensions**
   - OpenClaw: Complex plugin system
   - 0xKobold: Built-in skills

---

## Manual Migration (Advanced)

If automatic migration doesn't work:

### Config Only

```bash
# Copy config
cp ~/.openclaw/openclaw.json ~/.0xkobold/config.json

# Transform manually
# See conversion guide above
```

### Database Only

```bash
# Copy database
cp ~/.openclaw/workspace/default.db ~/.0xkobold/kobold.db

# Schema will auto-convert
```

### Full Manual

```bash
# 1. Create fresh 0xKobold
0xkobold init

# 2. Copy specific files manually
cp ~/.openclaw/identity/device.json ~/.0xkobold/devices/
cp -r ~/.openclaw/agents/* ~/.0xkobold/agents/

# 3. Edit config to match
nano ~/.0xkobold/config.json
```

---

## Getting Help

### Check Logs

```bash
0xkobold logs

# Specific errors
grep ERROR ~/.0xkobold/logs/*.log
```

### Debug Mode

```bash
DEBUG=1 0xkobold migrate --dry-run
```

### Community

- Discord: discord.gg/0xkobold
- Issues: github.com/0xKobold/issues

---

## Migration Script

For automation, create `migrate.sh`:

```bash
#!/bin/bash
set -e

echo "🔄 OpenClaw → 0xKobold Migration"

# 1. Dry run
echo "Step 1: Preview..."
0xkobold migrate --dry-run

# 2. Confirm
read -p "Continue with live migration? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "Step 2: Migrating..."
  0xkobold migrate --live
  
  echo "Step 3: Testing..."
  0xkobold status
  
  echo "✅ Migration complete!"
else
  echo "❌ Aborted"
  exit 1
fi
```

---

## Summary

- **Use:** `0xkobold migrate --dry-run` first
- **Review:** Output carefully
- **Apply:** With `--live` when ready
- **Backup:** Automatic, but verify
- **Test:** After migration

**Most users should migrate successfully with minimal manual intervention.**
