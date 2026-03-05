-- 0xKobold Database Schema
-- Smart memory management with priority-based storage and memory palace concept

-- Enable foreign keys and WAL mode
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- =====================================================
-- AGENTS TABLE - Agent registry and metadata
-- =====================================================
CREATE TABLE agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    agent_type TEXT NOT NULL CHECK (agent_type IN ('main', 'worker', 'specialist')),
    description TEXT,
    capabilities TEXT, -- JSON array of capabilities
    config TEXT, -- JSON configuration
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'disabled')),
    created_at INTEGER DEFAULT (unixepoch()),
    last_active INTEGER DEFAULT (unixepoch()),
    metadata TEXT -- JSON for extensibility
);

-- =====================================================
-- MEMORY ROOMS - Spatial organization for memory palace
-- =====================================================
CREATE TABLE memory_rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    room_type TEXT NOT NULL CHECK (room_type IN ('general', 'project', 'task', 'knowledge', 'archive')),
    capacity INTEGER DEFAULT 1000, -- Max memories in this room
    priority_multiplier REAL DEFAULT 1.0, -- Priority boost for this room
    parent_room_id INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    metadata TEXT,
    FOREIGN KEY (parent_room_id) REFERENCES memory_rooms(id) ON DELETE SET NULL
);

-- =====================================================
-- WORKING MEMORY - Last 50 messages (short-term)
-- =====================================================
CREATE TABLE working_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('message', 'thought', 'observation', 'action')),
    agent_id INTEGER NOT NULL,
    room_id INTEGER,
    priority_score REAL DEFAULT 0.0, -- Calculated priority
    context_hash TEXT, -- For grouping related memories
    created_at INTEGER DEFAULT (unixepoch()),
    metadata TEXT,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES memory_rooms(id) ON DELETE SET NULL
);

-- =====================================================
-- LONG-TERM MEMORY - High priority memories
-- =====================================================
CREATE TABLE long_term_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    content_type TEXT NOT NULL CHECK (content_type IN ('fact', 'insight', 'pattern', 'relationship', 'skill')),
    agent_id INTEGER NOT NULL,
    room_id INTEGER,
    priority_score REAL DEFAULT 0.0,
    access_count INTEGER DEFAULT 0, -- Frequency tracking
    last_accessed INTEGER DEFAULT (unixepoch()), -- Recency tracking
    created_at INTEGER DEFAULT (unixepoch()),
    decay_rate REAL DEFAULT 0.01, -- How fast this memory loses priority
    context_tags TEXT, -- JSON array of related tags
    source_memory_id INTEGER, -- Link to original working memory
    metadata TEXT,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES memory_rooms(id) ON DELETE SET NULL,
    FOREIGN KEY (source_memory_id) REFERENCES working_memory(id) ON DELETE SET NULL
);

-- =====================================================
-- PROJECT MEMORY - Active projects and their context
-- =====================================================
CREATE TABLE project_memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    agent_id INTEGER NOT NULL,
    room_id INTEGER,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'archived')),
    priority_score REAL DEFAULT 0.0,
    start_date INTEGER DEFAULT (unixepoch()),
    target_completion INTEGER,
    last_activity INTEGER DEFAULT (unixepoch()),
    context_data TEXT, -- JSON project context
    related_memory_ids TEXT, -- JSON array of related memory IDs
    metadata TEXT,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES memory_rooms(id) ON DELETE SET NULL
);

-- =====================================================
-- GOALS TABLE - Long-term goals hierarchy
-- =====================================================
CREATE TABLE goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    agent_id INTEGER NOT NULL,
    parent_goal_id INTEGER,
    goal_type TEXT NOT NULL CHECK (goal_type IN ('mission', 'strategic', 'tactical', 'immediate')),
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'abandoned')),
    progress REAL DEFAULT 0.0 CHECK (progress BETWEEN 0.0 AND 100.0),
    target_date INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    completed_at INTEGER,
    metadata TEXT,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_goal_id) REFERENCES goals(id) ON DELETE SET NULL
);

