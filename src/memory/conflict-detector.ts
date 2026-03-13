/**
 * Memory Conflict Detection
 * 
 * Detect contradictions in user preferences and handle resolution
 * "I love my job" vs "I hate my job" - embeddings close, truth different
 */

import { Database } from "bun:sqlite";

export interface ConflictConfig {
  // Detection thresholds
  similarityThreshold: number;  // Max similarity to flag as potential conflict (0-1)
  minConfidence: number;        // Min confidence for auto-resolving (0-1)
  
  // Resolution preferences
  preferRecent: boolean;        // When in doubt, prefer more recent
  archiveOld: boolean;          // Archive instead of delete
  
  // Notification
  notifyUserOnConflict: boolean;
  notifyThreshold: number;      // Confidence below which to notify
}

const DEFAULT_CONFLICT_CONFIG: ConflictConfig = {
  similarityThreshold: 0.85,
  minConfidence: 0.8,
  preferRecent: true,
  archiveOld: true,
  notifyUserOnConflict: true,
  notifyThreshold: 0.7,
};

export class ConflictDetector {
  private db: Database;
  private config: ConflictConfig;

  constructor(db: Database, config?: Partial<ConflictConfig>) {
    this.db = db;
    this.config = { ...DEFAULT_CONFLICT_CONFIG, ...config };
  }

