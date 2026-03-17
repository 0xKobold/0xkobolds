/**
 * Gateway Module
 *
 * WebSocket + HTTP gateway for multi-channel support.
 * Koclaw-style architecture with JSON-RPC protocol.
 */

// Protocol
export {
  PROTOCOL_VERSION,
  ErrorCodes,
  errorShape,
  isValidRequestFrame,
  isValidEventFrame,
} from "./protocol/index";

export type {
  RequestFrame,
  ResponseFrame,
  EventFrame,
  ErrorShape,
  HelloOk,
  ConnectParams,
} from "./protocol/index";

// Method handlers
export type {
  GatewayContext,
  GatewayDeps,
  GatewayDedupeStore,
  GatewayRespond,
  GatewayMethodHandler,
  GatewayClientInfo,
  ConnectInfo,
  GatewayRequestHandlers,
} from "./methods/index";

export {
  agentHandler,
  agentStatusHandler,
  agentWaitHandler,
  gatewayHandlers,
  getHandler,
  listMethods,
} from "./methods/index";

// Gateway Server
export {
  createGateway,
  startGateway,
  stopGateway,
  getGateway,
  RealGatewayServer,
  isGatewayRunning,
  startGatewaySafe,
} from "./gateway-server";

export type { GatewayConfig } from "./gateway-server";

// Legacy exports (deprecated, will be removed)
export {
  getGatewayServer,
  resetGatewayServer,
  registerDiscordChannel,
  registerTelegramChannel,
} from "./websocket-server.js";

// Queue Modes (v0.1.0 - Hermes-style)
export {
  createMessageQueue,
  MessageQueue,
  InterruptHandler,
  getRecommendedMode,
  PLATFORM_RECOMMENDATIONS,
  type QueueMode,
  type QueueConfig,
  type QueuedMessage,
  type InterruptResult,
} from "./queue-modes.js";

// Session Store (Phase 2 + Phase 5)
export {
  createSessionStore,
  getSessionStore,
  resetSessionStore,
  generateSessionId,
} from "../memory/session-store";

export type { SessionEntry, SessionStore } from "../memory/session-store";

// Session Memory Bridge (Phase 5)
export {
  getSessionMemoryBridge,
} from "../memory/session-memory-bridge";

export type {
  SessionMemoryContext,
  MemoryEnrichedSession,
  SessionMemoryBridge,
} from "../memory/session-memory-bridge";
