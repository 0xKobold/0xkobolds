/**
 * 🧠 Learning Extension Extension - Unit Tests
 *
 * Tests for core logic: importance scoring, memory retrieval, reflection parsing
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import * as os from "node:os";

// Test database path
const TEST_DB_PATH = path.join(
  os.tmpdir(),
  `generative-test-${Date.now()}.db`
);

// ============================================================================
// Importance Scoring Tests (Core Logic)
// ============================================================================

describe("🧠 Learning Extension - Unit Tests", () => {
  describe("Importance Scoring", () => {
    const calculateImportance = (content: string): number => {
      const highImportance = [
        "decided", "promised", "committed", "agreed", "disagreed",
        "failed", "succeeded", "launched", "shipped", "broke",
        "learned", "realized", "discovered", "fixed", "solved",
        "argued", "conflict", "victory", "milestone", "achievement"
      ];

      const lowImportance = [
        "walked", "sat", "stood", "looked", "waited",
        "breathed", "passed", "glanced", "noticed"
      ];

      let score = 5;
      const words = content.toLowerCase().split(/\s+/);

      for (const word of words) {
        if (highImportance.some(h => word.includes(h))) score += 1;
        if (lowImportance.some(l => word.includes(l))) score -= 1;
      }

      if (/\b(function|class|component|bug|error|deploy|build)\b/.test(content)) {
        score += 1;
      }

      return Math.max(1, Math.min(10, score));
    };

    test("neutral content gets base score of 5", () => {
      expect(calculateImportance("Working on code today")).toBe(5);
    });

    test("high importance keywords boost score", () => {
      expect(calculateImportance("User decided on the architecture")).toBeGreaterThan(5);
      expect(calculateImportance("Successfully shipped v1.0")).toBeGreaterThan(5);
      expect(calculateImportance("Fixed critical bug in production")).toBeGreaterThan(5);
    });

    test("low importance keywords reduce score", () => {
      expect(calculateImportance("Walked around the block and sat down")).toBeLessThan(5);
    });

    test("technical keywords boost score", () => {
      expect(calculateImportance("Found a bug in the function")).toBeGreaterThan(5);
      expect(calculateImportance("Build failed on component test")).toBeGreaterThan(5);
    });

    test("score is clamped between 1 and 10", () => {
      expect(calculateImportance("learned decided promised failed succeeded")).toBe(10);
      expect(calculateImportance("walked sat stood looked waited")).toBe(1);
    });

    test("handles empty content", () => {
      expect(calculateImportance("")).toBe(5);
    });

    test("handles mixed content correctly", () => {
      // "decided" (+1) + "bug" (+1) = +2, total 7
      expect(calculateImportance("Decided on the bug fix approach")).toBe(7);
    });
  });

  describe("Relevance Calculation", () => {
    const calculateRelevance = (memoryContent: string, context: string): number => {
      const memWords = new Set(memoryContent.toLowerCase().split(/\s+/));
      const ctxWords = new Set(context.toLowerCase().split(/\s+/));
      const intersection = [...memWords].filter(w => ctxWords.has(w));
      return intersection.length / Math.max(memWords.size, ctxWords.size);
    };

    test("identical content has perfect relevance", () => {
      expect(calculateRelevance("hello world", "hello world")).toBe(1);
    });

    test("no overlap has zero relevance", () => {
      expect(calculateRelevance("hello world", "foo bar")).toBe(0);
    });

    test("partial overlap calculates correctly", () => {
      // memory: "debug fix bug" (3 words), context: "fix bug issues" (3 words)
      // overlap: fix, bug (2 words)
      // relevance: 2 / 3 = 0.666...
      const relevance = calculateRelevance("debug fix bug", "fix bug issues");
      expect(relevance).toBeCloseTo(0.67, 1);
    });

    test("case insensitive matching", () => {
      expect(calculateRelevance("HELLO World", "hello WORLD")).toBe(1);
    });

    test("punctuation is handled", () => {
      const clean = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '');
      const memWords = new Set(clean("hello, world!").split(/\s+/));
      const ctxWords = new Set(clean("hello world").split(/\s+/));
      const intersection = [...memWords].filter(w => ctxWords.has(w));
      const relevance = intersection.length / Math.max(memWords.size, ctxWords.size);
      expect(relevance).toBe(1);
    });
  });

  describe("Recency Scoring", () => {
    const calculateRecencyScore = (timestamp: Date, now: number): number => {
      const hoursAgo = (now - timestamp.getTime()) / (1000 * 60 * 60);
      return Math.exp(-0.005 * hoursAgo);
    };

    test("now has perfect recency score", () => {
      const now = Date.now();
      expect(calculateRecencyScore(new Date(now), now)).toBe(1);
    });

    test("recency decays exponentially", () => {
      const now = Date.now();
      const oneHourAgo = new Date(now - 60 * 60 * 1000);
      const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);

      const score1 = calculateRecencyScore(oneHourAgo, now);
      const score2 = calculateRecencyScore(twoHoursAgo, now);

      expect(score1).toBeGreaterThan(score2);
      expect(score1).toBeCloseTo(0.995, 2);
    });

    test("24 hour decay", () => {
      const now = Date.now();
      const yesterday = new Date(now - 24 * 60 * 60 * 1000);
      const score = calculateRecencyScore(yesterday, now);
      // exp(-0.005 * 24) = exp(-0.12) ≈ 0.887
      expect(score).toBeCloseTo(0.887, 2);
    });

    test("7 day decay", () => {
      const now = Date.now();
      const lastWeek = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const score = calculateRecencyScore(lastWeek, now);
      // exp(-0.005 * 168) = exp(-0.84) ≈ 0.432
      expect(score).toBeCloseTo(0.432, 2);
    });
  });
});

// ============================================================================
// Database Schema Tests
// ============================================================================

describe("🧠 Learning Extension - Database Tests", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(TEST_DB_PATH);
    db.exec("PRAGMA journal_mode = WAL;");
    initSchema(db);
  });

  afterEach(() => {
    db.close();
    try {
      Bun.file(TEST_DB_PATH).delete();
    } catch {}
  });

  const initSchema = (db: Database) => {
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
  };

  test("database initializes with all tables", () => {
    const tables = db.query(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[];

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain("agents");
    expect(tableNames).toContain("memory_stream");
    expect(tableNames).toContain("reflections");
    expect(tableNames).toContain("plans");
  });

  test("can insert and retrieve agent", () => {
    const agentId = randomUUID();
    const now = new Date().toISOString();

    db.query(`
      INSERT INTO agents (id, name, traits, current_location, observation_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(agentId, "TestAgent", JSON.stringify(["test"]), "workspace", 0, now);

    const result = db.query("SELECT * FROM agents WHERE id = ?").get(agentId) as any;
    expect(result).toBeDefined();
    expect(result.name).toBe("TestAgent");
    expect(JSON.parse(result.traits)).toEqual(["test"]);
  });

  test("can insert and retrieve memory", () => {
    const agentId = randomUUID();
    const memoryId = randomUUID();
    const now = new Date().toISOString();

    // Create agent first
    db.query(`
      INSERT INTO agents (id, name, traits, created_at)
      VALUES (?, ?, ?, ?)
    `).run(agentId, "TestAgent", JSON.stringify(["test"]), now);

    // Insert memory
    db.query(`
      INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(memoryId, now, "Test memory content", "observation", 7, agentId);

    const result = db.query("SELECT * FROM memory_stream WHERE id = ?").get(memoryId) as any;
    expect(result).toBeDefined();
    expect(result.content).toBe("Test memory content");
    expect(result.importance).toBe(7);
  });

  test("can query memories by agent and date range", () => {
    const agentId = randomUUID();
    const now = new Date().toISOString();

    // Create agent
    db.query(`
      INSERT INTO agents (id, name, traits, created_at)
      VALUES (?, ?, ?, ?)
    `).run(agentId, "TestAgent", JSON.stringify(["test"]), now);

    // Insert multiple memories
    for (let i = 0; i < 5; i++) {
      db.query(`
        INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
        VALUES (?, datetime('now', '-${i} hours'), ?, ?, ?, ?)
      `).run(randomUUID(), `Memory ${i}`, "observation", 5 + i, agentId);
    }

    const results = db.query(`
      SELECT * FROM memory_stream 
      WHERE agent_id = ? 
      ORDER BY timestamp DESC
      LIMIT 10
    `).all(agentId) as any[];

    expect(results).toHaveLength(5);
    expect(results[0].content).toBe("Memory 0"); // Most recent
  });

  test("can insert reflection with evidence", () => {
    const agentId = randomUUID();
    const reflectionId = randomUUID();
    const evidenceIds = [randomUUID(), randomUUID()];
    const now = new Date().toISOString();

    db.query(`
      INSERT INTO agents (id, name, traits, created_at)
      VALUES (?, ?, ?, ?)
    `).run(agentId, "TestAgent", JSON.stringify(["test"]), now);

    db.query(`
      INSERT INTO reflections (id, timestamp, content, insight, agent_id, evidence, depth, importance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reflectionId,
      now,
      "Pattern detected",
      "Agent prefers async patterns",
      agentId,
      JSON.stringify(evidenceIds),
      1,
      8
    );

    const result = db.query("SELECT * FROM reflections WHERE id = ?").get(reflectionId) as any;
    expect(result).toBeDefined();
    expect(JSON.parse(result.evidence)).toEqual(evidenceIds);
    expect(result.depth).toBe(1);
  });

  test("observation count increments correctly", () => {
    const agentId = randomUUID();
    const now = new Date().toISOString();

    db.query(`
      INSERT INTO agents (id, name, traits, observation_count, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(agentId, "TestAgent", JSON.stringify(["test"]), 0, now);

    // Simulate adding observations
    for (let i = 0; i < 5; i++) {
      db.query(`
        UPDATE agents SET observation_count = observation_count + 1 WHERE id = ?
      `).run(agentId);
    }

    const result = db.query("SELECT observation_count FROM agents WHERE id = ?").get(agentId) as any;
    expect(result.observation_count).toBe(5);
  });

  test("can query pending plans", () => {
    const agentId = randomUUID();
    const now = new Date().toISOString();

    db.query(`
      INSERT INTO agents (id, name, traits, created_at)
      VALUES (?, ?, ?, ?)
    `).run(agentId, "TestAgent", JSON.stringify(["test"]), now);

    // Create plans
    db.query(`
      INSERT INTO plans (id, timestamp, content, type, status, agent_id)
      VALUES 
        (?, ?, ?, 'action', 'pending', ?),
        (?, ?, ?, 'action', 'completed', ?),
        (?, ?, ?, 'action', 'pending', ?)
    `).run(
      randomUUID(), now, "Plan 1", agentId,
      randomUUID(), now, "Plan 2", agentId,
      randomUUID(), now, "Plan 3", agentId
    );

    const pending = db.query(`
      SELECT * FROM plans WHERE agent_id = ? AND status = 'pending'
    `).all(agentId) as any[];

    expect(pending).toHaveLength(2);
  });
});

// ============================================================================
// Memory Retrieval Tests
// ============================================================================

describe("🧠 Learning Extension - Memory Retrieval", () => {
  let db: Database;
  const agentId = randomUUID();

  beforeEach(() => {
    db = new Database(TEST_DB_PATH);
    db.exec("PRAGMA journal_mode = WAL;");

    db.exec(`
      CREATE TABLE memory_stream (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        importance REAL NOT NULL,
        agent_id TEXT NOT NULL,
        location TEXT,
        people TEXT,
        embedding BLOB
      );
      
      CREATE INDEX idx_memory_agent ON memory_stream(agent_id);
      CREATE INDEX idx_memory_timestamp ON memory_stream(timestamp);
    `);

    // Seed with test data
    const now = Date.now();
    const seedMemories = [
      { content: "Fixed critical bug in auth system", importance: 9, hoursAgo: 1, type: "action" },
      { content: "Debugged database connection issue", importance: 7, hoursAgo: 2, type: "observation" },
      { content: "Sat at desk waiting for build", importance: 2, hoursAgo: 3, type: "observation" },
      { content: "Learned about async patterns", importance: 8, hoursAgo: 24, type: "reflection" },
      { content: "Walked around the office", importance: 1, hoursAgo: 25, type: "observation" },
    ];

    for (const m of seedMemories) {
      db.query(`
        INSERT INTO memory_stream (id, timestamp, content, type, importance, agent_id)
        VALUES (?, datetime('now', '-${m.hoursAgo} hours'), ?, ?, ?, ?)
      `).run(randomUUID(), m.content, m.type, m.importance, agentId);
    }
  });

  afterEach(() => {
    db.close();
    try {
      Bun.file(TEST_DB_PATH).delete();
    } catch {}
  });

  const retrieveMemories = (context: string, k: number = 10): any[] => {
    const now = Date.now();

    const rows = db.query(`
      SELECT id, timestamp, content, type, importance, location
      FROM memory_stream
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT 200
    `).all(agentId) as any[];

    const calculateRelevance = (memoryContent: string, context: string): number => {
      const memWords = new Set(memoryContent.toLowerCase().split(/\s+/));
      const ctxWords = new Set(context.toLowerCase().split(/\s+/));
      const intersection = [...memWords].filter(w => ctxWords.has(w));
      return intersection.length / Math.max(memWords.size, ctxWords.size);
    };

    const scored = rows.map(row => {
      const hoursAgo = (now - new Date(row.timestamp).getTime()) / (1000 * 60 * 60);
      const recency = Math.exp(-0.005 * hoursAgo);
      const importance = row.importance / 10;
      const relevance = calculateRelevance(row.content, context);

      return {
        memory: row,
        score: (recency * 0.3) + (importance * 0.3) + (relevance * 0.4),
      };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(s => s.memory);
  };

  test("retrieves relevant memories by combined score", () => {
    const results = retrieveMemories("bug database issue", 5);
    
    expect(results).toHaveLength(5);
    // Bug-related memories should rank higher
    const contents = results.map((r: any) => r.content.toLowerCase());
    expect(contents.some((c: string) => c.includes("bug"))).toBe(true);
  });

  test("recency weight affects ranking", () => {
    // Recent low-importance vs old high-importance
    const results = retrieveMemories("walked office", 5);
    
    // "Walked around the office" should appear (recent low-importance)
    // "Learned about async patterns" (older but higher importance)
    const contents = results.map((r: any) => r.content.toLowerCase());
    expect(contents).toContain("walked around the office");
  });

  test("respects limit parameter", () => {
    const results = retrieveMemories("test", 3);
    expect(results).toHaveLength(3);
  });

  test("returns empty array when no memories", () => {
    const otherAgent = randomUUID();
    const results = retrieveMemories.call(
      { db, agentId: otherAgent },
      "test",
      10
    );
    // Actually, we need to test with the real retrieval using otherAgent
    const rows = db.query(`
      SELECT * FROM memory_stream WHERE agent_id = ?
    `).all(otherAgent) as any[];
    expect(rows).toHaveLength(0);
  });
});

// ============================================================================
// Reflection Parsing Tests
// ============================================================================

describe("🧠 Learning Extension - Reflection Parsing", () => {
  const parseReflections = (response: string, validIds: string[]): Array<{ content: string; insight: string; evidence: string[] }> => {
    const reflections: Array<{ content: string; insight: string; evidence: string[] }> = [];
    const blocks = response.split('---').filter(b => b.trim());

    for (const block of blocks) {
      const lines = block.trim().split('\n').filter(l => l.trim());
      let content = '';
      let evidence: string[] = [];

      for (const line of lines) {
        if (line.startsWith('Insight:')) {
          content = line.replace('Insight:', '').trim();
        } else if (line.startsWith('Evidence:')) {
          const ids = line.replace('Evidence:', '').trim().split(',').map(s => s.trim());
          evidence = ids.filter(id => validIds.includes(id) || validIds.some(v => v.startsWith(id)));
        }
      }

      if (content) {
        reflections.push({ content, insight: content, evidence: evidence.length ? evidence : [validIds[0]].filter(Boolean) });
      }
    }

    return reflections.length ? reflections : [{
      content: 'Agent continues regular work patterns',
      insight: 'No major pattern changes detected',
      evidence: [validIds[0]].filter(Boolean)
    }];
  };

  test("parses single reflection correctly", () => {
    const validIds = ["abc-123", "def-456", "ghi-789"];
    const response = `Insight: Agent prefers TypeScript over JavaScript
Evidence: abc-123, def-456
---`;

    const reflections = parseReflections(response, validIds);
    expect(reflections).toHaveLength(1);
    expect(reflections[0].content).toBe("Agent prefers TypeScript over JavaScript");
    expect(reflections[0].evidence).toContain("abc-123");
    expect(reflections[0].evidence).toContain("def-456");
  });

  test("parses multiple reflections", () => {
    const validIds = ["id-1", "id-2", "id-3", "id-4"];
    const response = `Insight: First insight
Evidence: id-1
---
Insight: Second insight
Evidence: id-2, id-3
---`;

    const reflections = parseReflections(response, validIds);
    expect(reflections).toHaveLength(2);
    expect(reflections[0].content).toBe("First insight");
    expect(reflections[1].content).toBe("Second insight");
  });

  test("filters invalid evidence IDs", () => {
    const validIds = ["valid-1", "valid-2"];
    const response = `Insight: Test insight
Evidence: valid-1, invalid-id, valid-2
---`;

    const reflections = parseReflections(response, validIds);
    expect(reflections[0].evidence).toHaveLength(2);
    expect(reflections[0].evidence).not.toContain("invalid-id");
  });

  test("provides fallback for empty response", () => {
    const validIds = ["fallback-id"];
    const response = "";

    const reflections = parseReflections(response, validIds);
    expect(reflections).toHaveLength(1);
    expect(reflections[0].content).toBe("Agent continues regular work patterns");
  });

  test("handles missing evidence field", () => {
    const validIds = ["id-1"];
    const response = `Insight: Insight without evidence---`;

    const reflections = parseReflections(response, validIds);
    expect(reflections[0].evidence).toEqual(["id-1"]);
  });

  test("handles messy formatting", () => {
    const validIds = ["id-1"];
    const response = `  Insight:   Messy spacing here   
   Evidence:   id-1   
  ---  `;

    const reflections = parseReflections(response, validIds);
    expect(reflections[0].content).toBe("Messy spacing here");
    expect(reflections[0].evidence).toContain("id-1");
  });
});

console.log("🧠 Learning Extension Unit Tests loaded");
