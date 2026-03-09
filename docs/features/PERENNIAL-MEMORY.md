# 0xKobold Perennial Memory Architecture

## Vision

> A digital familiar that remembers everything, outlasts its creator, and can be passed down through generations.

## Why This Changes Everything

A project-focused assistant can use text search. A **lifetime companion** needs:

- **Semantic memory** - Understanding concepts, not just keywords
- **Scalable storage** - Decades of conversations
- **Portable format** - Migrate across systems, even after original creator is gone
- **Self-healing** - Backup, redundancy, corruption recovery
- **Privacy-first** - Local embeddings, no cloud dependencies
- **Exportable** - Future-compatible formats

## Architecture

```
0xKobold Perennial Memory
├── ~/.0xkobold/memory/
│   ├── knowledge.db              # SQLite + sqlite-vec
│   │   ├── entries               # Core memory table
│   │   ├── embeddings            # Vector embeddings
│   │   ├── sessions              # Session history
│   │   └── fts_index             # Full-text search
│   │
│   ├── exports/                  # Portable formats
│   │   ├── memories-YYYY-MM-DD.jsonl
│   │   ├── memories-YYYY-MM-DD.sqlite
│   │   └── backup/               # Automatic backups
│   │
│   ├── MEMORY.md                 # Human-readable synthesis
│   │                                   └── Auto-generated from database
│   │
│   └── ollama/                   # Local embedding cache
│       └── models/
│           └── nomic-embed-text.gguf
│
└── Tools
    ├── memory_save               # Save with auto-embedding
    ├── memory_search             # Hybrid (vector + text)
    ├── memory_recall             # "That thing about..." vague queries
    ├── memory_synthesize         # Generate MEMORY.md
    ├── memory_export             # Export to JSONL/SQLite
    ├── memory_import             # Import from backup
    └── memory_migrate            # Version upgrades
```

## Hybrid Search Strategy

```sql
-- Get semantic matches (vector similarity)
WITH semantic AS (
  SELECT entry_id, embedding_vector <-> query_vector as distance
  FROM embeddings
  ORDER BY distance
  LIMIT 100
),
-- Get text matches (BM25)
textual AS (
  SELECT entry_id, rank
  FROM fts_index
  WHERE content MATCH query
  ORDER BY rank
  LIMIT 100
),
-- Reciprocal Rank Fusion (RRF)
combined AS (
  SELECT 
    entry_id,
    (1.0 / (60 + semantic.rank)) + (1.0 / (60 + textual.rank)) as score
  FROM semantic
  FULL OUTER JOIN textual USING (entry_id)
)
SELECT * FROM combined ORDER BY score DESC LIMIT 10;
```

## Memory Entry Schema

```typescript
interface PerennialMemory {
  // Identity
  id: string;                    // UUID (never changes)
  
  // Content
  content: string;               // The memory text
  embedding: number[];          // 768-dim float vector (Ollama)
  
  // Metadata
  timestamp: string;            // ISO 8601
  category: "decision" | "fact" | "task" | 
            "context" | "error" | "learning" |
            "relationship" | "preference" | "goal";
  tags: string[];
  
  // Context
  sessionId: string;            // Link to session
  project?: string;             // Optional project
  source?: string;              // File, URL, conversation
  
  // Temporal decay (OpenClaw-style)
  accessCount: number;          // Times recalled
  lastAccessed: string;         // Decay recency
  importance: number;           // 0.0-1.0 (user-rated)
  
  // Relationships (knowledge graph)
  relatedIds: string[];         // Linked memories
  
  // Versioning
  version: number;              // For migrations
  createdAt: string;
  modifiedAt: string;
}
```

## Ollama Integration

```typescript
// Local embeddings - works forever, no API costs, fully private
async function getEmbedding(text: string): Promise<number[]> {
  const response = await fetch('http://localhost:11434/api/embeddings', {
    method: 'POST',
    body: JSON.stringify({
      model: 'nomic-embed-text',
      prompt: text,
    }),
  });
  return response.embedding;
}
```

