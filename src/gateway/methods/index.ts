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

// Import handlers
import { 
  agentHandler, 
  agentStatusHandler, 
  agentWaitHandler,
  sessionMemoryHandler, // Phase 5
} from "./agent";

// Build the handler registry
export const gatewayHandlers: import("./types").GatewayRequestHandlers = {
  // Agent methods
  "agent.run": agentHandler,
  "agent.status": agentStatusHandler,
  "agent.wait": agentWaitHandler,

  // Phase 5: Session memory methods
  "session.memory": sessionMemoryHandler,

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
