## Multi-Agent Workspace System 🏗️ [v0.2.0+]

Run multiple persistent AI agents with isolated workspaces. Each agent has its own context, memory, and capabilities.

```
┌─────────────────────────────────────────┐
│           Gateway (Standalone)        │ ◄── Coordinates all agents
│           Port: 18789                 │
└────┬─────────────┬──────────────────┘
     │             │
┌────▼────┐   ┌───▼────┐
│ Dev     │   │ Ops    │ ◄── Main Agents (persistent)
│ Agent   │   │ Agent  │
└────┬────┘   └───┬────┘
     │            │
┌────▼────┐  ┌───▼────┐
│Scout    │  │Health  │ ◄── Subagents (ephemeral)
│Planner  │  │Checker │
│Worker   │  │Deploy  │
└─────────┘  └────────┘
```

### Why Multi-Agent?

Instead of one agent doing everything:
- **Dev Agent**: Codes features, reviews PRs
- **Ops Agent**: Monitors services, deploys to production
- **Docs Agent**: Auto-generates documentation
- **Research Agent**: Explores new technologies

Each with isolated workspaces, scheduled tasks, and specialized capabilities.

### Quick Start: Multi-Agent

```bash
# Initialize your first agent workspace
0xkobold agent init dev-agent --description "Main development agent"

# Create workspace structure
# ~/.0xkobold/agents/dev-agent/
#   ├── config.json      # Agent configuration
#   ├── workspace/        # Working directory
#   ├── memory/          # Agent-specific memory
#   └── logs/            # Execution logs

# Start the agent
0xkobold agent start dev-agent

# Check status
0xkobold agent status dev-agent

# Switch TUI to this agent
0xkobold agent select dev-agent
```

### Agent Commands

```
/agent-init <name>          # Create new agent workspace
/agent-start <name>          # Start agent process
/agent-stop <name>           # Stop agent process
/agent-status [name]         # Check agent status
/agent-select <name>         # Switch TUI to agent
/agents                      # List all agents
```

## Autonomous Subagents 🤖

**No commands needed.** Just describe your task, and the agent automatically decides when to use subagents.

### How It Works

```
You: "Implement user authentication system"

Agent: 🤖 Analyzing task...
       Complexity: COMPLEX
       Strategy: Scout → Planner → Workers → Reviewer

✅ Scout finds auth code
✅ Planner designs secure flow
✅ Workers implements components
✅ Reviewer approves changes
🎉 All done!
```

### Complexity Detection

The agent analyzes your request:

| Complexity | Trigger Words | Strategy |
|------------|---------------|----------|
| **Simple** | "fix typo", "update config" | Handle directly |
| **Medium** | "implement feature" | Scout + Worker |
| **Complex** | "redesign", "architecture" | Full workflow |

### Control Autonomy

```
/autonomous-toggle simple     # Only complex tasks use subagents
/autonomous-toggle medium    # Medium + complex (default)
/autonomous-toggle complex   # Only complex tasks
/autonomous-toggle always    # Everything uses subagents
/autonomous-toggle off       # Disable auto-delegation
/autonomous-status           # Show current mode
```

### Explicit Delegation

```
/implement <feature>           # Auto-detect and delegate
/scout-and-plan <feature>     # Scout → Planner only
/parallel "task 1" "task 2"  # Run scouts in parallel
```

### Built-in Subagents

| Agent | Purpose | Tools |
|-------|---------|-------|
| **scout** | Fast reconnaissance | read, search, list |
| **planner** | Create implementation plans | read, search |
| **worker** | Full implementation | all tools |
| **reviewer** | Code review | read, search |

Create custom agents:
```
/subagent-create health-checker
# Edit ~/.0xkobold/agents/health-checker.md
```

## Subagent Workflows

Pre-built workflows for common tasks:

### /implement - Full Implementation

```
/implement add Redis caching

Workflow:
1. Scout finds current caching code
2. Planner designs Redis integration
3. Workers implement Redis client
4. Reviewer checks error handling

✅ Complete in 4 steps
```

### /scout-and-plan - Planning Only

