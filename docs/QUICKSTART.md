# 0xKobold Quick Start Guide

Get 0xKobold running in under 5 minutes.

## Prerequisites

**Bun is required** (0xKobold is built on Bun for performance)

```bash
# Install Bun (one command)
curl -fsSL https://bun.sh/install | bash

# Restart your terminal
exec $SHELL -l
```

## Install 0xKobold

```bash
# Install globally
npm install -g 0xkobold

# You'll see a welcome message after install!
```

## Initial Setup

```bash
# Run the interactive setup wizard
0xkobold setup
```

This will:
- ✓ Create config at `~/.0xkobold/config.json`
- ✓ Initialize the SQLite database
- ✓ Set up default extensions

## First Use

```bash
# Start the TUI (interactive mode)
0xkobold

# Or start in specific mode
0xkobold --mode plan      # Research/planning mode
0xkobold --mode build     # Implementation mode

# Or use local project mode
0xkobold local            # Uses CWD for settings
```

## Commands Reference

| Command | Description |
|---------|-------------|
| `0xkobold` | Start TUI (default) |
| `0xkobold --mode plan` | Start in plan mode |
| `0xkobold --mode build` | Start in build mode |
| `0xkobold setup` | Interactive setup wizard |
| `0xkobold gateway start` | Start WebSocket gateway |
| `0xkobold gateway status` | Check gateway status |
| `0xkobold status` | Check overall status |
| `0xkobold --help` | Show all commands |

## Configure Ollama

By default, 0xKobold uses local Ollama:

```bash
# Install Ollama (macOS/Linux)
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull qwen2.5-coder:14b

# Start Ollama
ollama serve
```

Or use **Ollama Cloud** for bigger models without running locally:

```bash
# In the TUI, run:
/login
# Select "Ollama Cloud" and enter your API key
```

## VPS Deployment (Optional)

Want 24/7 access from anywhere?

```bash
# Get Tailscale auth key from https://login.tailscale.com/admin/settings/keys
# Then deploy to DigitalOcean:
./scripts/deploy-vps.sh tskey-auth-xxxxx
```

See [VPS Deployment Guide](docs/VPS-DEPLOYMENT.md) for full details.

## Troubleshooting

### "Bun not found"

```bash
# Re-install Bun
curl -fsSL https://bun.sh/install | bash
# Restart terminal
exec $SHELL -l
```

### "0xkobold command not found"

```bash
# Make sure npm global packages are in your PATH
npm config get prefix
# Add that path + /bin to your PATH
export PATH="$PATH:$(npm config get prefix)/bin"
```

### "Ollama connection failed"

```bash
# Check if Ollama is running
curl http://localhost:11434/api/tags

# If not, start it
ollama serve
```

### Gateway issues

```bash
# Check gateway status
0xkobold gateway status

# Restart gateway
0xkobold gateway restart

# View logs
0xkobold logs
```

## Next Steps

- **TUI Commands**: See COMMANDS.md
- **VPS Setup**: See docs/VPS-DEPLOYMENT.md
- **Architecture**: See ARCHITECTURE.md
- **Skills**: Place custom skills in `skills/` folder
- **Configuration**: Edit `~/.0xkobold/config.json`

## Getting Help

```bash
# Built-in help
0xkobold --help

# Specific command help
0xkobold gateway --help

# In the TUI, run:
/help          # Show available commands
/mode          # Show mode commands
/gateway       # Show gateway commands
```

---

**Ready to go?** Just run: `0xkobold setup` then `0xkobold` 🐉
