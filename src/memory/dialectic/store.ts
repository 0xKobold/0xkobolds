/**
 * Dialectic Store
 * 
 * SQLite storage for dialectic memory components:
 * - Peers (users, agents, projects, ideas)
 * - Observations (what happened)
 * - Contradictions (conflicts between observations)
 * - Syntheses (resolved understanding)
 * - Representations (inferred preferences, goals, constraints, values)
 * - Nudges (scheduled reflections)
 */

import { Database } from "bun:sqlite";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type {
  Peer,
  PeerType,
  Observation,
  ObservationCategory,
  Contradiction,
  ContradictionResolution,
  Synthesis,
  InferredPreference,
  InferredGoal,
  InferredConstraint,
  InferredValue,
  Representation,
  Nudge,
  NudgeTrigger,
  NudgeAction,
} from "./types";

const DB_DIR = path.join(homedir(), ".0xkobold", "dialectic");
const DB_PATH = path.join(DB_DIR, "dialectic.db");
const CURRENT_SCHEMA_VERSION = 1;

// ═════════════════════════════════════════════════════════════════
// SCHEMA
// ═════════════════════════════════════════════════════════════════

const SCHEMA_V1 = `
  -- Metadata
  CREATE TABLE IF NOT EXISTS _metadata (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  INSERT OR REPLACE INTO _metadata VALUES ('schema_version', '1');
  INSERT OR REPLACE INTO _metadata VALUES ('created_at', datetime('now'));

  -- Peers: Entities that persist and change over time
  CREATE TABLE IF NOT EXISTS peers (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('user', 'agent', 'project', 'idea')),
    name TEXT NOT NULL,
    metadata TEXT,  -- JSON
    created_at TEXT NOT NULL,
    last_updated TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_peers_type ON peers(type);
  CREATE INDEX IF NOT EXISTS idx_peers_name ON peers(name);

  -- Observations: Raw input to dialectic reasoning
  CREATE TABLE IF NOT EXISTS observations (
    id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('behavior', 'statement', 'preference', 'goal', 'constraint', 'value', 'error', 'success')),
    timestamp TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('message', 'tool_call', 'event', 'reflection')),
    source_id TEXT NOT NULL,
    session_id TEXT,
    project_id TEXT,
    FOREIGN KEY (peer_id) REFERENCES peers(id)
  );
  CREATE INDEX IF NOT EXISTS idx_observations_peer ON observations(peer_id);
  CREATE INDEX IF NOT EXISTS idx_observations_category ON observations(category);
  CREATE INDEX IF NOT EXISTS idx_observations_timestamp ON observations(timestamp);

  -- Contradictions: Conflicts between observations
  CREATE TABLE IF NOT EXISTS contradictions (
    id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    observation_a TEXT NOT NULL,
    observation_b TEXT NOT NULL,
    resolution TEXT NOT NULL CHECK(resolution IN ('newer_wins', 'context', 'refinement', 'correction', 'both_true', 'unknown')),
    resolution_note TEXT,
    confidence REAL DEFAULT 0.5,
    detected_at TEXT NOT NULL,
    resolved_at TEXT,
    FOREIGN KEY (peer_id) REFERENCES peers(id)
  );
  CREATE INDEX IF NOT EXISTS idx_contradictions_peer ON contradictions(peer_id);
  CREATE INDEX IF NOT EXISTS idx_contradictions_resolved ON contradictions(resolved_at);

  -- Syntheses: Resolved understanding from dialectic reasoning
  CREATE TABLE IF NOT EXISTS syntheses (
    id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    content TEXT NOT NULL,
    derived_from TEXT NOT NULL,  -- JSON array of observation IDs
    resolved_contradictions TEXT,  -- JSON array of contradiction IDs
    confidence REAL DEFAULT 0.5,
    timestamp TEXT NOT NULL,
    superseded_by TEXT,
    FOREIGN KEY (peer_id) REFERENCES peers(id)
  );
  CREATE INDEX IF NOT EXISTS idx_syntheses_peer ON syntheses(peer_id);

  -- Inferred Preferences: What the peer prefers
  CREATE TABLE IF NOT EXISTS inferred_preferences (
    id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    topic TEXT NOT NULL,
    preference TEXT NOT NULL,
    evidence TEXT NOT NULL,  -- JSON array of observation IDs
    confidence REAL DEFAULT 0.5,
    last_updated TEXT NOT NULL,
    contradicted BOOLEAN DEFAULT FALSE,
    contradicted_by TEXT,
    FOREIGN KEY (peer_id) REFERENCES peers(id)
  );
  CREATE INDEX IF NOT EXISTS idx_preferences_peer ON inferred_preferences(peer_id);
  CREATE INDEX IF NOT EXISTS idx_preferences_topic ON inferred_preferences(topic);

  -- Inferred Goals: What the peer is trying to achieve
  CREATE TABLE IF NOT EXISTS inferred_goals (
    id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'abandoned', 'unknown')),
    priority TEXT NOT NULL CHECK(priority IN ('high', 'medium', 'low')),
    evidence TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    first_observed TEXT NOT NULL,
    last_updated TEXT NOT NULL,
    FOREIGN KEY (peer_id) REFERENCES peers(id)
  );
  CREATE INDEX IF NOT EXISTS idx_goals_peer ON inferred_goals(peer_id);
  CREATE INDEX IF NOT EXISTS idx_goals_status ON inferred_goals(status);

  -- Inferred Constraints: What the peer cannot/will not do
  CREATE TABLE IF NOT EXISTS inferred_constraints (
    id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    description TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('hard', 'soft', 'preference')),
    evidence TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    last_updated TEXT NOT NULL,
    FOREIGN KEY (peer_id) REFERENCES peers(id)
  );
  CREATE INDEX IF NOT EXISTS idx_constraints_peer ON inferred_constraints(peer_id);

  -- Inferred Values: What the peer cares about intrinsically
  CREATE TABLE IF NOT EXISTS inferred_values (
    id TEXT PRIMARY KEY,
    peer_id TEXT NOT NULL,
    value TEXT NOT NULL,
    context TEXT,
    evidence TEXT NOT NULL,
    confidence REAL DEFAULT 0.5,
    last_updated TEXT NOT NULL,
    FOREIGN KEY (peer_id) REFERENCES peers(id)
  );
  CREATE INDEX IF NOT EXISTS idx_values_peer ON inferred_values(peer_id);

  -- Nudges: Scheduled reflections and actions
  CREATE TABLE IF NOT EXISTS nudges (
    id TEXT PRIMARY KEY,
    trigger_type TEXT NOT NULL CHECK(trigger_type IN ('time', 'event', 'threshold')),
    trigger_data TEXT NOT NULL,  -- JSON
    question TEXT NOT NULL,
    action_type TEXT NOT NULL,
    action_data TEXT NOT NULL,  -- JSON
    priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high')),
    created_at TEXT NOT NULL,
    run_at TEXT,
    completed_at TEXT,
    result TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_nudges_pending ON nudges(completed_at) WHERE completed_at IS NULL;
`;

