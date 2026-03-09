# 0xKobold Unified CLI Architecture

Based on OpenClaw CLI analysis and best practices for multi-agent platforms.

## Philosophy

Replace scattered TUI commands (`/status`, `/heartbeat`, `/env-status`) with a unified CLI interface similar to OpenClaw's `kobold` command.

## Command Structure

```bash
0xkobold [command] [subcommand] [options]
```

## Command Hierarchy

### Core Commands

| Command | Subcommands | Description | Replaces |
|---------|-------------|-------------|----------|
| `start` | `--daemon`, `--foreground` | Start gateway | Manual bun start |
| `stop` | - | Stop service | systemctl stop |
| `restart` | - | Restart service | systemctl restart |
| `status` | `--json`, `--watch` | Consolidated status | `/status`, `/heartbeat` |
| `logs` | `--follow`, `--lines` | View logs | journalctl |
| `tui` | - | Interactive mode | Default TUI |

### Service Management (system)

```bash
0xkobold system [subcommand]

# Subcommands:
#   install    Install systemd service
#   uninstall  Remove systemd service
#   enable     Enable auto-start
#   disable    Disable auto-start
#   edit       Edit service config
```

### Configuration Management (config)

```bash
0xkobold config [subcommand]

# Subcommands:
#   show       Show current configuration
#   set        Set configuration value
#   get        Get configuration value
#   edit       Edit configuration file
#   validate   Validate configuration

# Environment/Secrets:
0xkobold config env [subcommand]
#   show       Show environment variables
#   edit       Edit .env file
#   load       Load from file

0xkobold config secrets [subcommand]
#   init       Initialize SOPS
#   edit       Edit encrypted secrets
#   rotate     Rotate encryption keys
#   status     Show secrets status
```

### Health & Monitoring (health)

```bash
0xkobold health [subcommand]

# Subcommands:
#   check      Run health check
#   monitor    Start monitoring mode
#   history    Show health history

# Replaces:
#   /heartbeat
#   /status (partial)
```

### Discord Integration (discord)

```bash
0xkobold discord [subcommand]

# Subcommands:
#   status     Check Discord connection
#   test       Send test message
#   notify     Send notification
#   config     Configure Discord settings

# Options:
#   --channel  Target channel
#   --dm       Send DM to user

# Replaces:
#   /discord-status
#   /discord-test
```

### Environment (env)

```bash
0xkobold env [subcommand]

# Subcommands:
#   status     Show environment status
#   check      Check for missing variables
#   init       Initialize environment

# Replaces:
#   /env-status
```

### Heartbeat (heartbeat)

```bash
0xkobold heartbeat [subcommand]

# Subcommands:
#   start      Start heartbeat
#   stop       Stop heartbeat
#   status     Show heartbeat status
#   config     Configure heartbeat

# Replaces:
#   /heartbeat
```

### Session Management (session)

```bash
0xkobold session [subcommand]

# Subcommands:
#   list       List active sessions
#   attach     Attach to session
#   kill       Kill session
#   rename     Rename session
#   export     Export session
#   import     Import session

# Replaces:
#   Session-related TUI commands
```

### Agent Management (agent)

```bash
0xkobold agent [subcommand]

# Subcommands:
#   list       List agents
#   spawn      Spawn new agent
#   kill       Kill agent
#   status     Agent status
#   logs       Agent logs

# Replaces:
#   /agents
#   /agent-spawn
#   /agent-status
#   /agent-kill
```

### Task Management (task)

```bash
0xkobold task [subcommand]

# Subcommands:
#   list       Show task board
#   add        Add task
#   complete   Mark complete
#   edit       Edit task
#   delete     Delete task
#   export     Export tasks

# Replaces:
#   Task-related TUI commands
```

### Mode Management (mode)

```bash
0xkobold mode [subcommand]

# Subcommands:
#   plan       Enter plan mode
#   build      Enter build mode
#   toggle     Toggle between modes
#   status     Show current mode

# Replaces:
#   /plan
#   /build
#   /mode
```

### Extension Management (extension)

```bash
0xkobold extension [subcommand]

# Subcommands:
#   list       List installed extensions
#   install    Install extension
#   remove     Remove extension
#   reload     Reload extensions
#   enable     Enable extension
#   disable    Disable extension

# Replaces:
#   /reload
```

## Consolidated Status View

### Command: `0xkobold status`

Shows unified status from all components:

```
0xKobold Status
═══════════════════════════════════════════

Service:     🟢 running (pid 12345)
Uptime:      3h 24m 15s

Health:
  Memory:     45% (healthy)
  Uptime:     3h 24m
  Status:     ✅ healthy

Discord:
  Status:     🟢 connected
  Bot:        MyBot#1234
  Channel:    #notifications

Environment:
  Config:     ✅ loaded
  Secrets:    ✅ encrypted
  Discord:    ✅ configured

Active Sessions:
  kobold-dwvt04-89a0a411: Build Mode
    Agent:    Running
    Tasks:    3 active

Extensions:
  ✅ mode-manager
  ✅ discord-channel
  ✅ env-loader
  ✅ heartbeat

Mode: 🔨 Build Mode

Use --json for machine-readable output
Use --watch to continuously monitor
```

