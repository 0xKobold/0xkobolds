/**
 * Gateway Module - v0.2.0
 * 
 * WebSocket + HTTP gateway for multi-channel support.
 * Now with REAL Bun-native WebSocket server.
 */

// Old mock (deprecated)
export { getGatewayServer, resetGatewayServer, registerDiscordChannel, registerTelegramChannel } from "./websocket-server.js";
export type { GatewayConnection } from "./websocket-server.js";

// NEW Real Gateway
export { getRealGateway, resetRealGateway, default as RealGatewayServer } from "./server.js";
export type { 
  GatewayConfig, 
  GatewayMessage, 
  RealGatewayServerType,
  WSConnection 
} from "./server.js";

// Re-export as primary (old becomes legacy)
export { getRealGateway as getGateway, resetRealGateway as resetGateway } from "./server.js";
