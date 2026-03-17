# 0xKobold Node System Design

## Overview

An OpenClaw-style node system that allows external processes to connect as "nodes" to the 0xKobold gateway, exposing command surfaces for bidirectional communication.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      0xKobold Gateway                           │
│                    (WebSocket Server)                           │
│                                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌──────────────────┐  │
│  │ Discord │  │Telegram │  │  Web    │  │ Node Connections │  │
│  │ Channel │  │ Channel │  │  TUI    │  │  (role: "node")   │  │
│  └─────────┘  └─────────┘  └─────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Node Host Registry                           │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐ │
│  │ Desktop Familiar Node │  │  Android Node   │  │ Headless Node  │ │
│  │  (kobold-pet)    │  │  (future)        │  │ (system runs)  │ │
│  │                  │  │                  │  │                 │ │
│  │ Commands:        │  │ Commands:        │  │ Commands:       │ │
│  │ - familiar.show       │  │ - camera.snap   │  │ - system.exec  │ │
│  │ - familiar.hide       │  │ - notify.send   │  │ - process.bg   │ │
│  │ - familiar.animate    │  │ - device.loc    │  │ - file.watch   │ │
│  │ - familiar.state      │  │ - sms.send      │  │ - http.serve   │ │
│  └──────────────────┘  └──────────────────┘  └───────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Protocol

### Connection Phase

Nodes connect to the gateway via WebSocket with `role: "node"`:

```typescript
// Client connects to ws://gateway:7777/ws?role=node&name=desktop-pet

// Gateway sends welcome
{
  "id": "connect-response",
  "result": {
    "ok": true,
    "nodeId": "node-desktop-pet-abc123",
    "capabilities": ["familiar.show", "familiar.hide", "familiar.animate", "familiar.state"]
  }
}
```

### Method Registration

Nodes register their command surface:

```typescript
// Node sends method registration
{
  "id": "register-methods",
  "method": "node.register",
  "params": {
    "name": "desktop-pet",
    "version": "1.0.0",
    "commands": {
      "familiar.show": {
        "description": "Show the desktop familiar",
        "params": { "$ref": "schemas/pet/show.json" }
      },
      "familiar.hide": {
        "description": "Hide the desktop familiar",
        "params": {}
      },
      "familiar.animate": {
        "description": "Set animation state",
        "params": {
          "state": { "type": "string", "enum": ["idle", "working", "thinking", "sleeping"] }
        }
      },
      "familiar.state": {
        "description": "Get current pet state",
        "returns": { "type": "object" }
      }
    }
  }
}
```

### Bidirectional Invocation

**Agent → Node:** Agent invokes a node command

```typescript
// Agent calls familiar.animate to show working state
{
  "id": "call-123",
  "method": "node.invoke",
  "params": {
    "nodeId": "node-desktop-pet-abc123",
    "command": "familiar.animate",
    "args": { "state": "working" }
  }
}

// Gateway routes to node, node responds:
{
  "id": "call-123",
  "result": {
    "ok": true,
    "state": "working",
    "animation": "Waving.fbx"
  }
}
```

**Node → Agent:** Node sends event to notify agent

```typescript
// Node sends event (e.g., pet was clicked)
{
  "event": "node.event",
  "params": {
    "nodeId": "node-desktop-pet-abc123",
    "event": "familiar.clicked",
    "data": { "x": 150, "y": 200 }
  }
}

// Agent can respond via node.invoke
```

## Implementation

### 1. Gateway Changes (`src/gateway/methods/node-invoke.ts`)

```typescript
// New method: node.invoke
export const nodeInvokeHandler: MethodHandler = async ({ params, respond, context }) => {
  const { nodeId, command, args } = params;
  
  // Find node connection
  const nodeConn = context.nodes.get(nodeId);
  if (!nodeConn) {
    return respond(false, null, { code: -32001, message: `Node not found: ${nodeId}` });
  }
  
  // Check if command is registered
  if (!nodeConn.commands.includes(command)) {
    return respond(false, null, { code: -32002, message: `Command not available: ${command}` });
  }
  
  // Generate call ID
  const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  
  // Create promise for response
  const responsePromise = new Promise((resolve, reject) => {
    context.pendingCalls.set(callId, { resolve, reject });
    // Timeout after 30s
    setTimeout(() => {
      context.pendingCalls.delete(callId);
      reject(new Error('Timeout'));
    }, 30000);
  });
  
  // Send invocation to node
  nodeConn.socket.send(JSON.stringify({
    id: callId,
    method: command,
    params: args
  }));
  
  // Wait for response
  try {
    const result = await responsePromise;
    respond(true, result);
  } catch (error) {
    respond(false, null, { code: -32000, message: String(error) });
  }
};
```

