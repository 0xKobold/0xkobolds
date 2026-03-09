# Multi-Agent Workspace System

**Status:** Design Phase  
**Target Version:** 0.0.7 or later  
**Priority:** High (architectural foundation)

## Overview

A unified gateway serving multiple persistent "main agents", each with isolated workspaces. Agents activate via selection, cron schedules, or heartbeat triggers. Each main agent can spawn sub-agents as needed.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Gateway (Single)                         │
│              Port: 18789 (or configured)                   │
│         Authentication, Routing, Broadcasting                │
└────────────┬────────────────────────────────┬───────────────┘
             │                                │
             ▼                                ▼
┌─────────────────────┐            ┌─────────────────────┐
│   Main Agent #1     │            │   Main Agent #2     │
│   "Development"     │            │   "DevOps"          │
│                     │            │                     │
│   Workspace:        │            │   Workspace:        │
│   ~/workspace/dev   │            │   ~/workspace/ops   │
│                     │            │                     │
│   Activation:       │            │   Activation:       │
│   - Manual select   │            │   - Cron: */5 * * *  │
│   - Heartbeat: 1h   │            │   - Heartbeat: 5min │
│                     │            │                     │
│   Can spawn:        │            │   Can spawn:        │
│   - scout           │            │   - health-check    │
│   - planner         │            │   - deploy-agent    │
│   - worker          │            │   - rollback-agent  │
│   - reviewer        │            │                     │
└─────────┬───────────┘            └─────────┬───────────┘
          │                                  │
          ▼                                  ▼
   ┌──────────────┐                  ┌──────────────┐
   │ Subagents    │                  │ Subagents    │
   │ (ephemeral)  │                  │ (ephemeral)  │
   └──────────────┘                  └──────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Main Agent #3                             │
│                    "Documentation"                           │
│                                                              │
│   Workspace: ~/workspace/docs                                │
│   Activation: Heartbeat daily, manual trigger                │
│   Task: Generate docs, update README, create changelogs      │
└─────────────────────────────────────────────────────────────┘
```

## Core Concepts

### Main Agent
- **Persistent**: Runs as daemon or on-demand
- **Isolated Workspace**: Own directory with:
  - `workspace/` - Project files
  - `state/` - Agent state, memory, config
  - `logs/` - Execution logs
  - `agents/` - Custom subagent definitions
- **Activation Methods**:
  - **Manual**: User selects from TUI
  - **Cron**: Scheduled tasks
  - **Heartbeat**: Periodic checks
  - **Event**: File changes, git hooks, webhooks
- **Subagent Spawning**: Can use `agent_spawn` tool

### Gateway (Shared)
- Single WebSocket server
- All main agents connect as clients
- Routes messages between agents and UI
- No agent-specific code in gateway

### Subagents (Ephemeral)
- Temporary workers spawned by main agents
- Use existing `agent_spawn` system
- Return results to parent main agent
- Clean up after completion

## Workspace Structure

```
~/.0xkobold/
├── config.json              # Global config
├── gateway/
│   └── state.json           # Gateway state
├── agents/
│   ├── dev-agent/           # Main agent: Development
│   │   ├── config.json      # Agent config
│   │   ├── state.json       # Running state
│   │   ├── workspace/       # Working directory
│   │   │   └── (cloned repos, projects)
│   │   ├── memory/          # Agent-specific memory
│   │   ├── logs/            # Execution logs
│   │   └── agents/          # Custom subagents
│   │       └── my-scout.md
│   ├── ops-agent/           # Main agent: DevOps
│   │   ├── config.json
│   │   ├── workspace/
│   │   │   └── docker-compose.yml
│   │   └── ...
│   └── docs-agent/          # Main agent: Documentation
│       └── ...
└── shared/
    └── agents/              # Global subagents
        ├── scout.md
        ├── planner.md
        └── worker.md
```

## Main Agent Configuration

```json
// ~/.0xkobold/agents/dev-agent/config.json
{
  "name": "dev-agent",
  "description": "Development assistant for 0xKobold",
  "version": "1.0.0",
  
  "workspace": {
    "path": "~/workspace/dev",
    "autoClone": "https://github.com/kobolds/0xKobolds",
    "branch": "main"
  },
  
  "activation": {
    "manual": true,
    "cron": ["0 9 * * 1-5"],
    "heartbeat": "1h",
    "onFileChange": ["*.ts", "*.md"]
  },
  
  "model": {
    "provider": "ollama",
    "model": "qwen2.5-coder:14b"
  },
  
  "capabilities": [
    "read", "write", "edit", "search", 
    "shell", "agent_spawn"
  ],
  
  "systemPrompt": "You are the development agent...",
  
  "memory": {
    "enabled": true,
    "scope": "agent"
  },
  
  "subagents": {
    "scout": "~/.0xkobold/shared/agents/scout.md",
    "planner": "~/.0xkobold/shared/agents/planner.md",
    "custom": "./agents/my-scout.md"
  }
}
```

## Activation Methods

### 1. Manual Selection (TUI)
```
┌────────────────────────────────┐
│         0xKobold TUI          │
├────────────────────────────────┤
│ Main Agents:                   │
│                                │
│ [1] dev-agent    ● active     │
│ [2] ops-agent    ○ standby    │
│ [3] docs-agent   ○ standby    │
│                                │
│ Press 1-3 to select            │
└────────────────────────────────┘
```

### 2. Cron Schedule
```json
{
  "activation": {
    "cron": [
      "0 9 * * 1-5",    // 9 AM weekdays
      "0 17 * * 1-5",   // 5 PM weekdays
      "0 2 * * 0"       // 2 AM Sunday
    ]
  }
}
```

### 3. Heartbeat Trigger
```json
{
  "activation": {
    "heartbeat": "30m",     // Every 30 minutes
    "condition": "check_for_updates",
    "action": "update_dependencies"
  }
}
```

### 4. Event-Driven
```json
{
  "activation": {
    "onFileChange": ["package.json"],
    "onGitPush": true,
    "onWebhook": "/webhook/docs"
  }
}
```

## Command Interface

```bash
# List main agents
0xkobold agents list

