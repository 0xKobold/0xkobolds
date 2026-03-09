# 0xKobold Implementation Plan

## Overview: Incremental Path to Multi-Agent Workspaces

This plan takes us from 0.1.0 to 0.2.0+ while delivering value at each step.

---

## Phase 0: Foundation Fixes (0.1.1) - 3 days

**Goal:** Solidify current system before major architecture changes

### Tasks
```markdown
- [ ] Debug mode for subagents
  - `/subagent-debug` command
  - Verbose logging to file
  - Agent execution tracing
  
- [ ] Bug fixes from usage
  - Fix any issues from 0.1.0 feedback
  - Better error messages for common failures
  
- [ ] Documentation updates
  - Update README with subagent examples
  - Create `/examples` directory with workflows
```

**Deliverable:** 0.1.1 released as stable baseline

---

## Phase 1: Standalone Gateway (0.1.2) - 1 week

**Goal:** Gateway runs independently of TUI sessions

### Architecture
```
┌─────────────────────────────────────────┐
│           Gateway (Standalone)        │ ◄── Always runs
│           Port: 18789                 │     Manages connections
└──────────┬──────────────────────┬─────┘
           │                      │
    ┌──────▼──────┐       ┌──────▼──────┐
    │ TUI Client  │       │ TUI Client  │
    │  (You)      │       │  (Future)   │
    └─────────────┘       └─────────────┘
```

### Tasks
```markdown
- [ ] Gateway service mode
  - `0xkobold gateway start --daemon` (background)
  - `0xkobold gateway stop`
  - `0xkobold gateway status` (service status)
  
- [ ] Gateway auto-start
  - On TUI launch, connect to existing gateway
  - If none exists, prompt to start
  
- [ ] Connection persistence
  - WebSocket reconnection logic
  - Session restoration on reconnect
  
- [ ] Gateway logging
  - Connection logs
  - Event logs
  - Admin stats endpoint
```

**Deliverable:** Gateway runs independently, TUI connects as client

---

## Phase 2: Workspace Structure (0.1.3) - 1 week

**Goal:** Directory structure and agent configuration

### Directory Layout
```
~/.0xkobold/
├── config.json              # Global settings
├── gateway/
│   └── state.json          # Gateway state
├── agents/                  # Main agent definitions
│   ├── dev-agent/
│   │   ├── config.json     # Agent config
│   │   ├── workspace/      # Working directory
│   │   ├── memory/         # Agent-specific memory
│   │   └── logs/           # Execution logs
│   │   └── agents/         # Custom subagents
│   │       └── my-scout.md
│   └── (more agents...)
└── shared/
    └── agents/             # Global subagents
        ├── scout.md
        ├── planner.md
        └── worker.md
```

### Tasks
```markdown
- [ ] Create workspace structure on first run
  - `0xkobold setup --workspace` flag
  - Migration from existing config
  
- [ ] Agent configuration system
  - JSON schema validation
  - Hot-reloading of configs
  - Agent validation
  
- [ ] CLI commands
  - `0xkobold agent list` - List main agents
  - `0xkobold agent init <name>` - Create new agent
  - `0xkobold agent validate` - Check configs
```

**Deliverable:** Agents have persistent workspace structure

---

## Phase 3: Agent Lifecycle (0.2.0-alpha.1) - 1 week

**Goal:** Basic start/stop/persistence for main agents

### Architecture
```
┌─────────────────────────────────────────┐
│           Gateway                      │
└────┬───────────────────────────┬──────┘
     │                           │
┌────▼────┐               ┌──────▼────┐
│ Agent   │               │  Agent    │
│ States  │               │  States   │
├─────────┤               ├───────────┤
│ stopped │               │  running  │
│ starting│◄─────────────►  ready    │
│ running │               │  error    │
│ error   │               │  stopped  │
└─────────┘               └───────────┘
```

### Tasks
```markdown
- [ ] Agent process spawning
  - Spawn pi-coding-agent in workspace
  - Process management (PID tracking)
  - Graceful shutdown
  
- [ ] State persistence
  - Agent state to disk
  - Recovery on gateway restart
  
- [ ] TUI integration
  - Agent status indicator
  - Start/stop buttons
  - Basic logs viewer
  
- [ ] Command
  - `0xkobold agent start <name>` - Start main agent
  - `0xkobold agent stop <name>` - Stop main agent
  - `0xkobold agent logs <name>` - View logs
```

