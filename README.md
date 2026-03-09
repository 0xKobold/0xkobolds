# 0xKobold

```
                         ..
            .                                        ..
                 . ,^   .                   .   .....          ......
            ,^ ... :: .  .                   ...     ,;.    ...
           .lI^ I.`I,.. ;;..             . `l}^ ^:;+td]^..      ^:!!i .
           . ,:^I^I< . :+,..             ..l+tI`!?o@f,     .,~fWQft?<..
        `:. ^<l>,!I>^`<!^              .. `?_-11COQYI:;l!l+1o@#[l
         !<`l.ii,~l^iI-,`!I..   .. ...   ^l>??}JOoUUZ1]-fYXB@fl    ,+i..
     . `.:<+:<ll>~l>+-<:~!^    .      I_>_?<+?}Bb+M8%oOf}-_+_!~~+[CQJ:..
     `:,lI,:Ii!<:`!iii>_+^ :!^  ^``^,l+?<_}+fJ?1ItJ1<>?[?JX1YdOOodtl  ..
    . li:^~Il, :Il`::,:i!,I>I`^l_~--<i_<>?+~?_-CY}~i+-?~]fO@@@@@Ml
     ..,!``I,!]JZXJ{]I,,~~;,  I[_<-t}1doCdfdQCOB%oJ{+?{ddMO@@@#@o>` .:-< .
      .``l;;{QW%###WQZ+;>>I ...<YfZ{]}Xb!IQ@@8%W@@QJ{[-JJZ@@@@@@%dZbMX[,..
     . II ,I]bo%8%%MQd?>;  .    ;li   . ,Z@@@@#@MI]~ZUOX}YB@@@@@8oQY};
      . ^>^.^~fbXXdZf_,, Il .         I~d@@#MOIY>l[ZoW@@@@@@@@@UIMO{.   .
        `I!<` ,lllll :,i;,^`    ...~+<d#oJQQbIIJdUB@@@@@@@#%OU8WW@@81+,`
       .,i[l:i!, `:I<-l<-, ^^`  ..:]ZodXIdbC1i1Z#@@@@@@%%BWWoO%@@@@%bQf[^.
       .J-I ~I!.iCU->-1_<`ii>~:....:_1}It}!.::+tX%#@%MbMBQ%@@@@@@%%WbY]+-~`.
        XWOUMO{,Z@B-;1B]:I_->i^      ...   `;;JOB#QB#M8@@@@@@8OOOQdZ{~i!i!:.
       ..iJB@@M[1@%Y<X@o][]]>:III,^,    ....,Z@@@@@@@@@@@@@@8#WOMoZI~~~~+I..
           `~M@8X#@8Zf#@BUWb1{1?]1}]<!^ ...:b@@@@@@@@@@@@@8BW#dXZf[?-+l:`..
         ..  :JB@@@@%%@@@B#@%W%OQ8BMQbU> ..>M%@@@@@@@@@@@#8WBMZII]_I:^
           ..  ^?1YbMWO#@@@@@@@@@@@@@@OZ-` d@#@@@@@@@@#%W8##OoXZXQCi^ ...
             ..     .`.:!~-CXd%@@@@@@@8oQ}}%@@@@@@@@@@@BWWBWMMdbf[->>^..
               .....          :{@@@@@@@OYUCQ8@@@@@@@@8BB8WMQModU?++:!I..
                    ..........  _@@B8%@#QMdYJO@@@@%BB%obO%obbXZ{?-~l,;..
                              .. {ooQB%o@%OO-{Z@%oOooWOXZYYII}?_~iiI.`
                              . ^+IoQWQbOQXdJbfU#BdUZYJI[{[--l>:`
                                `><+-]1??_~>++~!]J{}~>i>>;!;`     ..
                                                   `         . ..
                                 ........ ......... .........
```

> *"Your digital familiar - a personal AI assistant that learns, evolves, and helps you code 24/7"*

## Hybrid Architecture

Best of both worlds:
- **Bun + Elysia** for blazing fast gateway
- **@mariozechner/pi-agent-core** for proven agent loop
- **Event bus** for decoupled architecture
- **Hot-reload skills** - just edit .ts files
- **Approval queue** for safety
- **Multi-provider LLM** (Ollama default, Anthropic supported)
- **Subagents** for parallel work

## Installation

### Via NPM (Recommended)

```bash
# 1. Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash
# Restart your terminal after installing Bun

# 2. Install 0xKobold globally
npm install -g 0xkobold

# 3. Run interactive setup
0xkobold setup

# 4. Start using it!
0xkobold           # Start the TUI
0xkobold --mode plan    # Or start in plan mode
0xkobold --mode build   # Or start in build mode
```

### Quick Start with npx (No Install)

```bash
# Just want to try it out? Use npx:
npx 0xkobold setup
npx 0xkobold
```

### From Source (Development)

```bash
# Clone and install
git clone https://github.com/moikapy/0xkobold.git
cd 0xkobold
bun install

# Start Ollama (in another terminal)
ollama run kimi-k2.5:cloud

# Start the TUI
bun run tui
```

## Project Structure

```
0xkobold/
├── src/
│   ├── agent/          # Pi Agent Core adapter with subagent support
│   ├── approval/       # Approval queue for risky operations
│   ├── channels/       # Discord integration
│   ├── config/         # Zod config system
│   ├── discord/        # Discord bot
│   ├── event-bus/      # Decoupled event system
│   ├── gateway/        # Elysia WebSocket gateway
│   ├── llm/            # Ollama + Anthropic providers
│   ├── memory/         # JSON persistence
│   ├── skills/         # Hot-reload skill system
│   └── index.ts        # Main entry
├── skills/             # Your custom skills (hot-reloaded)
└── package.json
```

## Creating Skills

Skills are plain TypeScript files in the `skills/` folder:

```typescript
// skills/hello.ts
import type { Skill } from '../src/skills/types';

export const helloSkill: Skill = {
  name: 'hello',
  description: 'Say hello to someone',
  risk: 'safe',

  toolDefinition: {
    type: 'function',
    function: {
      name: 'hello',
      description: 'Say hello to someone',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name to greet' },
        },
        required: ['name'],
      },
    },
  },

  async execute(args) {
    return { message: `Hello, ${args.name}!` };
  },
};

export default helloSkill;
```

The skill is automatically hot-reloaded when you save!

## Safety

Risk levels:
- `safe` - No approval needed (math, string operations)
- `medium` - Confirmation for write operations (file write, web requests)
- `high` - Explicit approval for dangerous operations (shell, delete)

## Subagents

Spawn child agents for parallel work:

```typescript
const result = await agent.spawn('Research this topic');
```

The `spawn_subagent` skill is built-in and lets agents create child agents automatically.

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
/delegation-plan <task>      # Preview what would happen
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

## Ollama Cloud 🌩️

0xKobold now supports Ollama Cloud for access to larger models without running Ollama locally.

### Setup Cloud Access

1. Get your API key from [ollama.com/settings/keys](https://ollama.com/settings/keys)

2. Login via the TUI:
   ```
   /login
   # Select "Ollama Cloud"
   # Paste your API key
   ```

3. Switch between modes:
   ```
   /ollama-mode cloud    # Use cloud exclusively
   /ollama-mode local    # Use local Ollama
   /ollama-mode auto     # Auto-detect (default)
   ```

### Cloud Models Available

- **GPT-OSS 120B** - State-of-the-art open source
- **Qwen 2.5 72B/32B** - Alibaba's instruction-tuned model
- **DeepSeek R1 671B** - Reasoning-capable model
- **Llama 3.2** - Meta's latest open weights

### Quick Commands

- `/ollama-mode` - Show current mode and status
- `/ollama-status` - Check cloud connection
- `/ollama-local` - Switch to local mode
- `/ollama-cloud` - Switch to cloud mode

Your API key is securely stored in `~/.0xkobold/auth.json` with 0600 permissions.

## Commands

```bash
# Global install (recommended)
npm install -g 0xkobold

# Interactive TUI (default)
0xkobold
# or explicitly
0xkobold tui

# Project mode (per-directory config)
0xkobold local

# Gateway service
0xkobold start        # Start daemon
0xkobold start -f     # Start foreground
0xkobold stop         # Stop daemon
0xkobold status       # Check status
0xkobold logs         # View logs

# Agent management (v0.2.0+)
0xkobold agent init <name>      # Create agent workspace
0xkobold agent start <name>      # Start agent process
0xkobold agent stop <name>       # Stop agent process
0xkobold agent status [name]      # Check agent status
0xkobold agent list               # List all agents
0xkobold agent logs <name>        # View agent logs

# Using npx (no install)
npx 0xkobold
npx 0xkobold tui --local
```

### CLI Commands (In TUI)

**Agent Management (v0.2.0+)**
```
/agent-init <name>                    # Create new agent workspace
/agent-start <name>                  # Start agent process
/agent-stop <name>                   # Stop agent process
/agent-status [name]                   # Check agent status
/agent-select <name>                 # Switch TUI to agent
/agents                                 # List all agents with status
```

**Autonomous Subagents**
```
/implement <feature>                   # Auto-delegate based on complexity
/scout-and-plan <feature>             # Scout → Planner only
/parallel "task 1" "task 2"           # Run scouts in parallel

/autonomous-toggle [mode]              # Control delegation
/autonomous-status                     # Show current mode
/delegation-plan <task>               # Preview delegation strategy

/subagents                             # List available subagents
/subagent-create <name>               # Create custom subagent
```

**Ollama Cloud**
```
/ollama-mode [local|cloud|auto]       # Switch provider mode
/ollama-status                         # Check cloud connection
/login                                 # Authenticate with Ollama Cloud
```

**Mode Switching**
```
/plan                                  # Switch to plan mode
/build                                 # Switch to build mode
/mode                                  # Show current mode
/modes                                 # List available modes
```

## Configuration

Config is stored in `~/.config/kobold/kobold.json`:

```json
{
  "meta": {
    "version": "1.0.0"
  },
  "providers": {
    "ollama": {
      "enabled": true,
      "model": "kimi-k2.5:cloud"
    }
  },
  "gateway": {
    "enabled": true,
    "port": 18789
  },
  "discord": {
    "enabled": false,
    "token": "${DISCORD_BOT_TOKEN}"
  }
}
```

Or use **Local Mode** for per-project configs:
```bash
0xkobold local   # Creates/uses ./kobold.json in current directory
```

## Architecture Differences from OpenClaw

| Aspect | OpenClaw | 0xKobold |
|--------|----------|----------|
| **Gateway** | Bun.serve | Elysia.js (3x faster) |
| **Orchestration** | Tight coupling | Event bus (decoupled) |
| **Agent Loop** | Custom | @mariozechner/pi-agent-core |
| **Skills** | Compiled | Hot-reload .ts files |
| **Approval** | Basic | Risk-based queue |
| **Dependencies** | Many | Minimal (~10) |

## License

MIT
