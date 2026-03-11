# Cleanup: Unified Sessions Migration

## 🧹 What Was Removed

### Removed Extensions

| Extension | Lines | Why Removed | Replacement |
|-----------|-------|-------------|-------------|
| `session-manager-extension.ts` | 395 | Fragmented, 0B DB | `UnifiedSessionBridge.ts` |
| `session-bridge-extension.ts` | ~150 | Unstable IDs | `UnifiedSessionBridge.ts` |
| `mode-manager-extension.ts` | 630 | Unwanted complexity | **Natural workflow** |
| `context-aware-extension.ts` | TBD | Superseded | Unified session context |
| `session-name-extension.ts` | TBD | Redundant | Unified session naming |
| `handoff-extension.ts` | TBD | Superseded | `session_fork` in unified |

**Total removed: ~1,500+ lines of dead code**

---

## 🎯 Why Mode Manager Was Removed

### Problems with Plan/Build Mode:

1. **Artificial Constraints**
   ```typescript
   // Blocking bash commands with regex - fragile!
   BLOCKED_BASH_COMMANDS = [
     "rm", "mv", "cp", "git add", 
     // What about "git\tadd" or "GIT ADD"?
   ];
   ```

2. **Complexity Without Value**
   - System prompt injection
   - Command filtering overhead
   - Mode state management
   - F2 keybinding for toggle

3. **Wrong Abstraction**
   - AI should decide what's appropriate
   - User should approve destructive actions individually
   - Not based on artificial "mode"

4. **Technical Debt**
   - Custom mode JSON configs
   - Mode migration logic
   - Tool restriction system

### What Replaces It:

**Natural Workflow:**
```
User: "Analyze the codebase"
AI: "I'll explore the code..." ✅ (reads - safe)

User: "Now refactor it"  
AI: "I'll make these changes: [list]"
     "Approve? (y/n)"
User: y
AI: Makes changes ✅ (writes - approved)
```

**Existing safety extensions handle this better:**
- `confirm-destructive.ts` - Asks for approval
- `dirty-repo-guard.ts` - Prevents data loss
- `protected-paths.ts` - Blocks system files
- Git checkpointing for rollback

---

## ✅ New System Benefits

### Unified Session Bridge (Replaces 3 Extensions)

| Feature | Old | New |
|---------|-----|-----|
| Session ID | `kobold-${timestamp}-${hash}` ❌ | `kobold-${sha256}` ✅ |
| On restart | New ID, orphans | Same ID, restores |
| Persistence | 0B sessions.db | Full `sessions.db` |
| Hierarchy | None | Parent/child trees |
| Snapshots | Manual | Auto + manual |

### Key Capabilities

```typescript
// Stable ID - survives restarts
const unifiedId = getCurrentUnifiedSessionId(); 
// kobold-a1b2c3d4e5f6... (same forever)

// Resume from anywhere
await sessionManager.resumeSession(unifiedId);

// Automatic snapshots every 5 min
await sessionManager.createSnapshot("checkpoint");

// Full session tree
await sessionManager.getSessionTree(rootId);
// Shows: parent → children → grandchildren
```

---

## 🔧 Configuration Changes

### Keybindings Removed
```diff
- 'f2': 'toggle_mode',     // REMOVED
+ 'f2': 'toggle_tree',     // Still useful!

+ 'ctrl+s': 'session_snapshot',  // NEW
+ 'ctrl+r': 'resume_session',   // NEW
```

### Extensions Removed (from pi-config.ts)
```diff
- './src/extensions/core/session-bridge-extension.ts',
- './src/extensions/core/session-manager-extension.ts',
- './src/extensions/core/mode-manager-extension.ts',
- './src/extensions/core/context-aware-extension.ts',
- './src/extensions/core/session-name-extension.ts',
- './src/extensions/core/handoff-extension.ts',

+ './src/sessions/UnifiedSessionBridge.ts',
```

### Settings Added
```typescript
'0xkobold.sessions.enabled': true,
'0xkobold.sessions.autoResume': true,
'0xkobold.sessions.resumeMaxAgeHours': 168,
'0xkobold.agents.persist': true,  // Agents survive restarts!
```

