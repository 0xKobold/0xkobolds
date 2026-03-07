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
# Install globally
npm install -g 0xkobold

# Or use with npx
npx 0xkobold init
npx 0xkobold start
```

### From Source

```bash
# Clone and install
git clone https://github.com/yourusername/0xkobold.git
cd 0xkobold
bun install

# Start Ollama (in another terminal)
ollama run kimi-k2.5:cloud

# Start the server
bun run start
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

## Commands

```bash
bun run start     # Start server
bun run tui       # Start TUI
bun run cli       # CLI commands
```

## Configuration

Config is stored in `~/.0xkobold/config.json5`:

```json5
{
  agents: {
    default: {
      model: 'ollama/kimi-k2.5:cloud',
      capabilities: ['chat', 'code'],
    },
  },
  gateway: {
    enabled: true,
    port: 18789,
  },
  discord: {
    enabled: false,
    token: '${DISCORD_BOT_TOKEN}',
  },
}
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
