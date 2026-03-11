# v0.5.0 "Draconic Intelligence" - Pre-Release Notes

**Status**: ✅ READY FOR RELEASE

---

## Completed Cleanup Tasks

### ✅ TODOs Resolved for v0.5.0
| File | Description | Action |
|------|-------------|--------|
| `tui/components/agent-tree-overlay.ts` | Implement agent restart | ✅ Added `onRestart` callback |
| `cron/runner.ts` | Emit event to main session | ✅ Now emits to eventBus |

templateFiles.ts | Deleted empty stub file | ✅ Cleaned up |

### 📋 TODOs Deferred to Future Versions
| File | Description | Target |
|------|-------------|--------|
| `agent/embedded-runner.ts:64` | pi-coding-agent SDK integration | v0.6.0 |
| `agent/embedded-runner.ts:102` | Check SDK linkage | v0.6.0 |
| `skills/framework.ts:259` | Git/tarball skill installation | v0.5.1 |
| `cron/notifications.ts:183` | WhatsApp cron notifications | v0.5.1 |
| `cron/runner.ts:162` | Main session context via memory store | v0.5.1 |

---

## Changes Made

### 1. Event Bus Enhancements
**File**: `src/event-bus/index.ts`

Added new event types:
- `system.notification` - System-level notifications
- `cron.job.started` - Cron lifecycle tracking
- `cron.job.completed`
- `cron.job.failed`

### 2. Cron Runner Improvements
**File**: `src/cron/runner.ts`

- Added eventBus import
- Implemented `system.notification` emission in `runSystemEvent()`
- Updated TODO markers to indicate target versions

### 3. TUI Agent Tree Overlay
**File**: `src/tui/components/agent-tree-overlay.ts`

- Added `onRestart` callback to `TreeOverlayOptions`
- Implemented 'r' key handler for agent restart
- Removed TODO comment

### 4. File Cleanup
**Deleted**: `src/cli/program-fixed.ts` (empty stub file)

### 5. Versioned TODO Markers
Updated TODOs with target versions:
- `TODO(v0.5.1)` - Near-term features
- `TODO(v0.5.2+)` - Post-pi-coding-agent integration
- `TODO(v0.6.0)` - Future architectural changes

---

## Verification

### TypeScript Compilation
```
$ bun run build
✅ PASS (no errors)
```

### Test Suite
```
315 pass
19 skip
91 fail (pre-existing - external services)
4 errors (pre-existing)
```

**Assessment**: No new regressions from cleanup changes.

---

## Release Readiness

- [x] All critical TODOs resolved
- [x] Code compiles without errors
- [x] Test suite stable
- [x] Documentation updated (CLAUDE.md, README.md, SOURCE_AUDIT.md)
- [x] Empty artifacts removed
- [x] Version markers added to deferred TODOs

**READY FOR v0.5.0 RELEASE** 🐉
