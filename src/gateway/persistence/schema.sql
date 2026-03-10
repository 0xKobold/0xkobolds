-- Agent Persistence Schema for 0xKobold Gateway
-- This schema stores agent state to survive process restarts

-- Main agents table - stores complete agent state
CREATE TABLE IF NOT EXISTS persisted_agents (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES persisted_agents(id) ON DELETE SET NULL,
  session_key TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK(type IN ('primary', 'orchestrator', 'worker')),
  capabilities TEXT NOT NULL DEFAULT '[]', -- JSON array of strings
  status TEXT NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'error')),
  task TEXT,
  model TEXT NOT NULL DEFAULT 'ollama/minimax-m2.5:cloud',
  workspace TEXT NOT NULL,
  tokens_input INTEGER NOT NULL DEFAULT 0,
  tokens_output INTEGER NOT NULL DEFAULT 0,
  stats_runtime INTEGER NOT NULL DEFAULT 0,
  stats_tool_calls INTEGER NOT NULL DEFAULT 0,
  spawned_at INTEGER NOT NULL, -- Unix timestamp in ms
  updated_at INTEGER NOT NULL  -- Unix timestamp in ms
);

-- Agent lifecycle events - audit log for debugging
CREATE TABLE IF NOT EXISTS agent_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES persisted_agents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('spawned', 'status_change', 'killed', 'completed', 'resumed', 'tokens_updated', 'checkpoint')),
  previous_status TEXT, -- For status_change events
  new_status TEXT,      -- For status_change events
  timestamp INTEGER NOT NULL, -- Unix timestamp in ms
  metadata TEXT DEFAULT '{}' -- JSON object with additional context
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agents_status ON persisted_agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_parent ON persisted_agents(parent_id);
CREATE INDEX IF NOT EXISTS idx_agents_updated ON persisted_agents(updated_at);
CREATE INDEX IF NOT EXISTS idx_agents_depth ON persisted_agents(depth);

CREATE INDEX IF NOT EXISTS idx_events_agent ON agent_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_events_agent_time ON agent_events(agent_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON agent_events(event_type, timestamp DESC);

-- Migration: If old agent_events table exists with different schema, migrate it
-- Note: This assumes the table might exist from previous versions
