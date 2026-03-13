/**
 * Tiered Memory Architecture
 * 
 * Three-layer hierarchy from Rohit's article:
 * - Layer 1: Resources (raw transcripts)
 * - Layer 2: Items (atomic facts)  
 * - Layer 3: Categories (evolving summaries)
 */

import { Database } from "bun:sqlite";
import type { MemoryEntry, MemoryResource, MemoryItem, TieredCategory } from "./types";
import { eventBus } from "../event-bus";

export interface TieredMemoryConfig {
  // Extraction
  extractionModel: string;
  extractionPrompt: string;
  
  // Evolution
  evolutionModel: string;
  evolutionPrompt: string;
  
  // Decay
  categoryCondenseThreshold: number;  // Items before condensing
  maxCategorySize: number;           // Characters before forcing condense
  
  // Retrieval
  maxItemsInContext: number;
  maxCategoriesInContext: number;
}

const DEFAULT_CONFIG: TieredMemoryConfig = {
  extractionModel: "llama3.2",
  extractionPrompt: `Extract discrete atomic facts from the following text.
Focus on: user preferences, project details, decisions, errors/learned lessons.

Text: {{content}}

Return JSON array of items:
[{
  "content": "atomic fact",
  "category": "preference|fact|decision|task|error|learning"
}]`,
  
  evolutionModel: "llama3.2",
  evolutionPrompt: `You are a Memory Synchronization Specialist.

## Current Category Summary
{{existing_summary}}

## New Items to Integrate
{{new_items}}

## Task
1. Update existing with new information
2. Overwrite if contradiction found
3. Keep style: concise, scannable
4. Output ONLY the updated summary

Return the updated category summary.`,
  
  categoryCondenseThreshold: 20,
  maxCategorySize: 5000,
  maxItemsInContext: 5,
  maxCategoriesInContext: 3,
};

export class TieredMemory {
  private db: Database;
  private config: TieredMemoryConfig;
  private ollamaUrl: string;

  constructor(db: Database, ollamaUrl: string, config?: Partial<TieredMemoryConfig>) {
    this.db = db;
    this.ollamaUrl = ollamaUrl;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize tiered tables if they don't exist
   */
  async initSchema(): Promise<void> {
    // Resources (Layer 1) - raw transcripts
    this.db.run(`
      CREATE TABLE IF NOT EXISTS memory_resources (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        raw_content TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        processed BOOLEAN DEFAULT FALSE,
        extracted_items INTEGER DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES sessions(session_id)
      )
    `);

    // Items (Layer 2) - atomic facts
    this.db.run(`
      CREATE TABLE IF NOT EXISTS memory_items (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT,
        extracted_at TEXT NOT NULL,
        category_id TEXT,
        archived BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (resource_id) REFERENCES memory_resources(id),
        FOREIGN KEY (category_id) REFERENCES memory_categories(id)
      )
    `);

    // Migration: Add archived column if it doesn't exist (for existing databases)
    try {
      this.db.run(`ALTER TABLE memory_items ADD COLUMN archived BOOLEAN DEFAULT FALSE`);
    } catch (e) {
      // Column already exists, ignore error
    }

    // Categories (Layer 3) - evolving summaries
    this.db.run(`
      CREATE TABLE IF NOT EXISTS memory_categories (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        summary TEXT NOT NULL,
        item_count INTEGER DEFAULT 0,
        last_updated TEXT NOT NULL,
        auto_condensed BOOLEAN DEFAULT FALSE,
        project TEXT
      )
    `);

    // Decay tracking
    this.db.run(`
      CREATE TABLE IF NOT EXISTS memory_decay_log (
        id TEXT PRIMARY KEY,
        memory_id TEXT NOT NULL,
        memory_type TEXT NOT NULL, -- resource, item, category
        action TEXT NOT NULL,      -- condense, archive, delete
        reason TEXT,
        timestamp TEXT NOT NULL
      )
    `);

    // Indexes
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_resources_session ON memory_resources(session_id)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_items_category ON memory_items(category_id)`);
    // Archived column may be added by migration, handle gracefully
    try {
      this.db.run(`CREATE INDEX IF NOT EXISTS idx_items_archived ON memory_items(archived)`);
    } catch (e) {
      // Index will be created after migration adds the column
    }

    console.log("[TieredMemory] Schema initialized");
  }

  /**
   * WRITE PATH: Ingest raw content
   */
  async ingestResource(content: string, sessionId: string): Promise<MemoryResource> {
    const id = `res_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const timestamp = new Date().toISOString();

    this.db.query(`
      INSERT INTO memory_resources (id, session_id, raw_content, timestamp, processed)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, sessionId, content, timestamp, false);

    // Emit event for async processing
    eventBus.emit("memory.resource_ingested", {
      resourceId: id,
      sessionId,
      timestamp,
    });

    return {
      id,
      sessionId,
      rawContent: content,
      timestamp,
      processed: false,
      extractedItems: [],
    };
  }

  /**
   * WRITE PATH: Extract atomic items from resource
   */
  async extractItems(resourceId: string): Promise<MemoryItem[]> {
    const resource = this.db.query(
      `SELECT * FROM memory_resources WHERE id = ?`
    ).get(resourceId) as MemoryResource;

    if (!resource) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    // Call Ollama to extract facts
    const prompt = this.config.extractionPrompt.replace("{{content}}", resource.rawContent);
    
    let items: MemoryItem[] = [];
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.extractionModel,
          prompt,
          stream: false,
          format: "json",
        }),
      });

      if (response.ok) {
        const data = await response.json() as { response: string };
        const parsed = JSON.parse(data.response);
        
        items = parsed.map((item: any, idx: number) => ({
          id: `item_${Date.now()}_${idx}`,
          resourceId: resourceId,
          content: item.content,
          category: item.category,
          extractedAt: new Date().toISOString(),
        }));

        // Store items
        for (const item of items) {
          this.db.query(`
            INSERT INTO memory_items (id, resource_id, content, category, extracted_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(item.id, item.resourceId, item.content, item.category, item.extractedAt);
        }

        // Update resource
        this.db.query(`
          UPDATE memory_resources SET processed = TRUE, extracted_items = ? WHERE id = ?
        `).run(items.length, resourceId);
      }
    } catch (err) {
      console.error("[TieredMemory] Extraction failed:", err);
    }

    return items;
  }

