# 0xKobold v0.2.0 Roadmap: Digital Familiar

**Goal:** Transform 0xKobold from a coding assistant to a true digital familiar with personality, memory, and natural interaction patterns.

## Vision

> A personal AI companion that grows with you — learning your preferences, anticipating your needs, and becoming an indispensable part of your digital life.

---

## Core Themes for v0.2.0

1. **Personality & Memory** - The familiar remembers, learns, and evolves
2. **Natural Interaction** - Speak to it like a companion, not a tool
3. **Contextual Awareness** - It knows when to act, help, or wait
4. **Extensibility** - Easy to teach new skills and behaviors

---

## Phase 1: Foundation (Weeks 1-2)

### 1.1 Perennial Memory System ✅
**Status:** Implemented | **Commit:** 

- [x] Semantic memory with `perennial_save` and `perennial_search`
- [x] Memory synthesis for automatic documentation
- [x] MEMORY.md generation from memories
- [x] Per-project memory isolation

### 1.2 Persona System ✅
**Status:** Complete

- [x] `SOUL.md` - Personality, tone, boundaries (auto-created)
- [x] `IDENTITY.md` - Name, vibe, emoji (auto-created)  
- [x] Bootstrap file loader with truncation support
- [x] System prompt builder with bootstrap injection
- [x] Embedded runner for custom system prompt control
- [x] `USER.md` - User profile with learned preferences
- [x] Dynamic personality adaptation (5 traits)

### 1.3 Context Pruning
- [ ] Automatic context management
- [ ] Token budget awareness
- [ ] Smart compaction strategies

---

## Phase 2: Natural Interaction (Weeks 3-4)

### 2.1 Remove Explicit Commands ✅

**Status:** Implemented via v0.2.0 philosophy

- [x] Remove `/implement` - Not present
- [x] Remove all persona commands (bootstrap, persona-reload, etc.)
- [x] Philosophy: Agent reads files naturally, no explicit commands
- [ ] Natural language triggers for subagents
- [ ] Agent persona guides natural detection

### 2.2 Heartbeat System
- [ ] Scheduled check-ins (`HEARTBEAT.md`)
- [ ] Proactive notifications
- [ ] Cron-based activation
- [ ] Idle detection and "nurture" prompts

### 2.3 Mode System Enhancement
- [x] Plan mode (read-only) ✅ Done
- [x] Build mode (full tools) ✅ Done
- [ ] Natural mode switching based on context
- [ ] Auto-detect when to switch modes

---

## Phase 3: Sub-Agent System (Weeks 5-6)

### 3.1 Unified Orchestrator ✅
**Status:** Implemented

- [x] Single tool: `agent_orchestrate`
- [x] Auto-delegation modes
- [x] Complexity detection
- [x] Natural language spawning

### 3.2 Agent Types ✅
**Status:** Implemented

- [x] **Coordinator (🎯)** - Plans and delegates
- [x] **Specialist (🧠)** - Deep domain expertise
- [x] **Researcher (🔍)** - Information gathering
- [x] **Worker (⚒️)** - Implementation
- [x] **Reviewer (👁️)** - Code review and validation
- [x] Auto-routing based on task description
- [x] Task complexity analysis
- [x] spawn_agent tool with intelligent routing

### 3.3 Worker Skills
- [ ] `nextjs-worker` - React/Next.js specialist
- [ ] `sql-worker` - Database optimization
- [ ] `api-worker` - API design/implementation
- [ ] `test-worker` - Test generation

---

## Phase 4: Skills System (Weeks 7-8)

### 4.1 Skill Framework
- [ ] Load skills from `~/.0xkobold/skills/`
- [ ] Skill discovery and installation
- [ ] Skill marketplace/curated list

### 4.2 Core Skills
- [ ] Web research with Playwright
- [ ] Git operations
- [ ] Testing workflows
- [ ] Documentation generation

### 4.3 External Integrations
- [ ] Web scraping skill (Playwright-based)
- [ ] Discord bot support
- [ ] Email integration
- [ ] Calendar integration

---

## Phase 5: Streaming & UX (Weeks 9-10)

### 5.1 Response Streaming
- [ ] Block streaming for long responses
- [ ] Chunking with boundary detection
- [ ] Human-like pacing between blocks
- [ ] Live preview for Discord/Telegram

### 5.2 Multi-Agent Workspaces
- [ ] Per-project agent isolation
- [ ] Workspace persistence
- [ ] Agent activation (manual/cron/heartbeat)
- [ ] Context sharing between agents

### 5.3 Gateway Architecture
- [ ] WebSocket server for external connections
- [ ] Discord bot channel
- [ ] Multi-channel support

---

## Implementation Using Sub-Agents

Break down v0.2.0 implementation into sub-agent tasks:

```
🎯 v0.2.0 Implementation
├── 📋 Phase 1.2: Persona System
│   └── agent_spawn: specialist, task="Design SOUL.md format"
├── 📋 Phase 1.3: Context Pruning
│   └── agent_spawn: specialist, task="Implement smart compaction"
├── 📋 Phase 2: Natural Interaction
│   └── agent_spawn: coordinator, task="Remove explicit commands"
├── 📋 Phase 3.2: Agent Types
│   ├── agent_spawn: specialist, task="Implement Researcher agent"
│   ├── agent_spawn: specialist, task="Implement Worker agent"
│   └── agent_spawn: specialist, task="Implement Reviewer agent"
├── 📋 Phase 4: Skills System
│   └── agent_spawn: coordinator, task="Design skill framework"
└── 📋 Phase 5: Streaming
    └── agent_spawn: specialist, task="Implement block streaming"
```

## Definition of Done

v0.2.0 is complete when:

- [ ] User can have natural conversation without explicit commands
- [ ] Familiar remembers context across sessions via perennial memory
- [ ] Automatic delegation to sub-agents based on task complexity
- [ ] Skills can be loaded and executed
- [ ] Multi-project workspace support
- [ ] Documentation is clean and organized
- [ ] Tests pass (target: 90%+ coverage)

## Key Metrics

| Metric | v0.1.0 | v0.2.0 Target |
|--------|--------|---------------|
| Lines of Code | ~15K | ~25K |
| Test Coverage | 85% | 90% |
| Extensions | 12 | 20+ |
| Documentation Files | 40+ | 25 (organized) |
| Commands | 15+ | Natural language |

---

**Next:** Use sub-agents to begin Phase 1.2 (Persona System)
