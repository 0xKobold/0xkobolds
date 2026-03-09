# Natural Subagent Usage

**No commands needed.** Just talk naturally.

## How It Works

The agent detects natural language patterns and automatically uses subagents.

### Natural Triggers → Automatic Actions

| You Say | Agent Automatically... |
|---------|------------------------|
| "**analyze** this codebase" | Spawns **scout** → Reports findings |
| "**implement** user auth" | Analyzes → Spawns **planner** → **workers** → **reviewer** |
| "**find** all API routes" | Spawns **scout** → Lists files |
| "**plan** the migration" | Spawns **planner** → Creates plan |
| "**review** this code" | Spawns **reviewer** → Provides feedback |
| "**use subagents**" | Asks what task, then delegates |

### Complexity-Based Delegation

The agent analyzes your request:

**Simple** (1-2 files)
```bash
You: "Fix this typo"
Agent: ✅ I'll handle this directly
```

**Medium** (3-5 files)
```bash
You: "Add error logging"
Agent: 🤖 Delegating to scout → worker...
```

**Complex** (5+ files, architecture)
```bash  
You: "Refactor to microservices"
Agent: 🤖 Full workflow: scout → planner → workers → reviewer
```

## Examples

### Example 1: Natural Analysis
```bash
You: "Please analyze the authentication system"

Agent: 🤖 Analyzing authentication system...
        Spawning scout to find auth code...
        Found 12 relevant files.
        
        Here's what I discovered:
        - 3 auth middleware files
        - 5 user-related models  
        - 4 API endpoints
```

### Example 2: Natural Implementation
```bash
You: "Implement password reset"

Agent: 🤖 This is medium complexity.
        Spawning workflow...
        
        Scout: Found user models
        Planner: Created 5-step plan
        Worker: Implemented password reset flow
        
        ✅ Complete! Password reset is working.
```

### Example 3: Explicit Request
```bash
You: "Use subagents to check performance"

Agent: 🔍 Spawning performance analysis...
        
        Scout found slow database queries
        Reviewer identified optimization opportunities
        
        Recommendations:
        1. Add indexes on user_id
        2. Cache session data
```

### Example 4: Simple Task
```bash
You: "Fix the typo in README"

Agent: ✅ Simple task - I'll fix it directly.
        (No subagents needed)
```

## Controlling Autonomy

If you want to disable automatic delegation:

```bash
/autonomous off    # Handle everything directly
/autonomous on     # Enable auto-delegation (default: medium)
```

## The agent_orchestrate Tool

The agent uses this tool internally when it decides subagents are needed:

```typescript
// You say: "Implement auth"
// Agent internally calls:
agent_orchestrate({
  operation: "delegate",
  task: "Implement auth",
  autoDelegate: true
})

// Result: Appropriate subagents are spawned automatically
```

## Available Subagents

The agent can spawn any of these:

| Agent | Purpose | Best For |
|-------|---------|----------|
| **scout** | Fast reconnaissance | Finding code, checking structure |
| **planner** | Implementation plans | Design, architecture decisions |
| **worker** | Full implementation | Writing code, making changes |
| **reviewer** | Code review | Security, quality, best practices |

## No Commands Needed

**Old way (command-based):**
```bash
/implement "add auth"
/scout "find auth code"
```

**New way (natural):**
```bash
"Add authentication please"
"Find all auth-related code"
"What needs refactoring?"
```

The agent understands context and delegates appropriately.

## Tips

1. **Be specific:** "Find auth code" vs "Check stuff"
2. **Mention scope:** "This project" vs "All files"
3. **Say "use subagents"** if you explicitly want them
4. **Check first:** "What would you recommend?" → Agent analyzes first

## What the Agent Shows You

```bash
🤖 - Thinking about delegation
🚀 - Spawning subagents  
✅ - Subagent complete
🔍 - Scout findings
📋 - Planner output
⚒️  - Worker results
🔒 - Reviewer feedback
```

---

**Just talk naturally. The agent handles the rest.**
