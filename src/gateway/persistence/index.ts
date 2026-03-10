/**
 * Agent Persistence Module
 * 
 * Provides durable storage for Gateway agents so they survive
 * process restarts. All agents are persisted to SQLite with
 * automatic restore on startup.
 */

export { AgentStore } from './AgentStore.js';
export type { 
  PersistedAgent, 
  AgentEvent, 
  AgentStatus, 
  AgentType, 
  AgentEventType 
} from './AgentStore.js';
