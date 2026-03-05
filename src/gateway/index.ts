/**
 * Gateway
 *
 * WebSocket gateway using native Bun.serve for simplicity
 * and compatibility with Bun runtime.
 */

import type { GatewayConfig } from '../config';

const clients = new Map<string, ClientConnection>();
const agents = new Map<string, AgentState>();

interface ClientConnection {
  id: string;
  socket: any;
  role: 'client' | 'node';
  device?: { id: string; platform: string };
  connectedAt: Date;
}

interface AgentState {
  id: string;
  parentId?: string;
  sessionKey: string;
  depth: number;
  type: 'primary' | 'orchestrator' | 'worker';
  capabilities: string[];
  status: 'idle' | 'running' | 'completed' | 'error';
  spawnedAt: Date;
  task?: string;
  model: string;
  children: string[];
  workspace: string;
  tokens: { input: number; output: number };
  stats: { runtime: number; toolCalls: number };
}

interface Frame {
  type: 'connect' | 'req' | 'res' | 'event' | 'error';
  id: string;
}

interface ConnectFrame extends Frame {
  type: 'connect';
  params: {
    role: 'client' | 'node';
    client: string;
    caps?: string[];
    device?: { id: string; platform: string };
  };
}

interface RequestFrame extends Frame {
  type: 'req';
  method: string;
  params: Record<string, unknown>;
}

interface ResponseFrame extends Frame {
  type: 'res';
  ok: boolean;
  payload?: unknown;
  error?: string;
}

interface EventFrame {
  type: 'event';
  event: string;
  payload: unknown;
  seq?: number;
}

interface WsData {
  state: 'pending' | 'connected';
  id: string | null;
  role?: 'client' | 'node';
  device?: { id: string; platform: string };
}

/**
 * Start the gateway server
 */
export async function startGateway(config: GatewayConfig): Promise<void> {
  if (!config.enabled) {
    console.log('[Gateway] Gateway disabled');
    return;
  }

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,

    fetch(req, server) {
      const url = new URL(req.url);

      // Health check
      if (url.pathname === '/health') {
        // Dynamically get version from package.json
        let version = 'unknown';
        try {
          const packageJson = await Bun.file(new URL('../../package.json', import.meta.url)).json();
          version = packageJson.version;
        } catch {
          // Fallback to unknown if package.json can't be read
        }

        return Response.json({
          status: 'ok',
          uptime: process.uptime(),
          agents: agents.size,
          clients: clients.size,
          version,
        });
      }

      // Agent info
      if (url.pathname === '/agents') {
        return Response.json(
          Array.from(agents.values()).map(a => ({
            id: a.id,
            type: a.type,
            status: a.status,
            depth: a.depth,
            task: a.task?.slice(0, 50),
            tokens: a.tokens,
          }))
        );
      }

      // WebSocket upgrade
      if (url.pathname === '/ws') {
        const success = server.upgrade(req);
        if (success) return undefined;
        return new Response('WebSocket upgrade failed', { status: 400 });
      }

      return new Response('Not Found', { status: 404 });
    },

    websocket: {
      open(ws) {
        console.log('[Gateway] WebSocket connection opened');
        (ws as any).data = { state: 'pending', id: null };
      },

      async message(ws, message) {
        try {
          const wsAny = ws as any;
          const frame = JSON.parse(message as string) as Frame;

          // Handle handshake
          if (wsAny.data.state === 'pending') {
            if (frame.type !== 'connect') {
              ws.close(1002, 'Expected connect frame');
              return;
            }

            const connect = frame as ConnectFrame;
            const clientId = connect.params.device?.id || `client-${Date.now()}`;

            wsAny.data = {
              state: 'connected',
              id: clientId,
              ...connect.params,
            };

            clients.set(clientId, {
              id: clientId,
              socket: ws,
              role: connect.params.role,
              device: connect.params.device,
              connectedAt: new Date(),
            });

            // Send connection response
            const res: ResponseFrame = {
              type: 'res',
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
          if (frame.type === 'req') {
            const req = frame as RequestFrame;
            const res = await handleRequest(req, wsAny.data.id);
            ws.send(JSON.stringify(res));
          }
        } catch (err) {
          console.error('[Gateway] WebSocket error:', err);
          ws.send(JSON.stringify({
            type: 'error',
            error: err instanceof Error ? err.message : String(err),
          }));
        }
      },

      close(ws) {
        const wsAny = ws as any;
        if (wsAny.data?.id) {
          clients.delete(wsAny.data.id);
          console.log(`[Gateway] Client disconnected: ${wsAny.data.id}`);
        }
      },
    },
  });

  console.log(`[Gateway] Listening on ws://${config.host}:${config.port}`);
}

/**
 * Handle JSON-RPC style requests
 */