**Default model:** `nomic-embed-text` (274MB, Apache 2.0, good quality/size)

## Scaling Strategy

| Size | Storage | Query Time | Strategy |
|------|---------|------------|----------|
| 0-1K | SQLite | <10ms | In-memory cache |
| 1K-10K | SQLite + sqlite-vec | <50ms | Indexed vectors |
| 10K-100K | SQLite + sqlite-vec | <100ms | Partition by year |
| 100K+ | SQLite + optional pgvector | <200ms | Archive old data |

## Backup & Export

```bash
# Automatic daily export
0xkobold memory export --format jsonl --daily

# Manual export
0xkobold memory export --format sqlite --output memories-2024-03-08.db

# Git-friendly export (for version control)
0xkobold memory export --format jsonl --split-by-month

# Import from backup
0xkobold memory import memories-2023-backup.jsonl
```

## Migration Strategy

```typescript
// Version migrations for "forever" compatibility
interface Migration {
  fromVersion: number;
  toVersion: number;
  migrate: (db: Database) => Promise<void>;
}

const migrations: Migration[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: async (db) => {
      // Add importance column
      await db.exec('ALTER TABLE entries ADD COLUMN importance REAL DEFAULT 0.5');
    },
  },
  // Future migrations...
];
```

## The Synthesis Loop

Every day/week, auto-generate `MEMORY.md`:

```typescript
async function synthesize() {
  // 1. Find high-importance memories
  const important = await search({
    minImportance: 0.7,
    since: '1 week ago',
  });
  
  // 2. Cluster related memories
  const clusters = await clusterBySimilarity(important);
  
  // 3. Generate human-readable summary
  const summary = await llm.generate({
    prompt: `Summarize these related memories into a coherent narrative...`,
    context: clusters,
  });
  
  // 4. Write to MEMORY.md
  await fs.writeFile('MEMORY.md', summary);
}
```

## Privacy & Longevity Guarantees

1. **Local-only** - Embeddings via Ollama, never cloud APIs
2. **Open format** - SQLite + JSONL, readable in 50 years
3. **Self-contained** - Single directory, easy to backup/migrate
4. **No lock-in** - Export anytime to standard formats
5. **Future-proof** - Migration system for schema changes

## Usage Flow

```
User: "What was that auth thing we did?"
    ↓
/memory_recall "auth thing"
    ↓
1. Vector search: "auth" ≈ "authentication" ≈ "login" ≈ "sign-in"
2. Find: "Refactored auth module" (2 months ago)
        "JWT token implementation" (related)
        "OAuth2 flow discussion" (semantically similar)
    ↓
Return: "3 relevant memories found..."
    ↓
User: "Can you summarize my year?"
    ↓
/memory_synthesize --year 2024
    ↓
Generate comprehensive summary from all memories
```

## Comparison

| Feature | 0xKobold Perennial | OpenClaw (koclaw) | Text-Based |
|---------|-------------------|-------------------|------------|
| **Storage** | SQLite + sqlite-vec | SQLite + QMD | JSONL |
| **Embeddings** | Ollama (local) | Multiple providers | None |
| **Search** | Hybrid (vec + text) | Hybrid + MMR + decay | Text only |
| **Scale** | 100K+ memories | 1M+ | 1K-10K |
| **Backup** | Auto-export | Manual | Git-friendly |
| **Migrations** | Built-in | Limited | N/A |
| **Synthesis** | MEMORY.md auto-gen | No | No |
| **Lifetime** | 🏛️ **Centuries** | Years | Months |

## Implementation Phases

**Phase 1: Foundation** (0.0.4)
- SQLite schema
- Ollama embeddings
- Basic vector search
- Export to JSONL

**Phase 2: Smart** (0.0.5)
- Hybrid search (BM25 + vectors)
- Temporal decay
- MEMORY.md synthesis
- Backup automation

**Phase 3: Eternal** (0.0.6)
- Knowledge graph (related memories)
- Multi-machine sync
- Migration tools
- Archive/Cold storage

---

**Ready to build the perennial version?** 🏛️✨
