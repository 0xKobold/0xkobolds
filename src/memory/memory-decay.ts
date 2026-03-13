/**
 * Memory Decay System
 * 
 * "Never forget" doesn't mean "remember every token"
 * Maintenance keeps memory healthy: consolidation, summarization, pruning
 * 
 * Schedule: Nightly, Weekly, Monthly via Heartbeat
 */

import { Database } from "bun:sqlite";
import { eventBus } from "../event-bus";

export interface DecayConfig {
  // Nightly (3 AM)
  nightlyEnabled: boolean;
  nightlyTime: string; // "03:00"
  
  // Weekly (Sunday)
  weeklyEnabled: boolean;
  weeklyDay: number; // 0 = Sunday
  
  // Monthly
  monthlyEnabled: boolean;
  monthlyDay: number; // Day of month
  
  // Policies
  archiveDays: number; // 90 days
  pruneDays: number; // 180 days
  condensationThreshold: number; // Items before condensing
}

const DEFAULT_DECAY_CONFIG: DecayConfig = {
  nightlyEnabled: true,
  nightlyTime: "03:00",
  weeklyEnabled: true,
  weeklyDay: 0, // Sunday
  monthlyEnabled: true,
  monthlyDay: 1, // First of month
  archiveDays: 90,
  pruneDays: 180,
  condensationThreshold: 20,
};

export class MemoryDecay {
  private db: Database;
  private config: DecayConfig;

  constructor(db: Database, config?: Partial<DecayConfig>) {
    this.db = db;
    this.config = { ...DEFAULT_DECAY_CONFIG, ...config };
  }

  /**
   * Initialize decay tables
   */
  async initSchema(): Promise<void> {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS memory_decay_schedule (
        id TEXT PRIMARY KEY,
        job_type TEXT NOT NULL, -- nightly, weekly, monthly
        last_run TEXT,
        next_run TEXT NOT NULL
      )
    `);

    // Initialize schedule if empty
    const [nightly, weekly, monthly] = this.calculateSchedule();
    
    // Insert defaults
    const defaults = [
      { id: "nightly", job: "nightly", next: nightly },
      { id: "weekly", job: "weekly", next: weekly },
      { id: "monthly", job: "monthly", next: monthly },
    ];

    for (const def of defaults) {
      const exists = this.db.query(`SELECT 1 FROM memory_decay_schedule WHERE id = ?`).get(def.id);
      if (!exists) {
        this.db.query(`
          INSERT INTO memory_decay_schedule (id, job_type, next_run)
          VALUES (?, ?, ?)
        `).run(def.id, def.job, def.next);
      }
    }
  }

  /**
   * Calculate next run times
   */
  private calculateSchedule(): [string, string, string] {
    const now = new Date();
    
    // Nightly: Tomorrow at 3 AM
    const nightly = new Date(now);
    nightly.setDate(nightly.getDate() + 1);
    nightly.setHours(3, 0, 0, 0);
    
    // Weekly: Next Sunday at 3 AM
    const weekly = new Date(now);
    weekly.setDate(weekly.getDate() + ((7 - weekly.getDay()) % 7 || 7));
    weekly.setHours(3, 0, 0, 0);
    
    // Monthly: First of next month at 3 AM
    const monthly = new Date(now.getFullYear(), now.getMonth() + 1, 1, 3, 0, 0, 0);
    
    return [
      nightly.toISOString(),
      weekly.toISOString(),
      monthly.toISOString(),
    ];
  }

  /**
   * NIGHTLY CONSOLIDATION
   * - Merge duplicates
   * - Promote hot memories
   * - Process unprocessed resources
   */
  async runNightly(): Promise<{
    processed: number;
    merged: number;
    promoted: number;
    errors: string[];
  }> {
    console.log("[MemoryDecay] Running nightly consolidation...");
    const result = { processed: 0, merged: 0, promoted: 0, errors: [] as string[] };

    try {
      // Get resources from last 24h
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const unprocessed = this.db.query(`
        SELECT * FROM memory_resources 
        WHERE processed = FALSE AND timestamp > ?
      `).all(yesterday) as any[];

      for (const res of unprocessed) {
        // Emit for tiered memory to process
        eventBus.emit("memory.consolidate_resource", { resourceId: res.id });
        result.processed++;
      }

      // Find duplicates by content similarity
      const duplicates = await this.findDuplicates(24);
      for (const group of duplicates) {
        if (group.length > 1) {
          await this.mergeMemories(group);
          result.merged += group.length - 1;
        }
      }

      // Promote hot memories
      const hotMemories = this.db.query(`
        SELECT id FROM memories 
        WHERE access_count > 10 
        AND last_accessed > ?
        ORDER BY access_count DESC
      `).all(yesterday) as any[];

      for (const mem of hotMemories) {
        this.db.query(`UPDATE memories SET importance = MIN(importance + 0.1, 1.0) WHERE id = ?`)
          .run(mem.id);
        result.promoted++;
      }

      // Log
      this.db.query(`
        INSERT INTO memory_decay_log (id, memory_id, memory_type, action, reason, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `decay_${Date.now()}`,
        "nightly",
        "system",
        "nightly_consolidation",
        `Processed: ${result.processed}, Merged: ${result.merged}, Promoted: ${result.promoted}`,
        new Date().toISOString()
      );

    } catch (err) {
      result.errors.push(String(err));
    }