// ═════════════════════════════════════════════════════════════════
// STORE CLASS
// ═════════════════════════════════════════════════════════════════

export class DialecticStore {
  private db: Database;

  constructor(db?: Database) {
    if (db) {
      this.db = db;
      // Initialize schema for provided databases (including :memory:)
      this.initSchema();
    } else {
      this.db = this.initDatabase();
    }
  }

  /**
   * Initialize schema on an existing database
   */
  private initSchema(): void {
    // Check if schema exists
    try {
      const result = this.db.query("SELECT value FROM _metadata WHERE key = 'schema_version'").get() as { value: string } | undefined;
      if (result?.value === "1") {
        return; // Schema already initialized
      }
    } catch {
      // Schema doesn't exist, create it
    }

    console.log("[DialecticStore] Initializing schema v1");
    this.db.exec(SCHEMA_V1);
  }

  private initDatabase(): Database {
    // Ensure directory exists
    fs.mkdir(DB_DIR, { recursive: true }).catch(() => {});
    
    const db = new Database(DB_PATH);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA synchronous = NORMAL;");

    // Check schema version
    let version = "0";
    try {
      const result = db.query("SELECT value FROM _metadata WHERE key = 'schema_version'").get() as { value: string } | undefined;
      version = result?.value || "0";
    } catch {
      version = "0";
    }

    // Run migrations
    if (version === "0") {
      console.log("[DialecticStore] Initializing schema v1");
      db.exec(SCHEMA_V1);
    }

    return db;
  }