```
/scout-and-plan refactor auth to OAuth2

Workflow:
1. Scout analyzes current auth
2. Planner creates OAuth2 migration plan

📋 Plan ready (no implementation)
```

### /parallel - Parallel Reconnaissance

```
/parallel "Find auth code" "Find models" "Check dependencies"

Runs 3 scouts simultaneously → Aggregates results
```

## Commands Reference

### Agent Management
```
0xkobold agent init <name> [--description]   # Create workspace
0xkobold agent start <name>                     # Start agent
0xkobold agent stop <name>                      # Stop agent
0xkobold agent status [name]                    # Check status
0xkobold agent list                             # List all agents
0xkobold agent logs <name> [--follow]           # View logs
```

### Subagent Control
```
/implement <feature>              # Auto-delegate based on complexity
/scout-and-plan <feature>         # Plan only
/parallel "task 1" "task 2"       # Parallel scouting

/autonomous-toggle [mode]          # Control delegation
/subagents                        # List available subagents
/subagent-create <name>           # Create custom agent
```

### Ollama Cloud
```
/ollama-mode [local|cloud|auto]   # Switch provider
/ollama-status                   # Check connection
/login                           # Authenticate cloud
```

### Mode Switching
```
/plan                            # Switch to plan mode
/build                           # Switch to build mode
/mode                            # Show current mode
```

## Configuration: Multi-Agent

Agent config in `~/.0xkobold/agents/<name>/config.json`:

```json
{
  "name": "dev-agent",
  "description": "Development assistant",
  "version": "1.0.0",
  "enabled": true,
  "autoStart": false,
  "workspace": {
    "path": "~/.0xkobold/agents/dev-agent/workspace",
    "autoClone": "https://github.com/your/project"
  },
  "activation": {
    "manual": true,
    "cron": ["0 9 * * 1-5"],
    "heartbeat": "30m"
  },
  "model": {
    "provider": "ollama",
    "model": "qwen2.5-coder:14b"
  },
  "capabilities": [
    "read", "write", "edit", "search", "shell", "subagent_spawn"
  ],
  "memory": {
    "enabled": true
  }
}
```

### Scheduling

Agents activate via:
- **Manual**: User starts them
- **Cron**: `"0 9 * * 1-5"` for weekdays at 9am
- **Heartbeat**: `"30m"` every 30 minutes
- **File Change**: Watch for `.env` changes

## Feature Comparison

| Feature | 0.1.x | 0.2.0+ |
|---------|-------|--------|
| **Main Agents** | 1 | Unlimited |
| **Subagents** | Ephemeral | Ephemeral + Persistent |
| **Automatic Delegation** | Manual commands | Auto-detect |
| **Workspaces** | Single | Isolated per agent |
| **Scheduling** | None | Cron + Heartbeat |
| **Process Isolation** | None | Full isolation |

## Examples

### Dev Agent Workflow

```bash
# Initialize dev agent
0xkobold agent init dev-agent

# Configure for your project
echo '{
  "autoClone": "https://github.com/your/project",
  "activation": {
    "manual": true,
    "cron": ["0 9 * * 1-5"]
  }
}' > ~/.0xkobold/agents/dev-agent/config.json

# Start and use
0xkobold agent start dev-agent
0xkobold agent select dev-agent

# Now in TUI:
/implement new payment system
/autonomous-toggle medium
```

### Ops Agent Monitoring

```bash
0xkobold agent init ops-agent --description "DevOps monitoring"

# Set up cron
0xkobold agent config ops-agent --cron="*/5 * * * *"

# Start with auto-restart
0xkobold agent start ops-agent --restart=always

# Agent wakes up every 5 minutes, does health checks
```

### Multi-Agent Collaboration

```
Dev Agent: Implements feature
    │
    triggers
    │
Ops Agent: Wakes up, detects new code
    │
    deploys
    │
Docs Agent: Updates documentation
```

## Architecture

See [docs/MULTI-AGENT-WORKSPACE.md](docs/MULTI-AGENT-WORKSPACE.md) for full architecture details.

---