---

## 🧪 Verification Steps

After cleanup, verify:

### 1. Build Clean
```bash
cd ~/Documents/code/0xKobolds
bun run build
# Should complete without errors
```

### 2. Session Stability
```bash
# Start
0xkobold
> /session
# Note unified ID: kobold-a1b2c3d4...

# Restart
Ctrl+C
0xkobold
> /session
# SAME ID: kobold-a1b2c3d4... ✅
```

### 3. Agents Persist
```bash
0xkobold
> /agent:spawn coordinator "test"
# Spawn agent

Ctrl+C
0xkobold
> /agent:resume all
# Agent restores ✅
```

### 4. No Mode Manager Conflicts
```bash
> # Mode commands removed:
> /mode  # Should fail gracefully or not exist
> /modes # Should not exist
> 
> # These still work:
> /session      # Show unified session
> /sessions     # List all sessions  
> /session-tree # Show hierarchy
```

---

## 🗄️ Data Migration

### What Happens to Old Data?

**Sessions in `sessions.db`:**
- Old: `~/.0xkobold/sessions.db` was 0 bytes (empty)
- Action: Safe to delete if migrating fresh

**Conversations in `kobold.db`:**
- Old: Referenced `session_id` (timestamp-based)
- New: Still accessible but orphaned
- Action: Optionally migrate via script

**Tasks in `tasks.db`:**
- Old: Referenced `session_id`
- New: Can be linked to unified session
- Action: Run cleanup script

**Agents in `agents-runtime.db`:**
- Old: Referenced `session_key`
- New: Link to `unified_session_id`
- Action: Auto-migration on first run

### Migration Script

Run this ONCE after updating:

```bash
cd ~/Documents/code/0xKobolds
cp src/pi-config.ts src/pi-config.ts.backup
# Edit pi-config.ts with new extension list

bun run build
bun run start

# In 0xKobold:
> /session
# Verify unified session created

> /sessions  
# See migrated sessions from old DBs
```

---

## 🚨 Rollback Plan

If issues arise:

1. **Restore old config:**
   ```bash
   cp src/pi-config.ts.backup src/pi-config.ts
   ```

2. **Restore deleted extensions:**
   ```bash
   git checkout src/extensions/core/session-manager-extension.ts
   git checkout src/extensions/core/session-bridge-extension.ts
   git checkout src/extensions/core/mode-manager-extension.ts
   # etc.
   ```

3. **Rebuild:**
   ```bash
   bun run build
   bun run start
   ```

---

## 📊 Code Reduction

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Extensions | 20+ | 15 | -5 |
| Session files | 4 | 1 | -3 |
| Lines of code | ~4k | ~2k | -2k |
| Database files | 5+ | Unified | Simpler |
| Config complexity | High | Low | ✓ |

---

## ✅ Cleanup Checklist

- [ ] Update `src/pi-config.ts`
- [ ] Remove old extension files
- [ ] Update keybindings
- [ ] Build and test
- [ ] Verify unified sessions
- [ ] Test agent persistence
- [ ] Update documentation
- [ ] Clean build artifacts
- [ ] Delete backup if all works

---

## 💡 Philosophy Change

### Before (Mode-Manager)
```
User: "Plan mode"
System: "I can only read"
User: "Build mode"  
System: "I can write"
# Artificial, restrictive
```

### After (Natural Flow)
```
User: "Analyze the code"
AI: "I'll read and understand..."
# Uses context to determine appropriate tools

User: "Now fix it"
AI: "Here are the changes: [diff]"
     "Approve?"
# Destructive = explicit approval
```

**The AI should be intelligent enough to choose appropriate actions based on context, not be constrained by artificial modes.**

---

## 📚 References

- `UNIFIED-SESSIONS.md` - Full architecture
- `AGENT-PERSISTENCE-IMPLEMENTATION.md` - Agent persistence
- `src/sessions/index.ts` - Module exports
- `src/pi-config.ts` - Clean configuration