  /**
   * WRITE PATH: Organize items into categories
   */
  async organizeIntoCategories(items: MemoryItem[]): Promise<Map<string, TieredCategory>> {
    const categories = new Map<string, TieredCategory>();

    // Group by explicit category or auto-classify
    const byCategory = new Map<string, MemoryItem[]>();
    
    for (const item of items) {
      const catName = item.category || "general";
      if (!byCategory.has(catName)) {
        byCategory.set(catName, []);
      }
      byCategory.get(catName)!.push(item);
    }

    // Process each category
    for (const [catName, catItems] of byCategory) {
      // Get or create category
      let category = this.getCategoryByName(catName);
      
      if (!category) {
        category = await this.createCategory(catName);
      }

      // Evolve summary
      await this.evolveCategory(category, catItems);

      categories.set(catName, category);
    }

    return categories;
  }

  /**
   * WRITE PATH: Evolve category summary with new items
   */
  private async evolveCategory(category: TieredCategory, items: MemoryItem[]): Promise<void> {
    const itemsText = items.map(i => `- ${i.content}`).join("\n");
    
    const prompt = this.config.evolutionPrompt
      .replace("{{existing_summary}}", category.summary)
      .replace("{{new_items}}", itemsText);

    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.evolutionModel,
          prompt,
          stream: false,
        }),
      });

      if (response.ok) {
        const data = await response.json() as { response: string };
        const updatedSummary = data.response.trim();

        // Update category
        this.db.query(`
          UPDATE memory_categories 
          SET summary = ?, item_count = item_count + ?, last_updated = ?
          WHERE id = ?
        `).run(updatedSummary, items.length, new Date().toISOString(), category.id);

        // Update items with category_id
        for (const item of items) {
          this.db.query(`UPDATE memory_items SET category_id = ? WHERE id = ?`)
            .run(category.id, item.id);
        }
      }
    } catch (err) {
      console.error("[TieredMemory] Evolution failed:", err);
    }
  }

  /**
   * READ PATH: Tiered retrieval with sufficiency check
   */
  async tieredRetrieve(query: string, sessionId: string, maxTokens: number = 2000): Promise<{
    categories: string[];
    details: string[];
    items?: MemoryItem[];
  }> {
    const results = {
      categories: [] as string[],
      details: [] as string[],
      items: undefined as MemoryItem[] | undefined,
    };

    // Stage 1: Load category summaries
    const categories = this.getCategorySummaries();
    
    // Use LLM to select relevant categories
    const relevantCats = await this.selectRelevantCategories(query, categories);
    results.categories = relevantCats.map(c => c.summary);

    // Stage 2: Sufficiency check
    const isSufficient = await this.isSufficient(query, relevantCats.map(c => c.summary));
    
    if (isSufficient) {
      results.details = ["Sufficient info from category summaries"];
      return results;
    }

    // Stage 3: Drill down to items
    const items = this.getCategoryItems(relevantCats.map(c => c.id), maxTokens);
    results.items = items;
    results.details = [`Retrieved ${items.length} specific items`];

    return results;
  }

  /**
   * Helper: Get category by name
   */
  private getCategoryByName(name: string): TieredCategory | undefined {
    const row = this.db.query(`SELECT * FROM memory_categories WHERE name = ?`).get(name) as any;
    if (!row) return undefined;
    
    return {
      id: row.id,
      name: row.name,
      summary: row.summary,
      itemCount: row.item_count,
      lastUpdated: row.last_updated,
      autoCondensed: row.auto_condensed,
    };
  }

  /**
   * Helper: Create new category
   */
  private async createCategory(name: string): Promise<TieredCategory> {
    const id = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const initialSummary = `## ${name}\n\nInitial category. No items yet.`;

    this.db.query(`
      INSERT INTO memory_categories (id, name, summary, last_updated)
      VALUES (?, ?, ?, ?)
    `).run(id, name, initialSummary, now);

    return {
      id,
      name,
      summary: initialSummary,
      itemCount: 0,
      lastUpdated: now,
      autoCondensed: false,
    };
  }

  /**
   * Helper: Get all category summaries
   */
  private getCategorySummaries(): TieredCategory[] {
    const rows = this.db.query(`SELECT * FROM memory_categories`).all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      summary: r.summary,
      itemCount: r.item_count,
      lastUpdated: r.last_updated,
      autoCondensed: r.auto_condensed,
    }));
  }

  /**
   * Helper: Select relevant categories using LLM
   */
  private async selectRelevantCategories(query: string, categories: TieredCategory[]): Promise<TieredCategory[]> {
    if (categories.length === 0) return [];
    
    const catList = categories.map(c => `- ${c.name}: ${c.summary.slice(0, 100)}`).join("\n");
    
    const prompt = `Query: ${query}\n\nCategories:\n${catList}\n\nReturn JSON array of category names relevant to the query.`;
    
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.extractionModel,
          prompt,
          stream: false,
          format: "json",
        }),
      });

      if (response.ok) {
        const data = await response.json() as { response: string };
        const selectedNames = JSON.parse(data.response) as string[];
        return categories.filter(c => selectedNames.includes(c.name));
      }
    } catch (err) {
      console.error("[TieredMemory] Category selection failed:", err);
    }
    
    return categories.slice(0, this.config.maxCategoriesInContext);
  }

  /**
   * Helper: Sufficiency check
   */
  private async isSufficient(query: string, summaries: string[]): Promise<boolean> {
    if (summaries.length === 0) return false;
    
    const combined = summaries.join("\n\n");
    const prompt = `Query: ${query}\n\nContext:\n${combined}\n\nCan you answer the query with this context? Reply YES or NO only.`;
    
    try {
      const response = await fetch(`${this.ollamaUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.extractionModel,
          prompt,
          stream: false,
        }),
      });

      if (response.ok) {
        const data = await response.json() as { response: string };
        return data.response.toUpperCase().includes("YES");
      }
    } catch (err) {
      console.error("[TieredMemory] Sufficiency check failed:", err);
    }
    
    return false;
  }

  /**
   * Helper: Get items from categories
   */
  private getCategoryItems(categoryIds: string[], maxTokens: number): MemoryItem[] {
    const items: MemoryItem[] = [];
    let tokenCount = 0;

    for (const catId of categoryIds) {
      const rows = this.db.query(`
        SELECT * FROM memory_items 
        WHERE category_id = ? AND archived = FALSE
        ORDER BY extracted_at DESC
        LIMIT ?
      `).all(catId, this.config.maxItemsInContext) as any[];

      for (const row of rows) {
        const estimatedTokens = row.content.length / 4; // Rough estimate
        
        if (tokenCount + estimatedTokens > maxTokens) {
          break;
        }

        items.push({
          id: row.id,
          resourceId: row.resource_id,
          content: row.content,
          category: row.category,
          extractedAt: row.extracted_at,
          categoryId: row.category_id,
        });

        tokenCount += estimatedTokens;
      }
    }

    return items;
  }
}

export { DEFAULT_CONFIG };