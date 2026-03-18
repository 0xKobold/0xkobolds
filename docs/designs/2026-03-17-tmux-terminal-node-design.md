# Tmux Terminal Node - Design Document

**Date:** 2026-03-17
**Author:** Claude + moika
**Status:** Approved

---

## Overview

A desktop terminal application that connects to the 0xKobold gateway and exposes tmux sessions to the agent. The agent can create sessions, send commands, and capture output remotely over Tailscale.

## Goals

1. Provide a persistent terminal node for the Kobold infrastructure
2. Enable remote command execution via Tailscale transport
3. Use native tmux for battle-tested terminal handling
4. Integrate with existing gateway/node architecture

## Non-Goals

1. Custom terminal emulation (use tmux directly)
2. Complex authentication (Tailscale-only for now)
3. Multi-user session management (single-user for v1)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Gateway (port 7777)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────┐  ┌────────────┐  │
│  │ FamiliarNode│  │ TmuxNode    │  │ AgentCore│  │ MissionCtrl│  │
│  │ (desktop)   │  │ (terminal)  │  │          │  │ (web)      │  │
│  └──────┬──────┘  └──────┬──────┘  └────┬─────┘  └─────┬──────┘  │
└─────────┼────────────────┼───────────────┼──────────────┼─────────┘
          │                │               │              │
    Tailscale         Tailscale            │         Tailscale
          │                │               │              │
    ┌─────▼─────┐    ┌─────▼─────┐         │        ┌─────▼─────┐
    │  Desktop  │    │ TmuxTerm  │         │        │  Browser  │
    │  Familiar │    │  (Electron)│         │        │           │
    └───────────┘    └───────────┘         │        └───────────┘
                                          │
                                    ┌─────▼─────┐
                                    │   Agent   │
                                    │  (Claude) │
                                    └───────────┘
```

**Key Components:**

| Component | Location | Purpose |
|-----------|----------|---------|
| TmuxNode | packages/tmux-terminal/ | Gateway node, exposes tmux commands |
| TmuxManager | packages/tmux-terminal/ | Spawns/manages local tmux sessions |
| Electron App | packages/tmux-terminal/ | Desktop UI, attaches to tmux |
| Gateway | src/gateway/ | Routes commands to nodes |

---

## Components

### 1. TmuxNode

**File:** `packages/tmux-terminal/src/tmux-node.ts`

Extends the `NodeClient` pattern from `familiar-node.ts`.

```typescript
export class TmuxNode {
  private client: NodeClient;
  private manager: TmuxManager;
  
  commands = {
    'tmux.list': this.listSessions.bind(this),
    'tmux.create': this.createSession.bind(this),
    'tmux.send': this.sendKeys.bind(this),
    'tmux.capture': this.capturePane.bind(this),
    'tmux.kill': this.killSession.bind(this),
    'tmux.rename': this.renameSession.bind(this),
  };
}
```

**Responsibilities:**
- Connect to gateway via WebSocket
- Register as node type `tmux-terminal`
- Expose tmux commands to agent
- Stream output events back to gateway

---

### 2. TmuxManager

**File:** `packages/tmux-terminal/src/tmux-manager.ts`

Manages local tmux sessions.

```typescript
export class TmuxManager {
  async listSessions(): Promise<TmuxSession[]>;
  async createSession(name: string, command?: string): Promise<TmuxSession>;
  async sendKeys(session: string, keys: string): Promise<void>;
  async capturePane(session: string): Promise<string>;
  async killSession(session: string): Promise<void>;
  async renameSession(oldName: string, newName: string): Promise<void>;
  async hasTmux(): Promise<boolean>;
}
```

**TmuxSession interface:**
```typescript
interface TmuxSession {
  name: string;
  id: string;
  windows: number;
  created: Date;
  attached: boolean;
  path: string;
}
```

---

### 3. Electron App

**File:** `packages/tmux-terminal/src/main.ts`

Electron entry point.

```typescript
import { app, BrowserWindow } from 'electron';
import { TmuxNode } from './tmux-node';

let mainWindow: BrowserWindow | null = null;
let tmuxNode: TmuxNode | null = null;

async function main() {
  await app.whenReady();
  
  // Create window
  mainWindow = createWindow();
  
  // Connect to gateway
  tmuxNode = new TmuxNode(process.env.GATEWAY_URL || 'ws://localhost:7777');
  await tmuxNode.connect();
  
  // Load TUI
  mainWindow.loadFile('dist/renderer/index.html');
}
```

---

### 4. TUI Frame

**File:** `packages/tmux-terminal/src/renderer/`

Minimal UI wrapping tmux:

```
┌─────────────────────────────────────────────────┐
│  🐉 0xKobold Terminal                    [−][□][×]│
├─────────────────────────────────────────────────┤
│                                                 │
│  tmux session "work"                            │
│  $ bun run dev                                  │
│  ✓ Server running on port 3000                 │
│  $ _                                            │
│                                                 │
├─────────────────────────────────────────────────┤
│  [work] [project-x] [+new]   ● connected        │
└─────────────────────────────────────────────────┘
```

**Features:**
- Session tabs at bottom (from gateway)
- Connection status indicator
- Attach to tmux session (actual terminal rendering by tmux)
- Create new session button

---

## Commands

### Agent → Node Commands

| Command | Params | Description |
|---------|--------|-------------|
| `tmux.list` | none | List all tmux sessions |
| `tmux.create` | `name`, `command?` | Create new named session |
| `tmux.send` | `session`, `keys` | Send keystrokes to session |
| `tmux.capture` | `session` | Capture current pane output |
| `tmux.kill` | `session` | Kill session |
| `tmux.rename` | `session`, `newName` | Rename session |

### Node → Agent Events

| Event | Data | Description |
|-------|------|-------------|
| `tmux.output` | `{ session, output }` | Stream output from session |
| `tmux.session` | `{ type, session }` | Session created/destroyed event |
| `tmux.connected` | `{ nodeId }` | Node connected to gateway |

---

## Data Flow

### App Startup

```
TmuxTerm starts
    │
    ▼