-- =====================================================
-- CRON JOBS - Scheduled tasks
-- =====================================================
CREATE TABLE cron_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    cron_expression TEXT NOT NULL, -- Standard cron format
    task_type TEXT NOT NULL CHECK (task_type IN ('memory_decay', 'priority_recalc', 'cleanup', 'custom')),
    agent_id INTEGER,
    is_enabled INTEGER DEFAULT 1,
    last_run INTEGER,
    next_run INTEGER,
    run_count INTEGER DEFAULT 0,
    fail_count INTEGER DEFAULT 0,
    config TEXT, -- JSON task-specific config
    created_at INTEGER DEFAULT (unixepoch()),
    metadata TEXT,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

-- =====================================================
-- TASK QUEUE - Background tasks
-- =====================================================
CREATE TABLE task_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL CHECK (task_type IN ('memory_promote', 'memory_decay', 'priority_update', 'cleanup', 'custom')),
    agent_id INTEGER,
    payload TEXT NOT NULL, -- JSON task data
    priority INTEGER DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    error_message TEXT,
    scheduled_at INTEGER DEFAULT (unixepoch()),
    started_at INTEGER,
    completed_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    metadata TEXT,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL
);

-- =====================================================
-- MEMORY CONTEXT - For context-aware recall
-- =====================================================
CREATE TABLE memory_context (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_type TEXT NOT NULL CHECK (memory_type IN ('working', 'long_term', 'project')),
    memory_id INTEGER NOT NULL,
    context_vector TEXT, -- JSON embedding vector for semantic search
    related_entities TEXT, -- JSON array of entity references
    sentiment_score REAL, -- -1.0 to 1.0
    importance_indicators TEXT, -- JSON of importance signals
    created_at INTEGER DEFAULT (unixepoch())
);

-- =====================================================
-- MEMORY ASSOCIATIONS - Links between memories
-- =====================================================
CREATE TABLE memory_associations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_memory_type TEXT NOT NULL CHECK (source_memory_type IN ('working', 'long_term', 'project')),
    source_memory_id INTEGER NOT NULL,
    target_memory_type TEXT NOT NULL CHECK (target_memory_type IN ('working', 'long_term', 'project')),
    target_memory_id INTEGER NOT NULL,
    association_type TEXT NOT NULL CHECK (association_type IN ('related', 'causes', 'enables', 'contradicts', 'supersedes')),
    strength REAL DEFAULT 0.5 CHECK (strength BETWEEN 0.0 AND 1.0),
    created_at INTEGER DEFAULT (unixepoch()),
    UNIQUE(source_memory_type, source_memory_id, target_memory_type, target_memory_id, association_type)
);

-- =====================================================
-- INDEXES - For performance optimization
-- =====================================================

-- Working memory indexes
CREATE INDEX idx_working_agent ON working_memory(agent_id);
CREATE INDEX idx_working_room ON working_memory(room_id);
CREATE INDEX idx_working_priority ON working_memory(priority_score DESC);
CREATE INDEX idx_working_context ON working_memory(context_hash);
CREATE INDEX idx_working_created ON working_memory(created_at DESC);

-- Long-term memory indexes
CREATE INDEX idx_ltm_agent ON long_term_memory(agent_id);
CREATE INDEX idx_ltm_room ON long_term_memory(room_id);
CREATE INDEX idx_ltm_priority ON long_term_memory(priority_score DESC);
CREATE INDEX idx_ltm_access ON long_term_memory(access_count DESC);
CREATE INDEX idx_ltm_last_access ON long_term_memory(last_accessed DESC);
CREATE INDEX idx_ltm_created ON long_term_memory(created_at DESC);

-- Project memory indexes
CREATE INDEX idx_project_agent ON project_memory(agent_id);
CREATE INDEX idx_project_status ON project_memory(status);
CREATE INDEX idx_project_priority ON project_memory(priority_score DESC);
CREATE INDEX idx_project_activity ON project_memory(last_activity DESC);

-- Goals indexes
CREATE INDEX idx_goals_agent ON goals(agent_id);
CREATE INDEX idx_goals_status ON goals(status);
CREATE INDEX idx_goals_priority ON goals(priority DESC);
CREATE INDEX idx_goals_parent ON goals(parent_goal_id);