  /**
   * Initialize conflict tables
   */
  initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS memory_conflicts (
        id TEXT PRIMARY KEY,
        item_a_id TEXT NOT NULL,
        item_b_id TEXT NOT NULL,
        item_a_content TEXT NOT NULL,
        item_b_content TEXT NOT NULL,
        similarity_score REAL NOT NULL,
        conflict_type TEXT NOT NULL, -- contradiction, update, duplicate
        detected_at TEXT NOT NULL,
        detected_by TEXT NOT NULL,     -- llm, embedding, rule
        
        -- Resolution
        resolved_at TEXT,
        resolution TEXT,               -- keep_a, keep_b, merge, archive_both, user_decided
        resolution_note TEXT,
        resolved_by TEXT,
        confidence REAL                -- LLM confidence in resolution
      )
    `);

    // Index for performance
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_conflicts_unresolved ON memory_conflicts(resolved_at IS NULL)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_conflicts_items ON memory_conflicts(item_a_id, item_b_id)`);

    console.log("[ConflictDetector] Schema initialized");
  }

  /**
   * Check if new item conflicts with existing memories
   */
  async checkConflict(
    newItemId: string,
    newContent: string,
    embeddings: Map<string, number[]>
  ): Promise<Array<{
    itemId: string;
    content: string;
    similarity: number;
    conflictType: "contradiction" | "update" | "duplicate";
    suggestedResolution: string;
    confidence: number;
  }>> {
    const conflicts = [];

    // Get all active items (not the new one, not archived)
    const existing = this.db.query(`
      SELECT id, content FROM memory_items 
      WHERE id != ? AND archived = FALSE
    `).all(newItemId) as any[];

    // Get new item embedding
    const newEmbedding = embeddings.get(newItemId);
    
    for (const item of existing) {
      const itemEmbedding = embeddings.get(item.id);
      
      if (newEmbedding && itemEmbedding) {
        const similarity = this.cosineSimilarity(newEmbedding, itemEmbedding);
        
        // High similarity = potential conflict
        if (similarity >= this.config.similarityThreshold) {
          // Use LLM to determine conflict type
          const analysis = await this.analyzeConflict(newContent, item.content);
          
          if (analysis.conflictType !== "none") {
            conflicts.push({
              itemId: item.id,
              content: item.content,
              similarity,
              conflictType: analysis.conflictType,
              suggestedResolution: analysis.resolution,
              confidence: analysis.confidence,
            });

            // Record in database
            this.recordConflict(newItemId, item.id, newContent, item.content, similarity, analysis);
          }
        }
      }
    }

    return conflicts;
  }

  /**
   * Use LLM to analyze conflict
   */
  private async analyzeConflict(
    contentA: string,
    contentB: string
  ): Promise<{
    conflictType: "contradiction" | "update" | "duplicate" | "none";
    resolution: string;
    confidence: number;
  }> {
    const prompt = `Analyze these two memory items for conflicts:

Item A: "${contentA}"
Item B: "${contentB}"

Determine:
1. CONTRADICTION: They cannot both be true ("I love" vs "I hate")
2. UPDATE: Item B is newer information about same thing ("I had coffee" → "I had tea")
3. DUPLICATE: Same information, keep only one
4. NONE: No conflict, both can coexist

Return JSON:
{
  "type": "contradiction|update|duplicate|none",
  "reasoning": "brief explanation",
  "suggested_action": "keep_a|keep_b|merge|archive_both",
  "confidence": 0.0-1.0
}`;

    try {
      // This would call Ollama - using stub for now
      // const response = await fetch(...)
      
      // Stub implementation based on heuristics
      const lowerA = contentA.toLowerCase();
      const lowerB = contentB.toLowerCase();
      
      // Check for negation flips
      const negations = ["not", "never", "hate", "dislike", "quit", "left"];
      const affirmations = ["love", "like", "enjoy", "have", "work", "at"];
      
      const aHasNeg = negations.some(n => lowerA.includes(n));
      const bHasNeg = negations.some(n => lowerB.includes(n));
      const aHasAff = affirmations.some(a => lowerA.includes(a));
      const bHasAff = affirmations.some(a => lowerB.includes(a));
      
      if ((aHasNeg !== bHasNeg) && (aHasAff || bHasAff)) {
        return {
          conflictType: "contradiction",
          resolution: "keep_b", // Prefer newer
          confidence: 0.75,
        };
      }
      
      // Check for time-based updates
      const timeWords = ["now", "currently", "just", "recently", "today", "new"];
      if (timeWords.some(w => lowerB.includes(w))) {
        return {
          conflictType: "update",
          resolution: "keep_b",
          confidence: 0.7,
        };
      }
      
      // High similarity, likely duplicate
      return {
        conflictType: "duplicate",
        resolution: "keep_a",
        confidence: 0.8,
      };
      
    } catch (err) {
      return {
        conflictType: "none",
        resolution: "keep_both",
        confidence: 0.5,
      };
    }
  }

  /**
   * Resolve conflict
   */
  async resolveConflict(
    conflictId: string,
    resolution: "keep_a" | "keep_b" | "merge" | "archive_both" | "user_decided",
    note?: string,
    userId?: string
  ): Promise<boolean> {
    const conflict = this.db.query(`SELECT * FROM memory_conflicts WHERE id = ?`).get(conflictId) as any;
    if (!conflict) return false;

    // Apply resolution
    const now = new Date().toISOString();
    
    switch (resolution) {
      case "keep_a":
        this.db.query(`UPDATE memory_items SET archived = TRUE WHERE id = ?`).run(conflict.item_b_id);
        break;
      case "keep_b":
        this.db.query(`UPDATE memory_items SET archived = TRUE WHERE id = ?`).run(conflict.item_a_id);
        break;
      case "archive_both":
        this.db.query(`UPDATE memory_items SET archived = TRUE WHERE id IN (?, ?)`)
          .run(conflict.item_a_id, conflict.item_b_id);
        break;
      case "merge":
        // Keep A, update with B's info
        // In practice, might want to do something more sophisticated
        this.db.query(`UPDATE memory_items SET archived = TRUE WHERE id = ?`).run(conflict.item_b_id);
        break;
      case "user_decided":
        // Just mark resolved, user will handle manually
        break;
    }

    // Update conflict record
    this.db.query(`
      UPDATE memory_conflicts 
      SET resolved_at = ?, resolution = ?, resolution_note = ?, resolved_by = ?
      WHERE id = ?
    `).run(now, resolution, note || null, userId || "system", conflictId);

    return true;
  }

  /**
   * Auto-resolve conflicts above confidence threshold
   */
  async autoResolve(sessionId?: string): Promise<{
    resolved: number;
    flaggedForUser: number;
    failed: number;
  }> {
    const pending = this.db.query(`
      SELECT * FROM memory_conflicts 
      WHERE resolved_at IS NULL AND confidence >= ?
    `).all(this.config.minConfidence) as any[];

    const result = { resolved: 0, flaggedForUser: 0, failed: 0 };

    for (const conflict of pending) {
      try {
        // Prefer recent if configured
        let resolution: "keep_a" | "keep_b" = "keep_b";
        if (!this.config.preferRecent) {
          resolution = "keep_a";
        }

        // Archive old if configured
        if (this.config.archiveOld) {
          await this.resolveConflict(conflict.id, resolution, "Auto-resolved by system", "system");
        }

        result.resolved++;
      } catch {
        result.failed++;
      }
    }

    // Flag conflicts needing user attention
    const needsUser = this.db.query(`
      SELECT * FROM memory_conflicts 
      WHERE resolved_at IS NULL 
      AND confidence < ? 
      AND confidence >= ?
    `).all(this.config.minConfidence, this.config.notifyThreshold) as any[];

    if (this.config.notifyUserOnConflict) {
      for (const conflict of needsUser) {
        // Emit notification event
        // eventBus.emit("memory.needs_resolution", { conflict, sessionId });
        result.flaggedForUser++;
      }
    }

    return result;
  }

  /**
   * Record conflict in database
   */
  private recordConflict(
    itemAId: string,
    itemBId: string,
    contentA: string,
    contentB: string,
    similarity: number,
    analysis: any
  ): void {
    const id = `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    
    this.db.query(`
      INSERT INTO memory_conflicts (
        id, item_a_id, item_b_id, item_a_content, item_b_content,
        similarity_score, conflict_type, detected_at, detected_by, confidence
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      itemAId,
      itemBId,
      contentA,
      contentB,
      similarity,
      analysis.conflictType,
      new Date().toISOString(),
      "llm",
      analysis.confidence
    );
  }

  /**
   * Get pending conflicts
   */
  getPendingConflicts(): Array<{
    id: string;
    itemA: { id: string; content: string };
    itemB: { id: string; content: string };
    type: string;
    similarity: number;
    detectedAt: string;
  }> {
    const rows = this.db.query(`
      SELECT * FROM memory_conflicts 
      WHERE resolved_at IS NULL
      ORDER BY detected_at DESC
    `).all() as any[];

    return rows.map(r => ({
      id: r.id,
      itemA: { id: r.item_a_id, content: r.item_a_content },
      itemB: { id: r.item_b_id, content: r.item_b_content },
      type: r.conflict_type,
      similarity: r.similarity_score,
      detectedAt: r.detected_at,
    }));
  }

  /**
   * Cosine similarity calculation
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}

export { DEFAULT_CONFLICT_CONFIG };