# HEARTBEAT - 0xKobold Streamlining Project

> Track progress for memory consolidation and architecture streamlining

## 🎯 Project Overview

Consolidate and streamline 0xKobold's architecture following the router consolidation pattern.

**Started:** 2026-03-14
**Owner:** Claude + moika

---

## 📋 Action Tasks

### ⚡ Dialectic Memory Implementation (DEADLINE: 2026-03-15 17:00 EST)

**Goal**: Closed learning loop with Honcho-style dialectic reasoning.

**Status**: Phase 3 (Autonomous Skill Creation) in progress.

| Task | Status | Assignee | Notes |
|------|--------|----------|-------|
| **Phase 1: Dialectic Representations** | ✅ COMPLETE | | |
| Create `src/memory/dialectic/types.ts` | ✅ DONE | Claude | Types defined |
| Create `src/memory/dialectic/store.ts` | ✅ DONE | Claude | SQLite schema + CRUD |
| Create `src/memory/dialectic/reasoning.ts` | ✅ DONE | Claude | Thesis-Antithesis-Synthesis |
| Create `src/memory/dialectic/nudges.ts` | ✅ DONE | Claude | Nudge engine |
| Create `src/memory/dialectic/index.ts` | ✅ DONE | Claude | Exports + convenience API |
| **Phase 2: Periodic Nudges** | ✅ COMPLETE | | Merged into dialectic/nudges.ts |
| Nudge engine (time/event/threshold triggers) | ✅ DONE | Claude | In nudges.ts |
| Nudge actions (reflection, skill creation) | ✅ DONE | Claude | In nudges.ts |
| Scheduler | ✅ DONE | Claude | In nudges.ts |
| **Phase 3: Autonomous Skill Creation** | 🔄 IN PROGRESS | | |
| Create `src/memory/dialectic/skill-creation.ts` | ✅ DONE | Claude | Pattern detection + generation |
| Pattern detection from observations | ✅ DONE | Claude | Tool sequences, commands, workflows |
| Skill generation via LLM | ✅ DONE | Claude | JSON skill generation |
| Skill writing and validation | ✅ DONE | Claude | Write to skills dir |
| Wire skill creation into nudge engine | ✅ DONE | Claude | executeSkillCreation updated |
| **Phase 4: Integration** | ✅ COMPLETE | | |
| Wire dialectic into perennial-memory-extension | ✅ DONE | Claude | Imports + init |
| Add `/represent` command | ✅ DONE | Claude | Show peer model |
| Add `/observe` command | ✅ DONE | Claude | Add observation |
| Add `/reason` command | ✅ DONE | Claude | Run dialectic reasoning |
| Add `/ask-peer` command | ✅ DONE | Claude | Query representation |
| Add `/nudge` command | ✅ DONE | Claude | Check/process nudges |
| Add `/dialectic-stats` command | ✅ DONE | Claude | Show statistics |
| Document in Obsidian vault | ✅ DONE | Claude | Dialectic-Memory-Implementation.md |
| **Phase 5: Testing** | ✅ COMPLETE | | |
| Unit tests for dialectic store | ✅ DONE | Claude | 18 tests pass |
| Test extraction → representation flow | ✅ DONE | Claude | Runtime test passed |
| Test nudge scheduling | ✅ DONE | Claude | 3 nudges created |
| Test dialectic reasoning with LLM | ✅ DONE | Claude | Works with Ollama/llama3.2 |

### Phase 1: Memory Consolidation (NEAR COMPLETE)

| Task | Status | Assignee | Notes |
|------|--------|----------|-------|
| Rename generative-agents to learning-extension | ✅ DONE | Claude | Completed |
| Update imports and references | ✅ DONE | Claude | pi-config, event-bus, docs |
| Rename test files | ✅ DONE | Claude | Unit, integration, e2e |
| Add session_events table to session-store | ✅ DONE | Claude | Phase 6 schema |
| Create SessionEventStore interface | ✅ DONE | Claude | addEvent, getEvents, etc. |
| Create migration script | ✅ DONE | Claude | migrate-memory-stream.ts |
| Create verification script | ✅ DONE | Claude | verify-migration.ts |
| Add session-events tests | ✅ DONE | Claude | 9 tests pass |
| Analyze memory_stream + session-store overlap | ✅ DONE | Claude | Analysis doc created |
| Design unified session schema | ✅ DONE | Claude | session_events table |
| Update learning-extension to use session_events | ✅ DONE | Claude | Uses SessionEventStore |
| Remove memory_stream from learning-extension | ✅ DONE | Claude | Schema updated, no memory_stream |
| Test unified memory system | ✅ DONE | - | 27 tests pass, build passes |

