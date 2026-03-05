# 0xKobold Architecture - Session Isolation & Task Management

## New Extensions Added

### 1. Session Manager Extension
**Location:** `src/extensions/core/session-manager-extension.ts`

**Purpose:**
- Each TUI/Discord instance gets isolated session
- Conversation history persists per session
- Can resume previous sessions

**Features:**
- Session creation/resumption via SQLite (`~/.0xkobold/sessions.db`)
- Automatic message storage for conversation history
- Session identification via `KOBOLD_SESSION_ID` env var

**Commands:**
- `/session` - Show current session info
- `/sessions` - List all active sessions
- `/resume <session-id>` - Resume a previous session's conversation

**Data Structure:**
```typescript
interface Session {
  id: string;           // e.g., "tui-1234567890-abc123"
  type: "tui" | "discord";
  workspace: string;
  createdAt: number;
  lastActivity: number;
  isActive: boolean;
}
```

**Usage:**
```bash
# Start new session
0xkobold tui --local
cd ~/project && 0xkobold tui --local

# Sessions are automatically created and isolated
# Each TUI only sees its own messages
```

---

### 2. Task Manager Extension
**Location:** `src/extensions/core/task-manager-extension.ts`

**Purpose:**
Kanban-style task workflow for breaking down requests and tracking work.

**Columns (Statuses):**
| Status | Emoji | Description |
|--------|-------|-------------|
| backlog | 📋 | Ideas and future work |
| needs-assignment | 👤 | Ready but unassigned |
| in-progress | 🏗️ | Currently working on it |
| needs-review | 👀 | Awaiting review |
| blocked | 🚫 | Stalled, needs help |
| done | ✅ | Complete |

**Commands:**
```bash
/task "Create login page" "Build auth form with validation"
/tasks                    # Show kanban board
/task-show <id>         # View task details
/task-move <id> done     # Move to done
/task-assign <id> @user  # Assign task
/task-comment <id> "LGTM" # Add comment
```

**AI Tools:**
- `task_breakdown` - Break request into subtasks
- `task_list` - Query tasks by status
- `task_update` - Move/assign tasks

**Example Workflow:**
```
User: "Build a todo app"
AI: Creates task, uses task_breakdown to create subtasks:
  - Create UI components
  - Add local storage
  - Style with CSS
User: /tasks to view board
AI works through tasks, moving them columns as complete
```

---

### 3. MCP Extension
**Location:** `src/extensions/core/mcp-extension.ts`

**Purpose:**
Integrate Model Context Protocol (MCP) servers for standardized external tools.

**Configuration:** `~/.0xkobold/mcp.json`

**Pre-configured Servers:**
- `filesystem` - File operations via MCP
- `github` - GitHub API access
- `sqlite` - Database operations

**Commands:**
```bash
/mcp-list                    # Show servers and status
/mcp-enable github          # Activate and connect
/mcp-disable filesystem     # Disconnect
/mcp-add name command args  # Add new server
```

**Tool Discovery:**
MCP servers auto-discover tools which get registered as:
`mcp_{server-name}_{tool-name}`

---

## Session Isolation Architecture

### How It Works

```
┌─────────────────────────────────────────────────────┐
│                    System                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ TUI #1      │  │ TUI #2      │  │ Discord     │ │
│  │ Session A   │  │ Session B   │  │ Session C   │ │
│  │ workspace X │  │ workspace Y │  │ workspace Y │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
│         │                │                │         │
│         ▼                ▼                ▼         │
│  ┌──────────────────────────────────────────────┐  │
│  │          Session Manager (SQLite)            │  │
│  │  sessions.db  •  messages per session       │  │
│  └──────────────────────────────────────────────┘  │
│                      │                              │
│                      ▼                              │
│  ┌──────────────────────────────────────────────┐  │
│  │          Task Manager (SQLite)               │  │
│  │  tasks.db  •  kanban board per workspace   │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Key Behaviors

1. **Each TUI = New Session**
   - Unique ID generated on start
   - Messages stored with sessionId
   - Session tracks workspace

2. **Shared Across Instances in Same Workspace**
   - Tasks are workspace-scoped
   - Multiple TUIs in same dir share kanban board
   - Sessions are separate but tasks collaborative

3. **Resume Capability**
   - Can resume conversation history
   - Session ID can be passed via env var
   - History loads automatically

---

## Usage Examples

### Starting Multiple TUIs
```bash
# Terminal 1 - Project A
cd ~/projects/project-a
0xkobold tui --local
# Creates session-1, works in project-a

# Terminal 2 - Project B  
cd ~/projects/project-b
0xkobold tui --local
# Creates session-2, works in project-b

# Terminal 3 - Also Project B
cd ~/projects/project-b
0xkobold tui --local
# Creates session-3, works in project-b
# Shares task board with Terminal 2
```

### Task Workflow
```
# User creates task
/task "Implement auth" "Add JWT auth middleware"

# AI breaks it down via tool
AI: I've broken this down into 3 subtasks in the backlog

# User checks board
/tasks
┌─────────────────────────────────────────────────┐
│ 📋 Backlog (2)                                  │
│   - Set up JWT library                          │
│   - Add auth middleware                         │
│ 🏗️ In Progress (1)                              │
│   - Implement auth (assigned to AI)               │
└─────────────────────────────────────────────────┘

# AI works through, moves to done
/task-move abc in-progress
...work...
/task-move abc done
```

### MCP Integration
```bash
# Add GitHub token first
0xkobold persona edit MCP

# Enable MCP server
/mcp-enable github

# Now AI can use
AI: I'll check the issues
[uses mcp_github_list_issues]
```

---

## Technical Notes

### SQLite Databases
- `~/.0xkobold/sessions.db` - Session and message history
- `~/.0xkobold/tasks.db` - Kanban board and task comments
- `~/.0xkobold/mcp.json` - MCP server configuration

### Environment Variables
```bash
KOBOLD_WORKING_DIR    # Set by --local flag
KOBOLD_SESSION_TYPE   # "tui" or "discord"
KOBOLD_SESSION_ID     # Set by session manager
KOBOLD_RESUME_SESSION # Optional: session to resume
```

### Extension Loading Order
1. **Infrastructure**: ollama-provider, session-manager
2. **Core Features**: persona, context-aware, onboarding, mode-manager, task-manager  
3. **Integrations**: mcp, gateway, update, self-update

---

## Testing

```bash
# Test session isolation
0xkobold tui --local
/session        # Shows current session
/sessions       # Lists all sessions

# Test task board
/task "Test task" "A test"
/tasks
/task-show <id>
/task-move <id> in-progress
/task-move <id> done

# Test MCP
/mcp-list
```
