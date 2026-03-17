/**
 * Gateway Methods - Registry and exports
 */

export type {
  GatewayContext,
  GatewayDeps,
  GatewayDedupeStore,
  GatewayRespond,
  GatewayMethodHandler,
  GatewayClientInfo,
  ConnectInfo,
  GatewayRequestHandlers,
} from "./types";

export { 
  agentHandler, 
  agentStatusHandler, 
  agentWaitHandler,
  sessionMemoryHandler, // Phase 5
} from "./agent";

export {
  nodeRegistry,
  nodeHandlers,
  type NodeInfo,
  type NodeCommand,
  type NodeEvent,
  type NodeInvokeParams,
  type NodeRegisterParams,
} from "./node";

// Import handlers
import { 
  agentHandler, 
  agentStatusHandler, 
  agentWaitHandler,
  sessionMemoryHandler, // Phase 5
} from "./agent";

import { nodeHandlers } from "./node";

// Build the handler registry
export const gatewayHandlers: import("./types").GatewayRequestHandlers = {
  // Agent methods
  "agent.run": agentHandler,
  "agent.status": agentStatusHandler,
  "agent.wait": agentWaitHandler,

  // Phase 5: Session memory methods
  "session.memory": sessionMemoryHandler,

  // Node methods (OpenClaw-style nodes)
  ...nodeHandlers,

  // Future methods
  // "chat.send": chatHandler,
  // "channels.list": channelsListHandler,
  // "agents.list": agentsListHandler,
};

// Helper to get a handler
export function getHandler(method: string): import("./types").GatewayMethodHandler | undefined {
  return gatewayHandlers[method];
}

// List available methods
export function listMethods(): string[] {
  return Object.keys(gatewayHandlers).filter((k) => gatewayHandlers[k] !== undefined);
}
