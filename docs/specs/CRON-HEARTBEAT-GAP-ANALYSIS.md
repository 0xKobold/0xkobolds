# Cron vs Heartbeat: Gap Analysis & Implementation Roadmap

**Based on:** OpenClaw Documentation (https://docs.openclaw.ai/automation/cron-vs-heartbeat)  
**Current Version:** 0xKobold v0.3.3  
**Status:** Heartbeat ✅ Complete | Cron ❌ Missing

---

## Executive Summary

0xKobold currently implements **Heartbeat** correctly per OpenClaw specs. **Cron** functionality is missing entirely. This document outlines the gaps and implementation priorities.

| Feature | Status | Priority |
|---------|--------|----------|
| HEARTBEAT.md | ✅ Complete | - |
| Context-aware checks | ✅ Complete | - |
| Smart suppression (HEARTBEAT_OK) | ✅ Complete | - |
| Periodic scheduling | ✅ Complete | - |
| **Precise Cron Jobs** | ❌ Missing | **P0** |
| **Isolated Sessions** | ❌ Missing | **P0** |
| **One-shot Reminders** | ❌ Missing | **P1** |
| **Cron CLI Commands** | ❌ Missing | **P1** |
| Model overrides per job | ❌ Missing | **P2** |
| Load spreading (--stagger) | ❌ Missing | **P3** |

---

## Current Implementation: Heartbeat ✅

### What's Working

```typescript
// Location: src/extensions/core/heartbeat-extension.ts
interface HeartbeatConfig {
  enabled: boolean;
  every: string;              // "30m", "1h", etc.
  prompt: string;             // Instructions including HEARTBEAT.md
  ackMaxChars: number;        // 300 char limit for responses
  activeHours: {              // Optional quiet hours
    start: string;            // "09:00"
    end: string;              // "22:00"
    timezone?: string;
  } | null;
}
```

### Key Features Present

1. **HEARTBEAT.md Checklist**
   - File: `HEARTBEAT.md` in project root
   - Agent reads and follows checklist
   - Batched multiple checks in one turn

2. **Smart Suppression**
   - Response contains `HEARTBEAT_OK` → No notification sent
   - Saves user from noise when nothing needs attention

3. **Context-Aware**
   - Runs in main session
   - Has full conversation context
   - Can reference recent work

4. **Periodic Scheduling**
   - Parsed from string: "30m", "1h", "2h30m"
   - Respects activeHours (quiet period)

### Example HEARTBEAT.md (Current)

```markdown
# 🤖 Agent Self-Monitor Heartbeat

**Session Active Since:** 2025-01-09 05:42 UTC  
**Current Time:** ~13:20 UTC  
**Status:** ✅ V0.3.0 COMPLETE

## ✅ Checklist

- [ ] Check for urgent PRs or issues
- [ ] Review calendar for upcoming events
- [ ] Check backup status
- [ ] Monitor disk space
- [ ] Review recent errors in logs

Reply with "HEARTBEAT_OK" if nothing needs attention.
```

---

## Missing Implementation: Cron ❌

### What OpenClaw Has (We Don't)

| Feature | OpenClaw Implementation | 0xKobold Status |
|---------|------------------------|-----------------|
| **Cron Expressions** | `0 7 * * *` (precise timing) | ❌ Not implemented |
| **Isolated Sessions** | `cron:<jobId>` separate context | ❌ Not implemented |
| **One-shot Reminders** | `--at "20m"` or `--at "2025-01-10T09:00:00"` | ❌ Not implemented |
| **CLI Commands** | `openclaw cron add/list/remove` | ❌ Not implemented |
| **Session Type** | `--session isolated` vs `--session main` | ❌ Not implemented |
| **Model Override** | `--model opus` per job | ❌ Not implemented |
| **Stagger/Spread** | `--stagger 5m` for load distribution | ❌ Not implemented |
| **Timezone Support** | `--tz "America/New_York"` per job | ❌ Not implemented |
| **Auto-delete** | `--delete-after-run` for one-shots | ❌ Not implemented |
| **Wake Triggers** | `--wake now` to alert main session | ❌ Not implemented |
| **Channel Routing** | `--channel whatsapp --to "+..."` | ❌ Not implemented |
| **System Events** | `--system-event "message"` (no LLM) | ❌ Not implemented |

---

## Decision Flowchart (OpenClaw Standard)

```
Does the task need to run at an EXACT time?
  YES -> Use cron
  NO  -> Continue...

Does the task need isolation from main session?
  YES -> Use cron (isolated)
  NO  -> Continue...

Can this task be batched with other periodic checks?
  YES -> Use heartbeat (add to HEARTBEAT.md)
  NO  -> Use cron

Is this a one-shot reminder?
  YES -> Use cron with --at
  NO  -> Continue...

Does it need a different model or thinking level?
  YES -> Use cron (isolated) with --model
  NO  -> Use heartbeat
```

---

## Quick Decision Table

| Use Case | OpenClaw | 0xKobold Current | Gap |
|----------|----------|------------------|-----|
| Check inbox every 30 min | Heartbeat | ✅ Heartbeat | None |
| Send daily report at 9am sharp | Cron (isolated) | ❌ Not possible | **Major** |
| Monitor calendar events | Heartbeat | ✅ Heartbeat | None |
| Weekly deep analysis | Cron (isolated) | ❌ Not possible | **Major** |
| Remind me in 20 minutes | Cron (main, --at) | ❌ Not possible | **Major** |
| Background health check | Heartbeat | ✅ Heartbeat | None |
| Different model per task | Cron with --model | ❌ Same model always | **Medium** |

---

## Implementation Roadmap

### Phase 1: Core Cron Infrastructure (P0)

#### 1.1 Cron Expression Parser

```typescript
// src/cron/parser.ts
export interface CronExpression {
  minute: number[] | '*';
  hour: number[] | '*';
  dayOfMonth: number[] | '*';
  month: number[] | '*';
  dayOfWeek: number[] | '*';
  timezone: string;
}

export function parseCron(expression: string): CronExpression;
export function getNextRun(cron: CronExpression): Date;
export function parseDuration(duration: string): number; // "20m", "2h", "1d"
```

#### 1.2 Job Scheduler

```typescript
// src/cron/scheduler.ts
export interface CronJob {
  id: string;
  name: string;
  cronExpression?: string;      // "0 9 * * *" for recurring
  at?: Date;                     // One-shot absolute time
  atDuration?: number;           // One-shot relative (ms)
  session: 'main' | 'isolated';
  message: string;
  model?: string;                // Override default model
  timezone: string;
  enabled: boolean;
  lastRun?: Date;
  nextRun: Date;
  runCount: number;
  deleteAfterRun?: boolean;
  wakeAfterRun?: boolean;
}

export class CronScheduler extends EventEmitter {
  addJob(config: Partial<CronJob>): CronJob;
  removeJob(id: string): boolean;
  listJobs(): CronJob[];
  getNextRun(id: string): Date | null;
  start(): void;
  stop(): void;
}
```

#### 1.3 Isolated Session Runner

```typescript
// src/cron/isolated-runner.ts
export async function runIsolatedSession(
  jobId: string,
  message: string,
  model?: string
): Promise<SessionResult>;

interface SessionResult {
  success: boolean;
  output: string;
  tokensUsed: number;
  duration: number;
  error?: string;
}
```

### Phase 2: CLI & API (P1)

#### 2.1 CLI Commands

```bash
# Add recurring job
0xkobold cron add \
  --name "Morning Brief" \
  --cron "0 7 * * *" \
  --timezone "America/New_York" \
  --session isolated \
  --message "Generate morning brief: weather, calendar, tasks" \
  --model "kimi-k2.5:cloud"

# One-shot reminder
0xkobold cron add \
  --name "Call Reminder" \
  --at "20m" \
  --session main \
  --message "Call client back" \
  --wake \
  --delete-after-run

# List jobs
0xkobold cron list
# Output:
# ID | Name | Schedule | Next Run | Session | Status

# Remove job
0xkobold cron remove <id>

# Pause/resume
0xkobold cron pause <id>
0xkobold cron resume <id>
```

#### 2.2 REST API

```typescript
// POST /api/cron/jobs
{
  "name": "Daily Report",
  "cron": "0 9 * * *",
  "timezone": "UTC",
  "session": "isolated",
  "message": "Generate daily report",
  "model": "kimi-k2.5:cloud",
  "enabled": true
}

// GET /api/cron/jobs
// DELETE /api/cron/jobs/:id
// PATCH /api/cron/jobs/:id (pause/resume)
```

### Phase 3: Advanced Features (P2)

#### 3.1 Model Override Per Job

```typescript
interface CronJob {
  // ... existing fields
  model?: string;           // "kimi-k2.5:cloud", "claude", etc.
  thinkingLevel?: 'fast' | 'normal' | 'deep';
  costLimit?: number;       // Max tokens/cost for job
}
```

#### 3.2 Load Spreading

```typescript
interface CronJob {
  // ... existing fields
  stagger?: number;         // Random delay 0-N minutes (for load distribution)
  exact?: boolean;         // If true, disable stagger
}

// Example: 100 jobs at 9:00 with stagger 5m
// Actually run between 9:00-9:05 to avoid thundering herd
```

#### 3.3 Channel Routing

```typescript
interface CronJob {
  // ... existing fields
  notify?: {
    channel: 'whatsapp' | 'telegram' | 'slack' | 'email';
    recipient: string;
    onSuccess?: boolean;
    onError?: boolean;
  };
}
```

### Phase 4: Integration (P3)

#### 4.1 Extension API

```typescript
// src/extensions/core/cron-extension.ts
export default function cronExtension(api: ExtensionAPI) {
  api.registerTool('cron_add', addJobTool);
  api.registerTool('cron_list', listJobsTool);
  api.registerTool('cron_remove', removeJobTool);
  api.registerCommand('cron', cronCommand);
}
```

#### 4.2 Database Schema

```sql
-- Cron jobs table
CREATE TABLE cron_jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cron_expression TEXT,
  at_timestamp INTEGER,
  timezone TEXT DEFAULT 'UTC',
  session_type TEXT CHECK(session_type IN ('main', 'isolated')),
  message TEXT NOT NULL,
  model TEXT,
  enabled BOOLEAN DEFAULT true,
  delete_after_run BOOLEAN DEFAULT false,
  wake_after_run BOOLEAN DEFAULT false,
  created_at INTEGER DEFAULT (unixepoch()),
  last_run_at INTEGER,
  next_run_at INTEGER NOT NULL,
  run_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  last_error TEXT
);

-- Cron job run log
CREATE TABLE cron_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT REFERENCES cron_jobs(id),
  started_at INTEGER,
  completed_at INTEGER,
  success BOOLEAN,
  output TEXT,
  tokens_used INTEGER,
  error TEXT
);

CREATE INDEX idx_cron_jobs_next_run ON cron_jobs(next_run_at) WHERE enabled = true;
CREATE INDEX idx_cron_jobs_last_run ON cron_jobs(last_run_at);
CREATE INDEX idx_cron_runs_job_id ON cron_runs(job_id);
```

---

## Architecture Decision Records

### ADR-001: Session Isolation

**Decision:** Use completely isolated contexts for cron jobs, not shared with main session.

**Rationale:**
- Prevents history pollution
- Allows different models/costs per job
- Failed jobs don't corrupt main session
- Easier to debug and retry

**Implementation:**
```typescript
// Isolated session gets its own context
const isolatedContext = {
  sessionId: `cron:${job.id}`,
  history: [], // Fresh history
  model: job.model ?? defaultModel,
  costTracking: separateFromMain,
  workingDir: job.workingDir ?? process.cwd()
};
```

### ADR-002: Storage Backend

**Decision:** Use SQLite for job persistence, in-memory for scheduling.

**Rationale:**
- SQLite: Survives restarts, queryable, ACID
- In-memory scheduler: Fast, event-driven, no polling
- Hybrid gives durability + performance

**Implementation:**
```typescript
class CronScheduler {
  private db: Database;           // SQLite persistence
  private jobs: Map<string, Job>; // In-memory active jobs
  private timers: Map<string, Timer>; // Bun/node timers
  
  // On startup: Load from SQLite into memory
  // On change: Persist to SQLite, update memory
}
```

### ADR-003: Timezone Handling

**Decision:** Store all times in UTC, convert to job's timezone for scheduling.

**Rationale:**
- UTC in database = no ambiguity
- Local time for user display
- Handles DST correctly

---

## File Structure

```
src/
├── cron/
│   ├── index.ts              # Public API exports
│   ├── scheduler.ts            # Core scheduler
│   ├── parser.ts               # Cron expression parser
│   ├── isolated-runner.ts      # Isolated session execution
│   ├── jobs.ts                 # CRUD operations
│   ├── cli.ts                  # CLI command handlers
│   ├── types.ts                # TypeScript interfaces
│   └── schema.sql              # Database schema
├── extensions/core/
│   └── cron-extension.ts       # Extension registration
└── cli/commands/
    └── cron.ts                 # CLI command definitions
```

---

## Testing Strategy

### Unit Tests

```typescript
// test/unit/cron/parser.test.ts
describe('Cron Parser', () => {
  test('parses standard cron expressions');
  test('calculates next run correctly');
  test('handles timezone conversions');
  test('parses duration strings (20m, 2h)');
});

// test/unit/cron/scheduler.test.ts
describe('Cron Scheduler', () => {
  test('adds and removes jobs');
  test('triggers job at correct time');
  test('runs job in isolated session');
  test('respects session type (main vs isolated)');
  test('deletes one-shot jobs after run');
  test('handles job failures gracefully');
});
```

### Integration Tests

```typescript
// test/integration/cron/full-flow.test.ts
describe('Cron Full Flow', () => {
  test('complete cycle: add -> trigger -> complete -> log');
  test('one-shot reminder with wake');
  test('daily report with model override');
  test('recurring job survives restart');
});
```

---

## Migration from Current State

### Step 1: Create cron/ directory
- Move away from `src/heartbeat/` pattern
- Create standalone `src/cron/` module

### Step 2: Implement Core
- Parser + Scheduler (no CLI yet)
- Test with programmatic API

### Step 3: Add CLI
- Hook into existing `src/cli/commands/`
- Add `cron` subcommand

### Step 4: Extension Integration
- Register as extension
- Add tools for agent usage

### Step 5: Database Migration
```sql
-- Migration: Add jobs table
-- Already handled by schema.sql on first run
```

---

## Open Questions

1. **Cost Control:** Should we implement per-job token/cost limits?
2. **Retry Logic:** How many times to retry failed jobs? Exponential backoff?
3. **Concurrency:** Limit concurrent cron jobs? (e.g., 5 at a time)
4. **Notifications:** Email/slack on job failure? (separate extension?)
5. **Web Dashboard:** Visual job management in gateway UI?

---

## References

- OpenClaw Docs: https://docs.openclaw.ai/automation/cron-vs-heartbeat
- OpenClaw Cron CLI: https://docs.openclaw.ai/automation/cron-jobs
- OpenClaw Hooks: https://docs.openclaw.ai/automation/hooks
- Cron Expression Spec: https://en.wikipedia.org/wiki/Cron
- crontab.guru: https://crontab.guru/ (testing expressions)

---

## Document Info

| Field | Value |
|-------|-------|
| **Author** | 0xKobold |
| **Version** | 0.3.3 |
| **Status** | Draft |
| **Created** | 2025-01-09 |
| **Updated** | 2025-01-09 |
| **Target** | v0.4.0 or v0.5.0 |
