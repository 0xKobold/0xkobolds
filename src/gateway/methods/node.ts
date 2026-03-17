/**
 * Node Method Handlers
 *
 * OpenClaw-style node system for external devices/processes.
 * Nodes connect as peripherals and expose command surfaces.
 */

import type { GatewayMethodHandler, GatewayContext, GatewayRespond } from "./types";
import { errorShape, type ErrorShape } from "../protocol";

// ============================================================================
// Types

export interface NodeCommand {
  description: string;
  params?: NodeCommandParams;
  returns?: NodeCommandParams;
}

export interface NodeCommandParams {
  type: string;
  properties?: Record<string, NodeCommandParamDef>;
  required?: string[];
  [key: string]: unknown;
}

export interface NodeCommandParamDef {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
}

export interface NodeInfo {
  id: string;
  name: string;
  type: string; // 'desktop-pet', 'android', 'headless', etc.
  version: string;
  connectedAt: Date;
  lastSeen: Date;
  commands: Map<string, NodeCommand>;
  socket: WebSocket | null;
  status: 'connected' | 'disconnected' | 'error';
  metadata?: Record<string, unknown>;
}

export interface NodeInvokeParams {
  nodeId: string;
  command: string;
  args?: Record<string, unknown>;
  timeout?: number;
}

export interface NodeRegisterParams {
  name: string;
  type: string;
  version?: string;
  commands: Record<string, NodeCommand>;
  metadata?: Record<string, unknown>;
}

export interface NodeEvent {
  nodeId: string;
  event: string;
  data: unknown;
  timestamp: number;
}

// Pending invocation promises
interface PendingInvocation {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timeout: Timer;
}

// ============================================================================
// Node Registry (in-memory, could be persisted later)

class NodeRegistry {
  private nodes = new Map<string, NodeInfo>();
  private pendingInvocations = new Map<string, PendingInvocation>();

  register(id: string, info: {
    name: string;
    type: string;
    version: string;
    commands: Record<string, { description: string; params?: unknown }>;
    socket: WebSocket | null;
    status: 'connected' | 'disconnected' | 'error';
    metadata?: Record<string, unknown>;
  }): NodeInfo {
    const commandsMap = new Map<string, NodeCommand>();
    for (const [key, value] of Object.entries(info.commands)) {
      commandsMap.set(key, {
        description: value.description,
        params: value.params as NodeCommandParams | undefined,
      });
    }

    const node: NodeInfo = {
      id,
      name: info.name,
      type: info.type,
      version: info.version,
      connectedAt: new Date(),
      lastSeen: new Date(),
      commands: commandsMap,
      socket: info.socket,
      status: info.status,
      metadata: info.metadata,
    };
    this.nodes.set(id, node);
    return node;
  }

  unregister(id: string): void {
    const node = this.nodes.get(id);
    if (node) {
      node.status = 'disconnected';
      node.socket = null;
      this.nodes.delete(id);
    }
  }

  get(id: string): NodeInfo | undefined {
    return this.nodes.get(id);
  }

  list(): NodeInfo[] {
    return Array.from(this.nodes.values());
  }

  updateLastSeen(id: string): void {
    const node = this.nodes.get(id);
    if (node) {
      node.lastSeen = new Date();
    }
  }

  setPendingInvocation(callId: string, invocation: PendingInvocation): void {
    this.pendingInvocations.set(callId, invocation);
  }

  getPendingInvocation(callId: string): PendingInvocation | undefined {
    return this.pendingInvocations.get(callId);
  }

  resolveInvocation(callId: string, result: unknown): void {
    const invocation = this.pendingInvocations.get(callId);
    if (invocation) {
      clearTimeout(invocation.timeout);
      invocation.resolve(result);
      this.pendingInvocations.delete(callId);
    }
  }

  rejectInvocation(callId: string, error: Error): void {
    const invocation = this.pendingInvocations.get(callId);
    if (invocation) {
      clearTimeout(invocation.timeout);
      invocation.reject(error);
      this.pendingInvocations.delete(callId);
    }
  }
}

// Singleton registry
export const nodeRegistry = new NodeRegistry();

// ============================================================================
// Method Handlers

/**
 * node.register - Register a node with its command surface
 *
 * Called by nodes on connect to announce their capabilities
 */
export const nodeRegisterHandler: GatewayMethodHandler<NodeRegisterParams, { nodeId: string; commands: string[] }> = async ({
  params,
  respond,
  context,
  client,
}) => {
  const { name, type, version = '1.0.0', commands, metadata } = params;

  if (!name || !type) {
    respond(false, null, errorShape(-32602, 'Missing required fields: name, type'));
    return;
  }

  if (!commands || typeof commands !== 'object') {
    respond(false, null, errorShape(-32602, 'commands must be an object'));
    return;
  }

  // Generate node ID
  const nodeId = `node-${type}-${name}-${Date.now().toString(36)}`;

  // Store client info for this node
  if (client) {
    (client as any).nodeId = nodeId;
    (client as any).nodeType = type;
  }

  // Register node
  const node = nodeRegistry.register(nodeId, {
    name,
    type,
    version,
    commands,
    metadata,
    socket: null, // Will be set by connection handler
    status: 'connected',
  });

  console.log(`[Gateway] Node registered: ${nodeId} (${type}/${name})`);

  respond(true, {
    nodeId,
    commands: Object.keys(commands),
    gatewayVersion: '2',
    protocolVersion: '1.0.0',
  });
};

