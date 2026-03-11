# 0xKobold Usage Guide

## Installation

```bash
# Clone the repo
git clone https://github.com/yourusername/0xKobolds.git
cd 0xKobolds

# Install dependencies
bun install

# Build the project
bun run build

# Link globally (recommended)
bun link

# Or install globally
npm install -g .
```

## Usage Modes

### Global Mode (Default)

When you run `0xkobold` from anywhere, it uses the global configuration:

```bash
# Start TUI
0xkobold

# Or explicitly
0xkobold tui
```

**In Global Mode:**
- Extensions load from the installed 0xKobold package (dist folder)
- Config: `~/.config/kobold/kobold.json` (or `~/.0xkobold/`)
- Sessions: `~/.0xkobold/sessions/`
- Skills: `~/.0xkobold/skills/`

### Local Mode (Per-Project)

Use `--local` flag to develop within a specific project:

```bash
# Navigate to your project
cd ~/my-project

# Start in local mode
0xkobold --local

# Or use the explicit local command
0xkobold local
```

**In Local Mode:**
- Extensions still load from the installed 0xKobold package (so features work)
- Config: `./kobold.json` (creates if doesn't exist)
- Sessions: `./.kobold/sessions/`
- Skills: `./skills/` (falls back to global)
- Memory: `./.kobold/memory.db`

## Project Setup (Local Mode)

Create a `kobold.json` in your project root:

```json
{
  "meta": {
    "version": "1.0.0",
    "description": "My Project"
  },
  "agents": {
    "defaults": {
      "model": "ollama/kimi-k2.5:cloud",
      "heartbeat": {
        "enabled": true,
        "every": "30m"
      }
    }
  }
}
```

Create a `HEARTBEAT.md` for periodic check-ins:

```markdown
# Project Checklist

- [ ] Review pending tasks
- [ ] Check for blocked items
- [ ] Update documentation
```

## Extension System

Extensions are bundled with the package and auto-load:

| Category | Extensions |
|----------|-----------|
| Infrastructure | ollama-provider, session-bridge |
| Core | heartbeat, mode-manager, task-manager, context-pruning |
| Multi-Channel | discord-channel, multi-channel |
| Safety | protected-paths, confirm-destructive, git-checkpoint |
| Integrations | mcp, gateway, websearch |

## Troubleshooting

### Extensions Not Loading

If you see "No models available" or extensions fail to load:

```bash
# Rebuild the project
bun run build

# Re-link if using bun link
bun unlink
bun link
```

### Local Mode Not Working

```bash
# Check if local mode is active
echo $KOBOLD_LOCAL_MODE  # should print 'true' in local mode

# Verify kobold.json exists in CWD
ls -la kobold.json

# Check which config is being loaded
0xkobold config file
```

### Debug Extension Paths

The TUI will print whether it's running in:
- `Production (from dist)` - global install, uses .js extensions
- `Development (from source)` - dev mode, uses .ts extensions
- `LOCAL mode` - project-specific development

## Environment Variables

| Variable | Description |
|----------|-------------|
| `KOBOLD_CONFIG_PATH` | Override config file location |
| `KOBOLD_HOME` | Override base directory (default: ~/.config/kobold) |
| `KOBOLD_LOCAL_MODE` | Set to 'true' for local mode (auto-set by --local) |
| `PI_CODING_AGENT_DIR` | Base dir for pi-coding-agent (default: ~/.0xkobold) |

## CLI Commands

```bash
# Global commands
0xkobold status          # Check service status
0xkobold stop            # Stop daemon
0xkobold logs             # View logs

# Discord
0xkobold discord status  # Check Discord connection
0xkobold discord test    # Send test message

# Config
0xkobold config file     # Show config path
0xkobold config init     # Create default config

# Local development
0xkobold local            # Start in local mode
0xkobold --local          # Same as above
```

## Development

When developing 0xKobold itself:

```bash
cd ~/Documents/code/0xKobolds

# Run from source (dev mode)
bun run tui

# Watch and rebuild
bun run dev

# Build for production
bun run build
```

In dev mode, extensions load directly from `src/` as `.ts` files.