# Create new main agent
0xkobold agents create dev-agent --workspace ~/projects/dev

# Start agent manually
0xkobold agents start dev-agent

# Stop agent
0xkobold agents stop dev-agent

# View agent logs
0xkobold agents logs dev-agent --follow

# Send task to running agent
0xkobold agents task dev-agent "Review PR #123"

# Spawn subagent from agent
0xkobold agents spawn dev-agent --agent scout --task "Find auth code"
```

## Extension: agent-workspace-extension

```typescript
// Main agent lifecycle
interface WorkspaceExtensionAPI {
  // Agent management
  registerAgent(config: AgentConfig): void;
  startAgent(name: string): Promise<void>;
  stopAgent(name: string): Promise<void>;
  listAgents(): AgentInfo[];
  
  // Task delegation
  sendTask(agentName: string, task: string): Promise<TaskResult>;
  
  // Subagent spawning (within agent context)
  spawnSubagent(
    parentAgent: string, 
    config: SubagentConfig
  ): Promise<SubagentResult>;
  
  // Scheduling
  scheduleCron(agentName: string, cron: string, task: string): void;
  scheduleHeartbeat(agentName: string, interval: string): void;
  
  // Workspace isolation
  getAgentWorkspace(agentName: string): string;
  getAgentState(agentName: string): AgentState;
  getAgentMemory(agentName: string): MemoryStore;
}
```

## TUI Integration

```typescript
// Agent selector component
export function AgentSelector() {
  return (
    <Box flexDirection="column">
      <Text bold>Main Agents</Text>
      {agents.map(agent => (
        <AgentRow
          key={agent.name}
          name={agent.name}
          status={agent.status}
          lastActive={agent.lastActive}
          onSelect={() => selectAgent(agent.name)}
        />
      ))}
    </Box>
  );
}

// Show active agent in footer
export function StatusFooter({ activeAgent }) {
  return (
    <Box>
      <Text>Agent: {activeAgent?.name || 'None'}</Text>
      <Text> | </Text>
      <Text>Workspace: {activeAgent?.workspace}</Text>
    </Box>
  );
}
```

## Implementation Plan

### Phase 1: Foundation (0.0.7)
- [ ] `agent-workspace-extension.ts` core
- [ ] Workspace directory structure
- [ ] Agent config loading
- [ ] Manual selection TUI
- [ ] Basic start/stop lifecycle

### Phase 2: Gateway Integration (0.0.8)
- [ ] Gateway runs standalone
- [ ] Agents connect via WebSocket
- [ ] Message routing
- [ ] Broadcasting between agents

### Phase 3: Scheduling (0.0.9)
- [ ] Cron integration (node-cron)
- [ ] Heartbeat scheduling
- [ ] Event listeners (file, git)
- [ ] Task queue management

### Phase 4: Advanced Features (0.1.0)
- [ ] Agent-to-agent communication
- [ ] Shared memory between agents
- [ ] Agent templates
- [ ] Workspace snapshots

## Comparison with Current System

| Aspect | Current (0.0.5) | Future (0.0.7+) |
|--------|-----------------|-----------------|
| **Gateway** | Per-session | Single, shared |
| **Main Agents** | One (you) | Multiple, persistent |
| **Subagents** | Ephemeral pi processes | Same |
| **Workspaces** | Current working dir | Isolated per agent |
| **Activation** | Manual | Manual + Auto |
| ** Scheduling** | None | Cron + Heartbeat |
| **State** | Session-only | Persistent |

## Migration Path

```typescript
// Current (0.0.5)
// User runs 0xkobold in a directory
// Single agent, single workspace

// Future (0.0.7)
// Gateway runs as daemon or service
// User selects/activates main agents
// Each agent has isolated workspace

// Migration:
// 1. User's current session becomes "default" agent
// 2. Workspace stays as-is
// 3. New agents created from templates
// 4. Gradual migration of workflows
```

## Benefits

1. **Isolation**: Each agent has clean workspace
2. **Specialization**: Dev agent, Ops agent, Docs agent
3. **Automation**: Scheduled tasks without user presence
4. **Scalability**: Multiple concurrent workspaces
5. **Organization**: Clear separation of concerns
6. **Persistence**: Agent state survives restarts

## Use Cases

| Agent Type | Workspace | Schedule | Tasks |
|------------|-----------|----------|-------|
| **Development** | `~/projects/main` | Manual | Code, debug, review |
| **DevOps** | `~/workspace/ops` | 5min cron | Monitor, deploy |
| **Documentation** | `~/workspace/docs` | Daily | Generate, update |
| **Security** | `~/workspace/sec` | Hourly | Scan, audit |
| **Research** | `~/workspace/rnd` | Event | Explore, prototype |

## Dependencies

- `node-cron` - Cron scheduling
- `chokidar` - File watching
- `ws` - WebSocket client for agents
- Existing: `gateway-extension`, `subagent-extension`

## Notes

- **Not replacing** current subagent system
- **Extending** with persistent main agents
- **Single gateway** is key architectural decision
- **Backwards compatible** - existing workflows work
- **Gradual adoption** - opt-in for new features
