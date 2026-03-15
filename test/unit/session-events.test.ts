/**
 * Session Events Tests
 *
 * Tests for the consolidated session_events table.
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

// Import the functions we need
const TEST_DB = join(tmpdir(), `session-events-test-${Date.now()}.db`);

function createTestSchema(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_key TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      agent_id TEXT,
      updated_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      message_count INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS session_events (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      importance INTEGER DEFAULT 5,
      agent_id TEXT,
      location TEXT,
      people TEXT,
      embedding BLOB,
      metadata TEXT
    )
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_events_session ON session_events(session_id)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON session_events(timestamp)`);
}

interface SessionEvent {
  id: string;
  sessionId: string;
  timestamp: number;
  type: "observation" | "thought" | "action" | "reflection";
  content: string;
  importance: number;
  agentId?: string;
  location?: string;
  people?: string[];
  embedding?: number[];
  metadata?: Record<string, unknown>;
}

function addEvent(db: Database, event: Omit<SessionEvent, "id" | "timestamp">): SessionEvent {
  const id = randomUUID();
  const timestamp = Date.now();

  db.run(`
    INSERT INTO session_events (
      id, session_id, timestamp, type, content, importance,
      agent_id, location, people, embedding, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id,
    event.sessionId,
    timestamp,
    event.type,
    event.content,
    event.importance,
    event.agentId ?? null,
    event.location ?? null,
    event.people ? JSON.stringify(event.people) : null,
    event.embedding ? Buffer.from(new Float32Array(event.embedding).buffer) : null,
    event.metadata ? JSON.stringify(event.metadata) : null,
  ]);

  return { id, timestamp, ...event };
}

function getEvents(db: Database, sessionId: string, options?: {
  type?: SessionEvent["type"];
  minImportance?: number;
  limit?: number;
}): SessionEvent[] {
  let sql = "SELECT * FROM session_events WHERE session_id = ?";
  const params: (string | number)[] = [sessionId];

  if (options?.type) {
    sql += " AND type = ?";
    params.push(options.type);
  }

  if (options?.minImportance) {
    sql += " AND importance >= ?";
    params.push(options.minImportance);
  }

  sql += " ORDER BY timestamp DESC";

  if (options?.limit) {
    sql += " LIMIT ?";
    params.push(options.limit);
  }

  const rows = db.query(sql).all(...params) as Record<string, unknown>[];
  return rows.map(row => ({
    id: row.id as string,
    sessionId: row.session_id as string,
    timestamp: row.timestamp as number,
    type: row.type as SessionEvent["type"],
    content: row.content as string,
    importance: row.importance as number,
    agentId: row.agent_id as string | undefined,
    location: row.location as string | undefined,
    people: row.people ? JSON.parse(row.people as string) : undefined,
    metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
  }));
}

describe("Session Events", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(TEST_DB);
    createTestSchema(db);
  });

  afterEach(() => {
    db.close();
    // Cleanup
    try {
      require("fs").unlinkSync(TEST_DB);
    } catch {}
  });

  describe("Event Storage", () => {
    test("adds observation event", () => {
      const event = addEvent(db, {
        sessionId: "test-session",
        type: "observation",
        content: "User asked about the weather",
        importance: 5,
      });

      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.type).toBe("observation");
    });

    test("stores event with embedding", async () => {
    const embedding = new Array(768).fill(0).map(() => Math.random());
      const event = addEvent(db, {
        sessionId: "test-session",
        type: "thought",
        content: "Considering response options",
        importance: 7,
        embedding,
      });

      // Small delay to ensure write completes
      await new Promise(r => setTimeout(r, 10));

      const rows = db.query("SELECT * FROM session_events WHERE session_id = ?").all("test-session") as Record<string, unknown>[];
      expect(rows.length).toBe(1);
      
      // Embedding stored as blob
      expect(rows[0].embedding).toBeDefined();
    });

    test("stores event with people array", () => {
      const event = addEvent(db, {
        sessionId: "test-session",
        type: "observation",
        content: "Meeting with Alice and Bob",
        importance: 6,
        people: ["Alice", "Bob"],
      });

      const retrieved = getEvents(db, "test-session")[0];
      expect(retrieved.people).toEqual(["Alice", "Bob"]);
    });
  });

  describe("Event Retrieval", () => {
    beforeEach(async () => {
      // Add multiple events with small delays for timestamp ordering
      addEvent(db, { sessionId: "s1", type: "observation", content: "First", importance: 5 });
      await new Promise(r => setTimeout(r, 5));
      addEvent(db, { sessionId: "s1", type: "thought", content: "Second", importance: 7 });
      await new Promise(r => setTimeout(r, 5));
      addEvent(db, { sessionId: "s1", type: "action", content: "Third", importance: 3 });
      addEvent(db, { sessionId: "s2", type: "observation", content: "Other session", importance: 8 });
    }, 100); // Increase timeout

    test("retrieves all events for session", () => {
      const events = getEvents(db, "s1");
      expect(events.length).toBe(3);
    });

    test("filters by type", () => {
      const observations = getEvents(db, "s1", { type: "observation" });
      expect(observations.length).toBe(1);
      expect(observations[0].type).toBe("observation");
    });

    test("filters by minimum importance", () => {
      const important = getEvents(db, "s1", { minImportance: 6 });
      expect(important.length).toBe(1);
      expect(important[0].importance).toBe(7);
    });

    test("respects limit", () => {
      const limited = getEvents(db, "s1", { limit: 2 });
      expect(limited.length).toBe(2);
    });

    test("orders by timestamp descending", () => {
      const events = getEvents(db, "s1");
      expect(events[0].content).toBe("Third"); // Most recent
      expect(events[2].content).toBe("First"); // Oldest
    });
  });

  describe("Event Types", () => {
    test("supports all four types", () => {
      const types: SessionEvent["type"][] = ["observation", "thought", "action", "reflection"];

      for (const type of types) {
        const event = addEvent(db, {
          sessionId: "test",
          type,
          content: `${type} event`,
          importance: 5,
        });
        expect(event.type).toBe(type);
      }

      const events = getEvents(db, "test");
      expect(events.length).toBe(4);
    });
  });
});