### 2. Node Client Library (`packages/kobold-desktop-pet/src/gateway/node-client.ts`)

```typescript
/**
 * Node Client for 0xKobold Gateway
 * 
 * Connects as a "node" role and exposes commands to the agent
 */

import WebSocket from 'ws';

export interface NodeConfig {
  name: string;
  gatewayUrl: string;
  commands: Record<string, CommandDefinition>;
}

export interface CommandDefinition {
  description: string;
  params?: JSONSchema;
  handler: (args: any) => Promise<any>;
}

export class NodeClient {
  private ws: WebSocket | null = null;
  private nodeId: string | null = null;
  private pendingCalls = new Map<string, { resolve: Function; reject: Function }>();
  
  constructor(private config: NodeConfig) {}
  
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${this.config.gatewayUrl}/ws?role=node&name=${this.config.name}`);
      
      this.ws.on('open', () => {
        this.registerCommands();
        resolve();
      });
      
      this.ws.on('message', (data) => {
        this.handleMessage(JSON.parse(data.toString()));
      });
      
      this.ws.on('error', reject);
    });
  }
  
  private registerCommands(): void {
    this.send({
      id: 'register',
      method: 'node.register',
      params: {
        name: this.config.name,
        version: '1.0.0',
        commands: Object.fromEntries(
          Object.entries(this.config.commands).map(([name, def]) => [
            name,
            { description: def.description, params: def.params }
          ])
        )
      }
    });
  }
  
  private handleMessage(msg: any): void {
    // Handle responses to our calls
    if (msg.id && this.pendingCalls.has(msg.id)) {
      const { resolve, reject } = this.pendingCalls.get(msg.id)!;
      this.pendingCalls.delete(msg.id);
      if (msg.error) {
        reject(msg.error);
      } else {
        resolve(msg.result);
      }
      return;
    }
    
    // Handle incoming command calls
    if (msg.method && this.config.commands[msg.method]) {
      this.handleCommand(msg.id, msg.method, msg.params);
    }
  }
  
  private async handleCommand(callId: string, command: string, args: any): Promise<void> {
    const def = this.config.commands[command];
    try {
      const result = await def.handler(args);
      this.send({ id: callId, result });
    } catch (error) {
      this.send({ id: callId, error: { code: -32000, message: String(error) } });
    }
  }
  
  // Send event to agent (push notification)
  sendEvent(event: string, data: any): void {
    this.send({
      event: 'node.event',
      params: {
        nodeId: this.nodeId,
        event,
        data
      }
    });
  }
  
  private send(msg: any): void {
    this.ws?.send(JSON.stringify(msg));
  }
  
  disconnect(): void {
    this.ws?.close();
  }
}
```

### 3. Desktop Familiar Node Integration (`packages/kobold-desktop-pet/src/gateway/pet-node.ts`)

```typescript
/**
 * Desktop Familiar as a Node
 * 
 * Connects to 0xKobold gateway and exposes pet commands
 */

import { NodeClient, CommandDefinition } from './node-client';
import { BrowserWindow } from 'electron';

export class DesktopFamiliarNode {
  private node: NodeClient;
  private window: BrowserWindow | null = null;
  
  constructor(gatewayUrl: string = 'ws://localhost:7777') {
    this.node = new NodeClient({
      name: 'desktop-pet',
      gatewayUrl,
      commands: {
        'familiar.show': {
          description: 'Show the desktop familiar window',
          handler: async () => {
            this.window?.show();
            return { visible: true };
          }
        },
        'familiar.hide': {
          description: 'Hide the desktop familiar window',
          handler: async () => {
            this.window?.hide();
            return { visible: false };
          }
        },
        'familiar.animate': {
          description: 'Set pet animation state',
          params: {
            type: 'object',
            properties: {
              state: { type: 'string', enum: ['idle', 'working', 'thinking', 'sleeping', 'walking', 'cheering'] }
            },
            required: ['state']
          },
          handler: async (args) => {
            this.window?.webContents.send('agent-state', {
              status: args.state,
              task: args.task || null
            });
            return { state: args.state };
          }
        },
        'familiar.state': {
          description: 'Get current pet state',
          handler: async () => {
            // Query renderer for current state
            return new Promise((resolve) => {
              this.window?.webContents.send('get-state');
              // ... handler stores result
              resolve({ status: this.currentState, visible: this.window?.isVisible() });
            });
          }
        },
        'familiar.position': {
          description: 'Set pet position on screen',
          params: {
            type: 'object',
            properties: {
              x: { type: 'number' },
              y: { type: 'number' }
            }
          },
          handler: async (args) => {
            this.window?.setPosition(args.x, args.y);
            return { x: args.x, y: args.y };
          }
        }
      }
    });
  }
  
