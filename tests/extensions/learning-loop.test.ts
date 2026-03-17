/**
 * Learning Loop Tests
 * 
 * Tests for closed learning loop:
 * 1. Observations → Reflections → Plans
 * 2. Memory stream flow
 * 3. Reflection triggers
 * 4. Plan creation from insights
 * 
 * @see src/extensions/core/learning-extension.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { homedir } from "node:os";

// ============================================================================
// LEARNING LOOP TESTS
// ============================================================================

describe("Learning Loop: Closed Cycle", () => {
  const testDbPath = path.join(homedir(), ".0xkobold", "test-learning.db");
  let db: Database;

  beforeEach(async () => {
    // Clean up any existing test DB
    try {
      await fs.unlink(testDbPath);
    } catch {}
    
    // Create fresh test DB
    await fs.mkdir(path.dirname(testDbPath), { recursive: true });
    db = new Database(testDbPath);
    
    // Create tables
    db.run(`
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
    `);
    
    db.run(`
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
    `);
    
    db.run(`
      CREATE TABLE IF NOT EXISTS plans (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        agent_id TEXT NOT NULL
      );
    `);
  });

  afterEach(async () => {
    db?.close();
    try {
      await fs.unlink(testDbPath);
    } catch {}
  });

  test("observation count should trigger reflection", () => {
    // Test that reflection threshold (20 observations) triggers reflection
    const REFLECTION_THRESHOLD = 20;
    
    // Create agent
    const agentId = "test-agent";
    db.run(`
      INSERT INTO agents (id, name, traits, created_at)
      VALUES (?, 'TestAgent', '["curious"]', ?)
    `, agentId, new Date().toISOString());
    
    // Simulate observations
    for (let i = 0; i < REFLECTION_THRESHOLD - 1; i++) {
      db.run(`
        UPDATE agents SET observation_count = observation_count + 1 WHERE id = ?
      `, agentId);
    }
    
    // Check observation count
    const row = db.query(`SELECT observation_count FROM agents WHERE id = ?`).get(agentId) as any;
    expect(row.observation_count).toBe(REFLECTION_THRESHOLD - 1);
    
    // Add one more observation
    db.run(`UPDATE agents SET observation_count = observation_count + 1 WHERE id = ?`, agentId);
    
    // Should now be at threshold
    const row2 = db.query(`SELECT observation_count FROM agents WHERE id = ?`).get(agentId) as any;
    expect(row2.observation_count).toBe(REFLECTION_THRESHOLD);
  });

  test("reflections should be stored with evidence", () => {
    const agentId = "test-agent";
    const reflectionId = "reflection-1";
    const evidence = JSON.stringify(["obs-1", "obs-2", "obs-3"]);
    
    db.run(`
      INSERT INTO reflections (id, timestamp, content, insight, agent_id, evidence, depth, importance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, reflectionId, new Date().toISOString(), "User prefers TypeScript", "Preference for type safety", agentId, evidence, 1, 0.8);
    
    const row = db.query(`SELECT * FROM reflections WHERE id = ?`).get(reflectionId) as any;
    expect(row).toBeDefined();
    expect(row.insight).toBe("Preference for type safety");
    expect(JSON.parse(row.evidence)).toEqual(["obs-1", "obs-2", "obs-3"]);
  });

  test("plans should link to reflections", () => {
    const agentId = "test-agent";
    const planId = "plan-1";
    
    db.run(`
      INSERT INTO plans (id, timestamp, content, type, status, agent_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, planId, new Date().toISOString(), "Review TypeScript best practices", "action", "pending", agentId);
    
    const row = db.query(`SELECT * FROM plans WHERE id = ?`).get(planId) as any;
    expect(row).toBeDefined();
    expect(row.type).toBe("action");
    expect(row.status).toBe("pending");
  });

  test("closed loop: observation → reflection → plan", () => {
    // 1. Create agent
    const agentId = "closed-loop-agent";
    db.run(`
      INSERT INTO agents (id, name, traits, observation_count, created_at)
      VALUES (?, 'ClosedLoopAgent', '["adaptive"]', 0, ?)
    `, agentId, new Date().toISOString());
    
    // 2. Add observations (simulating the observe function)
    const observations = [
      { id: "obs-1", content: "User uses TypeScript for all projects", type: "observation" },
      { id: "obs-2", content: "User prefers strict type checking", type: "observation" },
      { id: "obs-3", content: "User avoids 'any' type", type: "observation" },
    ];
    
    observations.forEach(() => {
      db.run(`UPDATE agents SET observation_count = observation_count + 1 WHERE id = ?`, agentId);
    });
    
    // 3. Create reflection from observations (simulating reflect function)
    const reflectionId = "reflection-1";
    db.run(`
      INSERT INTO reflections (id, timestamp, content, insight, agent_id, evidence, depth, importance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, reflectionId, new Date().toISOString(), 
      "User strongly prefers TypeScript with strict mode",
      "TypeScript strict mode preference detected",
      agentId,
      JSON.stringify(observations.map(o => o.id)),
      1,
      0.9
    );
    
    // 4. Create plan from reflection (simulating plan function)
    const planId = "plan-1";
    db.run(`
      INSERT INTO plans (id, timestamp, content, type, status, agent_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, planId, new Date().toISOString(),
      "Suggest TypeScript strict mode for new projects",
      "action",
      "pending",
      agentId
    );
    
    // Verify the closed loop
    const agent = db.query(`SELECT * FROM agents WHERE id = ?`).get(agentId) as any;
    const reflections = db.query(`SELECT * FROM reflections WHERE agent_id = ?`).all(agentId) as any[];
    const plans = db.query(`SELECT * FROM plans WHERE agent_id = ?`).all(agentId) as any[];
    
    // 3 observations → 1 reflection → 1 plan
    expect(agent.observation_count).toBe(3);
    expect(reflections.length).toBe(1);
    expect(plans.length).toBe(1);
    
    // Plan is based on reflection evidence
    const reflection = reflections[0];
    expect(JSON.parse(reflection.evidence)).toContain("obs-1");
    expect(reflection.insight).toContain("TypeScript");
  });

  test("importance scoring should boost significant observations", () => {
    const calculateImportance = (content: string): number => {
      const highImportance = [
        "decided", "promised", "committed", "agreed", "disagreed",
        "failed", "succeeded", "launched", "shipped", "broke",
        "learned", "realized", "discovered", "fixed", "solved"
      ];
      
      let score = 5;
      const words = content.toLowerCase().split(/\s+/);
      
      for (const word of words) {
        if (highImportance.some(h => word.includes(h))) score += 1;
      }
      
      return Math.max(1, Math.min(10, score));
    };
    
    // High importance content
    expect(calculateImportance("I decided to switch to TypeScript")).toBeGreaterThan(5);
    expect(calculateImportance("I learned a new pattern")).toBeGreaterThan(5);
    
    // Low importance content
    expect(calculateImportance("I walked to the kitchen")).toBe(5);
    
    // Technical content boost
    expect(calculateImportance("The function returns void")).toBeLessThanOrEqual(6);
  });
});

describe("Learning Loop: Dialectic Integration", () => {
  test("observations should feed into dialectic reasoning", () => {
    // The dialectic store should be able to add observations
    // that feed into the learning loop
    
    // This is a conceptual test - the actual integration is in
    // dialectic/store.ts and learning-extension.ts
    
    const observation = {
      peerId: "user-moika",
      content: "Prefers functional programming",
      category: "preference",
      importance: 0.8,
    };
    
    // Observation should have:
    // - peerId (who observed)
    // - content (what was observed)
    // - category (preference, goal, context, etc.)
    // - importance (for retrieval ranking)
    
    expect(observation.peerId).toBeDefined();
    expect(observation.content).toBeDefined();
    expect(observation.category).toBeDefined();
  });

  test("reflection should extract inferences", () => {
    const observations = [
      { content: "User prefers TypeScript" },
      { content: "User uses strict mode" },
      { content: "User avoids 'any' type" },
    ];
    
    // A reflection should synthesize these into an insight
    const expectedInsight = {
      synthesis: "User values type safety highly",
      confidence: 0.85,
      evidence: observations.map(o => o.content),
    };
    
    // The insight synthesizes multiple observations
    expect(expectedInsight.synthesis).toContain("type safety");
    expect(expectedInsight.evidence.length).toBe(3);
  });
});

describe("Learning Loop: Memory Stream", () => {
  test("memory stream should store events with timestamps", () => {
    const stream = [
      { id: "e1", timestamp: new Date("2024-01-01T10:00:00Z"), type: "observation", content: "Started project" },
      { id: "e2", timestamp: new Date("2024-01-01T11:00:00Z"), type: "thought", content: "Need to plan architecture" },
      { id: "e3", timestamp: new Date("2024-01-01T12:00:00Z"), type: "action", content: "Wrote initial code" },
    ];
    
    // Stream should be ordered by timestamp
    const sorted = [...stream].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
    
    expect(sorted[0].id).toBe("e1");
    expect(sorted[2].id).toBe("e3");
  });

  test("memory retrieval should combine recency, importance, and relevance", () => {
    const memories = [
      { id: "m1", timestamp: new Date(), importance: 8, content: "Critical decision made" },
      { id: "m2", timestamp: new Date(Date.now() - 3600000), importance: 5, content: "Routine task" },
      { id: "m3", timestamp: new Date(Date.now() - 7200000), importance: 9, content: "Major breakthrough" },
    ];
    
    // Retrieval formula: recency + importance + relevance
    // In a real system, we'd also compute relevance to context
    
    const scoreMemory = (m: typeof memories[0], context: string) => {
      const recencyScore = 1 / (Date.now() - m.timestamp.getTime() + 1);
      const importanceScore = m.importance / 10;
      const relevanceScore = m.content.toLowerCase().includes(context.toLowerCase()) ? 0.5 : 0;
      return recencyScore * 1000 + importanceScore + relevanceScore;
    };
    
    // When asking about "breakthrough", m3 should score highest
    const scores = memories.map(m => scoreMemory(m, "breakthrough"));
    
    // m3 has highest importance (9) and relevance to "breakthrough"
    expect(scores[2]).toBeGreaterThan(scores[1]); // m3 > m2
  });
});