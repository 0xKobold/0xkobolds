# Background Process Manager

## Overview

The background process manager allows 0xKobold to spawn and manage long-running processes (web servers, watchers, daemons) without blocking the agent chat interface.

## Problem

When you want to run a web server or long-running command:

```bash
# This BLOCKS the agent until completion
bun run serve  # Agent cannot chat until process exits
```

With the process manager:

```typescript
// This runs in background, agent can still chat
await agent.run({
  method: 'process.spawn',
  params: {
    id: 'preview-server',
    command: 'bun',
    args: ['run', 'serve', '-p', '3000']
  }
});

// Agent continues conversation...

// Later check status
await agent.run({
  method: 'process.list',
  params: {}
});

// Stop when done
await agent.run({
  method: 'process.kill',
  params: { id: 'preview-server' }
});
```

## Available Commands

### `process.spawn`

Start a background process:

```typescript
{
  method: 'process.spawn',
  params: {
    id: string,          // Unique identifier for this process
    command: string,     // Command to run (e.g., 'bun', 'node', 'python')
    args?: string[],     // Command arguments
    options?: {
      name?: string,     // Human-readable name
      cwd?: string,      // Working directory
      env?: Record<string, string>,  // Environment variables
      detached?: boolean  // Run detached from gateway
    }
  }
}
```

Returns:
```typescript
{
  id: string,
  pid: number,
  status: 'running',
  startedAt: string  // ISO timestamp
}
```

### `process.list`

List all managed processes:

```typescript
{
  method: 'process.list',
  params: {}
}
```

Returns:
```typescript
{
  processes: Array<{
    id: string,
    name: string,
    pid: number,
    status: 'running' | 'stopped' | 'crashed',
    startedAt: string,
    exitCode: number | null
  }>
}
```

### `process.kill`

Stop a running process:

```typescript
{
  method: 'process.kill',
  params: {
    id: string,
    signal?: 'SIGTERM' | 'SIGKILL' | 'SIGINT'  // Default: SIGTERM
  }
}
```

### `process.logs`

Get process output:

```typescript
{
  method: 'process.logs',
  params: {
    id: string,
    type?: 'stdout' | 'stderr' | 'all',  // Default: 'stdout'
    lines?: number  // Last N lines, default: 100
  }
}
```

### `process.wait`

Wait for process to exit (with timeout):

```typescript
{
  method: 'process.wait',
  params: {
    id: string,
    timeout?: number  // ms, default: 30000
  }
}
```

## Usage Examples

### Start a Preview Server

```typescript
// Start development server in background
await agent.run({
  method: 'process.spawn',
  params: {
    id: 'dev-server',
    command: 'bun',
    args: ['run', 'dev', '--port', '3000'],
    options: { name: 'Development Server' }
  }
});

// Agent: "Server started. I can continue helping you while it runs."
```

### Check Server Logs

```typescript
const result = await agent.run({
  method: 'process.logs',
  params: { id: 'dev-server', lines: 20 }
});

console.log(result.logs.join('\n'));
```

### Run Multiple Processes

```typescript
// Start frontend
await agent.run({
  method: 'process.spawn',
  params: {
    id: 'frontend',
    command: 'npm',
    args: ['run', 'dev'],
    options: { cwd: './frontend', name: 'Frontend Dev' }
  }
});

// Start backend
await agent.run({
  method: 'process.spawn',
  params: {
    id: 'backend',
    command: 'bun',
    args: ['run', 'server.ts'],
    options: { cwd: './backend', name: 'Backend API' }
  }
});

// Check both are running
const status = await agent.run({ method: 'process.list', params: {} });
// status.processes = [{id: 'frontend', ...}, {id: 'backend', ...}]
```

### Stop All Processes

```typescript
const { processes } = await agent.run({
  method: 'process.list',
  params: {}
});

for (const proc of processes) {
  if (proc.status === 'running') {
    await agent.run({
      method: 'process.kill',
      params: { id: proc.id }
    });
  }
}
```

## Implementation

Located in `src/gateway/methods/process-manager.ts`:

```typescript
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
      return respond(false, null, { 
        code: -32001, 
        message: `Process already exists: ${id}` 
      });
    }
    
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
    
    // Capture output
    proc.stdout?.on('data', (data) => {
      managed.stdout.push(data.toString());
      // Optionally broadcast to connected clients
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
  },
  
  // ... other handlers
};
```

## Security Considerations

1. **Command Allowlist** (future): Restrict which commands can be spawned
2. **Resource Limits**: Limit memory and CPU per process
3. **Timeout**: Auto-kill processes after max lifetime
4. **User Approval**: Require approval for certain commands

## Agent Tool Integration

Add to `agent/tools`:

```typescript
// src/agent/tools/process-manager-tool.ts

import { Tool } from '@mariozechner/pi-coding-agent';

export const processManagerTool: Tool = {
  name: 'process_manager',
  description: 'Manage background processes (spawn, list, kill, logs)',
  parameters: {
    type: 'object',
    oneOf: [
      {
        properties: {
          action: { const: 'spawn' },
          id: { type: 'string' },
          command: { type: 'string' },
          args: { type: 'array', items: { type: 'string' } }
        },
        required: ['action', 'id', 'command']
      },
      {
        properties: {
          action: { const: 'list' }
        },
        required: ['action']
      },
      {
        properties: {
          action: { const: 'kill' },
          id: { type: 'string' }
        },
        required: ['action', 'id']
      },
      {
        properties: {
          action: { const: 'logs' },
          id: { type: 'string' },
          lines: { type: 'number' }
        },
        required: ['action', 'id']
      }
    ]
  },
  async execute(params, context) {
    const { gateway } = context;
    
    return await gateway.invoke({
      method: `process.${params.action}`,
      params: params
    });
  }
};
```

## Status Tracking

Gateway tracks process status and can notify agent:

```typescript
// Internal tracking
processes: {
  'dev-server': { status: 'running', pid: 12345 },
  'build': { status: 'stopped', exitCode: 0 },
  'test-runner': { status: 'crashed', exitCode: 1 }
}

// Agent can query
const status = await agent.run({ method: 'process.list' });
```

## Future Enhancements

- [ ] Process health monitoring
- [ ] Auto-restart on crash
- [ ] Resource usage tracking (CPU, memory)
- [ ] Port conflict detection
- [ ] Process groups (start/stop multiple)
- [ ] Process templates (saved configs)

---

*Part of the 0xKobold Node System Architecture*