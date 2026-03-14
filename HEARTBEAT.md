# HEARTBEAT - 0xKobold Streamlining Project

> Track progress for memory consolidation and architecture streamlining

## 🎯 Project Overview

Consolidate and streamline 0xKobold's architecture following the router consolidation pattern.

**Started:** 2026-03-14
**Owner:** Claude + moika

---

## 📋 Action Tasks

### Phase 1: Memory Consolidation (HIGH PRIORITY)

| Task | Status | Assignee | Notes |
|------|--------|----------|-------|
| Rename generative-agents to learning-extension | ⬜ TODO | - | Reflects reflection + planning |
| Analyze memory_stream + session-store overlap | ⬜ TODO | - | |
| Design unified session schema | ⬜ TODO | - | Merge conversation + memory_stream |
| Create migration script for tables | ⬜ TODO | - | Preserve existing data |
| Update references to new extension | ⬜ TODO | - | |
| Test unified memory system | ⬜ TODO | - | |

### Phase 2: Safety Extension Consolidation

| Task | Status | Assignee | Notes |
|------|--------|----------|-------|
| Merge auto-security-scan into draconic-safety | ⬜ TODO | - | |
| Merge compaction-safeguard into draconic-safety | ⬜ TODO | - | |
| Update extension loading order | ⬜ TODO | - | |
| Test safety guards work together | ⬜ TODO | - | |

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
5. User will be AFK for several hours
6. Target: Raspberry Pi deployment tomorrow
7. **FIXED: Tiered memory extraction not running**
   - Root cause: `extractItems()` was never called after `ingestResource()`
   - Event `memory.resource_ingested` was emitted with no listener
   - Fix: Call `extractItems()` and `organizeIntoCategories()` directly in `perennial-memory-extension.ts`
   - Added commands: `/memory-tiered` (status) and `/memory-extract` (manual extraction)
   - Installed `llama3.2` model for local extraction
   - 15 unprocessed resources ready for extraction

### Questions for Next Session

1. ~~Should learning-extension also handle planning OR keep plans separate?~~ (discussed - keep architecture as is)
2. What's the retention policy for memory_stream vs sessions?
3. Do we need bidirectional sync between DO and Pi?

---

*Last Updated: 2026-03-14 16:05 EDT*