  setWindow(window: BrowserWindow): void {
    this.window = window;
    
    // Forward events from pet to gateway
    // (e.g., pet was clicked -> agent can respond)
    window.webContents.on('ipc-message', (event, channel, ...args) => {
      if (channel === 'pet-event') {
        this.node.sendEvent(args[0].event, args[0].data);
      }
    });
  }
  
  async connect(): Promise<void> {
    await this.node.connect();
  }
  
  // Send state update to agent
  updateState(state: { status: string; task?: string | null }): void {
    this.node.sendEvent('familiar.stateChanged', state);
  }
  
  disconnect(): void {
    this.node.disconnect();
  }
}
```

### 4. Background Process Manager (`src/gateway/methods/process-manager.ts`)

For running web servers and long-lived processes in background while chatting:

```typescript
/**
 * Background Process Manager
 * 
 * Allows agent to spawn and manage long-running processes
 * (web servers, watchers, daemons) without blocking chat
 */

import { spawn, ChildProcess } from 'child_process';

interface ManagedProcess {
  id: string;
  name: string;
  process: ChildProcess;
  pid: number;
  startedAt: Date;
  status: 'running' | 'stopped' | 'crashed';
  stdout: string[];
  stderr: string[];
  exitCode: number | null;
}

const processes = new Map<string, ManagedProcess>();

export const processManagerHandlers = {
  'process.spawn': async ({ params, respond }) => {
    const { id, command, args = [], options = {} } = params;
    
    if (processes.has(id)) {
      return respond(false, null, { code: -32001, message: `Process already exists: ${id}` });
    }
    
    try {
      const proc = spawn(command, args, {
        ...options,
        stdio: ['ignore', 'pipe', 'pipe']
      });
      
      const managed: ManagedProcess = {
        id,
        name: options.name || command,
        process: proc,
        pid: proc.pid!,
        startedAt: new Date(),
        status: 'running',
        stdout: [],
        stderr: [],
        exitCode: null
      };
      
      proc.stdout?.on('data', (data) => {
        managed.stdout.push(data.toString());
        // Emit event for real-time monitoring
        // gateway.broadcast({ event: 'process.stdout', id, data: data.toString() });
      });
      
      proc.stderr?.on('data', (data) => {
        managed.stderr.push(data.toString());
      });
      
      proc.on('close', (code) => {
        managed.status = 'stopped';
        managed.exitCode = code;
      });
      
      proc.on('error', (err) => {
        managed.status = 'crashed';
      });
      
      processes.set(id, managed);
      
      respond(true, { id, pid: proc.pid, status: 'running' });
    } catch (error) {
      respond(false, null, { code: -32000, message: String(error) });
    }
  },
  
  'process.list': async ({ params, respond }) => {
    const list = Array.from(processes.values()).map(p => ({
      id: p.id,
      name: p.name,
      pid: p.pid,
      status: p.status,
      startedAt: p.startedAt,
      exitCode: p.exitCode
    }));
    respond(true, { processes: list });
  },
  
  'process.kill': async ({ params, respond }) => {
    const { id, signal = 'SIGTERM' } = params;
    const managed = processes.get(id);
    
    if (!managed) {
      return respond(false, null, { code: -32001, message: `Process not found: ${id}` });
    }
    
    managed.process.kill(signal);
    managed.status = 'stopped';
    respond(true, { id, status: 'stopped' });
  },
  
  'process.logs': async ({ params, respond }) => {
    const { id, type = 'stdout', lines = 100 } = params;
    const managed = processes.get(id);
    
    if (!managed) {
      return respond(false, null, { code: -32001, message: `Process not found: ${id}` });
    }
    
    const logs = type === 'stderr' ? managed.stderr : managed.stdout;
    respond(true, { logs: logs.slice(-lines) });
  },
  
  'process.wait': async ({ params, respond }) => {
    const { id, timeout = 30000 } = params;
    const managed = processes.get(id);
    
    if (!managed) {
      return respond(false, null, { code: -32001, message: `Process not found: ${id}` });
    }
    
    if (managed.status !== 'running') {
      return respond(true, { exitCode: managed.exitCode });
    }
    
    // Wait for process to exit
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), timeout);
      managed.process.on('close', () => {
        clearTimeout(timer);
        resolve();
      });
    });
    
    respond(true, { exitCode: managed.exitCode, status: managed.status });
  }
};
```

## Gateway Event Extensions

Add node events to the gateway protocol:

```typescript
// New event types in protocol
interface NodeEvent {
  event: 'node.connected' | 'node.disconnected' | 'node.event' | 'node.stateChanged';
  params: {
    nodeId: string;
    nodeName: string;
    [key: string]: any;
  }
}

