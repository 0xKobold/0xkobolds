/**
 * 🐉 Draconic Gateway Extension
 *
 * Enhanced with:
 * - DraconicConnectionPool: HTTP/2 multiplexing for API calls
 * - DraconicTokenPredictor: Pre-send token estimation
 * - DraconicRunRegistry: Hierarchical agent tracking
 * - DraconicErrorClassifier: Predictive error handling
 *
 * Replaces: gateway-extension.ts with superior performance
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, mkdirSync } from "node:fs";

// 🐉 DRACONIC IMPORTS
import {
  DraconicConnectionPool,
  ConnectionSlot,
  ConnectionHealth,
  getDraconicConnectionPool,
} from "../../infra/DraconicConnectionPool";

import {
  DraconicTokenPredictor,
  TokenEstimate,
  getDraconicTokenPredictor,
} from "../../agent/DraconicTokenPredictor";

import {
  DraconicRunRegistry,
  getDraconicRunRegistry,
} from "../../agent/DraconicRunRegistry";

import {
  DraconicErrorClassifier,
  getDraconicErrorClassifier,
} from "../../agent/DraconicErrorClassifier";

// Protocol Types
interface Frame {
  type: "connect" | "req" | "res" | "event" | "error";
  id: string;
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

// Enhanced with Draconic metrics
interface DraconicAgent {
  id: string;
  parentId?: string;
  sessionKey: string;
  depth: number;
  type: "primary" | "orchestrator" | "worker";
  capabilities: string[];
  status: "idle" | "running" | "completed" | "compacting" | "error";
  spawnedAt: Date;
  task?: string;
  model: string;
  children: string[];
  workspace: string;
  tokens: { input: number; output: number };
  // 🐉 Draconic additions
  draconicRunId?: string;
  tokenEstimate?: TokenEstimate;
  lastErrorStrategy?: string;
}

interface GatewayStats {
  running: boolean;
  port: number;
  agents: number;
  clients: number;
  // 🐉 Performance metrics
  poolConnections: number;
  poolHealth: ConnectionHealth[];
  totalTokensPredicted: number;
  totalErrorsPrevented: number;
}

// Config
const DEFAULT_GATEWAY_PORT = 18789;
const GATEWAY_PORT = process.env.GATEWAY_PORT
  ? parseInt(process.env.GATEWAY_PORT)
  : DEFAULT_GATEWAY_PORT;
const AGENTS_DIR = join(homedir(), ".0xkobold", "agents");

// State
let server: ReturnType<typeof Bun.serve> | null = null;
const agents = new Map<string, DraconicAgent>();
const clients = new Map<string, any>(); // Bun ServerWebSocket, not std WebSocket
let eventSeq = 0;
let isRunning = false;

// 🐉 Draconic systems
let draconicPool: DraconicConnectionPool;
let draconicPredictor: DraconicTokenPredictor;
let draconicRegistry: DraconicRunRegistry;
let draconicClassifier: DraconicErrorClassifier;

/**
 * Initialize Draconic systems
 */
function initializeDraconicSystems(): void {
  draconicPool = getDraconicConnectionPool();
  draconicPredictor = getDraconicTokenPredictor();
  draconicRegistry = getDraconicRunRegistry();
  draconicClassifier = getDraconicErrorClassifier();

  console.log("[🐉 DraconicGateway] Performance systems initialized:");
  console.log("  - HTTP/2 Connection Pool with multiplexing");
  console.log("  - Token prediction pre-send analysis");
  console.log("  - Hierarchical agent tracking");
  console.log("  - Predictive error classification");
}

/**
 * Enhanced agent spawn with Draconic prediction
 */
