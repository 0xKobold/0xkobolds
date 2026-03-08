# Memory Synthesis Extension Task

**Agent:** @memory-synthesis-expert  
**Status:** Ready to start  
**File:** src/extensions/core/memory-synthesis-extension.ts

## Objective
Auto-generate human-readable MEMORY.md from perennial database

## Requirements
1. Query high-importance memories from perennial DB
2. Cluster related memories using embeddings similarity
3. Generate narrative summary
4. Write to ~/.0xkobold/MEMORY.md
5. /memory-synthesize command
6. Daily/weekly auto-sync

## Implementation
1. Read from perennial DB (~/.0xkobold/memory/perennial/knowledge.db)
2. Group memories by category
3. Sort by importance and recency
4. Generate markdown with: headers, bullet points, dates
5. Write to MEMORY.md

## MEMORY.md Format
```markdown
# Personal Knowledge Vault

## Decisions
- **2024-03-08**: Refactored auth to use JWT (importance: 0.9)
- **2024-03-05**: Chose SQLite for memory (importance: 0.8)

## Facts
- 0xKobold uses Ollama for local embeddings
- Perennial memory uses 768-dim vectors

## Active Projects
- 0xKobold v0.0.4 release
- VPS deployment with Tailscale
```

## Commands
- /memory-synthesize - Manual trigger
- /memory-auto-sync on|off - Toggle daily sync

## Deliverables
- [ ] memory-synthesis-extension.ts
- [ ] MEMORY.md template generation
- [ ] Auto-sync scheduler

Start: Now  
Due: 20 minutes
