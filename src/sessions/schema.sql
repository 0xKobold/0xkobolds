-- Unified Session Database Schema
-- ~/.0xkobold/sessions.db
-- 
-- This is the single source of truth for session management across
-- all 0xKobold subsystems. All other databases reference this one.
--
-- Design principles:
-- - Stable IDs: Hash of pi-session-id survives restarts
-- - Foreign keys: All subsystems reference unified_session.id
-- - Timestamps: Unix milliseconds throughout
-- - WAL mode: For performance and durability

-- ============================================================================
-- Core Sessions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS unified_sessions (
  -- Primary key: Stable hash of pi-session-id
  id TEXT PRIMARY KEY,
  
  -- Pi-Coding-Agent Integration
  pi_session_id TEXT UNIQUE NOT NULL,
  pi_session_file TEXT,
  
  -- Identity
  device_id TEXT NOT NULL,
  user_id TEXT,
  
  -- State
  state TEXT NOT NULL CHECK(state IN ('idle', 'active', 'error', 'completed', 'suspended')),
  mode TEXT NOT NULL CHECK(mode IN ('persistent', 'oneshot', 'forked', 'cron')) DEFAULT 'persistent',
  
  -- Workspace Context
  cwd TEXT NOT NULL,
  workspace_type TEXT CHECK(workspace_type IN ('main', 'isolated', 'cron', 'agent', 'subagent')) DEFAULT 'main',
  
  -- Timestamps (Unix milliseconds)
  created_at INTEGER NOT NULL,
  last_activity_at INTEGER NOT NULL,
  last_accessed_at INTEGER NOT NULL,
  completed_at INTEGER,
  
  -- Statistics
  total_turns INTEGER DEFAULT 0,
  total_tokens_input INTEGER DEFAULT 0,
  total_tokens_output INTEGER DEFAULT 0,
  
  -- Context Source
  source TEXT NOT NULL CHECK(source IN ('tui', 'discord', 'web', 'gateway', 'cron', 'api', 'fork')),
  channel_id TEXT,
  
  -- Configuration (JSON)
  config TEXT DEFAULT '{}',
  
  -- Extension Metadata (JSON for flexibility)
  metadata TEXT DEFAULT '{}',
  
  -- Row versioning for optimistic locking
  version INTEGER DEFAULT 1
);

