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

# Using npx (no install)
npx 0xkobold
npx 0xkobold tui --local
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