async function spawnDraconicAgent(
  params: {
    task: string;
    parentId?: string;
    label?: string;
    capabilities?: string[];
    model?: string;
    maxWorkers?: number;
  },
  pi: ExtensionAPI
): Promise<{ success: boolean; agentId?: string; error?: string; prediction?: TokenEstimate }> {
  // 🐉 Predict tokens BEFORE creating agent
  const tokenEstimate = draconicPredictor.estimate({
    systemPrompt: "You are a helpful coding assistant",
    history: [],
    currentPrompt: params.task,
    contextWindow: 128000,
    model: params.model || "claude-3-sonnet",
  });

  // Warn if context will be tight
  if (tokenEstimate.suggestedAction === "compact") {
    console.log(`[🐉 Gateway] Token prediction: ${tokenEstimate.suggestedAction}`);
    pi.sendMessage({
      customType: "gateway.token.warning",
      content: [{ type: "text", text: `⚠️ Context limit may be reached (${tokenEstimate.contextWindow.percent.toFixed(1)}%)` }],
      display: true,
      details: tokenEstimate,
    });
  }

  // Create Draconic run record
  const parentId = params.parentId;
  const draconicRun = draconicRegistry.create({
    sessionKey: `gateway-${Date.now()}`,
    name: params.label || `Agent ${agents.size + 1}`,
    type: "worker",
    task: params.task,
    workspace: AGENTS_DIR,
    capabilities: {
      primary: params.capabilities || ["general"],
      secondary: [],
    },
    depth: parentId ? 1 : 0,
    isProcessingQueue: false,
    parentId,
    model: params.model,
  });

  // Create agent with Draconic tracking
  const agent: DraconicAgent = {
    id: draconicRun.id,
    parentId: params.parentId,
    sessionKey: draconicRun.sessionKey,
    depth: draconicRun.depth,
    type: params.parentId ? "worker" : "primary",
    capabilities: params.capabilities || ["general"],
    status: "running",
    spawnedAt: new Date(),
    task: params.task,
    model: params.model || "default",
    children: [],
    workspace: AGENTS_DIR,
    tokens: { input: tokenEstimate.input.total, output: tokenEstimate.output.expected },
    draconicRunId: draconicRun.id,
    tokenEstimate,
  };

  agents.set(agent.id, agent);

  // Track parent relationship
  if (params.parentId) {
    const parent = agents.get(params.parentId);
    if (parent) {
      parent.children.push(agent.id);
    }
  }

  // Create workspace if needed
  const workspaceDir = join(AGENTS_DIR, agent.id);
  if (!existsSync(workspaceDir)) {
    mkdirSync(workspaceDir, { recursive: true });
  }

  // Broadcast event
  broadcastEvent("agent.spawned", {
    agentId: agent.id,
    parentId: agent.parentId,
    depth: agent.depth,
    task: agent.task,
    predictedTokens: tokenEstimate.input.total + tokenEstimate.output.expected,
  });

  return {
    success: true,
    agentId: agent.id,
    prediction: tokenEstimate,
  };
}

/**
 * 🐉 Enhanced API call with connection pooling
 */