/**
 * node.invoke - Invoke a command on a connected node
 *
 * Called by agent to send commands to nodes
 */
export const nodeInvokeHandler: GatewayMethodHandler<NodeInvokeParams, unknown> = async ({
  params,
  respond,
  context,
}) => {
  const { nodeId, command, args = {}, timeout = 30000 } = params;

  if (!nodeId || !command) {
    respond(false, null, errorShape(-32602, 'Missing required fields: nodeId, command'));
    return;
  }

  const node = nodeRegistry.get(nodeId);
  if (!node) {
    respond(false, null, errorShape(-32001, `Node not found: ${nodeId}`));
    return;
  }

  if (node.status !== 'connected') {
    respond(false, null, errorShape(-32002, `Node not connected: ${nodeId} (status: ${node.status})`));
    return;
  }

  if (!node.commands.has(command)) {
    respond(false, null, errorShape(-32003, `Command not available: ${command}. Available: ${Array.from(node.commands.keys()).join(', ')}`));
    return;
  }

  // Generate call ID for this invocation
  const callId = `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Create promise for response
  const responsePromise = new Promise<unknown>((resolve, reject) => {
    const timeoutMs = Math.min(timeout, 60000); // Max 60s timeout

    const timeoutTimer = setTimeout(() => {
      nodeRegistry.rejectInvocation(callId, new Error('Timeout'));
      reject(new Error(`Invocation timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    nodeRegistry.setPendingInvocation(callId, { resolve, reject, timeout: timeoutTimer });
  });

  // Send invocation to node via WebSocket
  if (node.socket) {
    node.socket.send(JSON.stringify({
      id: callId,
      method: command,
      params: args,
    }));
  } else {
    respond(false, null, errorShape(-32004, `Node socket not available: ${nodeId}`));
    return;
  }

  try {
    const result = await responsePromise;
    nodeRegistry.updateLastSeen(nodeId);
    respond(true, result);
  } catch (error) {
    respond(false, null, errorShape(-32000, String(error)));
  }
};

/**
 * node.response - Handle response from node
 *
 * Called by node to respond to previous invocation
 */
export const nodeResponseHandler: GatewayMethodHandler<{ id: string; result?: unknown; error?: ErrorShape }, void> = async ({
  params,
  respond,
}) => {
  const { id: callId, result, error } = params;

  if (!callId) {
    respond(false, null, errorShape(-32602, 'Missing call id'));
    return;
  }

  if (error) {
    nodeRegistry.rejectInvocation(callId, new Error(error.message || 'Unknown error'));
  } else {
    nodeRegistry.resolveInvocation(callId, result);
  }

  respond(true, { received: true });
};

/**
 * node.list - List all connected nodes
 */
export const nodeListHandler: GatewayMethodHandler<unknown, { nodes: NodeSummary[] }> = async ({
  respond,
}) => {
  const nodes = nodeRegistry.list().map(node => ({
    id: node.id,
    name: node.name,
    type: node.type,
    version: node.version,
    status: node.status,
    connectedAt: node.connectedAt.toISOString(),
    lastSeen: node.lastSeen.toISOString(),
    commands: Array.from(node.commands.keys()),
    metadata: node.metadata,
  }));

  respond(true, { nodes });
};

/**
 * node.disconnect - Gracefully disconnect a node
 */
export const nodeDisconnectHandler: GatewayMethodHandler<{ nodeId?: string }, { disconnected: boolean }> = async ({
  params,
  respond,
  client,
}) => {
  const { nodeId } = params;

  // If no nodeId provided, disconnect the calling client's node
  const targetId = nodeId || (client as any)?.nodeId;

  if (!targetId) {
    respond(false, null, errorShape(-32602, 'No node ID provided and client has no associated node'));
    return;
  }

  const node = nodeRegistry.get(targetId);
  if (node) {
    nodeRegistry.unregister(targetId);
    node.socket?.close(1000, 'Graceful disconnect');
    console.log(`[Gateway] Node disconnected: ${targetId}`);
    respond(true, { disconnected: true });
  } else {
    respond(false, null, errorShape(-32001, `Node not found: ${targetId}`));
  }
};

/**
 * node.event - Receive event from node (push notification)
 *
 * Nodes can push events to notify agent of things happening
 */
export const nodeEventHandler: GatewayMethodHandler<NodeEvent, { received: boolean }> = async ({
  params,
  respond,
  context,
}) => {
  const { nodeId, event, data } = params;

  // Store event in recent events (for polling clients)
  // Could also broadcast to interested clients via event bus

  console.log(`[Gateway] Node event: ${nodeId} -> ${event}`, data);

  // TODO: Integrate with event bus for broadcasting
  // context.deps.eventBus?.emit('node.event', { nodeId, event, data });

  respond(true, { received: true, timestamp: Date.now() });
};

// ============================================================================
// Summary Types

interface NodeSummary {
  id: string;
  name: string;
  type: string;
  version: string;
  status: string;
  connectedAt: string;
  lastSeen: string;
  commands: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Export all handlers

export const nodeHandlers = {
  'node.register': nodeRegisterHandler,
  'node.invoke': nodeInvokeHandler,
  'node.response': nodeResponseHandler,
  'node.list': nodeListHandler,
  'node.disconnect': nodeDisconnectHandler,
  'node.event': nodeEventHandler,
};