-- Core indexes
CREATE INDEX IF NOT EXISTS idx_sessions_state ON unified_sessions(state);
CREATE INDEX IF NOT EXISTS idx_sessions_activity ON unified_sessions(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_sessions_accessed ON unified_sessions(last_accessed_at);
CREATE INDEX IF NOT EXISTS idx_sessions_device ON unified_sessions(device_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON unified_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON unified_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_source ON unified_sessions(source);
CREATE INDEX IF NOT EXISTS idx_sessions_pi_session ON unified_sessions(pi_session_id);

-- ============================================================================
-- Session Hierarchy (Trees, Forks, Subagents)
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_hierarchy (
  session_id TEXT PRIMARY KEY,
  parent_session_id TEXT,
  root_session_id TEXT,  -- Denormalized: top ancestor for fast queries
  spawn_depth INTEGER NOT NULL DEFAULT 0,
  
  -- Spawn Context
  spawned_by TEXT,
  spawn_reason TEXT,
  spawn_method TEXT CHECK(spawn_method IN ('manual', 'auto', 'cron', 'heartbeat', 'api')),
  spawned_at INTEGER NOT NULL,
  
  -- Fork Info
  is_fork BOOLEAN DEFAULT FALSE,
  forked_from_parent BOOLEAN DEFAULT FALSE,
  
  -- Foreign keys
  FOREIGN KEY (session_id) REFERENCES unified_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_session_id) REFERENCES unified_sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (root_session_id) REFERENCES unified_sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_hierarchy_parent ON session_hierarchy(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_hierarchy_root ON session_hierarchy(root_session_id);
CREATE INDEX IF NOT EXISTS idx_hierarchy_depth ON session_hierarchy(spawn_depth);

-- ============================================================================
-- Session Snapshots (Restore Points)
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  
  -- Snapshot metadata
  timestamp INTEGER NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('auto', 'manual', 'pre_spawn', 'post_completion', 'checkpoint', 'migration')),
  triggered_by TEXT,
  
  -- Conversation history (JSON array)
  conversation_history TEXT NOT NULL,
  
  -- Context state (JSON)
  context_window TEXT,
  
  -- Subsystem states (JSON)
  tasks_state TEXT,
  channels_state TEXT,
  agents_state TEXT,
  
  -- Memory (JSON)
  working_memory TEXT,
  perennial_refs TEXT,  -- JSON array of memory IDs
  
  -- Metadata
  token_count INTEGER,  -- Approximate size
  metadata TEXT DEFAULT '{}',
  
  -- Automatic cleanup
  expires_at INTEGER,   -- NULL = keep forever
  
  FOREIGN KEY (session_id) REFERENCES unified_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_snapshots_session ON session_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_session_time ON session_snapshots(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_type ON session_snapshots(type);
CREATE INDEX IF NOT EXISTS idx_snapshots_expires ON session_snapshots(expires_at) WHERE expires_at IS NOT NULL;

-- ============================================================================
-- Session Events (Audit Log)
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_events (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('created', 'activated', 'suspended', 'resumed', 'completed', 'forked', 'error', 'checkpoint', 'migrated')),
  timestamp INTEGER NOT NULL,
  metadata TEXT DEFAULT '{}',
  
  FOREIGN KEY (session_id) REFERENCES unified_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_session_time ON session_events(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON session_events(type);

-- ============================================================================
-- Cross-Subsystem References (Foreign Key Registry)
-- ============================================================================
-- 
-- This table tracks which subsystem records reference which sessions,
-- enabling cleanup, migration, and referential integrity.

CREATE TABLE IF NOT EXISTS session_subsystem_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  subsystem TEXT NOT NULL CHECK(subsystem IN ('tasks', 'channels', 'agents', 'conversations', 'memory', 'cron')),
  subsystem_record_id TEXT NOT NULL,
  sync_status TEXT CHECK(sync_status IN ('active', 'orphaned', 'migrated', 'deleted')) DEFAULT 'active',
  created_at INTEGER NOT NULL,
  last_synced_at INTEGER,
  
  UNIQUE(subsystem, subsystem_record_id),
  FOREIGN KEY (session_id) REFERENCES unified_sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refs_session ON session_subsystem_refs(session_id);
CREATE INDEX IF NOT EXISTS idx_refs_subsystem ON session_subsystem_refs(subsystem, subsystem_record_id);
CREATE INDEX IF NOT EXISTS idx_refs_status ON session_subsystem_refs(sync_status);

-- ============================================================================
-- Migration Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration_name TEXT UNIQUE NOT NULL,
  migrated_at INTEGER NOT NULL,
  from_system TEXT NOT NULL CHECK(from_system IN ('legacy', 'openclaw', 'upgrade')),
  items_migrated INTEGER DEFAULT 0,
  items_orphaned INTEGER DEFAULT 0,
  items_failed INTEGER DEFAULT 0,
  errors TEXT,  -- JSON array
  metadata TEXT DEFAULT '{}'
);

-- ============================================================================
-- Legacy ID Mappings (for backwards compatibility)
-- ============================================================================

CREATE TABLE IF NOT EXISTS legacy_session_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  unified_id TEXT NOT NULL,
  legacy_system TEXT NOT NULL CHECK(legacy_system IN ('tasks', 'channels', 'agents', 'session-manager')),
  legacy_id TEXT NOT NULL,
  mapped_at INTEGER NOT NULL,
  
  FOREIGN KEY (unified_id) REFERENCES unified_sessions(id) ON DELETE CASCADE,
  UNIQUE(legacy_system, legacy_id)
);

CREATE INDEX IF NOT EXISTS idx_legacy_unified ON legacy_session_mappings(unified_id);
CREATE INDEX IF NOT EXISTS idx_legacy_system ON legacy_session_mappings(legacy_system, legacy_id);

-- ============================================================================
-- Triggers for Automatic Maintenance
-- ============================================================================

-- Update version on modify
CREATE TRIGGER IF NOT EXISTS sessions_version_update
AFTER UPDATE ON unified_sessions
BEGIN
  UPDATE unified_sessions 
  SET version = OLD.version + 1 
  WHERE id = NEW.id AND version = OLD.version;
END;

-- Update last_accessed_at on any operation
CREATE TRIGGER IF NOT EXISTS sessions_touch
AFTER UPDATE OF state, last_activity_at, total_turns ON unified_sessions
BEGIN
  UPDATE unified_sessions 
  SET last_accessed_at = (strftime('%s', 'now') * 1000)
  WHERE id = NEW.id;
END;

-- Auto-delete expired snapshots
CREATE TRIGGER IF NOT EXISTS snapshots_cleanup_expired
AFTER INSERT ON session_snapshots
BEGIN
  DELETE FROM session_snapshots 
  WHERE expires_at IS NOT NULL 
    AND expires_at < (strftime('%s', 'now') * 1000);
END;

-- Prevent orphaned hierarchy entries
CREATE TRIGGER IF NOT EXISTS hierarchy_parent_check
BEFORE INSERT ON session_hierarchy
BEGIN
  -- Ensure parent exists if specified
  SELECT CASE
    WHEN NEW.parent_session_id IS NOT NULL 
         AND NOT EXISTS (SELECT 1 FROM unified_sessions WHERE id = NEW.parent_session_id)
    THEN RAISE(ABORT, 'Parent session does not exist')
  END;
END;

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- Active sessions view
CREATE VIEW IF NOT EXISTS active_sessions AS
SELECT 
  s.*,
  h.spawn_depth,
  h.parent_session_id,
  (SELECT COUNT(*) FROM session_hierarchy WHERE parent_session_id = s.id) as child_count
FROM unified_sessions s
LEFT JOIN session_hierarchy h ON s.id = h.session_id
WHERE s.state IN ('idle', 'active')
ORDER BY s.last_activity_at DESC;

-- Session tree view
CREATE VIEW IF NOT EXISTS session_tree AS
WITH RECURSIVE tree AS (
  -- Root sessions (no parent)
  SELECT 
    id,
    id as root_id,
    0 as level,
    CAST(id AS TEXT) as path
  FROM session_hierarchy
  WHERE parent_session_id IS NULL
  
  UNION ALL
  
  -- Children
  SELECT 
    h.id,
    t.root_id,
    t.level + 1,
    t.path || '/' || h.id
  FROM session_hierarchy h
  JOIN tree t ON h.parent_session_id = t.id
)
SELECT 
  t.id,
  t.root_id,
  t.level,
  t.path,
  s.state,
  s.source,
  s.created_at,
  s.last_activity_at
FROM tree t
JOIN unified_sessions s ON t.id = s.id
ORDER BY t.path;

-- Statistics view
CREATE VIEW IF NOT EXISTS session_stats AS
SELECT
  COUNT(*) as total_sessions,
  COUNT(CASE WHEN state = 'active' THEN 1 END) as active_count,
  COUNT(CASE WHEN state = 'idle' THEN 1 END) as idle_count,
  COUNT(CASE WHEN state = 'error' THEN 1 END) as error_count,
  COUNT(CASE WHEN state = 'completed' THEN 1 END) as completed_count,
  COUNT(CASE WHEN source = 'tui' THEN 1 END) as tui_count,
  COUNT(CASE WHEN source = 'discord' THEN 1 END) as discord_count,
  COUNT(CASE WHEN source = 'gateway' THEN 1 END) as gateway_count,
  SUM(total_tokens_input) as total_input_tokens,
  SUM(total_tokens_output) as total_output_tokens,
  SUM(total_turns) as total_turns
FROM unified_sessions;

-- ============================================================================
-- Initial Configuration
-- ============================================================================

-- Enable WAL mode for performance
PRAGMA journal_mode = WAL;

-- Normal sync mode (balance of safety and speed)
PRAGMA synchronous = NORMAL;

-- Enable foreign keys
PRAGMA foreign_keys = ON;

-- Set WAL autocheckpoint to 1000 pages (reasonable batch size)
PRAGMA wal_autocheckpoint = 1000;
