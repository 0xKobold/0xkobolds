/**
 * 🧠 Learning Extension Extension - Integration Tests
 *
 * Tests database persistence, memory operations, and reflection triggers
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs/promises";

const TEST_DB_DIR = path.join(os.tmpdir(), `generative-integration-${Date.now()}`);

// Ensure test directory exists
await fs.mkdir(TEST_DB_DIR, { recursive: true });

interface TestContext {
  db: Database;
  agentId: string;
  sessionId: string;
}

describe("🧠 Learning Extension Integration Tests", () => {
  const ctx: TestContext = { db: null as any, agentId: "", sessionId: "" };

  beforeEach(() => {
    const dbPath = path.join(TEST_DB_DIR, `test-${Date.now()}.db`);
    ctx.db = new Database(dbPath);
    ctx.db.exec("PRAGMA journal_mode = WAL;");
    ctx.agentId = randomUUID();
    ctx.sessionId = randomUUID();
    initSchema(ctx.db);
    seedAgent(ctx.db, ctx.agentId);
  });

  afterEach(() => {
    ctx.db?.close();
  });

  // ============================================================================
  // Helper Functions
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
      CREATE INDEX IF NOT EXISTS idx_memory_type ON memory_stream(type);
      CREATE INDEX IF NOT EXISTS idx_reflections_agent ON reflections(agent_id);
      CREATE INDEX IF NOT EXISTS idx_plans_agent ON plans(agent_id);
      CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
    `);
  }

  function seedAgent(db: Database, agentId: string) {
    db.query(`
      INSERT INTO agents (id, name, traits, current_location, observation_count, created_at)
      VALUES (?, 'TestAgent', ?, 'workspace', 0, ?)
    `).run(agentId, JSON.stringify(["test"]), new Date().toISOString());
  }

  function addObservation(db: Database, agentId: string, content: string, importance: number = 5) {
    const id = randomUUID();
    const now = new Date().toISOString();
    
    db.query(`
      INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
      VALUES (?, ?, ?, 'observation', ?, ?)
    `).run(id, now, content, importance, agentId);

    // Update observation count
    db.query("UPDATE agents SET observation_count = observation_count + 1 WHERE id = ?").run(agentId);
    
    return { id, timestamp: now };
  }

  // ============================================================================
  // Persistence Tests
  // ============================================================================

  describe("Persistence", () => {
    test("memory survives database close and reopen", () => {
      const content = "Important observation";
      addObservation(ctx.db, ctx.agentId, content, 9);
      
      // Close and reopen database
      const dbPath = ctx.db.filename;
      ctx.db.close();
      ctx.db = new Database(dbPath);
      
      const result = ctx.db.query("SELECT * FROM memory_stream WHERE agent_id = ?").all(ctx.agentId) as any[];
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(content);
    });

    test("WAL mode allows concurrent reads during writes", () => {
      // Verify WAL mode is active
      const journalMode = ctx.db.query("PRAGMA journal_mode").get() as any;
      expect(journalMode.journal_mode).toBe("wal");
    });

    test("bulk insert operations work efficiently", () => {
      const start = Date.now();
      
      ctx.db.transaction(() => {
        for (let i = 0; i < 100; i++) {
          addObservation(ctx.db, ctx.agentId, `Observation ${i}`, 5);
        }
      })();
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      
      const count = ctx.db.query(
        "SELECT COUNT(*) as count FROM memory_stream WHERE agent_id = ?"
      ).get(ctx.agentId) as { count: number };
      expect(count.count).toBe(100);
    });
  });

  // ============================================================================
  // Memory Stream Operations
  // ============================================================================

  describe("Memory Stream Operations", () => {
    test("can paginate through memory stream", () => {
      // Create 50 memories
      for (let i = 0; i < 50; i++) {
        addObservation(ctx.db, ctx.agentId, `Memory ${i}`, 5);
      }

      // Page 1 (items 0-9)
      const page1 = ctx.db.query(`
        SELECT content FROM memory_stream 
        WHERE agent_id = ? 
        ORDER BY timestamp DESC 
        LIMIT 10 OFFSET 0
      `).all(ctx.agentId) as any[];

      // Page 2 (items 10-19)
      const page2 = ctx.db.query(`
        SELECT content FROM memory_stream 
        WHERE agent_id = ? 
        ORDER BY timestamp DESC 
        LIMIT 10 OFFSET 10
      `).all(ctx.agentId) as any[];

      expect(page1).toHaveLength(10);
      expect(page2).toHaveLength(10);
      
      // Pages should have different content
      const page1Contents = page1.map(r => r.content);
      const page2Contents = page2.map(r => r.content);
      expect(page1Contents).not.toEqual(page2Contents);
    });

    test("can filter by type", () => {
      // Add different types
      const now = new Date().toISOString();
      
      ctx.db.query(`
        INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
        VALUES (?, ?, ?, 'observation', ?, ?)
      `).run(randomUUID(), now, "An observation", 5, ctx.agentId);

      ctx.db.query(`
        INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
        VALUES (?, ?, ?, 'thought', ?, ?)
      `).run(randomUUID(), now, "A thought", 5, ctx.agentId);

      ctx.db.query(`
        INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
        VALUES (?, ?, ?, 'action', ?, ?)
      `).run(randomUUID(), now, "An action", 5, ctx.agentId);

      const observations = ctx.db.query(
        "SELECT * FROM memory_stream WHERE agent_id = ? AND type = 'observation'"
      ).all(ctx.agentId) as any[];
      
      const thoughts = ctx.db.query(
        "SELECT * FROM memory_stream WHERE agent_id = ? AND type = 'thought'"
      ).all(ctx.agentId) as any[];

      expect(observations).toHaveLength(1);
      expect(observations[0].type).toBe("observation");
      expect(thoughts).toHaveLength(1);
      expect(thoughts[0].type).toBe("thought");
    });

    test("can filter by date range", () => {
      // Add memories at different times using relative timestamps
      ctx.db.query(`
        INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
        VALUES (?, datetime('now', '-2 days'), ?, 'observation', ?, ?)
      `).run(randomUUID(), "Old memory", 5, ctx.agentId);

      ctx.db.query(`
        INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
        VALUES (?, datetime('now', '-1 hour'), ?, 'observation', ?, ?)
      `).run(randomUUID(), "Recent memory", 5, ctx.agentId);

      const recent = ctx.db.query(`
        SELECT * FROM memory_stream 
        WHERE agent_id = ? AND timestamp > datetime('now', '-1 day')
      `).all(ctx.agentId) as any[];

      expect(recent).toHaveLength(1);
      expect(recent[0].content).toBe("Recent memory");
    });

    test("embedding blob storage and retrieval", () => {
      const embedding = new Float32Array(768);
      for (let i = 0; i < 768; i++) {
        embedding[i] = Math.random();
      }

      const id = randomUUID();
      const now = new Date().toISOString();

      ctx.db.query(`
        INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id, embedding)
        VALUES (?, ?, ?, 'observation', ?, ?, ?)
      `).run(id, now, "Embedded memory", 5, ctx.agentId, Buffer.from(embedding.buffer));

      const result = ctx.db.query(
        "SELECT embedding FROM memory_stream WHERE id = ?"
      ).get(id) as { embedding: Buffer };

      expect(result.embedding).toBeDefined();
      expect(result.embedding.length).toBe(768 * 4); // 4 bytes per float32
    });
  });

  // ============================================================================
  // Reflection Trigger Tests
  // ============================================================================

  describe("Reflection Triggers", () => {
    test("observation count increments correctly", () => {
      for (let i = 0; i < 5; i++) {
        addObservation(ctx.db, ctx.agentId, `Observation ${i}`, 5);
      }

      const result = ctx.db.query(
        "SELECT observation_count FROM agents WHERE id = ?"
      ).get(ctx.agentId) as { observation_count: number };

      expect(result.observation_count).toBe(5);
    });

    test("reflection can be generated from recent memories", () => {
      // Seed 10 observations
      const memoryIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        const { id } = addObservation(ctx.db, ctx.agentId, `Learned about ${i}`, 5);
        memoryIds.push(id);
      }

      // Generate a reflection
      const reflectionId = randomUUID();
      ctx.db.query(`
        INSERT INTO reflections (id, timestamp, content, insight, agent_id, evidence, depth, importance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reflectionId,
        new Date().toISOString(),
        "Agent consistently learns new concepts",
        "Learning pattern detected",
        ctx.agentId,
        JSON.stringify(memoryIds.slice(0, 3)),
        1,
        8
      );

      const result = ctx.db.query("SELECT * FROM reflections WHERE id = ?").get(reflectionId) as any;
      expect(result).toBeDefined();
      expect(JSON.parse(result.evidence)).toHaveLength(3);
    });

    test("higher-order reflection references lower-order reflections", () => {
      // Create first-order reflection
      const reflection1Id = randomUUID();
      ctx.db.query(`
        INSERT INTO reflections (id, timestamp, content, insight, agent_id, evidence, depth, importance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reflection1Id,
        new Date().toISOString(),
        "Content A",
        "Insight A",
        ctx.agentId,
        JSON.stringify(["mem-1"]),
        1,
        7
      );

      // Create second-order reflection referencing first
      const reflection2Id = randomUUID();
      ctx.db.query(`
        INSERT INTO reflections (id, timestamp, content, insight, agent_id, evidence, depth, importance)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        reflection2Id,
        new Date().toISOString(),
        "Meta insight",
        "Pattern of patterns",
        ctx.agentId,
        JSON.stringify([reflection1Id]),
        2,
        9
      );

      const result = ctx.db.query("SELECT * FROM reflections WHERE id = ?").get(reflection2Id) as any;
      expect(result.depth).toBe(2);
    });
  });

  // ============================================================================
  // Plan Hierarchy Tests
  // ============================================================================

  describe("Plan Hierarchy", () => {
    test("daily plan with action subplans", () => {
      // Create daily plan
      const dailyPlanId = randomUUID();
      const now = new Date().toISOString();

      ctx.db.query(`
        INSERT INTO plans (id, timestamp, content, type, status, agent_id)
        VALUES (?, ?, ?, 'daily', 'pending', ?)
      `).run(dailyPlanId, now, "Daily plan: Code, Review, Deploy", ctx.agentId);

      // Create action subplans
      const subPlanIds: string[] = [];
      const actions = [
        "Implement feature A",
        "Write tests",
        "Deploy to staging"
      ];

      for (const action of actions) {
        const actionId = randomUUID();
        ctx.db.query(`
          INSERT INTO plans (id, timestamp, content, type, status, agent_id, parent_plan_id)
          VALUES (?, ?, ?, 'action', 'pending', ?, ?)
        `).run(actionId, now, action, ctx.agentId, dailyPlanId);
        subPlanIds.push(actionId);
      }

      // Update parent with subplan IDs
      ctx.db.query("UPDATE plans SET sub_plan_ids = ? WHERE id = ?").run(
        JSON.stringify(subPlanIds),
        dailyPlanId
      );

      // Verify hierarchy
      const parent = ctx.db.query("SELECT * FROM plans WHERE id = ?").get(dailyPlanId) as any;
      expect(JSON.parse(parent.sub_plan_ids)).toHaveLength(3);

      const children = ctx.db.query(
        "SELECT * FROM plans WHERE parent_plan_id = ?"
      ).all(dailyPlanId) as any[];
      expect(children).toHaveLength(3);
    });

    test("plan status transitions", () => {
      const planId = randomUUID();
      const now = new Date().toISOString();

      ctx.db.query(`
        INSERT INTO plans (id, timestamp, content, type, status, agent_id)
        VALUES (?, ?, ?, 'action', 'pending', ?)
      `).run(planId, now, "Test plan", ctx.agentId);

      // Transition through statuses
      const statuses = ['in_progress', 'completed'];
      for (const status of statuses) {
        ctx.db.query("UPDATE plans SET status = ? WHERE id = ?").run(status, planId);
        const result = ctx.db.query("SELECT status FROM plans WHERE id = ?").get(planId) as any;
        expect(result.status).toBe(status);
      }
    });

    test("can query all pending plans for agent", () => {
      const now = new Date().toISOString();

      // Create mix of pending and completed
      const statuses = ['pending', 'pending', 'completed', 'in_progress', 'pending'];
      for (let i = 0; i < statuses.length; i++) {
        ctx.db.query(`
          INSERT INTO plans (id, timestamp, content, type, status, agent_id)
          VALUES (?, ?, ?, 'action', ?, ?)
        `).run(randomUUID(), now, `Plan ${i}`, statuses[i], ctx.agentId);
      }

      const pending = ctx.db.query(`
        SELECT * FROM plans 
        WHERE agent_id = ? AND status = 'pending'
      `).all(ctx.agentId) as any[];

      expect(pending).toHaveLength(3);
    });
  });

  // ============================================================================
  // Performance Tests
  // ============================================================================

  describe("Performance", () => {
    test("query with index is fast on large datasets", () => {
      // Seed 1000 memories
      ctx.db.transaction(() => {
        for (let i = 0; i < 1000; i++) {
          addObservation(ctx.db, ctx.agentId, `Memory ${i}`, Math.floor(Math.random() * 10) + 1);
        }
      })();

      const start = Date.now();
      
      // Query should use index
      const results = ctx.db.query(`
        SELECT * FROM memory_stream 
        WHERE agent_id = ? AND type = 'observation'
        ORDER BY timestamp DESC
        LIMIT 10
      `).all(ctx.agentId) as any[];

      const duration = Date.now() - start;
      
      expect(results).toHaveLength(10);
      expect(duration).toBeLessThan(100); // Should be very fast with index
    });

    test("EXPLAIN QUERY PLAN shows index usage", () => {
      const plan = ctx.db.query(`
        EXPLAIN QUERY PLAN 
        SELECT * FROM memory_stream 
        WHERE agent_id = ?
        ORDER BY timestamp DESC
      `).all(ctx.agentId) as any[];

      const planText = plan.map(p => p.detail).join(" ");
      // Should use index
      expect(planText).toMatch(/INDEX|SEARCH/);
    });
  });
});

console.log("🧠 Integration tests loaded");
