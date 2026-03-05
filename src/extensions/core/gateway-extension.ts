/**
 * Gateway Extension for 0xKobold
 *
 * Multi-Agent WebSocket Gateway - Ported from gateway/index.ts
 * Provides WebSocket server for agent spawning and management
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, mkdirSync } from 'node:fs';

// Protocol Types
interface Frame {
  type: "connect" | "req" | "res" | "event" | "error";
  id: string;
}

interface ConnectFrame extends Frame {
  type: "connect";
  params: {
    role: "client" | "node";
    client: string;
    caps?: string[];
    device?: { id: string; platform: string };
  };
}

interface RequestFrame extends Frame {
  type: "req";
  method: string;
  params: Record<string, unknown>;
}

interface ResponseFrame extends Frame {
  type: "res";
  ok: boolean;
  payload?: unknown;
  error?: string;
}

interface EventFrame {
  type: "event";
  event: string;
  payload: unknown;
  seq?: number;
}

// Agent Types
interface Agent {
  id: string;
  parentId?: string;
  sessionKey: string;
  depth: number;
  type: "primary" | "orchestrator" | "worker";
  capabilities: string[];
  status: "idle" | "running" | "completed" | "error";
  spawnedAt: Date;
  task?: string;
  model: string;
  children: string[];
  workspace: string;
  tokens: { input: number; output: number };
  stats: {
    runtime: number;
    toolCalls: number;
  };
}

interface SpawnParams {
  task: string;
  parentId: string;
  label?: string;
  capabilities?: string[];
  model?: string;
  maxWorkers?: number;
}

interface AnnouncePayload {
  source: "subagent";
  childSessionKey: string;
  taskLabel?: string;
  status: "success" | "error" | "timeout" | "unknown";
  result: string;
  tokens: { input: number; output: number };
  stats: {
    runtime: number;
    toolCalls: number;
  };
  sessionKey: string;
}

// Extension state
let server: ReturnType<typeof Bun.serve> | null = null;
const agents = new Map<string, Agent>();
const clients = new Map<string, WebSocket>();
let eventSeq = 0;
let isRunning = false;
let hasAttemptedStart = false; // Track if we've attempted to start

const KOBOLD_DIR = join(homedir(), ".0xkobold");
const AGENTS_DIR = join(KOBOLD_DIR, "agents");
const DEFAULT_GATEWAY_PORT = 18789;
const MAX_PORT_RETRIES = 10;

// Dynamic port state
let GATEWAY_PORT = DEFAULT_GATEWAY_PORT;

// Ensure directories exist
function ensureDirectories(): void {
  if (!existsSync(KOBOLD_DIR)) {
    mkdirSync(KOBOLD_DIR, { recursive: true });
  }
  if (!existsSync(AGENTS_DIR)) {
    mkdirSync(AGENTS_DIR, { recursive: true });
  }
}

// Check if a port is available
async function isPortAvailable(port: number, hostname: string): Promise<boolean> {
  try {
    const testServer = Bun.serve({
      port,
      hostname,
      fetch() {
        return new Response('test');
      },
    });
    testServer.stop();
    return true;
  } catch {
    return false;
  }
}

// Find an available port starting from the preferred port
async function findAvailablePort(preferredPort: number, hostname: string): Promise<number> {
  for (let i = 0; i < MAX_PORT_RETRIES; i++) {
    const port = preferredPort + i;
    if (await isPortAvailable(port, hostname)) {
      return port;
    }
    console.log(`[Gateway] Port ${port} is in use, trying next...`);
  }
  throw new Error(`Could not find an available port after ${MAX_PORT_RETRIES} attempts`);
}

// Event Bus
// @ts-ignore Return type
function emit(pi: ExtensionAPI, event: string, payload: unknown): void {
  eventSeq++;
  const frame: EventFrame = {
    type: "event",
    event,
    payload,
    seq: eventSeq,
  };

  // Emit to pi-coding-agent via message system
  // @ts-ignore sendMessage type
// @ts-ignore sendMessage type
  pi.sendMessage({
    customType: 'gateway.broadcast',
    // @ts-ignore Content type
    content: [{ type: 'text', text: `Event: ${event}` }],
    display: { type: 'text', text: `Gateway event: ${event}` },
    details: { event, payload, seq: eventSeq },
  });

  // Broadcast to WebSocket clients
  for (const [, ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(frame));
    }
  }
}

// Agent Tree
function buildAgentTree(): unknown {
  const root: Record<string, unknown> = {};

  for (const [id, agent] of agents) {
    const node = {
      id,
      type: agent.type,
      status: agent.status,
      depth: agent.depth,
      task: agent.task?.slice(0, 50),
      tokens: agent.tokens,
      children: agent.children,
    };

    if (agent.parentId) {
      const parent = agents.get(agent.parentId);
      if (parent) {
        if (!parent.children.includes(id)) {
          parent.children.push(id);
        }
      }
    } else {
      root[id] = node;
    }
  }

  return root;
}

function getAgentTreeString(): string {
  const lines: string[] = ["Agent Tree:"];

  function printAgent(id: string, indent: string) {
    const agent = agents.get(id);
    if (!agent) return;

    const statusIcon = agent.status === "running" ? "◐" :
                      agent.status === "completed" ? "✓" :
                      agent.status === "error" ? "✗" : "○";

    const typeLabel = agent.type === "orchestrator" ? "[orch]" :
                     agent.type === "worker" ? "[work]" : "[main]";

    const task = agent.task ? ` - ${agent.task.slice(0, 30)}` : "";
    const tokens = `(${agent.tokens.input}/${agent.tokens.output})`;

    lines.push(`${indent}${statusIcon} ${typeLabel} ${id}${task} ${tokens}`);

    for (const childId of agent.children) {
      printAgent(childId, indent + "  ");
    }
  }

  // Find root agents (depth 0)
  for (const [id, agent] of agents) {
    if (agent.depth === 0) {
      printAgent(id, "");
    }
  }

  return lines.join("\n");
}

// Detect capabilities from task description
function detectCapabilities(task: string): string[] {
  const caps: string[] = ["chat"];
  const t = task.toLowerCase();

  if (t.includes("code") || t.includes("program") || t.includes("develop")) {
    caps.push("coding", "shell", "file-ops");
  }
  if (t.includes("research") || t.includes("search") || t.includes("find")) {
    caps.push("web-search", "analysis");
  }
  if (t.includes("write") || t.includes("create") || t.includes("generate")) {
    caps.push("writing", "file-ops");
  }
  if (t.includes("debug") || t.includes("fix") || t.includes("error")) {
    caps.push("debugging", "shell");
  }
  if (t.includes("test") || t.includes("validate")) {
    caps.push("testing", "shell");
  }
  if (t.includes("refactor") || t.includes("improve")) {
    caps.push("refactoring", "code-review");
  }

  return [...new Set(caps)];
}

// Spawn Agent
async function spawnAgent(pi: ExtensionAPI, params: SpawnParams): Promise<Agent> {
  const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const parent = params.parentId ? agents.get(params.parentId) : undefined;

  const depth = parent ? parent.depth + 1 : 0;
  const sessionKey = parent
    ? `${parent.sessionKey}:subagent:${id}`
    : `agent:main:${id}`;

  // Determine agent type based on task and depth
  let type: Agent["type"] = "worker";
  if (depth === 0) {
    type = "primary";
  } else if (params.maxWorkers && params.maxWorkers > 1) {
    type = "orchestrator";
  }

  // Auto-detect capabilities from task
  const capabilities = params.capabilities || detectCapabilities(params.task);

  // Create workspace
  const workspace = join(AGENTS_DIR, id, "workspace");
  if (!existsSync(workspace)) {
    mkdirSync(workspace, { recursive: true });
  }

  const agent: Agent = {
    id,
    parentId: params.parentId,
    sessionKey,
    depth,
    type,
    capabilities,
    status: "idle",
    spawnedAt: new Date(),
    task: params.task,
    model: params.model || "ollama/minimax-m2.5:cloud",
    children: [],
    workspace,
    tokens: { input: 0, output: 0 },
    stats: { runtime: 0, toolCalls: 0 },
  };

  agents.set(id, agent);

  // Add to parent's children
  if (parent) {
    parent.children.push(id);
  }

  // Emit spawn event
  emit(pi, "agent.spawned", {
    id,
    parentId: params.parentId,
    type,
    depth,
    task: params.task,
    capabilities,
  });

  console.log(`[Agent] Spawned ${type} agent ${id} at depth ${depth}`);
  console.log(getAgentTreeString());

  return agent;
}

// Execute Agent Task
async function executeAgent(pi: ExtensionAPI, agent: Agent): Promise<void> {
  agent.status = "running";
  const startTime = Date.now();

  emit(pi, "agent.status", {
    id: agent.id,
    status: "running",
    task: agent.task,
  });

  // Simulate work
  await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));

  // Simulate token usage
  agent.tokens.input += Math.floor(agent.task?.length || 10) * 2;
  agent.tokens.output += Math.floor(Math.random() * 500) + 100;

  agent.stats.runtime = Date.now() - startTime;
  agent.stats.toolCalls = Math.floor(Math.random() * 5);
  agent.status = "completed";

  // Announce completion to parent
  if (agent.parentId) {
    await announceToParent(pi, agent);
  }

  emit(pi, "agent.status", {
    id: agent.id,
    status: "completed",
    tokens: agent.tokens,
  });
}

// Announce result to parent
async function announceToParent(pi: ExtensionAPI, agent: Agent): Promise<void> {
  const parent = agents.get(agent.parentId!);
  if (!parent) return;

  const announce: AnnouncePayload = {
    source: "subagent",
    childSessionKey: agent.sessionKey,
    taskLabel: agent.task?.slice(0, 50),
    status: agent.status === "completed" ? "success" : "error",
    result: `Completed: ${agent.task}\n\nOutput: ${agent.tokens.output} tokens`,
    tokens: agent.tokens,
    stats: agent.stats,
    sessionKey: agent.sessionKey,
  };

  emit(pi, "agent.announce", {
    parentId: parent.id,
    childId: agent.id,
    ...announce,
  });

  console.log(`[Agent] ${agent.id} announced to parent ${parent.id}`);
}

// Spawn Swarm
async function spawnSwarm(pi: ExtensionAPI, parentId: string, task: string, count: number): Promise<Agent[]> {
  const spawned: Agent[] = [];

  console.log(`[Agent] Spawning swarm of ${count} workers for task: ${task.slice(0, 50)}`);

  for (let i = 0; i < count; i++) {
    const agent = await spawnAgent(pi, {
      task: `${task} [worker ${i + 1}/${count}]`,
      parentId,
      label: `worker-${i + 1}`,
      capabilities: detectCapabilities(task),
    });
    spawned.push(agent);

    // Start execution
    executeAgent(pi, agent);
  }

  return spawned;
}

// Start Gateway Server
async function startGateway(pi: ExtensionAPI): Promise<void> {
  if (server) {
    console.log('[Gateway] Already running');
    return;
  }

  ensureDirectories();

  // Get port and hostname from flags or use defaults
  const preferredPort = Number(pi.getFlag('gateway-port')) || DEFAULT_GATEWAY_PORT;
  const hostname = String(pi.getFlag('gateway-host') ?? '127.0.0.1');

  // Find an available port
  try {
    GATEWAY_PORT = await findAvailablePort(preferredPort, hostname);
    if (GATEWAY_PORT !== preferredPort) {
      console.log(`[Gateway] Using alternate port ${GATEWAY_PORT} (preferred ${preferredPort} was in use)`);
    }
  } catch (err) {
    console.error('[Gateway] Failed to find available port:', err instanceof Error ? err.message : String(err));
    // @ts-ignore sendMessage type
// @ts-ignore sendMessage type
    pi.sendMessage({
      customType: 'gateway.error',
      // @ts-ignore Content type
      content: [{ type: 'text', text: 'Gateway failed to start: no available port' }],
      // @ts-ignore Content type
      display: { type: 'text', text: 'Gateway failed: no available port' },
      details: { error: 'no_available_port' },
    });
    return;
  }

  server = Bun.serve({
    port: GATEWAY_PORT,
    hostname,

    websocket: {
      open(ws) {
        (ws as unknown as { data: { state: string; id: string | null } }).data = { state: "pending", id: null };
      },

      async message(ws, data) {
        try {
          const frame = JSON.parse(data as string) as Frame;
          const wsData = (ws as unknown as { data: { state: string; id: string | null; [key: string]: unknown } }).data;

          // Handshake
          if (wsData.state === "pending") {
            if (frame.type !== "connect") {
              ws.close(1002, "Expected connect");
              return;
            }

            const connect = frame as ConnectFrame;
            const clientId = connect.params.device?.id || `client-${Date.now()}`;

            Object.assign(wsData, { state: "connected", id: clientId, ...connect.params });
            clients.set(clientId, ws as unknown as WebSocket);

            const res: ResponseFrame = {
              type: "res",
              id: frame.id,
              ok: true,
              payload: {
                clientId,
                agents: Array.from(agents.values()).map(a => ({
                  id: a.id,
                  type: a.type,
                  status: a.status,
                  depth: a.depth,
                })),
              },
            };

            ws.send(JSON.stringify(res));
            console.log(`[Gateway] Client connected: ${clientId}`);
            return;
          }

          // Handle requests
          if (frame.type === "req") {
            const req = frame as RequestFrame;
            let res: ResponseFrame;

            switch (req.method) {
              case "agent.spawn": {
                // @ts-ignore Type cast through unknown
                const { task, parentId, maxWorkers } = (req.params as unknown) as SpawnParams;

                if (maxWorkers && maxWorkers > 1) {
                  // Spawn swarm
                  const swarm = await spawnSwarm(pi, parentId || "main", task, maxWorkers);
                  res = {
                    type: "res",
                    id: frame.id,
                    ok: true,
                    payload: {
                      swarm: swarm.map(a => a.id),
                      count: swarm.length,
                      tree: getAgentTreeString(),
                    },
                  };
                } else {
                  // Spawn single agent
                  const agent = await spawnAgent(pi, { task, parentId: parentId || "main" });
                  executeAgent(pi, agent);

                  res = {
                    type: "res",
                    id: frame.id,
                    ok: true,
                    payload: {
                      id: agent.id,
                      sessionKey: agent.sessionKey,
                      type: agent.type,
                      depth: agent.depth,
                      tree: getAgentTreeString(),
                    },
                  };
                }
                break;
              }

              case "agent.list": {
                const agentList = Array.from(agents.values()).map(a => ({
                  id: a.id,
                  parentId: a.parentId,
                  type: a.type,
                  status: a.status,
                  depth: a.depth,
                  task: a.task?.slice(0, 50),
                  tokens: a.tokens,
                  children: a.children.length,
                }));

                res = {
                  type: "res",
                  id: frame.id,
                  ok: true,
                  payload: {
                    agents: agentList,
                    tree: getAgentTreeString(),
                    total: agents.size,
                  },
                };
                break;
              }

              case "agent.tree": {
                res = {
                  type: "res",
                  id: frame.id,
                  ok: true,
                  payload: {
                    tree: getAgentTreeString(),
                  },
                };
                break;
              }

              case "agent.kill": {
                const { id, cascade } = req.params as { id: string; cascade?: boolean };
                const agent = agents.get(id);

                if (agent) {
                  if (cascade && agent.children.length > 0) {
                    for (const childId of agent.children) {
                      agents.delete(childId);
                    }
                  }
                  agents.delete(id);

                  res = {
                    type: "res",
                    id: frame.id,
                    ok: true,
                    payload: { killed: id, cascade: cascade || false },
                  };
                } else {
                  res = {
                    type: "res",
                    id: frame.id,
                    ok: false,
                    error: "Agent not found",
                  };
                }
                break;
              }

              case "chat.send": {
                const { message, agentId } = req.params as { message: string; agentId?: string };

                // If message suggests spawning, auto-spawn
                if (message.toLowerCase().includes("spawn") || message.toLowerCase().includes("create agent")) {
                  const task = message.replace(/spawn|create agent/gi, "").trim();
                  const agent = await spawnAgent(pi, {
                    task: task || "assist with task",
                    parentId: agentId || "main"
                  });
                  executeAgent(pi, agent);

                  res = {
                    type: "res",
                    id: frame.id,
                    ok: true,
                    payload: {
                      content: `Spawned ${agent.type} agent ${agent.id} to handle: ${agent.task}`,
                      agent: agent.id,
                      tree: getAgentTreeString(),
                    },
                  };
                } else if (message.toLowerCase().includes("swarm")) {
                  // Extract number from message like "spawn swarm of 5"
                  const match = message.match(/(\d+)/);
                  const count = match ? parseInt(match[1]) : 3;
                  const task = message.replace(/swarm|\d+/gi, "").trim();

                  const swarm = await spawnSwarm(pi, agentId || "main", task || "assist", count);

                  res = {
                    type: "res",
                    id: frame.id,
                    ok: true,
                    payload: {
                      content: `Spawned swarm of ${swarm.length} workers`,
                      swarm: swarm.map(a => a.id),
                      tree: getAgentTreeString(),
                    },
                  };
                } else {
                  res = {
                    type: "res",
                    id: frame.id,
                    ok: true,
                    payload: {
                      content: `Echo: ${message}`,
                    },
                  };
                }
                break;
              }

              default:
                res = {
                  type: "res",
                  id: frame.id,
                  ok: false,
                  error: `Unknown method: ${req.method}`,
                };
            }

            ws.send(JSON.stringify(res));
          }
        } catch (err) {
          ws.send(JSON.stringify({
            type: "error",
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      },

      close(ws) {
        const wsData = (ws as unknown as { data: { id?: string } }).data;
        if (wsData.id) {
          clients.delete(wsData.id);
          console.log(`[Gateway] Client disconnected: ${wsData.id}`);
        }
      },
    },

    fetch(req, server) {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return Response.json({
          status: "ok",
          agents: agents.size,
          clients: clients.size,
        });
      }

      // Upgrade WebSocket connections
      // @ts-ignore Bun Server upgrade signature
      if (server.upgrade(req)) {
        return; // Return undefined to accept the WebSocket upgrade
      }

      return new Response("0xKobold Gateway - WebSocket on port 18789", { status: 200 });
    },
  });

  isRunning = true;
  console.log(`[Gateway] Multi-Agent Gateway listening on ws://127.0.0.1:${GATEWAY_PORT}`);
  console.log(`[Gateway] Agents directory: ${AGENTS_DIR}`);

  // @ts-ignore sendMessage type
// @ts-ignore sendMessage type
  pi.sendMessage({
    customType: 'gateway.started',
    content: [{ type: 'text', text: `Gateway started on port ${GATEWAY_PORT}` }],
      // @ts-ignore Content type
    display: { type: 'text', text: `Gateway started on port ${GATEWAY_PORT}` },
    details: { port: GATEWAY_PORT, url: `ws://127.0.0.1:${GATEWAY_PORT}`, agents: agents.size, clients: clients.size },
  });
}

// Stop Gateway Server
async function stopGateway(pi: ExtensionAPI): Promise<void> {
  if (!server) {
    console.log('[Gateway] Not running');
    return;
  }

  // Close all client connections
  for (const [, ws] of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, "Gateway shutting down");
    }
  }
  clients.clear();

  // Stop the server
  server.stop();
  server = null;
  isRunning = false;

  console.log('[Gateway] Server stopped');
  // @ts-ignore sendMessage type
// @ts-ignore sendMessage type
  pi.sendMessage({
    customType: 'gateway.stopped',
    content: [{ type: 'text', text: 'Gateway stopped' }],
      // @ts-ignore Content type
    display: { type: 'text', text: 'Gateway stopped' },
    details: {},
  });
}

// Get gateway status
function getStatus(): { running: boolean; port: number; agents: number; clients: number } {
  return {
    running: isRunning,
    port: GATEWAY_PORT,
    agents: agents.size,
    clients: clients.size,
  };
}

// Main Extension Export
export default function gatewayExtension(pi: ExtensionAPI) {
  // Register CLI flags for gateway configuration
  pi.registerFlag('gateway-port', {
    description: 'Port for the WebSocket gateway server',
    type: 'string',
    default: String(DEFAULT_GATEWAY_PORT),
  });

  pi.registerFlag('gateway-host', {
    description: 'Hostname for the WebSocket gateway server',
    type: 'string',
    default: '127.0.0.1',
  });

  // Register gateway_broadcast tool
  pi.registerTool({
    name: 'gateway_broadcast',
    description: 'Broadcast a message to all connected gateway clients',
    // @ts-ignore TSchema mismatch
    parameters: {
      type: 'object',
      properties: {
        event: { type: 'string', description: 'Event name' },
        payload: { type: 'object', description: 'Event payload' },
      },
      required: ['event', 'payload'],
    },
    async execute(args: any) {
      const { event, payload } = args as { event: string; payload: Record<string, unknown> };

      if (!isRunning) {
        return {
          content: [{ type: 'text', text: 'Gateway not running' }],
          details: { error: 'not_running' },
        };
      }

      emit(pi, event, payload);

      return {
        content: [{ type: 'text', text: `Broadcasted event "${event}" to ${clients.size} clients` }],
        details: { clients: clients.size },
      };
    },
  });

  // Register gateway:start command
  pi.registerCommand('gateway:start', {
    description: 'Start the WebSocket gateway server',
    async handler() {
      await startGateway(pi);
    },
  });

  // Register gateway:stop command
  pi.registerCommand('gateway:stop', {
    description: 'Stop the WebSocket gateway server',
    async handler() {
      await stopGateway(pi);
    },
  });

  // Register gateway:status command
  pi.registerCommand('gateway:status', {
    description: 'Get gateway server status',
    async handler() {
      const status = getStatus();
      // @ts-ignore sendMessage type
// @ts-ignore sendMessage type
      pi.sendMessage({
        customType: 'gateway.status',
        content: [{ type: 'text', text: `Gateway status: ${JSON.stringify(status)}` }],
      // @ts-ignore Content type
        display: { type: 'text', text: `Gateway: ${status.running ? '🟢' : '🔴'} ${status.agents} agents, ${status.clients} clients` },
        details: status,
      });
      console.log('[Gateway] Status:', status);
    },
  });

  // Cleanup on shutdown
  // @ts-ignore Event type
  pi.on('shutdown', async () => {
    await stopGateway(pi);
  });

  // Auto-start gateway when session starts (runtime is ready)
  // Only start in the main process, NOT in subagent sessions
  pi.on('session_start', async () => {
    // Skip if already attempted (prevents duplicate starts in subagents)
    if (hasAttemptedStart) {
      console.log('[Gateway] Gateway already started or attempted, skipping...');
      return;
    }
    hasAttemptedStart = true;

    // Check if we're in a subagent by looking for parent session indicator
    const isSubagent = process.env.KOBOLD_SUBAGENT === 'true' || process.env.PI_SESSION_PARENT;
    if (isSubagent) {
      console.log('[Gateway] Running in subagent, skipping gateway auto-start');
      return;
    }

    // Skip if this isn't the main TUI process
    const args = process.argv.slice(2);
    const hasCommandFlag = args.includes('--command') || args.includes('-c');
    if (hasCommandFlag) {
      console.log('[Gateway] Running with --command flag, skipping gateway auto-start');
      return;
    }

    console.log('[Gateway] Session started. Auto-starting gateway...');
    await startGateway(pi);
  });

  console.log('[Gateway] Extension loaded. Waiting for session start...');
}