### Phase 2: Safety Extension Consolidation (IN PROGRESS)

| Task | Status | Assignee | Notes |
|------|--------|----------|-------|
| Merge auto-security-scan into draconic-safety | ✅ DONE | Claude | file.written event handler |
| Merge compaction-safeguard into draconic-safety | ✅ DONE | Claude | context monitoring + commands |
| Update extension loading order | ✅ DONE | Claude | Removed from pi-config.ts |
| Delete old extension files | ✅ DONE | Claude | Removed 2 files |
| Test safety guards work together | ⬌ PENDING | - | Build passes, test suite runs |

### Phase 3: Router Provider Abstraction

| Task | Status | Assignee | Notes |
|------|--------|----------|-------|
| Create provider-agnostic interface | ⬜ TODO | - | |
| Add provider routing to router-core | ⬜ TODO | - | |
| Wire Anthropic through router | ⬜ TODO | - | Used in cron jobs |
| Test multi-provider routing | ⬜ TODO | - | |

### Phase 4: Event Types Cleanup

| Task | Status | Assignee | Notes |
|------|--------|----------|-------|
| Audit unused event types (43 found) | ⬜ TODO | - | |
| Remove dead events from event-bus | ⬜ TODO | - | |
| Document remaining events | ⬜ TODO | - | |

### Phase 5: Migration & Deployment

| Task | Status | Assignee | Notes |
|------|--------|----------|-------|
| Create migration checklist | ⬜ TODO | - | Raspberry Pi + Digital Ocean |
| Document infrastructure deps | ⬜ TODO | - | |
| Create deployment scripts | ⬜ TODO | - | |
| Test migration on backup | ⬜ TODO | - | |

---

## 📊 Current Architecture Analysis

### Memory Systems (Before)

```
┌─────────────────────────────────────────────────────────────────┐
│                     CURRENT STATE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  generative-agents-extension                                    │
│  ├── agents.db                                                  │
│  │   ├── agents (agent state)                                  │
│  │   ├── memory_stream (observations, thoughts, actions)       │
│  │   ├── reflections ( synthesized insights)                   │
│  │   └── plans (daily, action, project plans)                  │
│  └── Requires perennial for embeddings                          │
│                                                                  │
│  perennial-memory-extension                                     │
│  ├── knowledge.db                                               │
│  │   ├── memories (long-term facts/decisions)                  │
│  │   ├── memory_resources (raw session data)                   │
│  │   ├── memory_items (extracted from resources)               │
│  │   ├── memory_categories (auto-grouped)                      │
│  │   └── memory_decay_schedule (cleanup jobs)                  │
│  └── Features: decay, conflict detection, context graph       │
│                                                                  │
│  session-store                                                  │
│  └── sessions.db                                                │
│      └── Conversation history with timestamps                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Memory Systems (After - Target)

```
┌─────────────────────────────────────────────────────────────────┐
│                     TARGET STATE                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  learning-extension (renamed from generative-agents)           │
│  ├── learning.db                                                │
│  │   ├── agents (agent state)                                  │
│  │   ├── memory_stream → MERGED into sessions                  │
│  │   ├── reflections (synthesized insights)                     │
│  │   └── plans (daily, action, project plans)                  │
│  └── Uses perennial for embeddings                              │
│                                                                  │
│  perennial-memory-extension (unchanged)                         │
│  └── knowledge.db (long-term semantic storage)                  │
│                                                                  │
│  session-store (ENHANCED)                                       │
│  └── sessions.db                                                │
│      ├── sessions (conversation history)                       │
│      ├── session_events (was memory_stream)                    │
│      │   - type: observation|thought|action|reflection        │
│      │   - importance: number                                   │
│      │   - embedding: vector                                    │
│      └── Enhanced with importance + embeddings                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 Research Notes

