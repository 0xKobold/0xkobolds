import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Import dialectic module
import { DialecticStore } from "../../src/memory/dialectic/store";
import type { Peer, Observation } from "../../src/memory/dialectic/types";

// Full schema matching store.ts
const TEST_SCHEMA = `
  CREATE TABLE IF NOT EXISTS _metadata (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  INSERT OR REPLACE INTO _metadata VALUES ('schema_version', '1');
  
  CREATE TABLE IF NOT EXISTS peers (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    metadata TEXT,
    created_at TEXT NOT NULL,
    last_updated TEXT NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    session_id TEXT,
    project_id TEXT,
    FOREIGN KEY (peer_id) REFERENCES peers(id)
  );
  
  CREATE TABLE IF NOT EXISTS contradictions (
    id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    observation_a TEXT NOT NULL,
    observation_b TEXT NOT NULL,
    resolution TEXT NOT NULL,
    resolution_note TEXT,
    confidence REAL DEFAULT 0.5,
    detected_at TEXT NOT NULL,
    resolved_at TEXT
  );
  
  CREATE TABLE IF NOT EXISTS syntheses (
    id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    content TEXT NOT NULL,
    derived_from TEXT NOT NULL,
    resolved_contradictions TEXT,
    confidence REAL DEFAULT 0.5,
    timestamp TEXT NOT NULL,
    superseded_by TEXT
  );
  
  CREATE TABLE IF NOT EXISTS inferred_preferences (
    id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    preference TEXT NOT NULL,
    evidence TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    last_updated TEXT NOT NULL,
    contradicted BOOLEAN DEFAULT FALSE,
    contradicted_by TEXT
  );
  
  CREATE TABLE IF NOT EXISTS inferred_goals (
    id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    priority TEXT NOT NULL,
    evidence TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    first_observed TEXT NOT NULL,
    last_updated TEXT NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS inferred_constraints (
    id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL,
    evidence TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    last_updated TEXT NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS inferred_values (
    id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    value TEXT NOT NULL,
    context TEXT,
    evidence TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    last_updated TEXT NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS nudges (
    id TEXT PRIMARY KEY,
    trigger_type TEXT NOT NULL,
    trigger_data TEXT NOT NULL,
    question TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_data TEXT NOT NULL,
    priority TEXT NOT NULL,
    created_at TEXT NOT NULL,
    run_at TEXT,
    completed_at TEXT,
    result TEXT
  );
  
  CREATE INDEX IF NOT EXISTS idx_peers_type ON peers(type);
  CREATE INDEX IF NOT EXISTS idx_peers_name ON peers(name);
  CREATE INDEX IF NOT EXISTS idx_observations_peer ON observations(peer_id);
  CREATE INDEX IF NOT EXISTS idx_nudges_pending ON nudges(completed_at);
`;

