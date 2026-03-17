/**
 * Gateway Method Handler Types
 *
 * Similar to koclaw's server-methods pattern.
 */

import type { ErrorShape, ResponseFrame } from "../protocol";

// Context provided to all method handlers
export interface GatewayContext {
  deps: GatewayDeps;
  dedupe: GatewayDedupeStore;
  connections: Map<string, unknown>;
  sessions: Map<string, unknown>;
}

// Dependencies available to handlers
export interface GatewayDeps {
  // Config, stores, etc.
  getConfig: () => unknown;
  agentStore: {
    list: () => Array<{ id: string; name: string }> | Promise<Array<{ id: string; name: string }>>;
    get: (id: string) => unknown | undefined | Promise<unknown | undefined>;
  };
}

// Dedupe store for idempotent operations
export interface GatewayDedupeStore {
  get: (key: string) => { ts: number; ok: boolean; payload?: unknown; error?: ErrorShape } | undefined;
  set: (key: string, entry: { ts: number; ok: boolean; payload?: unknown; error?: ErrorShape }) => void;
  cleanup: (maxAgeMs: number) => void;
}

// Response helper
export type GatewayRespond = (
  ok: boolean,
  result?: unknown,
  error?: ErrorShape,
  opts?: { runId?: string; expectFinal?: boolean }
) => void;

// Handler function signature
export type GatewayMethodHandler <TParams = unknown, TResult = unknown> = (params: {
  params: TParams;
  respond: GatewayRespond;
  context: GatewayContext;
  client?: GatewayClientInfo;
}) => Promise<void> | void;

// Client info from connection
export interface GatewayClientInfo {
  id: string;
  type: "web" | "discord" | "telegram" | "internal" | "node";
  scopes?: string[];
  connect?: ConnectInfo;
  // Node-specific fields
  nodeId?: string;
  nodeType?: string;
  nodeName?: string;
}

export interface ConnectInfo {
  clientName?: string;
  clientVersion?: string;
  platform?: string;
  scopes: string[];
  caps?: string[];
}

// Registry of all method handlers
export interface GatewayRequestHandlers {
  [method: string]: GatewayMethodHandler <unknown, unknown> | undefined;
}

// Validation helpers
export type ValidateFunction <T> = (data: unknown) => data is T;

export interface ValidatedParams <T> {
  ok: true;
  params: T;
}

export interface ValidationError {
  ok: false;
  errors: string[];
}

export type ValidationResult <T> = ValidatedParams <T> | ValidationError;