**Deliverable:** Can start/stop main agents, they persist to disk

---

## Phase 4: Message Routing (0.2.0-alpha.2) - 1 week

**Goal:** TUI talks to main agents through gateway

### Architecture
```
┌──────────────┐      WebSocket      ┌──────────────┐
│  TUI Client  │◄──────────────────►│   Gateway    │
└──────┬───────┘                     └──────┬───────┘
       │                                    │
       │      "Select dev-agent"            │
       │─────────────────────────────────────►│
       │                                    │
       │      "Run this task"               │
       │─────────────────────────────────────►│
       │                                    │
       │                                    │◄───┐
       │                                    │    │ WebSocket
       │                                    │    │ to agent
       │                                    ▼────┘
       │                              ┌──────────────┐
       │                              │  dev-agent   │
       │                              │  (pi process)│
       │                              └──────────────┘
```

### Tasks
```markdown
- [ ] Protocol messages
  - AGENT_SELECT: Switch active agent
  - AGENT_MESSAGE: Send message to agent
  - AGENT_EVENT: Receive agent events
  
- [ ] Connection management
  - Multiple TUI clients
  - Agent connection multiplexing
  - Broadcast to all connected TUI clients
  
- [ ] TUI agent selector
  - UI to switch between agents
  - Indicator showing which agent is active
  - List of running agents
```

**Deliverable:** TUI can communicate with running main agents

---

## Phase 5: Full Multi-Agent (0.2.0) - 1 week

**Goal:** Complete multi-agent workspace system

### Features
```markdown
- [ ] Scheduling system
  - Cron integration (node-cron)
  - Heartbeat scheduling
  - Event-driven activation (file changes)
  
- [ ] Agent task queue
  - Queue tasks for agents
  - Priority handling
  - Task history
  
- [ ] Agent workspace isolation
  - Each agent has chroot-like isolation
  - Environment variables per agent
  - Secrets management
  
- [ ] Commands
  - `0xkobold agent task <name> "do something"`
  - `0xkobold agent schedule <name> --cron="0 9 * * 1-5"`
  - `0xkobold agents` - List all with status
```

**Deliverable:** 0.2.0 released with full multi-agent support

---

## Phase 6: Enhancements (0.2.1+) - Ongoing

**Post-0.2.0 features:**

```markdown
- [ ] Web dashboard for gateway
- [ ] Agent-to-agent communication
- [ ] Shared memory between agents
- [ ] Workspace templates
- [ ] Agent snapshots
- [ ] Load balancing
```

---

## Timeline Summary

| Phase | Version | Duration | Focus |
|-------|---------|----------|-------|
| 0 | 0.1.1 | 3 days | Foundation fixes |
| 1 | 0.1.2 | 1 week | Standalone gateway |
| 2 | 0.1.3 | 1 week | Workspace structure |
| 3 | 0.2.0-alpha.1 | 1 week | Agent lifecycle |
| 4 | 0.2.0-alpha.2 | 1 week | Message routing |
| 5 | 0.2.0 | 1 week | Full system |
| 6 | 0.2.1+ | Ongoing | Enhancements |

**Total time to 0.2.0:** ~5 weeks (with buffers)

---

## Benefits of This Plan

1. **Incremental Value**: Each phase delivers usable features
2. **Feedback Loops**: Can adjust based on 0.1.x usage
3. **Reduced Risk**: Not one big-bang release
4. **Clear Milestones**: Each phase has clear deliverables
5. **Optional Steps**: Can skip 0.1.2 or 0.1.3 if needed

---

## Alternative: Fast Track (4 weeks)

Skip standalone phases, go straight to multi-agent:

- Week 1: Foundation fixes (0.1.1)
- Week 2-3: Multi-agent core (0.2.0-alpha)
- Week 4: Polish and release (0.2.0)

**Trade-off:** Less testing of intermediate pieces, but faster to vision.

---

**Which path do you prefer?**
1. 📋 **Incremental plan** (5 weeks, more testing)
2. 🚀 **Fast track** (4 weeks, straight to multi-agent)
3. 🎯 **Custom** (pick and choose phases)