  // ─────────────────────────────────────────────────────────────────
  // PEERS
  // ─────────────────────────────────────────────────────────────────

  createPeer(type: PeerType, name: string, metadata?: Record<string, unknown>): Peer {
    const id = `peer_${type}_${name.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    const now = new Date().toISOString();

    this.db.query(`
      INSERT OR REPLACE INTO peers (id, type, name, metadata, created_at, last_updated)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, type, name, metadata ? JSON.stringify(metadata) : null, now, now);

    return { id, type, name, createdAt: now, lastUpdated: now, metadata };
  }

  getPeer(id: string): Peer | undefined {
    const row = this.db.query(`SELECT * FROM peers WHERE id = ?`).get(id) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      type: row.type as PeerType,
      name: row.name,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      lastUpdated: row.last_updated,
    };
  }

  getPeerByName(name: string, type?: PeerType): Peer | undefined {
    const query = type
      ? `SELECT * FROM peers WHERE name = ? AND type = ?`
      : `SELECT * FROM peers WHERE name = ?`;
    const params = type ? [name, type] : [name];
    const row = this.db.query(query).get(...params) as any;
    if (!row) return undefined;
    return {
      id: row.id,
      type: row.type as PeerType,
      name: row.name,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      lastUpdated: row.last_updated,
    };
  }

  listPeers(type?: PeerType): Peer[] {
    const query = type
      ? `SELECT * FROM peers WHERE type = ? ORDER BY last_updated DESC`
      : `SELECT * FROM peers ORDER BY last_updated DESC`;
    const params = type ? [type] : [];
    const rows = this.db.query(query).all(...params) as any[];
    return rows.map(row => ({
      id: row.id,
      type: row.type as PeerType,
      name: row.name,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      lastUpdated: row.last_updated,
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // OBSERVATIONS
  // ─────────────────────────────────────────────────────────────────

  addObservation(
    peerId: string,
    content: string,
    category: ObservationCategory,
    sourceType: "message" | "tool_call" | "event" | "reflection",
    sourceId: string,
    sessionId?: string,
    projectId?: string
  ): Observation {
    const id = `obs_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const timestamp = new Date().toISOString();

    this.db.query(`
      INSERT INTO observations (id, peer_id, content, category, timestamp, source_type, source_id, session_id, project_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, peerId, content, category, timestamp, sourceType, sourceId, sessionId || null, projectId || null);

    // Update peer's last_updated
    this.db.query(`UPDATE peers SET last_updated = ? WHERE id = ?`).run(timestamp, peerId);

    return {
      id,
      peerId,
      content,
      category,
      timestamp,
      sourceType,
      sourceId,
      sessionId,
      projectId,
    };
  }

  getObservations(peerId: string, limit: number = 100): Observation[] {
    const rows = this.db.query(`
      SELECT * FROM observations WHERE peer_id = ? ORDER BY timestamp DESC LIMIT ?
    `).all(peerId, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      peerId: row.peer_id,
      content: row.content,
      category: row.category as ObservationCategory,
      timestamp: row.timestamp,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sessionId: row.session_id,
      projectId: row.project_id,
    }));
  }

  getRecentObservations(peerId: string, since: Date): Observation[] {
    const rows = this.db.query(`
      SELECT * FROM observations WHERE peer_id = ? AND timestamp > ? ORDER BY timestamp DESC
    `).all(peerId, since.toISOString()) as any[];

    return rows.map(row => ({
      id: row.id,
      peerId: row.peer_id,
      content: row.content,
      category: row.category as ObservationCategory,
      timestamp: row.timestamp,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sessionId: row.session_id,
      projectId: row.project_id,
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // CONTRADICTIONS
  // ─────────────────────────────────────────────────────────────────

  addContradiction(
    peerId: string,
    observationA: string,
    observationB: string,
    resolution: ContradictionResolution = "unknown",
    resolutionNote: string = "",
    confidence: number = 0.5
  ): Contradiction {
    const id = `contra_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const detectedAt = new Date().toISOString();

    this.db.query(`
      INSERT INTO contradictions (id, peer_id, observation_a, observation_b, resolution, resolution_note, confidence, detected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, peerId, observationA, observationB, resolution, resolutionNote, confidence, detectedAt);

    return {
      id,
      peerId,
      observationA,
      observationB,
      resolution,
      resolutionNote,
      confidence,
      detectedAt,
    };
  }

  resolveContradiction(id: string, resolution: ContradictionResolution, note: string): void {
    const resolvedAt = new Date().toISOString();
    this.db.query(`
      UPDATE contradictions SET resolution = ?, resolution_note = ?, resolved_at = ? WHERE id = ?
    `).run(resolution, note, resolvedAt, id);
  }

  getUnresolvedContradictions(peerId: string): Contradiction[] {
    const rows = this.db.query(`
      SELECT * FROM contradictions WHERE peer_id = ? AND resolved_at IS NULL ORDER BY detected_at DESC
    `).all(peerId) as any[];

    return rows.map(row => ({
      id: row.id,
      peerId: row.peer_id,
      observationA: row.observation_a,
      observationB: row.observation_b,
      resolution: row.resolution as ContradictionResolution,
      resolutionNote: row.resolution_note,
      confidence: row.confidence,
      detectedAt: row.detected_at,
      resolvedAt: row.resolved_at,
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // SYNTHESES
  // ─────────────────────────────────────────────────────────────────

  addSynthesis(
    peerId: string,
    content: string,
    derivedFrom: string[],
    resolvedContradictions: string[],
    confidence: number = 0.5
  ): Synthesis {
    const id = `synth_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const timestamp = new Date().toISOString();

    this.db.query(`
      INSERT INTO syntheses (id, peer_id, content, derived_from, resolved_contradictions, confidence, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, peerId, content, JSON.stringify(derivedFrom), JSON.stringify(resolvedContradictions), confidence, timestamp);

    return {
      id,
      peerId,
      content,
      derivedFrom,
      resolvedContradictions,
      confidence,
      timestamp,
    };
  }

  getSyntheses(peerId: string, limit: number = 10): Synthesis[] {
    const rows = this.db.query(`
      SELECT * FROM syntheses WHERE peer_id = ? AND superseded_by IS NULL ORDER BY timestamp DESC LIMIT ?
    `).all(peerId, limit) as any[];

    return rows.map(row => ({
      id: row.id,
      peerId: row.peer_id,
      content: row.content,
      derivedFrom: JSON.parse(row.derived_from),
      resolvedContradictions: JSON.parse(row.resolved_contradictions),
      confidence: row.confidence,
      timestamp: row.timestamp,
      supersededBy: row.superseded_by,
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // INFERRED PREFERENCES
  // ─────────────────────────────────────────────────────────────────

  addPreference(
    peerId: string,
    topic: string,
    preference: string,
    evidence: string[],
    confidence: number = 0.5
  ): InferredPreference {
    const id = `pref_${topic}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    this.db.query(`
      INSERT OR REPLACE INTO inferred_preferences (id, peer_id, topic, preference, evidence, confidence, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, peerId, topic, preference, JSON.stringify(evidence), confidence, now);

    return {
      id,
      peerId,
      topic,
      preference,
      evidence,
      confidence,
      lastUpdated: now,
    };
  }

  getPreferences(peerId: string): InferredPreference[] {
    const rows = this.db.query(`
      SELECT * FROM inferred_preferences WHERE peer_id = ? AND contradicted = FALSE ORDER BY confidence DESC
    `).all(peerId) as any[];

    return rows.map(row => ({
      id: row.id,
      peerId: row.peer_id,
      topic: row.topic,
      preference: row.preference,
      evidence: JSON.parse(row.evidence),
      confidence: row.confidence,
      lastUpdated: row.last_updated,
      contradicted: row.contradicted === 1,
      contradictedBy: row.contradicted_by,
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // INFERRED GOALS
  // ─────────────────────────────────────────────────────────────────

  addGoal(
    peerId: string,
    description: string,
    status: "active" | "completed" | "abandoned" | "unknown" = "active",
    priority: "high" | "medium" | "low" = "medium",
    evidence: string[] = [],
    confidence: number = 0.5
  ): InferredGoal {
    const id = `goal_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    this.db.query(`
      INSERT INTO inferred_goals (id, peer_id, description, status, priority, evidence, confidence, first_observed, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, peerId, description, status, priority, JSON.stringify(evidence), confidence, now, now);

    return {
      id,
      peerId,
      description,
      status,
      priority,
      evidence,
      confidence,
      firstObserved: now,
      lastUpdated: now,
    };
  }

  getGoals(peerId: string, status?: string): InferredGoal[] {
    const query = status
      ? `SELECT * FROM inferred_goals WHERE peer_id = ? AND status = ? ORDER BY priority, confidence DESC`
      : `SELECT * FROM inferred_goals WHERE peer_id = ? ORDER BY priority, confidence DESC`;
    const params = status ? [peerId, status] : [peerId];
    const rows = this.db.query(query).all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      peerId: row.peer_id,
      description: row.description,
      status: row.status,
      priority: row.priority,
      evidence: JSON.parse(row.evidence),
      confidence: row.confidence,
      firstObserved: row.first_observed,
      lastUpdated: row.last_updated,
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // INFERRED CONSTRAINTS
  // ─────────────────────────────────────────────────────────────────

  addConstraint(
    peerId: string,
    description: string,
    type: "hard" | "soft" | "preference" = "soft",
    evidence: string[] = [],
    confidence: number = 0.5
  ): InferredConstraint {
    const id = `const_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    this.db.query(`
      INSERT INTO inferred_constraints (id, peer_id, description, type, evidence, confidence, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, peerId, description, type, JSON.stringify(evidence), confidence, now);

    return {
      id,
      peerId,
      description,
      type,
      evidence,
      confidence,
      lastUpdated: now,
    };
  }

  getConstraints(peerId: string): InferredConstraint[] {
    const rows = this.db.query(`
      SELECT * FROM inferred_constraints WHERE peer_id = ? ORDER BY type, confidence DESC
    `).all(peerId) as any[];

    return rows.map(row => ({
      id: row.id,
      peerId: row.peer_id,
      description: row.description,
      type: row.type as "hard" | "soft" | "preference",
      evidence: JSON.parse(row.evidence),
      confidence: row.confidence,
      lastUpdated: row.last_updated,
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // INFERRED VALUES
  // ─────────────────────────────────────────────────────────────────

  addValue(
    peerId: string,
    value: string,
    context: string,
    evidence: string[],
    confidence: number = 0.5
  ): InferredValue {
    const id = `val_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    this.db.query(`
      INSERT INTO inferred_values (id, peer_id, value, context, evidence, confidence, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, peerId, value, context, JSON.stringify(evidence), confidence, now);

    return {
      id,
      peerId,
      value,
      context,
      evidence,
      confidence,
      lastUpdated: now,
    };
  }

  getValues(peerId: string): InferredValue[] {
    const rows = this.db.query(`
      SELECT * FROM inferred_values WHERE peer_id = ? ORDER BY confidence DESC
    `).all(peerId) as any[];

    return rows.map(row => ({
      id: row.id,
      peerId: row.peer_id,
      value: row.value,
      context: row.context,
      evidence: JSON.parse(row.evidence),
      confidence: row.confidence,
      lastUpdated: row.last_updated,
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // REPRESENTATIONS (Aggregate)
  // ─────────────────────────────────────────────────────────────────

  getRepresentation(peerId: string): Representation | undefined {
    const peer = this.getPeer(peerId);
    if (!peer) return undefined;

    const preferences = this.getPreferences(peerId);
    const goals = this.getGoals(peerId);
    const constraints = this.getConstraints(peerId);
    const values = this.getValues(peerId);
    const observations = this.getObservations(peerId, 50);
    const contradictions = this.getUnresolvedContradictions(peerId);
    const synthesis = this.getSyntheses(peerId);

    // Calculate overall confidence
    const allConfidences = [
      ...preferences.map(p => p.confidence),
      ...goals.map(g => g.confidence),
      ...constraints.map(c => c.confidence),
      ...values.map(v => v.confidence),
      ...synthesis.map(s => s.confidence),
    ];
    const avgConfidence = allConfidences.length > 0
      ? allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length
      : 0.5;

    return {
      id: `repr_${peerId}`,
      peerId,
      peerType: peer.type,
      preferences,
      goals,
      constraints,
      values,
      observations,
      contradictions,
      synthesis,
      confidence: avgConfidence,
      lastUpdated: peer.lastUpdated,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // NUDGES
  // ─────────────────────────────────────────────────────────────────

  addNudge(
    trigger: NudgeTrigger,
    question: string,
    action: NudgeAction,
    priority: "low" | "medium" | "high" = "medium"
  ): Nudge {
    const id = `nudge_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const createdAt = new Date().toISOString();

    this.db.query(`
      INSERT INTO nudges (id, trigger_type, trigger_data, question, action_type, action_data, priority, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      trigger.type,
      JSON.stringify(trigger),
      question,
      action.type,
      JSON.stringify(action),
      priority,
      createdAt
    );

    return {
      id,
      trigger,
      question,
      action,
      priority,
      createdAt,
    };
  }

  getPendingNudges(limit: number = 10): Nudge[] {
    const rows = this.db.query(`
      SELECT * FROM nudges WHERE completed_at IS NULL ORDER BY priority, created_at LIMIT ?
    `).all(limit) as any[];

    return rows.map(row => ({
      id: row.id,
      trigger: JSON.parse(row.trigger_data) as NudgeTrigger,
      question: row.question,
      action: JSON.parse(row.action_data) as NudgeAction,
      priority: row.priority as "low" | "medium" | "high",
      createdAt: row.created_at,
      runAt: row.run_at,
      completedAt: row.completed_at,
      result: row.result,
    }));
  }

  completeNudge(id: string, result: string): void {
    const completedAt = new Date().toISOString();
    this.db.query(`
      UPDATE nudges SET completed_at = ?, result = ? WHERE id = ?
    `).run(completedAt, result, id);
  }

  // ─────────────────────────────────────────────────────────────────
  // UTILITY
  // ─────────────────────────────────────────────────────────────────

  close(): void {
    this.db.close();
  }

  getStats(): {
    peers: number;
    observations: number;
    contradictions: number;
    syntheses: number;
    preferences: number;
    goals: number;
    constraints: number;
    values: number;
    nudges: number;
  } {
    return {
      peers: (this.db.query(`SELECT COUNT(*) as n FROM peers`).get() as { n: number }).n,
      observations: (this.db.query(`SELECT COUNT(*) as n FROM observations`).get() as { n: number }).n,
      contradictions: (this.db.query(`SELECT COUNT(*) as n FROM contradictions`).get() as { n: number }).n,
      syntheses: (this.db.query(`SELECT COUNT(*) as n FROM syntheses`).get() as { n: number }).n,
      preferences: (this.db.query(`SELECT COUNT(*) as n FROM inferred_preferences`).get() as { n: number }).n,
      goals: (this.db.query(`SELECT COUNT(*) as n FROM inferred_goals`).get() as { n: number }).n,
      constraints: (this.db.query(`SELECT COUNT(*) as n FROM inferred_constraints`).get() as { n: number }).n,
      values: (this.db.query(`SELECT COUNT(*) as n FROM inferred_values`).get() as { n: number }).n,
      nudges: (this.db.query(`SELECT COUNT(*) as n FROM nudges`).get() as { n: number }).n,
    };
  }
}

// Singleton
let store: DialecticStore | null = null;

export function getDialecticStore(): DialecticStore {
  if (!store) {
    store = new DialecticStore();
  }
  return store;
}