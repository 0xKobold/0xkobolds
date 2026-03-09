-- Cron Jobs Database Schema - 0xKobold
-- Run this to initialize the cron system

-- Main cron jobs table
CREATE TABLE IF NOT EXISTS cron_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  -- Scheduling fields
  cron_expression TEXT,           -- "0 9 * * *" for recurring
  at_timestamp INTEGER,           -- One-shot: absolute timestamp
  at_duration INTEGER,            -- One-shot: relative duration in ms
  timezone TEXT DEFAULT 'UTC',
  -- Execution config
  session_type TEXT CHECK(session_type IN ('main', 'isolated')) DEFAULT 'isolated',
  message TEXT NOT NULL,
  model TEXT,                     -- Override default model
  thinking_level TEXT CHECK(thinking_level IN ('fast', 'normal', 'deep')),
  working_dir TEXT,
  token_limit INTEGER,
  -- Status
  enabled BOOLEAN DEFAULT true,
  created_at INTEGER DEFAULT (unixepoch()),
  updated_at INTEGER DEFAULT (unixepoch()),
  -- Runtime stats
  last_run_at INTEGER,
  next_run_at INTEGER NOT NULL,
  run_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  last_output TEXT,
  -- Options
  delete_after_run BOOLEAN DEFAULT false,
  wake_after_run BOOLEAN DEFAULT false,
  stagger INTEGER DEFAULT 0,
  exact BOOLEAN DEFAULT false
);

-- Job run history/log
CREATE TABLE IF NOT EXISTS cron_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES cron_jobs(id) ON DELETE CASCADE,
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  success BOOLEAN,
  output TEXT,
  tokens_used INTEGER DEFAULT 0,
  cost REAL,
  error TEXT,
  exit_code INTEGER
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cron_jobs_next_run 
  ON cron_jobs(next_run_at) 
  WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_cron_jobs_last_run 
  ON cron_jobs(last_run_at);

CREATE INDEX IF NOT EXISTS idx_cron_runs_job_id 
  ON cron_runs(job_id);

CREATE INDEX IF NOT EXISTS idx_cron_runs_started 
  ON cron_runs(started_at DESC);

-- View for upcoming jobs
CREATE VIEW IF NOT EXISTS upcoming_jobs AS
SELECT 
  id,
  name,
  session_type,
  next_run_at,
  CASE 
    WHEN cron_expression IS NOT NULL THEN 'recurring'
    WHEN at_timestamp IS NOT NULL THEN 'one-shot'
    ELSE 'unknown'
  END as job_type,
  enabled,
  run_count
FROM cron_jobs
WHERE enabled = true
  AND next_run_at > 0
ORDER BY next_run_at ASC;

-- View for job statistics
CREATE VIEW IF NOT EXISTS job_stats AS
SELECT 
  j.id,
  j.name,
  j.run_count,
  j.error_count,
  CASE 
    WHEN j.run_count > 0 
    THEN ROUND(100.0 * j.error_count / j.run_count, 2)
    ELSE 0
  END as error_rate,
  COUNT(r.id) as total_runs,
  AVG(r.tokens_used) as avg_tokens,
  SUM(r.tokens_used) as total_tokens,
  SUM(r.cost) as total_cost
FROM cron_jobs j
LEFT JOIN cron_runs r ON j.id = r.job_id
GROUP BY j.id, j.name, j.run_count, j.error_count;

-- Trigger to update updated_at on modification
CREATE TRIGGER IF NOT EXISTS update_cron_jobs_timestamp
AFTER UPDATE ON cron_jobs
BEGIN
  UPDATE cron_jobs SET updated_at = unixepoch() WHERE id = NEW.id;
END;
