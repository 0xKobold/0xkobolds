# Documentation Audit Task for 0xKobold

## Objective
Audit and clean up project documentation to remove confusion and establish clear structure for 0.2.0 release.

## Audit Findings

### Root .md Files (12 files)

| File | Status | Action | Notes |
|------|--------|--------|-------|
| README.md | ✅ KEEP | Main documentation | 15K, current |
| README-NEW-SECTIONS.md | 🔴 DELETE | Temporary | Content merged or outdated |
| README-UPDATE-PLAN.md | 🔴 DELETE | Temporary | Planning file, used |
| CHANGELOG.md | ✅ KEEP | Release history | Current |
| CLAUDE.md | ✅ KEEP | Claude-specific | Keep for context |
| HEARTBEAT.md | 🔴 MERGE | Duplicates docs/Heartbeat.md | Consolidate |
| PLAN-0.0.3.md | 🟡 ARCHIVE | Historical | Move to docs/archive/ |
| plan.md | 🔴 DELETE | Wrong project! | Resume optimizer, delete |
| ROADMAP.md | ✅ KEEP | Current roadmap | 17K, main roadmap |
| ROADMAP-OPENCLAW-FEATURES.md | ✅ KEEP | Research | Separate OpenClaw research |
| USAGE.md | 🟡 REVIEW | May duplicate README | Check content |
| WORKFLOW.md | 🟡 REVIEW | May be outdated | Check relevance |

### docs/ Directory (24 files + research/)

| File | Status | Notes |
|------|--------|-------|
| architecture-extensions.md | ✅ KEEP | Extension architecture |
| AUTONOMOUS-SUBAGENTS.md | 🟡 ARCHIVE | Deprecated extension, keep for reference |
| CLI_ARCHITECTURE.md | ✅ KEEP | CLI design |
| CONTEXT_PRUNING.md | ✅ KEEP | Memory management |
| Heartbeat.md | 🟡 MERGE | Merge with HEARTBEAT.md |
| IMPLEMENTATION-PLAN.md | ✅ KEEP | Current implementation plan |
| MEMORY-DESIGN.md | ✅ KEEP | Memory architecture |
| mode-manager.md | ✅ KEEP | Mode system |
| MULTI-AGENT-WORKSPACE.md | ✅ KEEP | Core architecture doc |
| NATURAL-SUBAGENT-USAGE.md | ✅ KEEP | Subagent patterns |
| onboarding-plan.md | 🔴 DELETE | Outdated, replaced |
| openclaw-integration.md | ✅ KEEP | Integration notes |
| PERENNIAL-MEMORY.md | ✅ KEEP | Memory system |
| persona-system.md | ✅ KEEP | Persona design |
| PI-TUI-MIGRATION.md | 🟡 ARCHIVE | Historical migration |
| precommit-setup.md | ✅ KEEP | Dev setup |
| QUICKSTART.md | ✅ KEEP | User guide |
| research/openclaw/* | ✅ KEEP | Research content |
| SUBAGENT-ARCHITECTURE.md | ✅ KEEP | Architecture |
| SUBAGENT-IMPLEMENTATION.md | ✅ KEEP | Implementation |
| UNIFIED-ORCHESTRATION.md | ✅ KEEP | Orchestration design |
| VPS-*.md | 🟡 ARCHIVE | Deployment docs, move to docs/deployment/ |

### Recommendations

1. **Create docs/archive/** for historical documents
2. **Merge duplicate heartbeat docs**
3. **Delete temporary/planning files** that have been used
4. **Delete plan.md** (wrong project content)
5. **Consolidate README updates** into main README.md
6. **Create clear README structure** with sections

## Cleanup Tasks

```bash
# Archive historical
docs/archive/
  PLAN-0.0.3.md
  PI-TUI-MIGRATION.md
  VPS-0.0.4-PLAN.md
  AUTONOMOUS-SUBAGENTS.md

# Delete temporary
rm README-NEW-SECTIONS.md
rm README-UPDATE-PLAN.md
rm plan.md
rm docs/onboarding-plan.md

# Merge/consolidate
- HEARTBEAT.md → docs/Heartbeat.md (move to docs/)
- Update README.md with any needed content from README-NEW-SECTIONS.md

# Organize
- Move VPS-* to docs/deployment/
```

## Clean Documentation Structure

```
README.md                 (main entry)
CHANGELOG.md             (releases)
ROADMAP.md               (current roadmap)
CLAUDE.md                (Claude context)
USAGE.md                 (usage guide - if not in README)
docs/
  architecture/            (system design)
    architecture-extensions.md
    CLI_ARCHITECTURE.md
    MULTI-AGENT-WORKSPACE.md
    SUBAGENT-ARCHITECTURE.md
    UNIFIED-ORCHESTRATION.md
  features/              (feature docs)
    CONTEXT_PRUNING.md
    MEMORY-DESIGN.md
    PERENNIAL-MEMORY.md
    mode-manager.md
    NATURAL-SUBAGENT-USAGE.md
    SUBAGENT-IMPLEMENTATION.md
    persona-system.md
  integration/           (external systems)
    openclaw-integration.md
  development/           (dev setup)
    precommit-setup.md
    QUICKSTART.md
  research/              (research)
    openclaw/
  reference/             (lookup)
    IMPLEMENTATION-PLAN.md
    Heartbeat.md
  deployment/            (ops)
    VPS-DEPLOYMENT.md
    VPS-DEPLOYMENT-RESEARCH.md
  archive/               (historical)
    PLAN-0.0.3.md
    PI-TUI-MIGRATION.md
    VPS-0.0.4-PLAN.md
    AUTONOMOUS-SUBAGENTS.md
```

## Expected Result
- ~40% reduction in root .md files (12 → 5-6)
- Clear organization in docs/
- No temporary/planning files in root
- Single source of truth for each topic