describe("Dialectic Memory Tests", () => {
  let db: Database;
  let store: DialecticStore;
  let dbPath: string;

  beforeEach(() => {
    // Create temp database with full schema
    dbPath = path.join(os.tmpdir(), `dialectic-test-${Date.now()}.db`);
    db = new Database(dbPath);
    db.exec(TEST_SCHEMA);
    store = new DialecticStore(db);
  });

  afterEach(() => {
    db.close();
    try {
      fs.unlinkSync(dbPath);
    } catch {}
  });

  describe("Database Schema", () => {
    test("initializes all tables", () => {
      const tables = db.query<{ name: string }>(`SELECT name FROM sqlite_master WHERE type = 'table'`).all();
      const tableNames = tables.map(t => t.name);
      
      expect(tableNames).toContain("peers");
      expect(tableNames).toContain("observations");
      expect(tableNames).toContain("contradictions");
      expect(tableNames).toContain("syntheses");
      expect(tableNames).toContain("inferred_preferences");
      expect(tableNames).toContain("inferred_goals");
      expect(tableNames).toContain("inferred_constraints");
      expect(tableNames).toContain("inferred_values");
      expect(tableNames).toContain("nudges");
    });
  });

  describe("Peer Management", () => {
    test("creates a user peer", () => {
      const peer = store.createPeer("user", "test-user");
      
      expect(peer.type).toBe("user");
      expect(peer.name).toBe("test-user");
      expect(peer.id).toBeDefined();
    });

    test("creates an agent peer", () => {
      const peer = store.createPeer("agent", "claude");
      
      expect(peer.type).toBe("agent");
      expect(peer.name).toBe("claude");
    });

    test("gets peer by name", () => {
      store.createPeer("user", "alice");
      const found = store.getPeerByName("alice");
      
      expect(found).toBeDefined();
      expect(found?.name).toBe("alice");
    });

    test("returns undefined for non-existent peer", () => {
      const found = store.getPeerByName("nonexistent");
      expect(found).toBeUndefined();
    });

    test("gets peer by name and type", () => {
      store.createPeer("user", "bob");
      store.createPeer("agent", "bob");
      
      const userBob = store.getPeerByName("bob", "user");
      const agentBob = store.getPeerByName("bob", "agent");
      
      expect(userBob?.type).toBe("user");
      expect(agentBob?.type).toBe("agent");
    });
  });

  describe("Observations", () => {
    test("adds an observation", () => {
      const peer = store.createPeer("user", "observer");
      const obs = store.addObservation(
        peer.id,
        "User prefers TypeScript",
        "preference",
        "statement",
        "msg-123"
      );
      
      expect(obs.content).toBe("User prefers TypeScript");
      expect(obs.category).toBe("preference");
      expect(obs.peerId).toBe(peer.id);
    });

    test("retrieves observations for a peer", () => {
      const peer = store.createPeer("user", "multi-obs");
      store.addObservation(peer.id, "obs1", "behavior", "message", "msg-1");
      store.addObservation(peer.id, "obs2", "statement", "message", "msg-2");
      
      const observations = store.getObservations(peer.id);
      expect(observations.length).toBe(2);
    });

    test("returns empty array for peer with no observations", () => {
      const peer = store.createPeer("user", "empty");
      const observations = store.getObservations(peer.id);
      expect(observations.length).toBe(0);
    });
  });

  describe("Contradictions", () => {
    test("adds a contradiction", () => {
      const peer = store.createPeer("user", "contradict");
      const obs1 = store.addObservation(peer.id, "I like Python", "preference", "message", "m1");
      const obs2 = store.addObservation(peer.id, "I hate Python", "preference", "message", "m2");
      
      const contradiction = store.addContradiction(
        peer.id,
        obs1.id,
        obs2.id,
        "newer_wins"
      );
      
      expect(contradiction.peerId).toBe(peer.id);
      expect(contradiction.observationA).toBe(obs1.id);
      expect(contradiction.observationB).toBe(obs2.id);
    });

    test("retrieves contradictions for a peer", () => {
      const peer = store.createPeer("user", "multi-contra");
      const obs1 = store.addObservation(peer.id, "A", "preference", "message", "m1");
      const obs2 = store.addObservation(peer.id, "B", "preference", "message", "m2");
      
      store.addContradiction(peer.id, obs1.id, obs2.id, "unknown");
      
      const contradictions = store.getUnresolvedContradictions(peer.id);
      expect(contradictions.length).toBe(1);
    });
  });

  describe("Syntheses", () => {
    test("adds a synthesis", () => {
      const peer = store.createPeer("user", "synth");
      const synthesis = store.addSynthesis(
        peer.id,
        "The user's preference changed over time",
        ["obs-1", "obs-2"]
      );
      
      expect(synthesis.peerId).toBe(peer.id);
      expect(synthesis.content).toBe("The user's preference changed over time");
    });

    test("retrieves syntheses for a peer", () => {
      const peer = store.createPeer("user", "multi-synth");
      store.addSynthesis(peer.id, "synthesis 1", []);
      store.addSynthesis(peer.id, "synthesis 2", []);
      
      const syntheses = store.getSyntheses(peer.id);
      expect(syntheses.length).toBe(2);
    });
  });

  describe("Inferred Preferences", () => {
    test("adds an inferred preference", () => {
      const peer = store.createPeer("user", "pref-user");
      const pref = store.addPreference(
        peer.id,
        "language",
        "TypeScript over Python",
        ["obs-1"],
        0.8
      );
      
      expect(pref.topic).toBe("language");
      expect(pref.preference).toBe("TypeScript over Python");
      expect(pref.confidence).toBe(0.8);
    });

    test("retrieves preferences for a peer", () => {
      const peer = store.createPeer("user", "multi-pref");
      store.addPreference(peer.id, "editor", "VSCode", [], 0.9);
      store.addPreference(peer.id, "theme", "dark", [], 0.85);
      
      const prefs = store.getPreferences(peer.id);
      expect(prefs.length).toBe(2);
    });
  });

  describe("Inferred Goals", () => {
    test("adds an inferred goal", () => {
      const peer = store.createPeer("user", "goal-user");
      const goal = store.addGoal(
        peer.id,
        "Build a memory system",
        "active",
        "high",
        ["obs-1"],
        0.95
      );
      
      expect(goal.description).toBe("Build a memory system");
      expect(goal.status).toBe("active");
      expect(goal.priority).toBe("high");
    });

    test("retrieves goals for a peer", () => {
      const peer = store.createPeer("user", "multi-goal");
      store.addGoal(peer.id, "Goal 1", "active", "high", [], 0.8);
      store.addGoal(peer.id, "Goal 2", "completed", "medium", [], 0.6);
      
      const goals = store.getGoals(peer.id);
      expect(goals.length).toBe(2);
    });
  });

  describe("Stats", () => {
    test("returns correct statistics", () => {
      const peer = store.createPeer("user", "stats");
      store.addObservation(peer.id, "obs", "behavior", "message", "m1");
      store.addPreference(peer.id, "test", "test pref", [], 0.5);
      
      const stats = store.getStats();
      
      expect(stats.peers).toBe(1);
      expect(stats.observations).toBe(1);
      expect(stats.preferences).toBe(1);
    });
  });
});