async function handleRequest(req: RequestFrame, clientId: string): Promise<ResponseFrame> {
  switch (req.method) {
    case 'agent.spawn': {
      const params = req.params as { task: string; parentId?: string; maxWorkers?: number };
      const { task, parentId, maxWorkers } = params;

      if (maxWorkers && maxWorkers > 1) {
        const swarm = await spawnSwarm(parentId || 'main', task, maxWorkers);
        return {
          type: 'res',
          id: req.id,
          ok: true,
          payload: {
            swarm: swarm.map(a => a.id),
            count: swarm.length,
            tree: getAgentTreeString(),
          },
        };
      } else {
        const agent = await spawnAgent({
          task,
          parentId: parentId || 'main',
        });

        return {
          type: 'res',
          id: req.id,
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
    }

    case 'agent.list': {
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

      return {
        type: 'res',
        id: req.id,
        ok: true,
        payload: {
          agents: agentList,
          tree: getAgentTreeString(),
          total: agents.size,
        },
      };
    }

    case 'agent.tree': {
      return {
        type: 'res',
        id: req.id,
        ok: true,
        payload: {
          tree: getAgentTreeString(),
        },
      };
    }

    case 'agent.kill': {
      const params = req.params as { id: string; cascade?: boolean };
      const { id, cascade } = params;
      const agent = agents.get(id);

      if (agent) {
        if (cascade && agent.children.length > 0) {
          for (const childId of agent.children) {
            agents.delete(childId);
          }
        }
        agents.delete(id);

        return {
          type: 'res',
          id: req.id,
          ok: true,
          payload: { killed: id, cascade: cascade || false },
        };
      }

      return {
        type: 'res',
        id: req.id,
        ok: false,
        error: 'Agent not found',
      };
    }

    case 'chat.send': {
      const params = req.params as { message: string; agentId?: string };
      const { message, agentId } = params;

      return {
        type: 'res',
        id: req.id,
        ok: true,
        payload: {
          received: true,
          message: message.slice(0, 100),
        },
      };
    }

    default:
      return {
        type: 'res',
        id: req.id,
        ok: false,
        error: `Unknown method: ${req.method}`,
      };
  }
}

/**
 * Spawn a new agent
 */
async function spawnAgent(params: {
  task: string;
  parentId?: string;
}): Promise<AgentState> {
  const id = `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const parent = params.parentId ? agents.get(params.parentId) : undefined;

  const depth = parent ? parent.depth + 1 : 0;
  const sessionKey = parent
    ? `${parent.sessionKey}:subagent:${id}`
    : `agent:main:${id}`;

  const agent: AgentState = {
    id,
    parentId: params.parentId,
    sessionKey,
    depth,
    type: depth === 0 ? 'primary' : 'worker',
    capabilities: detectCapabilities(params.task),
    status: 'idle',
    spawnedAt: new Date(),
    task: params.task,
    model: 'ollama/llama3.2',
    children: [],
    workspace: `~/.0xkobold/agents/${id}`,
    tokens: { input: 0, output: 0 },
    stats: { runtime: 0, toolCalls: 0 },
  };

  agents.set(id, agent);

  if (parent) {
    parent.children.push(id);
  }

  return agent;
}

/**
 * Spawn a swarm of agents
 */
async function spawnSwarm(
  parentId: string,
  task: string,
  count: number
): Promise<AgentState[]> {
  const spawned: AgentState[] = [];

  for (let i = 0; i < count; i++) {
    const agent = await spawnAgent({
      task: `${task} [worker ${i + 1}/${count}]`,
      parentId,
    });
    spawned.push(agent);
  }

  return spawned;
}

/**
 * Detect capabilities from task
 */
function detectCapabilities(task: string): string[] {
  const caps: string[] = ['chat'];
  const t = task.toLowerCase();

  if (t.includes('code') || t.includes('program') || t.includes('develop')) {
    caps.push('coding', 'shell', 'file-ops');
  }
  if (t.includes('research') || t.includes('search') || t.includes('find')) {
    caps.push('web-search', 'analysis');
  }
  if (t.includes('write') || t.includes('create') || t.includes('generate')) {
    caps.push('writing', 'file-ops');
  }
  if (t.includes('debug') || t.includes('fix') || t.includes('error')) {
    caps.push('debugging', 'shell');
  }

  return [...new Set(caps)];
}

/**
 * Build agent tree string
 */
function getAgentTreeString(): string {
  const lines: string[] = ['Agent Tree:'];

  function printAgent(id: string, indent: string) {
    const agent = agents.get(id);
    if (!agent) return;

    const statusIcon =
      agent.status === 'running' ? '◐' : agent.status === 'completed' ? '✓' : agent.status === 'error' ? '✗' : '○';

    const typeLabel =
      agent.type === 'orchestrator' ? '[orch]' : agent.type === 'worker' ? '[work]' : '[main]';

    const task = agent.task ? ` - ${agent.task.slice(0, 30)}` : '';
    const tokens = `(${agent.tokens.input}/${agent.tokens.output})`;

    lines.push(`${indent}${statusIcon} ${typeLabel} ${id}${task} ${tokens}`);

    for (const childId of agent.children) {
      printAgent(childId, indent + '  ');
    }
  }

  for (const [id, agent] of agents) {
    if (agent.depth === 0) {
      printAgent(id, '');
    }
  }

  return lines.join('\n');
}

/**
 * Create gateway (for compatibility)
 */
export function createGateway(config: GatewayConfig) {
  return {
    listen: () => startGateway(config),
  };
}