    console.log(`[MemoryDecay] Nightly complete: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * WEEKLY SUMMARIZATION
   * - Compress category summaries
   * - Archive old items
   * - Prune stale memories
   */
  async runWeekly(): Promise<{
    condensed: number;
    archived: number;
    pruned: number;
    errors: string[];
  }> {
    console.log("[MemoryDecay] Running weekly summarization...");
    const result = { condensed: 0, archived: 0, pruned: 0, errors: [] as string[] };

    try {
      // Condense category summaries
      const largeCategories = this.db.query(`
        SELECT * FROM memory_categories 
        WHERE item_count > ? OR LENGTH(summary) > 5000
      `).all(this.config.condensationThreshold) as any[];

      for (const cat of largeCategories) {
        // Emit for summarization
        eventBus.emit("memory.summarize_category", { categoryId: cat.id });
        result.condensed++;
      }

      // Archive old items (90+ days)
      const archiveCutoff = new Date(Date.now() - this.config.archiveDays * 24 * 60 * 60 * 1000).toISOString();
      const oldItems = this.db.query(`
        SELECT id FROM memory_items 
        WHERE extracted_at < ? AND archived = FALSE
      `).all(archiveCutoff) as any[];

      for (const item of oldItems) {
        this.db.query(`UPDATE memory_items SET archived = TRUE WHERE id = ?`).run(item.id);
        result.archived++;
      }

      // Prune stale memories (180+ days)
      const pruneCutoff = new Date(Date.now() - this.config.pruneDays * 24 * 60 * 60 * 1000).toISOString();
      const stale = this.db.query(`
        SELECT id FROM memories 
        WHERE last_accessed < ? AND importance < 0.3
        ORDER BY last_accessed ASC
        LIMIT 100
      `).all(pruneCutoff) as any[];

      for (const mem of stale) {
        this.db.query(`DELETE FROM memories WHERE id = ?`).run(mem.id);
        result.pruned++;
      }

      // Log
      this.db.query(`
        INSERT INTO memory_decay_log (id, memory_id, memory_type, action, reason, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `decay_${Date.now()}`,
        "weekly",
        "system",
        "weekly_summarization",
        `Condensed: ${result.condensed}, Archived: ${result.archived}, Pruned: ${result.pruned}`,
        new Date().toISOString()
      );

    } catch (err) {
      result.errors.push(String(err));
    }

    console.log(`[MemoryDecay] Weekly complete: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * MONTHLY RE-INDEX
   * - Rebuild embeddings
   * - Re-weight graph edges
   * - Archive dead nodes
   */
  async runMonthly(): Promise<{
    reindexed: number;
    archived: number;
    errors: string[];
  }> {
    console.log("[MemoryDecay] Running monthly re-index...");
    const result = { reindexed: 0, archived: 0, errors: [] as string[] };

    try {
      // Rebuild embeddings for all memories
      const memories = this.db.query(`
        SELECT id, content FROM memories 
        WHERE embedding IS NOT NULL
      `).all() as any[];

      for (const mem of memories) {
        // Emit for re-indexing
        eventBus.emit("memory.reindex", { memoryId: mem.id, content: mem.content });
        result.reindexed++;
      }

      // Archive dead nodes (unused for 180+ days, low importance)
      const staleCutoff = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const deadNodes = this.db.query(`
        SELECT id FROM memory_items 
        WHERE last_accessed < ? AND archived = FALSE
      `).all(staleCutoff) as any[];

      for (const node of deadNodes) {
        this.db.query(`UPDATE memory_items SET archived = TRUE WHERE id = ?`).run(node.id);
        result.archived++;
      }

      // Log
      this.db.query(`
        INSERT INTO memory_decay_log (id, memory_id, memory_type, action, reason, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `decay_${Date.now()}`,
        "monthly",
        "system",
        "monthly_reindex",
        `Reindexed: ${result.reindexed}, Archived: ${result.archived}`,
        new Date().toISOString()
      );

    } catch (err) {
      result.errors.push(String(err));
    }