-- Task queue indexes
CREATE INDEX idx_task_status ON task_queue(status);
CREATE INDEX idx_task_priority ON task_queue(priority DESC, created_at);
CREATE INDEX idx_task_scheduled ON task_queue(scheduled_at);
CREATE INDEX idx_task_agent ON task_queue(agent_id);

-- Cron jobs indexes
CREATE INDEX idx_cron_enabled ON cron_jobs(is_enabled);
CREATE INDEX idx_cron_next_run ON cron_jobs(next_run);

-- Memory context indexes
CREATE INDEX idx_context_memory ON memory_context(memory_type, memory_id);

-- Memory associations indexes
CREATE INDEX idx_assoc_source ON memory_associations(source_memory_type, source_memory_id);
CREATE INDEX idx_assoc_target ON memory_associations(target_memory_type, target_memory_id);

-- =====================================================
-- VIRTUAL TABLE - Full-text search for memories
-- =====================================================
CREATE VIRTUAL TABLE memory_search USING fts5(
    content,
    content_type,
    agent_id,
    room_id,
    tokenize='porter'
);

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Create default memory rooms
INSERT INTO memory_rooms (name, description, room_type, capacity, priority_multiplier) VALUES
('General', 'General purpose memory storage', 'general', 1000, 1.0),
('Projects', 'Active and recent projects', 'project', 500, 1.2),
('Tasks', 'Task-related memories and workflows', 'task', 300, 1.1),
('Knowledge', 'Facts, insights, and learned patterns', 'knowledge', 2000, 1.5),
('Archive', 'Archived and low-priority memories', 'archive', 5000, 0.5);

-- Create system agent
INSERT INTO agents (name, agent_type, description, capabilities) VALUES
('system', 'main', 'System agent for core operations', '["memory_management", "task_scheduling", "system_maintenance"]');

-- Create default cron jobs
INSERT INTO cron_jobs (name, description, cron_expression, task_type, config) VALUES
('memory_decay', 'Apply decay to long-term memory priorities', '0 */6 * * *', 'memory_decay', '{"decay_rate": 0.01}'),
('priority_recalc', 'Recalculate memory priorities based on access patterns', '0 0 * * *', 'priority_recalc', '{}'),
('cleanup_working', 'Clean old working memory entries', '0 */12 * * *', 'cleanup', '{"table": "working_memory", "keep_count": 50}'),
('cleanup_failed_tasks', 'Clean old failed tasks', '0 2 * * 0', 'cleanup', '{"table": "task_queue", "status": "failed", "older_than_days": 7}');

-- =====================================================
-- VIEWS - Useful queries
-- =====================================================

-- View: Working memory with agent and room info
CREATE VIEW v_working_memory AS
SELECT 
    wm.*,
    a.name as agent_name,
    a.agent_type,
    mr.name as room_name,
    mr.room_type as room_type
FROM working_memory wm
LEFT JOIN agents a ON wm.agent_id = a.id
LEFT JOIN memory_rooms mr ON wm.room_id = mr.id;

-- View: Long-term memory with agent and room info
CREATE VIEW v_long_term_memory AS
SELECT 
    ltm.*,
    a.name as agent_name,
    mr.name as room_name,
    CASE 
        WHEN julianday('now') - julianday(datetime(ltm.last_accessed, 'unixepoch')) < 1 THEN 'hot'
        WHEN julianday('now') - julianday(datetime(ltm.last_accessed, 'unixepoch')) < 7 THEN 'warm'
        ELSE 'cold'
    END as access_status
FROM long_term_memory ltm
LEFT JOIN agents a ON ltm.agent_id = a.id
LEFT JOIN memory_rooms mr ON ltm.room_id = mr.id;

-- View: Active projects with statistics
CREATE VIEW v_active_projects AS
SELECT 
    pm.*,
    a.name as agent_name,
    (SELECT COUNT(*) FROM long_term_memory WHERE room_id = pm.room_id) as memory_count,
    (julianday('now') - julianday(datetime(pm.last_activity, 'unixepoch'))) as days_since_activity
