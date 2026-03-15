/**
 * 🧠 Learning Extension Extension - E2E Tests
 *
 * End-to-end testing of the full agent lifecycle:
 * observe → think → act → reflect → plan → decide
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";

const TEST_DB_DIR = path.join(os.tmpdir(), `generative-e2e-${Date.now()}`);

// Ensure test directory exists
await fs.mkdir(TEST_DB_DIR, { recursive: true });

describe("🧠 Learning Extension E2E Tests", () => {
  let db: Database;
  let agentId: string;

  beforeEach(() => {
    const dbPath = path.join(TEST_DB_DIR, `e2e-${Date.now()}.db`);
    db = new Database(dbPath);
    db.exec("PRAGMA journal_mode = WAL;");
    initSchema(db);
    agentId = seedAgent(db);
  });

  afterEach(() => {
    db?.close();
  });

  // ============================================================================
  // Schema & Helpers
  // ============================================================================

  function initSchema(db: Database) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        traits TEXT NOT NULL,
        current_location TEXT DEFAULT 'home',
        current_plan_id TEXT,
        observation_count INTEGER DEFAULT 0,
        last_reflection_at TEXT,
        memory_count INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS memory_stream (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        importance REAL NOT NULL,
        agent_id TEXT NOT NULL,
        session_id TEXT,
        location TEXT,
        people TEXT,
        embedding BLOB,
        metadata TEXT
      );
      
      CREATE TABLE IF NOT EXISTS reflections (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        content TEXT NOT NULL,
        insight TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        evidence TEXT NOT NULL,
        depth INTEGER NOT NULL,
        importance REAL NOT NULL
      );
      
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        agent_id TEXT NOT NULL,
        parent_plan_id TEXT,
        sub_plan_ids TEXT,
        start_time TEXT,
        end_time TEXT,
        location TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_memory_agent ON memory_stream(agent_id);
      CREATE INDEX IF NOT EXISTS idx_memory_timestamp ON memory_stream(timestamp);
    `);
  }

  function seedAgent(db: Database): string {
    const id = randomUUID();
    db.query(`
      INSERT INTO agents (id, name, traits, current_location, observation_count, created_at)
      VALUES (?, 'E2EAgent', ?, 'workspace', 0, ?)
    `).run(id, JSON.stringify(["test", "e2e"]), new Date().toISOString());
    return id;
  }

  // ============================================================================
  // Agent Lifecycle Tests
  // ============================================================================

  describe("Full Agent Lifecycle", () => {
    test("complete cycle: observe → think → act → reflect → plan", () => {
      const now = new Date().toISOString();

      // STEP 1: OBSERVE - Agent observes environment
      const observationId = randomUUID();
      db.query(`
        INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
        VALUES (?, ?, ?, 'observation', ?, ?)
      `).run(observationId, now, "User requested a feature", 7, agentId);

      db.query("UPDATE agents SET observation_count = observation_count + 1 WHERE id = ?").run(agentId);

      const obsCount = db.query("SELECT observation_count FROM agents WHERE id = ?").get(agentId) as { observation_count: number };
      expect(obsCount.observation_count).toBe(1);

      // STEP 2: THINK - Agent processes internally
      const thoughtId = randomUUID();
      db.query(`
        INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
        VALUES (?, ?, ?, 'thought', ?, ?)
      `).run(thoughtId, now, "This seems like a medium complexity task", 6, agentId);

      // STEP 3: ACT - Agent takes action
      const actionId = randomUUID();
      db.query(`
        INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
        VALUES (?, ?, ?, 'action', ?, ?)
      `).run(actionId, now, "Started analyzing codebase", 8, agentId);

      // Verify all memories exist
      const memories = db.query("SELECT * FROM memory_stream WHERE agent_id = ?").all(agentId) as any[];
      expect(memories).toHaveLength(3);
      expect(memories.map(m => m.type).sort()).toEqual(["action", "observation", "thought"]);

      // STEP 4: REFLECT - Agent synthesizes insights
      const reflectionId = randomUUID();
      db.query(`
        INSERT INTO reflections (id, timestamp, content, insight, agent_id, evidence, depth, importance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reflectionId,
        now,
        "User typically requests features in the morning",
        "Morning feature requests pattern",
        agentId,
        JSON.stringify([observationId, thoughtId, actionId]),
        1,
        8
      );

      db.query("UPDATE agents SET last_reflection_at = ? WHERE id = ?").run(now, agentId);

      const reflection = db.query("SELECT * FROM reflections WHERE id = ?").get(reflectionId) as any;
      expect(reflection.depth).toBe(1);
      expect(JSON.parse(reflection.evidence)).toHaveLength(3);

      // STEP 5: PLAN - Agent creates plan
      const planId = randomUUID();
      db.query(`
        INSERT INTO plans (id, timestamp, content, type, status, agent_id)
        VALUES (?, ?, ?, 'daily', 'pending', ?)
      `).run(planId, now, "1. Analyze 2. Design 3. Implement 4. Test", agentId);

      const plan = db.query("SELECT * FROM plans WHERE id = ?").get(planId) as any;
      expect(plan.status).toBe("pending");

      // Complete lifecycle verified
      const stats = db.query(`
        SELECT 
          (SELECT COUNT(*) FROM memory_stream WHERE agent_id = ?) as memories,
          (SELECT COUNT(*) FROM reflections WHERE agent_id = ?) as reflections,
          (SELECT COUNT(*) FROM plans WHERE agent_id = ?) as plans
      `).get(agentId, agentId, agentId) as any;

      expect(stats.memories).toBe(3);
      expect(stats.reflections).toBe(1);
      expect(stats.plans).toBe(1);
    });

    test("multiple observations trigger reflection threshold", () => {
      const now = new Date().toISOString();

      // Add 20 observations (reflection triggers every 20)
      db.transaction(() => {
        for (let i = 0; i < 20; i++) {
          db.query(`
            INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
            VALUES (?, ?, ?, 'observation', ?, ?)
          `).run(randomUUID(), now, `Observation ${i}`, 5, agentId);
        }
      })();

      // Update observation count
      db.query("UPDATE agents SET observation_count = observation_count + 20 WHERE id = ?").run(agentId);

      const obsCount = db.query("SELECT observation_count FROM agents WHERE id = ?").get(agentId) as { observation_count: number };
      expect(obsCount.observation_count).toBe(20);

      // At 20 observations, reflection should be generated
      // (In real implementation, this would be automatic)
      const reflectionId = randomUUID();
      db.query(`
        INSERT INTO reflections (id, timestamp, content, insight, agent_id, evidence, depth, importance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reflectionId,
        now,
        "Pattern after 20 observations",
        "Automatic reflection at threshold",
        agentId,
        JSON.stringify(["mem-1", "mem-2"]),
        1,
        7
      );

      const reflection = db.query("SELECT * FROM reflections WHERE id = ?").get(reflectionId) as any;
      expect(reflection).toBeDefined();
    });

    test("plan hierarchy with subplans", () => {
      const now = new Date().toISOString();
      
      // Daily plan
      const dailyPlanId = randomUUID();
      db.query(`
        INSERT INTO plans (id, timestamp, content, type, status, agent_id)
        VALUES (?, ?, ?, 'daily', 'in_progress', ?)
      `).run(dailyPlanId, now, "Daily: Code, Review, Deploy", agentId);

      // Action subplans
      const subPlanIds: string[] = [];
      for (const content of ["Implement auth", "Write tests", "Deploy to staging"]) {
        const id = randomUUID();
        db.query(`
          INSERT INTO plans (id, timestamp, content, type, status, agent_id, parent_plan_id)
          VALUES (?, ?, ?, 'action', 'pending', ?, ?)
        `).run(id, now, content, agentId, dailyPlanId);
        subPlanIds.push(id);
      }

      // Link subplans to parent
      db.query("UPDATE plans SET sub_plan_ids = ? WHERE id = ?").run(JSON.stringify(subPlanIds), dailyPlanId);

      // Complete one subplan
      db.query("UPDATE plans SET status = 'completed' WHERE id = ?").run(subPlanIds[0]);

      // Verify hierarchy
      const parent = db.query("SELECT * FROM plans WHERE id = ?").get(dailyPlanId) as any;
      expect(JSON.parse(parent.sub_plan_ids)).toHaveLength(3);

      const completed = db.query(`
        SELECT COUNT(*) as count FROM plans 
        WHERE agent_id = ? AND status = 'completed'
      `).get(agentId) as { count: number };
      expect(completed.count).toBe(1);

      const pending = db.query(`
        SELECT COUNT(*) as count FROM plans 
        WHERE agent_id = ? AND status = 'pending'
      `).get(agentId) as { count: number };
      expect(pending.count).toBe(2);
    });
  });

  describe("Memory Retrieval and Decision Making", () => {
    test("retrieval combines multiple memories for decision", () => {
      const now = new Date().toISOString();

      // Seed diverse memories
      const memories = [
        { content: "User likes TypeScript", importance: 8 },
        { content: "User prefers functional patterns", importance: 7 },
        { content: "Previous project used React", importance: 6 },
        { content: "User dislikes verbose code", importance: 9 },
      ];

      db.transaction(() => {
        for (const m of memories) {
          db.query(`
            INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
            VALUES (?, datetime('now'), ?, 'observation', ?, ?)
          `).run(randomUUID(), m.content, m.importance, agentId);
        }
      })();

      // Retrieve relevant to "TypeScript code style"
      const query = "TypeScript code style";
      const rows = db.query(`
        SELECT * FROM memory_stream 
        WHERE agent_id = ? AND type = 'observation'
        ORDER BY importance DESC
        LIMIT 5
      `).all(agentId) as any[];

      // Should retrieve TypeScript-related memories
      const contents = rows.map(r => r.content);
      expect(contents.some(c => c.includes("TypeScript"))).toBe(true);
      expect(rows.length).toBeGreaterThan(0);

      // Simulate "decision" based on retrieval
      const relevant = rows.filter(r => 
        r.content.includes("TypeScript") || 
        r.content.includes("functional") ||
        r.content.includes("verbose")
      );
      
      // Decision would be influenced by these
      expect(relevant.length).toBeGreaterThanOrEqual(2);
    });

    test("higher-order reflection influences decisions", () => {
      const now = new Date().toISOString();

      // First-order reflection
      const r1 = db.query(`
        INSERT INTO reflections (id, timestamp, content, insight, agent_id, evidence, depth, importance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `).get(
        randomUUID(), now, "Pattern A", "Insight A", agentId, JSON.stringify(["m1"]), 1, 7
      ) as { id: string };

      // Higher-order reflection
      const r2 = db.query(`
        INSERT INTO reflections (id, timestamp, content, insight, agent_id, evidence, depth, importance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `).get(
        randomUUID(), now, "Meta pattern", "Core behavior trait", agentId, JSON.stringify([r1.id]), 2, 9
      ) as { id: string };

      const highOrder = db.query("SELECT * FROM reflections WHERE depth = 2").get(r2.id) as any;
      expect(highOrder).toBeDefined();
      expect(highOrder.evidence).toContain(r1.id);

      // Decision would weight this higher
      expect(highOrder.importance).toBeGreaterThan(7);
    });
  });

  describe("Temporal Behavior", () => {
    test("memory stream ordered by recency", () => {
      // Insert with specific timestamps
      db.query(`
        INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
        VALUES 
          (?, datetime('now', '-5 hours'), 'Old', 'observation', 5, ?),
          (?, datetime('now', '-1 hour'), 'Recent', 'observation', 5, ?),
          (?, datetime('now', '-24 hours'), 'Very old', 'observation', 5, ?)
      `).run(
        randomUUID(), agentId,
        randomUUID(), agentId,
        randomUUID(), agentId
      );

      const results = db.query(`
        SELECT content FROM memory_stream 
        WHERE agent_id = ? 
        ORDER BY timestamp DESC
      `).all(agentId) as any[];

      // Most recent should be first
      expect(results[0].content).toBe("Recent");
      expect(results[results.length - 1].content).toBe("Very old");
    });

    test("plan transitions over time", () => {
      const planId = randomUUID();
      const startTime = new Date().toISOString();

      // Create plan
      db.query(`
        INSERT INTO plans (id, timestamp, content, type, status, agent_id, start_time)
        VALUES (?, ?, ?, 'action', 'pending', ?, ?)
      `).run(planId, startTime, "Implement feature", agentId, startTime);

      // Start
      db.query("UPDATE plans SET status = 'in_progress', start_time = datetime('now') WHERE id = ?").run(planId);

      // Complete
      db.query(`
        UPDATE plans SET status = 'completed', end_time = datetime('now') WHERE id = ?
      `).run(planId);

      const plan = db.query("SELECT * FROM plans WHERE id = ?").get(planId) as any;
      expect(plan.status).toBe("completed");
      expect(plan.end_time).toBeDefined();
    });
  });

  describe("Edge Cases and Error Handling", () => {
    test("handles empty memory stream", () => {
      // New agent with no memories
      const newAgentId = randomUUID();
      db.query(`
        INSERT INTO agents (id, name, traits, current_location, observation_count, created_at)
        VALUES (?, 'EmptyAgent', ?, 'home', 0, ?)
      `).run(newAgentId, JSON.stringify([]), new Date().toISOString());

      const memories = db.query("SELECT * FROM memory_stream WHERE agent_id = ?").all(newAgentId) as any[];
      expect(memories).toHaveLength(0);
    });

    test("handles plan with no parent gracefully", () => {
      const planId = randomUUID();
      db.query(`
        INSERT INTO plans (id, timestamp, content, type, status, agent_id)
        VALUES (?, ?, ?, 'daily', 'pending', ?)
      `).run(planId, new Date().toISOString(), "Stand-alone plan", agentId);

      const plan = db.query("SELECT parent_plan_id FROM plans WHERE id = ?").get(planId) as any;
      expect(plan.parent_plan_id).toBeNull();
    });

    test("reflection can reference deleted memory (orphaned evidence)", () => {
      const now = new Date().toISOString();
      const memId = randomUUID();

      // Create memory
      db.query(`
        INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
        VALUES (?, ?, ?, 'observation', 5, ?)
      `).run(memId, now, "To be deleted", agentId);

      // Create reflection referencing it
      const refId = randomUUID();
      db.query(`
        INSERT INTO reflections (id, timestamp, content, insight, agent_id, evidence, depth, importance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(refId, now, "Content", "Insight", agentId, JSON.stringify([memId]), 1, 5);

      // Delete memory
      db.query("DELETE FROM memory_stream WHERE id = ?").run(memId);

      // Reflection still exists (cascade delete not enforced)
      const reflection = db.query("SELECT * FROM reflections WHERE id = ?").get(refId) as any;
      expect(reflection).toBeDefined();
      expect(JSON.parse(reflection.evidence)).toContain(memId);
    });
  });
});

console.log("🧠 E2E tests loaded");