### Memory Architecture: Future Implementation

**Goal**: Closed learning loop with agent-curated memory, periodic nudges, autonomous skill creation, skill self-improvement, FTS5 cross-session recall, and Honcho dialectic user modeling.

**Documented in**: `~/.0xkobold/obsidian_vault/Research/Memory-Architecture-Future.md`

**Key Components**:

1. **Dialectic Representations** (Phase 1)
   - Honcho-style reasoning about observations
   - Thesis-Antithesis-Synthesis pattern
   - User/Agent/Project models

2. **Periodic Nudges** (Phase 2)
   - Time-based: Daily, weekly, monthly
   - Event-based: Skill used, error occurred
   - Threshold-based: 100 observations, 10 skill uses

3. **Autonomous Skill Creation** (Phase 3)
   - Detect patterns in tool usage
   - Generate skills via LLM
   - Hot-reload immediately

4. **Skill Self-Improvement** (Phase 4)
   - Track success/failure rates
   - Analyze error patterns
   - Refine skill code

5. **Cross-Session Recall** (Phase 5)
   - FTS5 + embedding search
   - Enrich with representations
   - LLM summarization

### Memory Architecture Implementation (Documented)

**Three-Phase Implementation based on [Rohit's article](https://rohit.chat/memory):**

#### Phase 1: Smart Write Rules (`smart-write-rules.ts`)
- Filter ephemeral content before storage
- Categories: decision, fact, task, context, error, learning, preference
- Ephemeral: greeting, filler (not stored)
- Uses LLM to analyze memory worthiness

#### Phase 2: Three-Tier Memory (`tiered-memory.ts`)
```
Layer 1: Resources (raw transcripts) → memory_resources
Layer 2: Items (atomic facts) → memory_items  
Layer 3: Categories (summaries) → memory_categories
```
- Retrieval: Try summaries first → drill down if needed
- Evolution: Categories auto-update with new items via LLM

#### Phase 3: Maintenance Systems
- **Decay** (`memory-decay.ts`): Nightly/weekly/monthly cleanup
- **Conflict Detector** (`conflict-detector.ts`): Find contradictions
- **Context Graph** (`context-graph.ts`): Entity relationships
- **Checkpoints** (`checkpoint-manager.ts`): Session snapshots

#### Integration Layer (`memory-integration.ts`)
- Bridges session-store ↔ tiered-memory ↔ perennial
- Event-driven: `memory.resource_ingested`, `memory.consolidate_resource`
- Tracks observations for reflection triggers

### Hermes Agent Pattern (Stanford Generative Agents)

From `generative-agents-extension.ts`:
- **Memory Stream**: Chronological record of experiences (observations, thoughts, actions)
- **Reflection**: Periodic synthesis of memories into higher-level insights
- **Planning**: Hierarchical daily plans with action steps
- **Retrieval**: Recency × Importance × Relevance scoring

**Key insight from Stanford paper:**
> "The memory stream is essentially a session-scoped event log with importance scoring. This overlaps with session history."

### Overlap Analysis (Confirmed)

| Feature | generative-agents | tiered-memory | perennial | session-store |
|---------|------------------|---------------|-----------|---------------|
| Timestamp | ✅ memory_stream | ✅ resources | ✅ memories | ✅ sessions |
| Importance | ✅ | ❌ | ✅ | ❌ |
| Embeddings | ✅ | ❌ | ✅ | ❌ |
| Session link | ✅ | ✅ | ✅ | ✅ |
| Type/category | type | category | category | ❌ |
| Reflection | ✅ **unique** | ❌ | ❌ | ❌ |
| Planning | ✅ **unique** | ❌ | ❌ | ❌ |
| Tiered retrieval | ❌ | ✅ **unique** | ✅ semantic | ❌ |

**Consolidation Decision:**
- `memory_stream` → merge into `session_events` (add importance + embeddings)
- Keep `reflections` and `plans` in renamed `learning-extension`
- Tiered memory stays independent (different concern: summarization)

---

## 📁 Files to Modify

### Phase 1 Files

```
src/extensions/core/generative-agents-extension.ts
  → Rename to learning-extension.ts
  → Remove memory_stream table (use session-store)

src/memory/session-store.ts
  → Add importance column
  → Add embedding column
  → Add event_type column

src/extensions/core/perennial-memory-extension.ts
  → Update to read from enhanced session-store

src/pi-config.ts
  → Update extension path
```

### Phase 2 Files

```
src/extensions/core/draconic-safety-extension.ts
  → Merge auto-security-scan logic
  → Merge compaction-safeguard logic

src/extensions/core/auto-security-scan-extension.ts
  → DELETE (merged)

src/extensions/core/compaction-safeguard-v2.ts
  → DELETE (merged)
```

---

## 🚀 Migration Plan: Raspberry Pi + Digital Ocean

### Pre-Migration Checklist

- [ ] Backup ~/.0xkobold/ (all databases)
- [ ] List environment variables (OLLAMA_*, ANTHROPIC_*, DISCORD_*)
- [ ] Export config.json
- [ ] Document cron jobs
- [ ] List installed extensions
- [ ] Backup obsidian_vault/

### Digital Ocean Files to Migrate

```
DO Server → Raspberry Pi:
├── ~/.0xkobold/
│   ├── config.json (merge)
│   ├── agents.db (merge)
│   ├── sessions.db (merge)
│   ├── memory/ (merge)
│   ├── generative/ (merge)
│   ├── obsidian_vault/ (sync)
│   └── auth-profiles.db (merge)
├── Environment variables
├── Cron job definitions
└── Custom skills/ (sync)
```

### Raspberry Pi Setup

```
1. Install Bun on Pi
2. Clone 0xKobolds repo
3. Run bun install
4. Copy ~/.0xkobold/ from DO
5. Merge databases (manual or script)
6. Start with: bun run start
7. Verify Discord/gateway connections
```

---

## ✅ Completion Criteria

### Phase 1 Done When
- [ ] generative-agents renamed to learning-extension
- [ ] memory_stream merged into sessions
- [ ] All tests pass
- [ ] Memory retrieval still works
- [ ] Reflection still triggers

### Phase 2 Done When
- [ ] All safety logic in one file
- [ ] Extension count reduced by 2
- [ ] No regressions in guards

### Phase 3 Done When
- [ ] Router can select Ollama OR Anthropic
- [ ] Cron jobs still work with both providers

### Phase 5 Done When
- [ ] Pi running 0xKobold
- [ ] All databases migrated
- [ ] Discord bot connected
- [ ] Gateway accessible

---

## 📝 Notes

### 2026-03-14 Session Notes

1. Successfully consolidated router from 4 files to 3 files
2. Created architecture documentation (ARCHITECTURE.md + architecture.svg)
3. Copied docs to Obsidian vault
4. Identified memory consolidation as top priority
5. **IMPLEMENTED: Dialectic Memory System** (Phases 1, 2, 4 complete)
   - Created `src/memory/dialectic/` module with types, store, reasoning, nudges, index
   - Integrated into `perennial-memory-extension` with 6 new commands
   - Added documentation to Obsidian vault
   - Commits: `5244fb2`, `f7cc77e`, `6ca27c1`, `3a3401d`, `5eb4bc5`
6. **FIXED: Tiered memory extraction not running**
   - Root cause: `extractItems()` was never called after `ingestResource()`
   - Fix: Call `extractItems()` and `organizeIntoCategories()` directly
   - Added commands: `/memory-tiered` (status) and `/memory-extract` (manual)
   - Installed `llama3.2` model for local extraction
7. Target: Raspberry Pi deployment tomorrow

### Questions for Next Session

1. ~~Should learning-extension also handle planning OR keep plans separate?~~ (discussed - keep architecture as is)
2. What's the retention policy for memory_stream vs sessions?
3. Do we need bidirectional sync between DO and Pi?

---

*Last Updated: 2026-03-14 16:30 EDT*