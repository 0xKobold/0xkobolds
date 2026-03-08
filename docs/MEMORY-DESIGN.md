# 0xKobold Memory System Design

Based on research of OpenClaw's memory system (CLAWS) and 0xKobold's needs.

## Philosophy

**0xKobold Memory = Simple + Practical + Extensible**

Unlike OpenClaw's complex semantic search infrastructure, 0xKobold takes a pragmatic approach:

| Aspect | OpenClaw | 0xKobold |
|--------|----------|----------|
| **Storage** | SQLite + vector index + embeddings | JSONL files |
| **Search** | Hybrid (semantic + BM25 + MMR) | Tool-based filtering |
| **Indexing** | Automatic, background | On-demand, explicit |
| **Complexity** | High (QMD, sqlite-vec, embeddings) | Low (JSONL + tools) |
| **Backend** | Multiple (QMD, sqlite-vec) | Single (file-based) |
| **Use case** | Long-running agents, daily notes | Project-focused sessions |

## Architecture

```
0xKobold Memory
├── MEMORY.md              # Human-readable long-term memory
├── .0xkobold/memory/
│   ├── entries.jsonl      # Machine-readable memory entries
│   ├── index.json         # Metadata + tags index
│   └── sessions/          # Session snapshots
│       └── YYYY-MM-DD-session-id.jsonl
└── Tools
    ├── memory_save      # Save an entry
    ├── memory_search    # Search entries
    ├── memory_get       # Get specific entry
    └── memory_list      # List recent entries
```

## Memory Entry Format

```json
{
  "id": "uuid",
  "timestamp": "2024-01-15T10:30:00Z",
  "category": "decision|fact|task|context|error",
  "tags": ["auth", "refactor", "bugfix"],
  "content": "Moved auth to separate module",
  "source": "session-abc123",
  "confidence": 0.95,
  "project": "0xKobold"
}
```

## Categories

- **decision** - Key architectural choices
- **fact** - Learned information about codebase
- **task** - Action items or todos
- **context** - Session context worth preserving
- **error** - Known issues and resolutions

## Commands

```bash
/memory-save "Extracted auth logic to new module" --tags auth,refactor --category decision
/memory-search "auth module" --category decision --limit 5
/memory-get <uuid>
/memory-list --since 24h --category task
```

## Tools

### memory_save
Save a memory entry with metadata.

### memory_search
Search entries by content, tags, or category.

### memory_get
Retrieve a specific entry by ID.

### memory_list
List recent entries with filtering.

## Comparison Summary

**OpenClaw** is designed for:
- Long-running personal assistants
- Daily activity logging
- Complex semantic queries
- Large memory corpora

**0xKobold** is designed for:
- Project-focused development
- Explicit memory management
- Simple, reliable storage
- Git-friendly (text files)

## Usage Flow

```
User: "I want to refactor the auth system"
Agent: *searches memory for "auth"*
Agent: Found: "auth logic extracted to module" (3 days ago)
Agent: *saves new decision* "Planning auth service extraction"
Agent: *implements changes*
Agent: *saves outcome* "Auth service now in auth/ directory"
```

## Integration

Works with:
- **Heartbeat extension** - Auto-save before compaction
- **Session bridge** - Link memories to sessions
- **File ops** - Read/write MEMORY.md
- **Context pruning** - Smart context selection

## No Embed Required

Unlike OpenClaw's dependence on:
- Local embeddings (llama-cpp)
- Remote embeddings (OpenAI, Gemini)
- Vector databases (sqlite-vec)
- Complex re-ranking (MMR)

0xKobold uses:
- Simple text matching
- Tag-based filtering
- Date ranges
- Categories

This is intentional - 0xKobold prioritizes reliability and simplicity.
