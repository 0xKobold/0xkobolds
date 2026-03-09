# Scout Report: Multi-Agent Workspace System

## Current Architecture

### Gateway Extension
- File: src/extensions/core/gateway-extension.ts
- Current: Starts with TUI session
- Needs: Daemon mode, standalone operation

### Session Bridge Extension
- File: src/extensions/core/session-bridge-extension.ts
- Session ID generation working

### Subagent Extension
- File: src/extensions/core/subagent-extension.ts
- Spawns ephemeral agents successfully

## Key Files for Modification

1. gateway-extension.ts - Add daemon mode
2. New extension: agent-workspace-extension.ts
3. New extension: agent-lifecycle-extension.ts
4. src/index.ts - Register new extensions

## Recommended Approach

Reuse existing patterns:
- Process spawning from subagent-extension
- WebSocket from gateway-extension
- Config from existing config system
