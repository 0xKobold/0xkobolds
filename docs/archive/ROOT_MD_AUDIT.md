# Root Markdown File Audit

**Total Files**: 33 markdown files  
**Total Size**: ~150KB  
**Audit Date**: 2026-03-11

---

## 📋 CATEGORIZATION

### ✅ KEEP (Essential Documentation)

| File | Size | Purpose | Reason |
|------|------|---------|--------|
| `README.md` | 15KB | Main project documentation | Required for GitHub/repo |
| `CLAUDE.md` | 12KB | Claude Code context | Essential for AI assistance |
| `CHANGELOG.md` | 3KB | Version history | Standard practice |
| `HEARTBEAT.md` | 5KB | Current session status | Active tracking file |
| `IDENTITY.md` | 250B | Project identity | Used by system |
| `SOUL.md` | 507B | Project soul/personality | Used by system |

**Total Keep**: 6 files (~36KB)

---

### 📦 ARCHIVE (Historical / Reference)

| File | Size | Category | Action |
|------|------|----------|--------|
| `AGENT-PERSISTENCE-PLAN.md` | 12KB | Planning | Move to docs/archive/ |
| `AGENT-PERSISTENCE-IMPLEMENTATION.md` | 5KB | Implementation notes | Move to docs/archive/ |
| `AGENT-SPAWN-IMPLEMENTATION.md` | 12KB | Implementation notes | Move to docs/archive/ |
| `CLEANUP-FINAL.md` | 3KB | Cleanup notes | Move to docs/archive/ |
| `CLEANUP-SUCCESS.md` | 7KB | Cleanup notes | Move to docs/archive/ |
| `CLEANUP-UNIFIED-SESSIONS.md` | 7KB | Cleanup notes | Move to docs/archive/ |
| `COMPACTION-FIX.md` | 4KB | Bug fix notes | Move to docs/archive/ |
| `DRACONIC_IMPLEMENTATION_COMPLETE.md` | 11KB | Implementation notes | Move to docs/archive/ |
| `DRACONIC_SUPERIORITY_MANIFESTO.md` | 6KB | Design philosophy | Move to docs/archive/ |
| `DRACONIC_SUPERIORITY_PLAN.md` | 13KB | Planning | Move to docs/archive/ |
| `EXTENSION_AUDIT.md` | 7KB | Audit notes | Move to docs/archive/ |
| `OLLAMA-CONSOLIDATION.md` | 5KB | Implementation notes | Move to docs/archive/ |
| `OPENCLAW_EMBEDDED_RUNNER_RESEARCH.md` | 9KB | Research notes | Move to docs/archive/ or docs/research/ |
| `PUBLISH-CHECKLIST.md` | 3KB | Release checklist | Move to docs/archive/ |
| `RELEASE-v0.2.0.md` | 4KB | Release notes | Move to docs/releases/ |
| `REMOTE-GATEWAY-STATUS.md` | 4KB | Status notes | Move to docs/archive/ |
| `ROADMAP.md` | 17KB | Main roadmap | **MERGE** into ROADMAP.md, archive old |
| `ROADMAP-OPENCLAW-FEATURES.md` | 8KB | Feature roadmap | Move to docs/archive/ |
| `ROADMAP-v0.2.0.md` | 4KB | Version roadmap | Move to docs/archive/ |
| `ROADMAP-v0.3.0.md` | 5KB | Version roadmap | Move to docs/archive/ |
| `SESSION-SUMMARY-2026-03-10.md` | 5KB | Session notes | Move to docs/archive/sessions/ |
| `TESTING_GUIDE.md` | 14KB | Testing documentation | **MOVE** to docs/testing.md |
| `TEST-RESULTS.md` | 6KB | Test results | Move to docs/archive/ |
| `UNIFIED-AGENT-SPAWN.md` | 6KB | Implementation notes | Move to docs/archive/ |
| `UNIFIED-CONFIG.md` | 4KB | Implementation notes | Move to docs/archive/ |
| `UNIFIED-SESSION-INTEGRATION.md` | 6KB | Implementation notes | Move to docs/archive/ |
| `UNIFIED-SESSIONS.md` | 10KB | Implementation notes | Move to docs/archive/ |
| `USAGE.md` | 4KB | Usage guide | **MOVE** to docs/usage.md |
| `WORKFLOW.md` | 5KB | Workflow documentation | **MOVE** to docs/workflow.md |

**Total Archive**: 27 files (~114KB)

---

## 🎯 RECOMMENDED ACTIONS

### 1. Create Directory Structure
```bash
mkdir -p docs/archive docs/releases docs/research
```

### 2. Safe Cleanup Commands

```bash
# Move to archive
git mv AGENT-PERSISTENCE-PLAN.md docs/archive/
git mv AGENT-PERSISTENCE-IMPLEMENTATION.md docs/archive/
git mv AGENT-SPAWN-IMPLEMENTATION.md docs/archive/
git mv CLEANUP-*.md docs/archive/
git mv COMPACTION-FIX.md docs/archive/
git mv DRACONIC_*.md docs/archive/
git mv EXTENSION_AUDIT.md docs/archive/
git mv OLLAMA-CONSOLIDATION.md docs/archive/
git mv PUBLISH-CHECKLIST.md docs/archive/
git mv RELEASE-*.md docs/releases/
git mv REMOTE-GATEWAY-STATUS.md docs/archive/
git mv ROADMAP-*-*.md docs/archive/
git mv SESSION-SUMMARY-*.md docs/archive/
git mv TEST-RESULTS.md docs/archive/
git mv UNIFIED-*.md docs/archive/
```

### 3. Move to docs/ (Living Documentation)
```bash
# Move active docs to docs/
git mv TESTING_GUIDE.md docs/testing.md
git mv USAGE.md docs/usage.md
git mv WORKFLOW.md docs/workflow.md
git mv OPENCLAW_EMBEDDED_RUNNER_RESEARCH.md docs/research/
```

### 4. Consolidate ROADMAP.md
```bash
# Keep only the most recent roadmap, archive older ones
git mv ROADMAP-v0.2.0.md ROADMAP-v0.3.0.md docs/archive/
# Keep ROADMAP.md but update it with latest info
```

### 5. Delete (If Safe)
```bash
# After archiving, these may be safe to delete from git history:
git rm CLEANUP-*.md  # Temporary cleanup notes
```

---

## 📊 CLEANUP IMPACT

| Metric | Before | After |
|--------|--------|-------|
| Root .md files | 33 | 6 (~82% reduction) |
| Root clutter | High | Low |
| Important docs visible | Hidden among 33 files | Clear at root |
| Archive accessible | Mixed in root | In docs/archive/ |

---

## ⚠️ NOTES

- **HEARTBEAT.md**: Keep at root - active session tracking
- **IDENTITY.md/SOUL.md**: Keep at root - system uses these
- **CLAUDE.md**: Keep at root - Claude Code requires this at repo root
- Everything else: Archive or move to docs/