FROM project_memory pm
LEFT JOIN agents a ON pm.agent_id = a.id
WHERE pm.status = 'active';

-- View: Goals hierarchy
CREATE VIEW v_goals_hierarchy AS
WITH RECURSIVE goal_tree AS (
    SELECT 
        id, title, parent_goal_id, goal_type, priority, status, progress,
        0 as level,
        CAST(id AS TEXT) as path
    FROM goals
    WHERE parent_goal_id IS NULL
    
    UNION ALL
    
    SELECT 
        g.id, g.title, g.parent_goal_id, g.goal_type, g.priority, g.status, g.progress,
        gt.level + 1,
        gt.path || '/' || CAST(g.id AS TEXT)
    FROM goals g
    JOIN goal_tree gt ON g.parent_goal_id = gt.id
)
SELECT * FROM goal_tree;

-- View: Pending tasks with priority ranking
CREATE VIEW v_pending_tasks AS
SELECT 
    tq.*,
    a.name as agent_name,
    CASE 
        WHEN tq.retry_count >= tq.max_retries THEN 'permanent_fail'
        WHEN tq.scheduled_at < unixepoch() - 3600 THEN 'overdue'
        ELSE 'pending'
    END as urgency
FROM task_queue tq
LEFT JOIN agents a ON tq.agent_id = a.id
WHERE tq.status = 'pending'
ORDER BY tq.priority DESC, tq.created_at;

-- View: Memory room statistics
CREATE VIEW v_room_statistics AS
SELECT 
    mr.id,
    mr.name,
    mr.room_type,
    mr.capacity,
    (SELECT COUNT(*) FROM working_memory WHERE room_id = mr.id) as working_count,
    (SELECT COUNT(*) FROM long_term_memory WHERE room_id = mr.id) as long_term_count,
    (SELECT COUNT(*) FROM project_memory WHERE room_id = mr.id) as project_count,
    (SELECT AVG(priority_score) FROM working_memory WHERE room_id = mr.id) as avg_working_priority,
    (SELECT AVG(priority_score) FROM long_term_memory WHERE room_id = mr.id) as avg_ltm_priority
FROM memory_rooms mr;

-- =====================================================
-- TRIGGERS - Maintain data consistency
-- =====================================================

-- Trigger: Limit working memory to 50 entries per agent
CREATE TRIGGER trg_limit_working_memory
AFTER INSERT ON working_memory
BEGIN
    DELETE FROM working_memory
    WHERE id IN (
        SELECT id FROM working_memory
        WHERE agent_id = NEW.agent_id
        ORDER BY created_at DESC
        LIMIT -1 OFFSET 50
    );
END;

-- Trigger: Update agent last_active on memory creation
CREATE TRIGGER trg_update_agent_activity
AFTER INSERT ON working_memory
BEGIN
    UPDATE agents SET last_active = unixepoch() WHERE id = NEW.agent_id;
END;

-- Trigger: Update long-term memory access stats
CREATE TRIGGER trg_update_memory_access
AFTER INSERT ON memory_context
WHEN NEW.memory_type = 'long_term'
BEGIN
    UPDATE long_term_memory 
    SET access_count = access_count + 1, 
        last_accessed = unixepoch()
    WHERE id = NEW.memory_id;
END;

-- Trigger: Archive completed projects to long-term memory
CREATE TRIGGER trg_archive_completed_project
AFTER UPDATE OF status ON project_memory
WHEN NEW.status = 'completed' AND OLD.status != 'completed'
BEGIN
    INSERT INTO long_term_memory (
        content, content_type, agent_id, room_id, priority_score, context_tags
    )
    SELECT 
        'Completed project: ' || NEW.name || ' - ' || NEW.description,
        'insight',
        NEW.agent_id,
        (SELECT id FROM memory_rooms WHERE name = 'Archive'),
        NEW.priority_score * 0.5, -- Reduce priority for archive
        json_array('project_completion', 'archive')
    WHERE NEW.priority_score > 5.0; -- Only archive high-priority projects
END;