Connect to gateway (ws://localhost:7777 or Tailscale URL)
    │
    ▼
Register as node type 'tmux-terminal'
    │
    ▼
Gateway sends available sessions
    │
    ▼
App displays session tabs
    │
    ▼
User clicks session → `tmux attach -t <session>`
```

### Agent Sends Command

```
Agent calls 'tmux.send'
    │
    ▼
Gateway routes to TmuxNode
    │
    ▼
TmuxNode validates session exists
    │
    ▼
TmuxNode runs: tmux send-keys -t <session> <cmd>
    │
    ▼
Output streams via 'tmux.output' events
```

### Session Persistence

```
Sessions stored in: ~/.0xkobold/tmux-sessions.json

{
  "sessions": [
    { "name": "work", "path": "/home/user/code/project" },
    { "name": "project-x", "path": "/home/user/code/x" }
  ]
}

Gateway tracks active nodes → Each node sees same session list
```

---

## Security

### Tailscale-Only (v1)

- **No additional auth** - Trust Tailscale identity
- **Node registration** - Node identifies itself to gateway
- **Command scope** - Only tmux commands, no arbitrary shell execution

### Command Sanitization

```typescript
// Allowed tmux commands
const ALLOWED_COMMANDS = [
  'list-sessions', 'new-session', 'send-keys', 
  'capture-pane', 'kill-session', 'rename-session',
  'list-windows', 'select-window', 'split-window'
];

// Sanitize input
function sanitizeInput(input: string): string {
  // Remove dangerous characters
  return input.replace(/[`;|$(){}[\]\\]/g, '');
}
```

### User Permissions

- Runs as current Unix user
- Standard file permissions apply
- Cannot elevate privileges

---

## Package Structure

```
packages/tmux-terminal/
├── src/
│   ├── main.ts              # Electron entry
│   ├── tmux-node.ts         # Gateway node client
│   ├── tmux-manager.ts      # tmux session management
│   ├── session-store.ts     # Persist session metadata
│   └── renderer/
│       ├── index.html       # Minimal HTML
│       ├── styles.css       # Kobold TUI theme
│       └── app.ts           # UI logic
├── package.json
├── tsconfig.json
├── electron.vite.config.ts  # Build config
└── README.md
```

---

## Dependencies

| Package | Purpose |
|---------|---------|
| `electron` | Desktop app |
| `@mariozechner/pi-tui` | TUI components (optional) |
| `ws` | WebSocket client |
| `node-pty` | PTY for tmux (optional) |

**System Requirements:**
- `tmux` >= 3.0 installed
- Tailscale running (for remote access)

---

## Implementation Phases

### Phase 1: Core Node (1-2 hours)

1. Create `packages/tmux-terminal/` structure
2. Implement `TmuxManager` with tmux command execution
3. Implement `TmuxNode` connecting to gateway
4. Test commands via gateway

### Phase 2: Electron App (1-2 hours)

1. Set up Electron with electron-vite
2. Create minimal window with session tabs
3. Implement `tmux attach` for terminal view
4. Add connection status indicator

### Phase 3: Polish (1 hour)

1. Kobold TUI styling
2. Error handling
3. Reconnection logic
4. Session persistence

### Phase 4: Testing (30 min)

1. Test local connections
2. Test Tailscale connections
3. Test agent commands
4. Test session persistence

---

## Future Enhancements

1. **Multi-pane support** - Send to specific pane
2. **Copy/paste** - Clipboard integration
3. **Scroll history** - Access tmux scrollback
4. **Split windows** - Create splits via agent
5. **API keys** - Optional additional auth layer
6. **Session sharing** - Share session with other users

---

## Success Criteria

- [ ] TmuxNode connects to gateway
- [ ] Agent can list sessions via `tmux.list`
- [ ] Agent can send commands via `tmux.send`
- [ ] Output streams back to agent via `tmux.output`
- [ ] Electron app shows sessions and attaches to tmux
- [ ] Works over Tailscale from remote machine
- [ ] Sessions persist after app restart

---

## References

- `packages/kobold-desktop-pet/src/gateway/familiar-node.ts` - FamiliarNode pattern
- `packages/kobold-desktop-pet/src/gateway/node-client.ts` - NodeClient base
- `src/gateway/` - Gateway server
- `@mariozechner/pi-tui` - TUI components