// Broadcast to all clients when node connects
gateway.on('node.connected', (node) => {
  gateway.broadcast({
    event: 'node.connected',
    params: { nodeId: node.id, nodeName: node.name, commands: node.commands }
  });
});
```

## Usage Examples

### 1. Desktop Familiar Integration

```typescript
// In kobold-desktop-pet main.ts

// Initialize node client
const petNode = new DesktopFamiliarNode('ws://localhost:7777');
await petNode.connect();

// Poll agent state and sync with pet
setInterval(async () => {
  const state = await fetch('http://localhost:3456/api/agent-state').then(r => r.json());
  petNode.updateState({ status: state.status, task: state.task });
}, 2000);

// When pet is clicked, notify agent
window.webContents.on('ipc-message', (event, channel, data) => {
  if (channel === 'pet-clicked') {
    petNode.sendEvent('familiar.clicked', { position: data.position });
  }
});
```

### 2. Agent-Initiated Pet Interaction

```typescript
// Agent wants to show pet and set animation
await agent.run({
  method: 'node.invoke',
  params: {
    nodeId: 'node-desktop-pet-xxx',
    command: 'familiar.animate',
    args: { state: 'working', task: 'Building your feature...' }
  }
});

// Later, hide pet
await agent.run({
  method: 'node.invoke',
  params: {
    nodeId: 'node-desktop-pet-xxx',
    command: 'familiar.hide'
  }
});
```

### 3. Background Web Server

```typescript
// Agent starts a web server in background
await agent.run({
  method: 'process.spawn',
  params: {
    id: 'preview-server',
    command: 'npx',
    args: ['serve', '-p', '3000'],
    options: { name: 'Preview Server' }
  }
});

// Agent continues chatting while server runs

// Check logs
const logs = await agent.run({
  method: 'process.logs',
  params: { id: 'preview-server', lines: 50 }
});

// Stop server
await agent.run({
  method: 'process.kill',
  params: { id: 'preview-server' }
});
```

## File Structure

```
src/
├── gateway/
│   ├── methods/
│   │   ├── index.ts
│   │   ├── agent-run.ts
│   │   ├── node-invoke.ts      # NEW: Node command invocation
│   │   ├── node-register.ts    # NEW: Node registration
│   │   └── process-manager.ts   # NEW: Background process manager
│   └── persistence/
│       └── NodeRegistry.ts      # NEW: Node connection tracking
│
├── node/
│   ├── node-client.ts          # NEW: Generic node client library
│   └── node-test-client.ts      # NEW: Test client
│
packages/
└── kobold-desktop-pet/
    └── src/
        └── gateway/
            ├── pet-node.ts      # NEW: Pet-specific node implementation
            └── node-client.ts   # NEW: Copy of node client for standalone
```

## Implementation Phases

### Phase 1: Basic Node Protocol
- [ ] Add `node.register` method to gateway
- [ ] Add `node.invoke` method to gateway  
- [ ] Create NodeClient library
- [ ] Integrate with desktop familiar

### Phase 2: Event System
- [ ] Add node.event broadcaster
- [ ] Implement bidirectional events
- [ ] Add pet click events

### Phase 3: Process Manager
- [ ] Implement `process.spawn` method
- [ ] Add `process.list`, `process.kill`, `process.logs`
- [ ] Add timeout handling
- [ ] Integrate with agent loop

### Phase 4: Advanced Features
- [ ] Node discovery
- [ ] Multiple node instances
- [ ] Node health monitoring
- [ ] Process resource limits

## Security Considerations

1. **Command Allowlist**: Only registered commands can be invoked
2. **Process Isolation**: Background processes run with limited permissions
3. **Rate Limiting**: Nodes can't spam events
4. **Authentication**: Nodes must authenticate with gateway API key

## Next Steps

1. Create `src/gateway/methods/node-invoke.ts`
2. Create `packages/kobold-desktop-pet/src/gateway/pet-node.ts`
3. Update desktop familiar main process to use node client
4. Add `process.spawn` to agent's available tools
5. Document in README.md

---

*This design follows the OpenClaw node architecture pattern while adapting it for 0xKobold's gateway protocol.*