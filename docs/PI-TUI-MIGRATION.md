# Pi-TUI Migration Summary

## Overview

0xKobold has been migrated from blessed to Pi-TUI (the official pi-framework TUI library) and now uses the pi-coding-agent extension system.

## What Changed

### New Dependencies
- `@mariozechner/pi-tui` - Official TUI framework with differential rendering
- `@mariozechner/pi-coding-agent` - Agent framework with extension system
- `glob` - For file pattern matching in search operations

### New File Structure

```
src/
├── pi-config.ts              # Pi-framework configuration
├── index.ts                  # New entry point using pi-coding-agent
├── extensions/
│   ├── index.ts              # Barrel exports
│   ├── loader.ts             # Extension loader
│   └── core/
│       ├── discord-extension.ts    # Discord as extension
│       ├── gateway-extension.ts    # Gateway as extension
│       └── fileops-extension.ts    # Enhanced file tools
└── tui/
    ├── index.ts              # Barrel exports
    ├── App.tsx               # Main TUI application
    ├── components/
    │   ├── ChatLog.tsx       # Message display
    │   ├── InputBox.tsx      # Text input
    │   ├── AgentTree.tsx     # Agent hierarchy
    │   └── StatusBar.tsx     # Connection status
    └── hooks/
        ├── useAgentEvents.ts
        ├── useAgentTree.ts
        ├── useConnectionStatus.ts
        ├── useAgentFactory.ts
        └── index.ts
```

### Updated Files

1. **package.json** - Added pi-tui, pi-coding-agent, and glob dependencies
2. **tsconfig.json** - Added `src/**/*.tsx` to includes for TSX support
3. **tui/index.ts** - Replaced blessed implementation with Pi-TUI
4. **src/index.ts** - New main entry using pi-coding-agent Agent class

### Extension System

Each major feature is now an extension:

#### Discord Extension (`src/extensions/core/discord-extension.ts`)
- **Tools**: `discord_send_message`, `discord_reply`
- **Commands**: `/discord:connect`, `/discord:disconnect`, `/discord:status`
- **Events**: `discord.connected`, `discord.disconnected`, `discord.message`
- **Status Bar**: Shows connection status

#### Gateway Extension (`src/extensions/core/gateway-extension.ts`)
- **Tools**: `gateway_broadcast`
- **Commands**: `/gateway:start`, `/gateway:stop`, `/gateway:status`
- **Events**: `gateway.started`, `gateway.stopped`, `agent.spawned`, `agent.status`
- **WebSocket**: Multi-agent protocol on port 18789
- **Status Bar**: Shows server status

#### FileOps Extension (`src/extensions/core/fileops-extension.ts`)
- **Tools**:
  - `read_file_with_line_numbers` - Enhanced file reading
  - `write_file` - File writing with auto-directory creation
  - `list_directory` - Directory listing with icons
  - `search_files` - Pattern search across files
  - `batch_edit` - Multi-file find/replace
  - `shell` - Shell execution with safety checks

## Usage

### Start the Application

```bash
# Install dependencies
bun install

# Build TypeScript
bun run build

# Run with Pi-framework (loads extensions)
bun run start

# Run the new Pi-TUI
bun run tui
```

### Extension Commands

Once running, you can use extension commands:

```
/discord:connect                    # Connect to Discord
/gateway:start                      # Start WebSocket gateway
/gateway:start {"port": 8080}      # Start on custom port
```

### TUI Commands

In the TUI, type `/help` for available commands:

- `/spawn <task>` - Spawn a new agent
- `/swarm <n> <task>` - Spawn n worker agents
- `/agents` - List all agents
- `/tree` - Show agent tree
- `/clear` - Clear chat
- `/quit` - Exit

### Key Bindings

- `Ctrl+C` - Exit
- `Ctrl+T` - Toggle agent tree
- `Ctrl+L` - Clear chat

## Benefits

1. **Modern TUI** - Pi-TUI uses differential rendering (only updates changed cells)
2. **Extension Ecosystem** - Can use community extensions
3. **Modular** - Features are self-contained extensions
4. **Hot-reload** - Extensions can be reloaded at runtime
5. **Official Framework** - Using pi-framework's official packages

## Migration Notes

- The old blessed-based TUI has been replaced but can be found in git history
- Existing Discord, Gateway, and FileOps functionality is preserved
- Configuration now uses `src/pi-config.ts` instead of inline config
- The gateway still runs on port 18789 by default
- All original safety checks are preserved in the file operations extension
