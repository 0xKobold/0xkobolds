# README Update Plan for 0.2.0

## Complexity Analysis

**Task:** Update README.md  
**Estimated Complexity:** MEDIUM  
**Strategy:** Scout + Worker workflow

## Sections to Add/Update

### 1. Add Multi-Agent Workspace Section (after Features)

```markdown
## Multi-Agent Workspace System 🏗️ (v0.2.0)

Run multiple persistent AI agents with isolated workspaces:

```
┌─────────────────────────────────────────┐
│           Gateway (Standalone)        │
└────┬──────────────┬───────────────────┘
     │              │
┌────▼────┐   ┌────▼────┐
│ Dev     │   │ Ops     │
│ Agent   │   │ Agent   │
└────┬────┘   └────┬────┘
     │             │
┌────▼────┐   ┌────▼────┐
│ Workers │   │ Workers │
└─────────┘   └─────────┘
```

### Key Features
- **Multiple Main Agents** - Each with isolated workspace
- **Persistent State** - Agents survive restarts
- **Autonomous Delegation** - Agents decide when to use subagents
- **Lifecycle Management** - Start/stop agents on demand

### Commands
```bash
/agent-init dev-agent         # Create new agent workspace
/agent-start dev-agent        # Start agent process
/agent-select dev-agent       # Switch TUI to agent
/agent-status                 # Check agent status
```
```

### 2. Update Features Table

Add new features:
- Multi-agent workspaces
- Autonomous delegation
- Agent lifecycle management
- Task complexity analysis

### 3. Add Autonomous Subagent Examples

```markdown
### Autonomous Delegation

Just say "use subagents" and the agent handles the rest:

**Example:**
```
You: Implement user authentication system

Agent: 🤖 Analyzing task...
Complexity: COMPLEX
Strategy: Scout → Planner → Workers → Reviewer

✅ Scout found auth code
✅ Planner created implementation plan  
✅ Workers implemented 5 components
✅ Reviewer approved all changes
Done! 🎉
```

### Control Autonomy
```bash
/autonomous-toggle           # Enable/disable auto-delegation
/autonomous-status           # Show current mode
/delegation-plan <task>      # Preview what would happen
```
```

### 4. Update Quick Start

Add agent workspace initialization:

```bash
# Setup with agent workspaces
0xkobold setup --with-agents

# Initialize your first agent
0xkobold agent init my-agent
0xkobold agent start my-agent
```

## Implementation Plan

### Subagent 1: Scout (Read Current README)
- Read README.md
- Identify what needs updating
- Report findings

### Subagent 2: Worker (Update README)
- Add multi-agent section
- Update feature table
- Add autonomous examples
- Update quick start

### Subagent 3: Reviewer (Check Changes)
- Verify all new features documented
- Check formatting
- Ensure examples work

## Acceptance Criteria

- [ ] Multi-agent workspace section added
- [ ] Autonomous delegation section added  
- [ ] Feature table updated
- [ ] Quick start includes agent commands
- [ ] Examples are tested and working
- [ ] Version badge shows 0.2.0
