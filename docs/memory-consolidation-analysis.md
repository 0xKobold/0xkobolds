# Memory Consolidation Analysis

## Executive Summary

The `generative-agents-extension` was renamed to `learning-extension`, reflecting its focus on reflection and planning. Now we consolidate `memory_stream` into `session-store` to eliminate redundancy.

## Current State Analysis

### memory_stream Table (learning-extension)

```sql
CREATE TABLE memory_stream (
  id TEXT PRIMARY KEY,
  timestamp TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL,  -- observation, thought, action, reflection
  importance REAL NOT NULL,
  agent_id TEXT NOT NULL,
  session_id TEXT,
  location TEXT,
  people TEXT,      -- JSON array
  embedding BLOB,   -- 768 floats
  metadata TEXT    -- JSON
);
```

### sessions Table (session-store)

```sql
CREATE TABLE sessions (
  session_key TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  agent_id TEXT,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  -- ... model/provider overrides ...
  memory_thread_id TEXT,
  perennial_session_id TEXT,
  user_profile_id TEXT,
  conversation_summary TEXT,
  message_count INTEGER DEFAULT 0
);
```

## Overlap Analysis

| Feature | memory_stream | sessions | Consolidation |
|---------|---------------|----------|---------------|
| Timestamp | ✓ timestamp (ISO) | ✓ updated_at (epoch) | Keep both formats |
| Content | ✓ content | ✗ | Add to sessions as events |
| Type | ✓ type | ✗ | Add to events |
| Importance | ✓ importance (1-10) | ✗ | Add to events |
| Session ID | ✓ session_id | ✓ session_id | **Key link** |
| Agent ID | ✓ agent_id | ✓ agent_id | **Share** |
| Embedding | ✓ embedding | ✗ | Add to events |
| People/Location | ✓ people, location | ✗ | Add to events |
| Summary | ✗ | ✓ conversation_summary | Keep separate |

## Proposed Unified Schema

### Approach: Session Events Table

Add a `session_events` table to the session database that supersedes `memory_stream`:

```sql
-- In sessions.db
CREATE TABLE session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL,  -- Unix epoch (consistent with sessions)
  type TEXT NOT NULL,          -- observation, thought, action, reflection
  content TEXT NOT NULL,
  importance INTEGER DEFAULT 5, -- 1-10 scale
  agent_id TEXT,
  location TEXT,
  people TEXT,                 -- JSON array
  embedding BLOB,             -- Vector for semantic search
  metadata TEXT,              -- JSON
  FOREIGN KEY (session_id) REFERENCES sessions(session_id)
);

CREATE INDEX idx_session_events_session ON session_events(session_id);
CREATE INDEX idx_session_events_timestamp ON session_events(timestamp);
CREATE INDEX idx_session_events_type ON session_events(type);
CREATE INDEX idx_session_events_importance ON session_events(importance);
```

### What Stays in learning-extension

Keep these separate tables in `learning.db`:

1. **agents** - Agent state (traits, observation count, etc.)
2. **reflections** - Synthesized insights from memory (unique to learning)
3. **plans** - Hierarchical planning (unique to learning)

These are NOT session-scoped; they're agent-scoped.

## Migration Plan

### Phase A: Schema Migration

1. Add `session_events` table to `session-store.ts`
2. Create migration function to copy `memory_stream` → `session_events`
3. Update `learning-extension` to use `session_events` instead of `memory_stream`

### Phase B: API Updates

1. Add `addEvent()` to `SessionStore` interface
2. Add `getEvents(sessionId, filters)` to `SessionStore`
3. Update `LearningAgent.observe/think/act` to use session store

### Phase C: Cleanup

1. Remove `memory_stream` table from `learning.db`
2. Update imports in `learning-extension`
3. Update tests

## Benefits

1. **Single source of truth**: Session events in session database
2. **Simpler queries**: Join events with sessions directly
3. **Better backup**: One database for all session data
4. **Consistent embeddings**: Session events get same embedding treatment
5. **Retention alignment**: Event cleanup aligns with session cleanup

## Backward Compatibility

- Migration copies existing `memory_stream` data to `session_events`
- Original `memory_stream` table kept in `learning.db` until migration verified
- API functions maintain same signatures

## Implementation Order

1. ✅ Rename generative-agents → learning-extension
2. ✅ Update imports and references
3. ⬜ Add `session_events` table to session-store
4. ⬜ Create migration script
5. ⬜ Update learning-extension to use session_events
6. ⬜ Remove memory_stream from learning-extension
7. ⬜ Test unified system

## Files to Modify

| File | Change |
|------|--------|
| `src/memory/session-store.ts` | Add session_events table + API |
| `src/extensions/core/learning-extension.ts` | Use session_events instead of memory_stream |
| `src/memory/migration.ts` | NEW: Migration logic |
| `test/unit/session-store.test.ts` | Add event tests |

## Decision Points

1. **Keep agents table in learning.db?** → YES (agent-scoped, not session-scoped)
2. **Keep reflections/plans in learning.db?** → YES (derived data, not raw events)
3. **Use same embedding model?** → YES (nomic-embed-text, 768 dims)
4. **Location/people fields needed?** → YES (optional metadata for events)

---

*Created: 2026-03-15*
*Status: Planning*