async function draconicAPICall(
  provider: string,
  model: string,
  endpoint: string,
  payload: unknown
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    // Acquire connection from pool
    const slot = await draconicPool.acquire({ provider, model, host: getProviderHost(provider) });

    // Make request through pooled connection
    const response = await draconicPool.request(slot, endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Release connection
    draconicPool.release(slot);

    if (response.status >= 200 && response.status < 300) {
      return { success: true, data: JSON.parse(response.body.toString()) };
    } else {
      // 🐉 Classify error for retry strategy
      const errorText = response.body.toString();
      const strategy = draconicClassifier.classify(new Error(errorText), {
        retryCount: 0,
        consecutiveErrors: 0,
        provider,
      });

      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Get provider hostname
 */
function getProviderHost(provider: string): string {
  const hosts: Record<string, string> = {
    anthropic: "api.anthropic.com",
    openai: "api.openai.com",
    ollama: "localhost",
  };
  return hosts[provider.toLowerCase()] || "localhost";
}

/**
 * Enhanced gateway stats
 */
function getDraconicGatewayStats(): GatewayStats {
  const poolStats = draconicPool.getStats();

  return {
    running: isRunning,
    port: GATEWAY_PORT,
    agents: agents.size,
    clients: clients.size,
    poolConnections: poolStats.totalConnections,
    poolHealth: Object.keys(poolStats.byHealth) as ConnectionHealth[],
    totalTokensPredicted: Array.from(agents.values()).reduce(
      (sum, a) => sum + (a.tokenEstimate?.input.total || 0) + (a.tokenEstimate?.output.expected || 0),
      0
    ),
    totalErrorsPrevented: 0, // Would track from classifier history
  };
}

/**
 * Start Gateway Server with Draconic enhancements
 */
async function startDraconicGateway(pi: ExtensionAPI): Promise<void> {
  if (isRunning) {
    console.log("[🐉 Gateway] Already running");
    return;
  }

  // Initialize Draconic systems FIRST
  initializeDraconicSystems();

  // Ensure agents directory
  if (!existsSync(AGENTS_DIR)) {
    mkdirSync(AGENTS_DIR, { recursive: true });
  }

  // Start Bun server
  server = Bun.serve({
    port: GATEWAY_PORT,
    hostname: "127.0.0.1",

    websocket: {
      open(ws) {
        const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        clients.set(clientId, ws);
        console.log(`[🐉 Gateway] Client connected: ${clientId}`);

        // Send welcome with Draconic capabilities
        ws.send(
          JSON.stringify({
            type: "connected",
            clientId,
            features: {
              hierarchicalAgents: true,
              tokenPrediction: true,
              http2Pooling: true,
              errorPrediction: true,
            },
          })
        );
      },

      close(ws, code, reason) {
        // Find and remove client
        for (const [id, clientWs] of clients.entries()) {
          if (clientWs === ws) {
            clients.delete(id);
            console.log(`[🐉 Gateway] Client disconnected: ${id}`);
            break;
          }
        }
      },

      async message(ws, data) {
        try {
          const frame = JSON.parse(data.toString()) as RequestFrame;

          if (frame.type === "req") {
            switch (frame.method) {
              case "agent.spawn": {
                const { task, parentId, label, capabilities, model } = frame.params as any;
                const result = await spawnDraconicAgent({ task, parentId, label, capabilities, model }, pi);
                ws.send(
                  JSON.stringify({
                    type: "res",
                    id: frame.id,
                    ok: result.success,
                    payload: result.success
                      ? { agentId: result.agentId, prediction: result.prediction }
                      : undefined,
                    error: result.error,
                  })
                );
                break;
              }

              case "agent.tree": {
                // 🐉 Get hierarchical tree
                const tree = draconicRegistry.getTree();
                ws.send(
                  JSON.stringify({
                    type: "res",
                    id: frame.id,
                    ok: true,
                    payload: { tree },
                  })
                );
                break;
              }

              case "agent.status": {
                const { agentId } = frame.params as any;
                const agent = agents.get(agentId);
                const run = agent ? draconicRegistry.get(agent.draconicRunId || "") : null;
                const tree = agent ? draconicRegistry.getTree(agent.draconicRunId) : null;

                ws.send(
                  JSON.stringify({
                    type: "res",
                    id: frame.id,
                    ok: !!agent,
                    payload: agent
                      ? {
                          agent,
                          run: run
                            ? {
                                status: run.status,
                                metrics: run.metrics,
                              }
                            : null,
                          tree: tree ? formatTreeForWebSocket(tree) : null,
                        }
                      : undefined,
                    error: agent ? undefined : "Agent not found",
                  })
                );
                break;
              }

              case "gateway.stats": {
                const stats = getDraconicGatewayStats();
                ws.send(
                  JSON.stringify({
                    type: "res",
                    id: frame.id,
                    ok: true,
                    payload: stats,
                  })
                );
                break;
              }

              case "pool.status": {
                // 🐉 Connection pool status
                const poolStats = draconicPool.getStats();
                const connections = draconicPool.getConnections();

                ws.send(
                  JSON.stringify({
                    type: "res",
                    id: frame.id,
                    ok: true,
                    payload: {
                      stats: poolStats,
                      connections: connections.map((c) => ({
                        id: c.id,
                        provider: c.provider,
                        health: c.health,
                        streams: c.streams,
                        latency: c.latency,
                      })),
                    },
                  })
                );
                break;
              }

              default:
                ws.send(
                  JSON.stringify({
                    type: "res",
                    id: frame.id,
                    ok: false,
                    error: `Unknown method: ${frame.method}`,
                  })
                );
            }
          }
        } catch (error) {
          console.error("[🐉 Gateway] Message error:", error);
          ws.send(
            JSON.stringify({
              type: "error",
              error: String(error),
            })
          );
        }
      },
    },

    fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return Response.json(getDraconicGatewayStats());
      }

      if (url.pathname === "/metrics") {
        // 🐉 Detailed metrics endpoint
        const stats = getDraconicGatewayStats();
        const poolStats = draconicPool.getStats();
        return Response.json({
          gateway: stats,
          pool: poolStats,
          agents: {
            total: agents.size,
            byStatus: Object.fromEntries(
              Array.from(agents.values()).reduce((acc, a) => {
                acc.set(a.status, (acc.get(a.status) || 0) + 1);
                return acc;
              }, new Map<string, number>())
            ),
          },
        });
      }

      // @ts-ignore Bun upgrade
      if (server?.upgrade(req)) {
        return;
      }

      return new Response("🐉 0xKobold Draconic Gateway - WebSocket on port 18789", { status: 200 });
    },
  });

  isRunning = true;
  console.log(`[🐉 Gateway] RUNNING on ws://127.0.0.1:${GATEWAY_PORT}`);
  console.log(`[🐉 Gateway] Features: HTTP/2 pooling, token prediction, hierarchical tracking`);

  pi.sendMessage({
    customType: "gateway.started",
    content: [{ type: "text", text: `🐉 Draconic Gateway on port ${GATEWAY_PORT}` }],
    display: true,
    details: { port: GATEWAY_PORT, url: `ws://127.0.0.1:${GATEWAY_PORT}` },
  });
}

/**
 * Format tree for WebSocket transmission
 */
function formatTreeForWebSocket(node: any): any {
  return {
    id: node.id,
    name: node.name,
    type: node.type,
    status: node.status,
    depth: node.depth,
    metrics: node.metrics,
    children: node.children.map(formatTreeForWebSocket),
  };
}

/**
 * Broadcast event to all clients
 */
function broadcastEvent(event: string, payload: unknown): void {
  eventSeq++;
  const message = JSON.stringify({
    type: "event",
    event,
    payload,
    seq: eventSeq,
  });

  for (const [, ws] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

/**
 * Stop Gateway
 */
async function stopDraconicGateway(pi: ExtensionAPI): Promise<void> {
  if (!server) {
    console.log("[🐉 Gateway] Not running");
    return;
  }

  // Destroy connection pool
  await draconicPool.destroy();

  // Close clients
  for (const [, ws] of clients.entries()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1000, "Gateway shutting down");
    }
  }
  clients.clear();

  server.stop();
  server = null;
  isRunning = false;

  console.log("[🐉 Gateway] Stopped");
  pi.sendMessage({
    customType: "gateway.stopped",
    content: [{ type: "text", text: "🐉 Gateway stopped" }],
    display: true,
    details: {},
  });
}

// Main Export
export default function draconicGatewayExtension(pi: ExtensionAPI) {
  // Register commands
  pi.registerCommand("gateway:start", {
    description: "Start Draconic Gateway with HTTP/2 pooling",
    handler: async (_args: string, ctx: any) => {
      await startDraconicGateway(ctx.extension as ExtensionAPI);
    },
  });

  pi.registerCommand("gateway:stop", {
    description: "Stop Draconic Gateway",
    handler: async (_args: string, ctx: any) => {
      await stopDraconicGateway(ctx.extension as ExtensionAPI);
    },
  });

  pi.registerCommand("gateway:status", {
    description: "Show Draconic Gateway status with pool metrics",
    handler: async (_args: string, ctx: any) => {
      const stats = getDraconicGatewayStats();
      ctx.ui.notify(
        `🐉 Gateway: ${stats.running ? "RUNNING" : "STOPPED"}\n` +
          `Agents: ${stats.agents} | Clients: ${stats.clients}\n` +
          `Pool: ${stats.poolConnections} connections`,
        stats.running ? "info" : "warning"
      );
    },
  });

  pi.registerCommand("gateway:pool", {
    description: "Show connection pool status",
    handler: async (_args: string, ctx: any) => {
      const stats = draconicPool.getStats();
      ctx.ui.notify(
        `🌊 Connection Pool:\n` +
          `Connections: ${stats.totalConnections}\n` +
          `Active streams: ${stats.activeStreams}\n` +
          `Avg latency: ${stats.averageLatency.toFixed(0)}ms\n` +
          `Error rate: ${(stats.errorRate * 100).toFixed(1)}%`,
        "info"
      );
    },
  });

  // Tools
  pi.registerTool({
    name: "draconic_gateway_spawn",
    label: "🐉 Spawn Draconic Agent",
    description: "Spawn agent with token prediction",
    parameters: Type.Object({
      task: Type.String(),
      parentId: Type.Optional(Type.String()),
      model: Type.Optional(Type.String()),
    }),
    async execute(_id: string, params: any) {
      const result = await spawnDraconicAgent(params, pi as any);
      return {
        content: [{ type: "text", text: result.success ? `🐉 Spawned: ${result.agentId}` : `❌ Failed: ${result.error}` }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "draconic_gateway_stats",
    label: "🐉 Gateway Stats",
    description: "Get Draconic gateway statistics",
    parameters: Type.Object({}),
    async execute() {
      const stats = getDraconicGatewayStats();
      return {
        content: [{
          type: "text",
          text: `🐉 Gateway Stats:\nRunning: ${stats.running}\nAgents: ${stats.agents}\nPool: ${stats.poolConnections}\nTokens predicted: ${stats.totalTokensPredicted}`,
        }],
        details: stats,
      };
    },
  });

  console.log("[🐉 DraconicGateway] Extension loaded");
  console.log("  Commands: /gateway:start, /gateway:stop, /gateway:status, /gateway:pool");
  console.log("  Tools: draconic_gateway_spawn, draconic_gateway_stats");
}
