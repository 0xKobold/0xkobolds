/**
 * Gateway Protocol Frames - JSON-RPC inspired
 *
 * Protocol for Gateway ↔ Client communication.
 * Similar to koclaw's protocol but simplified for 0xKobold's needs.
 */

export const PROTOCOL_VERSION = "0.5.0";

// Request frame from client to gateway
export interface RequestFrame {
  id: string;
  method: string;
  params?: unknown;
  seq?: number; // Sequence number for ordering
}

// Response frame from gateway to client
export interface ResponseFrame {
  id: string;
  result?: unknown;
  error?: ErrorShape;
  seq?: number;
  expectFinal?: boolean; // true = last frame for this request
}

// Event frame (server-initiated)
export interface EventFrame {
  event: string;
  payload?: unknown;
  seq?: number;
  runId?: string; // Associated run, if any
}

export interface ErrorShape {
  code: string;
  message: string;
  details?: unknown;
}

// Error codes (aligned with JSON-RPC + custom)
export const ErrorCodes = {
  // Standard JSON-RPC
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,

  // Custom 0xKobold codes
  UNAUTHORIZED: -32001,
  NOT_FOUND: -32002,
  TIMEOUT: -32003,
  UNAVAILABLE: -32004,
  RATE_LIMITED: -32005,
  AGENT_ERROR: -32006,
} as const;

// Validators
export function isValidRequestFrame(obj: unknown): obj is RequestFrame {
  if (!obj || typeof obj !== "object") return false;
  const frame = obj as Record<string, unknown>;
  return (
    typeof frame.id === "string" &&
    typeof frame.method === "string" &&
    frame.method.length > 0
  );
}

export function isValidEventFrame(obj: unknown): obj is EventFrame {
  if (!obj || typeof obj !== "object") return false;
  const frame = obj as Record<string, unknown>;
  return typeof frame.event === "string" && frame.event.length > 0;
}

// Error factory
export function errorShape(code: number, message: string, details?: unknown): ErrorShape {
  return { code: String(code), message, details };
}

// Hello frame (connection handshake)
export interface HelloOk {
  version: string;
  protocol: number;
  sessionId: string;
  capabilities: string[];
  serverTime: number;
}

export interface ConnectParams {
  clientName?: string;
  clientVersion?: string;
  platform?: string;
  capabilities?: string[];
  token?: string;
  password?: string;
}