    console.log(`[MemoryDecay] Monthly complete: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Check and run scheduled jobs
   */
  async checkSchedule(): Promise<void> {
    const now = new Date().toISOString();
    
    // Check nightly
    const nightly = this.db.query(`SELECT * FROM memory_decay_schedule WHERE id = ?`).get("nightly") as any;
    if (this.config.nightlyEnabled && nightly && nightly.next_run <= now) {
      await this.runNightly();
      this.db.query(`UPDATE memory_decay_schedule SET last_run = ?, next_run = ? WHERE id = ?`)
        .run(now, this.getNextNightly(), "nightly");
    }
    
    // Check weekly
    const weekly = this.db.query(`SELECT * FROM memory_decay_schedule WHERE id = ?`).get("weekly") as any;
    if (this.config.weeklyEnabled && weekly && weekly.next_run <= now) {
      await this.runWeekly();
      this.db.query(`UPDATE memory_decay_schedule SET last_run = ?, next_run = ? WHERE id = ?`)
        .run(now, this.getNextWeekly(), "weekly");
    }
    
    // Check monthly
    const monthly = this.db.query(`SELECT * FROM memory_decay_schedule WHERE id = ?`).get("monthly") as any;
    if (this.config.monthlyEnabled && monthly && monthly.next_run <= now) {
      await this.runMonthly();
      this.db.query(`UPDATE memory_decay_schedule SET last_run = ?, next_run = ? WHERE id = ?`)
        .run(now, this.getNextMonthly(), "monthly");
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalResources: number;
    totalItems: number;
    totalCategories: number;
    archivedItems: number;
    lastNightly: string | null;
    lastWeekly: string | null;
    lastMonthly: string | null;
  } {
    const stats = {
      totalResources: (this.db.query(`SELECT COUNT(*) as n FROM memory_resources`).get() as { n: number })?.n || 0,
      totalItems: (this.db.query(`SELECT COUNT(*) as n FROM memory_items`).get() as { n: number })?.n || 0,
      totalCategories: (this.db.query(`SELECT COUNT(*) as n FROM memory_categories`).get() as { n: number })?.n || 0,
      archivedItems: (this.db.query(`SELECT COUNT(*) as n FROM memory_items WHERE archived = TRUE`).get() as { n: number })?.n || 0,
      lastNightly: null as string | null,
      lastWeekly: null as string | null,
      lastMonthly: null as string | null,
    };

    const nightly = this.db.query(`SELECT last_run FROM memory_decay_schedule WHERE id = ?`).get("nightly") as any;
    const weekly = this.db.query(`SELECT last_run FROM memory_decay_schedule WHERE id = ?`).get("weekly") as any;
    const monthly = this.db.query(`SELECT last_run FROM memory_decay_schedule WHERE id = ?`).get("monthly") as any;

    if (nightly?.last_run) stats.lastNightly = nightly.last_run;
    if (weekly?.last_run) stats.lastWeekly = weekly.last_run;
    if (monthly?.last_run) stats.lastMonthly = monthly.last_run;

    return stats;
  }

  // Private helpers
  private getNextNightly(): string {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(3, 0, 0, 0);
    return next.toISOString();
  }

  private getNextWeekly(): string {
    const next = new Date();
    next.setDate(next.getDate() + (7 - next.getDay()) % 7 || 7);
    next.setHours(3, 0, 0, 0);
    return next.toISOString();
  }

  private getNextMonthly(): string {
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    next.setDate(1);
    next.setHours(3, 0, 0, 0);
    return next.toISOString();
  }

  private async findDuplicates(hoursBack: number): Promise<Array<Array<string>>> {
    // Find potential duplicates with similar content
    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
    const items = this.db.query(`
      SELECT id, content FROM memory_items 
      WHERE extracted_at > ?
    `).all(cutoff) as any[];

    const duplicates: Array<Array<string>> = [];
    const processed = new Set<string>();

    for (const item of items) {
      if (processed.has(item.id)) continue;

      const group = [item.id];
      const content = item.content.toLowerCase();

      for (const other of items) {
        if (other.id === item.id || processed.has(other.id)) continue;
        
        const similarity = this.roughSimilarity(content, other.content.toLowerCase());
        if (similarity > 0.85) {
          group.push(other.id);
          processed.add(other.id);
        }
      }

      if (group.length > 1) {
        duplicates.push(group);
      }
      processed.add(item.id);
    }

    return duplicates;
  }

  private roughSimilarity(a: string, b: string): number {
    // Simple Jaccard-like similarity on words
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));
    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.size / union.size;
  }

  private async mergeMemories(ids: string[]): Promise<void> {
    // Merge group into first, mark rest archived
    const first = ids[0];
    for (const id of ids.slice(1)) {
      this.db.query(`UPDATE memory_items SET archived = TRUE WHERE id = ?`).run(id);
      this.db.query(`
        INSERT INTO memory_decay_log (id, memory_id, memory_type, action, reason, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        `decay_${Date.now()}_${id}`,
        first,
        "item",
        "merged",
        `Merged with ${first}`,
        new Date().toISOString()
      );
    }
  }
}

export { DEFAULT_DECAY_CONFIG };