## Implementation Structure

### File Organization

```
src/cli/
├── index.ts                    # Entry point
├── program.ts                  # CLI registration
├── register.ts                 # Command registry
├── commands/
│   ├── start.ts                # Start service
│   ├── stop.ts                 # Stop service
│   ├── status.ts               # Status command
│   ├── logs.ts                 # Logs command
│   └── tui.ts                  # TUI mode
├── system/
│   ├── install.ts              # Install systemd
│   ├── uninstall.ts            # Remove systemd
│   └── service-manager.ts      # Service operations
├── config/
│   ├── show.ts
│   ├── set.ts
│   ├── env.ts
│   └── secrets.ts
├── health/
│   ├── check.ts
│   └── monitor.ts
└── extensions/
    ├── register-discord.ts     # Discord CLI commands
    ├── register-heartbeat.ts   # Heartbeat CLI
    └── register-env.ts         # Environment CLI
```

### Extension CLI Registration Pattern

Each extension exports a `registerCli()` function:

```typescript
// src/extensions/core/discord-channel-extension.ts

export function registerDiscordCli(program: Command): void {
  const discord = program
    .command('discord')
    .description('Discord channel management');

  discord
    .command('status')
    .description('Check Discord connection')
    .action(async () => {
      // Implementation
    });

  discord
    .command('test <channel>')
    .description('Send test message')
    .option('--message <text>', 'Message to send', 'Test from 0xKobold')
    .action(async (channel, opts) => {
      // Implementation
    });

  discord
    .command('notify <message>')
    .description('Send notification')
    .option('--urgent', 'Mark as urgent')
    .action(async (message, opts) => {
      // Implementation
    });
}
```

### Main CLI Registration

```typescript
// src/cli/program.ts

import { Command } from 'commander';
import { registerDiscordCli } from '../extensions/core/discord-channel-extension.js';
import { registerHeartbeatCli } from '../extensions/core/heartbeat-extension.js';

export function createCli(): Command {
  const program = new Command('0xkobold')
    .version('1.0.0')
    .description('0xKobold - Multi-Agent Automation Platform');

  // Core commands
  program.addCommand(createStartCommand());
  program.addCommand(createStopCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createLogsCommand());

  // System management
  program.addCommand(createSystemCommand());

  // Extension commands
  registerDiscordCli(program);
  registerHeartbeatCli(program);
  registerEnvCli(program);

  // Default: TUI
  program
    .command('tui', { isDefault: true })
    .description('Start interactive TUI')
    .action(() => {
      // Launch TUI
    });

  return program;
}
```

## Migration from Extension Commands

### Before (TUI commands):
```
/status
/heartbeat
/env-status
/discord-status
/discord-test 123 Hello
/reload
```

### After (CLI commands):
```bash
0xkobold status                    # Shows all
0xkobold health check             # Health only
0xkobold env status                # Environment
0xkobold discord status             # Discord
0xkobold discord test 123 Hello    # Test message
0xkobold extension reload          # Reload
```

## Package.json Setup

```json
{
  "name": "@0xkobold/cli",
  "bin": {
    "0xkobold": "./dist/cli/index.js",
    "kobold": "./dist/cli/index.js"
  },
  "scripts": {
    "cli": "bun run src/cli/index.ts",
    "cli:build": "bun build src/cli/index.ts --target=bun --outfile=dist/cli/index.js"
  }
}
```

## Installation & Usage

### Install CLI globally:
```bash
bun install -g @0xkobold/cli
# or
bun link  # In dev directory
```

### First time setup:
```bash
0xkobold system install --user    # Install systemd service
0xkobold config secrets init       # Setup SOPS
0xkobold config env edit           # Edit .env
```

### Start service:
```bash
0xkobold start --daemon            # Start as service
# or
0xkobold start --foreground       # Start in foreground
```

### Check status:
```bash
0xkobold status                    # All status
0xkobold status --watch            # Continuous
0xkobold status --json             # For scripts
```

### Interactive mode:
```bash
0xkobold tui                       # or just `0xkobold`
```

## Completion & Help

```bash
0xkobold --help                    # Top-level help
0xkobold status --help             # Command help
0xkobold discord --help            # Group help
```

## Next Steps

1. ✅ Phase 1: Core infrastructure (systemd, env-loader, heartbeat)
2. 🔄 Phase 2: CLI implementation (this document)
3. ⏳ Phase 3: Migrate extension commands to CLI
4. ⏳ Phase 4: Web Mission Control dashboard
5. ⏳ Phase 5: Mobile companion

## References

- OpenClaw CLI: `src/cli/program/register.subclis.ts`
- Commander.js: https://github.com/tj/commander.js
- OpenClaw Gateway CLI: `src/cli/gateway-cli/register.ts`
