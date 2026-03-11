/**
 * 💎 Draconic Hoard System
 *
 * Superior code snippet management:
 * - Track "treasures" (valuable code snippets)
 * - Semantic search across hoard
 * - Automatic "this might be useful" suggestions
 * - Share treasures across sessions
 *
 * "A Kobold's hoard is never too big"
 */

import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";

// A treasure (valuable code snippet)
export interface Treasure {
  id: string;
  name: string;
  description: string;
  code: string;
  language: string;
  tags: string[];

  // Quality metrics
  quality: number; // 0-10
  complexity: "simple" | "medium" | "complex";
  usefulness: number; // 0-1, based on retrieval frequency

  // Usage tracking
  timesUsed: number;
  lastAccessed: number;
  createdAt: number;

  // Origin
  sourceFile?: string;
  sourceSession?: string;
  createdBy?: string;

  // Related
  relatedTreasures: string[];
  alternatives: string[];

  // Sharing
  sharedWith: string[]; // Session keys
  isPublic: boolean;
}

// Treasure search result
export interface TreasureSearchResult {
  treasure: Treasure;
  score: number;
  matchedTags: string[];
  matchedTerms: string[];
}

// Treasure creation request
export interface CreateTreasureRequest {
  name: string;
  description: string;
  code: string;
  language: string;
  tags?: string[];
  sourceFile?: string;
  sourceSession?: string;
  createdBy?: string;
}

// Auto-detection for "this might be useful"
export interface TreasureSuggestion {
  treasure: Treasure;
  reason: string;
  relevance: number;
  forTask: string;
}

// Hoard statistics
export interface HoardStats {
  totalTreasures: number;
  byLanguage: Record<string, number>;
  byComplexity: Record<Treasure["complexity"], number>;
  totalUsage: number;
  topTreasures: string[];
  sharedTreasures: number;
  averageQuality: number;
}

// Extraction from code
interface CodeExtraction {
  functions: Array<{ name: string; signature: string; body: string }>;
  classes: Array<{ name: string; signature: string; body: string }>;
  patterns: string[];
}

/**
 * 💎 Draconic Hoard System
 *
 * Superior to OpenClaw: Intelligent code snippet management
 */
export class DraconicHoardSystem extends EventEmitter {
  private treasures = new Map<string, Treasure>();
  private tagIndex = new Map<string, Set<string>>(); // tag -> treasureIds
  private languageIndex = new Map<string, Set<string>>(); // lang -> treasureIds

  // Language detection patterns
  private languagePatterns: Record<string, RegExp> = {
    typescript: /\.(ts|tsx)$/i,
    javascript: /\.(js|jsx|mjs|cjs)$/i,
    python: /\.(py|pyw)$/i,
    go: /\.go$/i,
    rust: /\.rs$/i,
    java: /\.java$/i,
    ruby: /\.rb$/i,
    php: /\.php$/i,
    csharp: /\.(cs|csx)$/i,
    cpp: /\.(cpp|cc|cxx|hpp|h)$/i,
  };

  // Common valuable patterns
  private valuablePatterns: Array<{ pattern: RegExp; name: string; score: number }> = [
    { pattern: /async function|async\s*\(|await\s+/i, name: "async-pattern", score: 0.8 },
    { pattern: /error.*handling|try.*catch|catch.*\(/i, name: "error-handling", score: 0.9 },
    { pattern: /validation|validate|sanitize/i, name: "validation", score: 0.85 },
    { pattern: /cache|memoize|memoization/i, name: "caching", score: 0.9 },
    { pattern: /debounce|throttle/i, name: "rate-limiting", score: 0.9 },
    { pattern: /encryption|hash|crypto|bcrypt|argon/i, name: "crypto", score: 0.95 },
    { pattern: /test|describe|it\(|expect|assert/i, name: "testing", score: 0.8 },
    { pattern: /generic|interface.*\u003c|T\s+extends|type.*=.*\u003c.*\u003e/i, name: "generics", score: 0.9 },
    { pattern: /decorator|@\w+|Reflect\.metadata/i, name: "decorators", score: 0.85 },
    { pattern: /stream|pipe|pipeline|transform/i, name: "streaming", score: 0.85 },
  ];

  private static instance: DraconicHoardSystem | null = null;

  static getInstance(): DraconicHoardSystem {
    if (!DraconicHoardSystem.instance) {
      DraconicHoardSystem.instance = new DraconicHoardSystem();
    }
    return DraconicHoardSystem.instance;
  }

  /**
   * Add treasure to hoard
   */
  treasure(request: CreateTreasureRequest): string {
    const id = randomUUID();

    // Detect complexity
    const complexity = this.assessComplexity(request.code);

    // Calculate initial quality
    const quality = this.assessQuality(request.code, request.language);

    const treasure: Treasure = {
      id,
      name: request.name,
      description: request.description,
      code: request.code,
      language: request.language,
      tags: [...new Set([...(request.tags || []), request.language])],
      quality,
      complexity,
      usefulness: 0.5, // Neutral starting point
      timesUsed: 0,
      lastAccessed: Date.now(),
      createdAt: Date.now(),
      sourceFile: request.sourceFile,
      sourceSession: request.sourceSession,
      createdBy: request.createdBy,
      relatedTreasures: [],
      alternatives: [],
      sharedWith: [],
      isPublic: false,
    };

    this.treasures.set(id, treasure);
    this.indexTreasure(treasure);

    this.emit("treasure.added", { treasure });
    console.log(`[HoardSystem] New treasure: "${treasure.name}" (${treasure.language})`);

    return id;
  }

  /**
   * Auto-extract treasures from code file
   */
  extractFromCode(filePath: string, code: string, sessionKey?: string): string[] {
    const ids: string[] = [];
    const language = this.detectLanguage(filePath);

    // Extract functions
    const functions = this.extractFunctions(code, language);
    for (const func of functions) {
      if (this.shouldTreasure(func.body)) {
        const id = this.treasure({
          name: func.name,
          description: `Extracted from ${filePath}`,
          code: func.body,
          language,
          tags: ["auto-extracted", "function"],
          sourceFile: filePath,
          sourceSession: sessionKey,
        });
        ids.push(id);
      }
    }

    // Extract classes
    const classes = this.extractClasses(code, language);
    for (const cls of classes) {
      if (this.shouldTreasure(cls.body)) {
        const id = this.treasure({
          name: cls.name,
          description: `Class from ${filePath}`,
          code: cls.body,
          language,
          tags: ["auto-extracted", "class"],
          sourceFile: filePath,
          sourceSession: sessionKey,
        });
        ids.push(id);
      }
    }

    return ids;
  }

  /**
   * Get treasure by ID
   */
  get(id: string): Treasure | undefined {
    const treasure = this.treasures.get(id);
    if (treasure) {
      treasure.lastAccessed = Date.now();
      treasure.timesUsed++;
    }
    return treasure;
  }

  /**
   * Search treasures
   */
  search(query: string, options: { language?: string; limit?: number } = {}): TreasureSearchResult[] {
    const results: TreasureSearchResult[] = [];
    const terms = query.toLowerCase().split(/\s+/);

    for (const treasure of this.treasures.values()) {
      let score = 0;
      const matchedTags: string[] = [];
      const matchedTerms: string[] = [];

      // Tag matching
      for (const term of terms) {
        for (const tag of treasure.tags) {
          if (tag.toLowerCase().includes(term)) {
            score += 0.5;
            if (!matchedTags.includes(tag)) matchedTags.push(tag);
          }
        }
      }

      // Name matching
      if (treasure.name.toLowerCase().includes(query.toLowerCase())) {
        score += 2.0;
      }

      // Description matching
      for (const term of terms) {
        if (treasure.description.toLowerCase().includes(term)) {
          score += 1.0;
          matchedTerms.push(term);
        }
      }

      // Code content matching (simplified)
      for (const term of terms) {
        if (treasure.code.toLowerCase().includes(term)) {
          score += 0.3;
          matchedTerms.push(term);
        }
      }

      // Boost for quality and usefulness
      score += (treasure.quality / 10) * 0.5;
      score += treasure.usefulness * 0.3;

      // Language filter
      if (options.language && treasure.language !== options.language) {
        score *= 0.1;
      }

      if (score > 0) {
        results.push({
          treasure,
          score,
          matchedTags,
          matchedTerms,
        });
      }
    }

    // Sort by score
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, options.limit ?? 10);
  }

  /**
   * Suggest treasures for task
   */
  suggestTreasures(task: string, options: { language?: string; limit?: number } = {}): TreasureSuggestion[] {
    const suggestions: TreasureSuggestion[] = [];

    // Extract keywords from task
    const keywords = this.extractKeywords(task);

    // Search for matching treasures
    const searchResults = this.search(keywords.join(" "), {
      language: options.language,
      limit: options.limit ?? 5,
    });

    for (const result of searchResults) {
      // Calculate relevance
      const relevance = this.calculateRelevance(
        result.treasure,
        task,
        result.score
      );

      // Generate reason
      const reason = this.generateReason(result.treasure, task, result.matchedTags);

      suggestions.push({
        treasure: result.treasure,
        reason,
        relevance,
        forTask: task,
      });
    }

    // Sort by relevance
    return suggestions.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Share treasure
   */
  shareTreasure(treasureId: string, sessionKey: string): boolean {
    const treasure = this.treasures.get(treasureId);
    if (!treasure) return false;

    if (!treasure.sharedWith.includes(sessionKey)) {
      treasure.sharedWith.push(sessionKey);
      this.emit("treasure.shared", { treasureId, sessionKey });
    }

    return true;
  }

  /**
   * Get treasures shared with session
   */
  getSharedTreasures(sessionKey: string): Treasure[] {
    return Array.from(this.treasures.values()).filter((t) =>
      t.sharedWith.includes(sessionKey)
    );
  }

  /**
   * Update treasure (e.g., quality rating)
   */
  updateTreasure(
    id: string,
    updates: Partial<Pick<Treasure, "name" | "description" | "tags" | "quality">>
  ): boolean {
    const treasure = this.treasures.get(id);
    if (!treasure) return false;

    Object.assign(treasure, updates);
    if (updates.tags) {
      // Re-index
      this.removeFromIndex(id);
      this.indexTreasure(treasure);
    }

    return true;
  }

  /**
   * Delete treasure
   */
  deleteTreasure(id: string): boolean {
    this.removeFromIndex(id);
    const deleted = this.treasures.delete(id);

    if (deleted) {
      this.emit("treasure.deleted", { id });
    }

    return deleted;
  }

  /**
   * Get statistics
   */
  getStats(): HoardStats {
    const byLanguage: Record<string, number> = {};
    const byComplexity: Record<Treasure["complexity"], number> = {
      simple: 0,
      medium: 0,
      complex: 0,
    };

    let totalUsage = 0;
    let qualitySum = 0;

    const treasuresArray = Array.from(this.treasures.values());

    for (const t of treasuresArray) {
      byLanguage[t.language] = (byLanguage[t.language] || 0) + 1;
      byComplexity[t.complexity]++;
      totalUsage += t.timesUsed;
      qualitySum += t.quality;
    }

    const topTreasures = treasuresArray
      .sort((a, b) => b.timesUsed - a.timesUsed)
      .slice(0, 5)
      .map((t) => t.id);

    const sharedTreasures = treasuresArray.filter((t) => t.sharedWith.length > 0).length;

    return {
      totalTreasures: this.treasures.size,
      byLanguage,
      byComplexity,
      totalUsage,
      topTreasures,
      sharedTreasures,
      averageQuality:
        treasuresArray.length > 0 ? qualitySum / treasuresArray.length : 0,
    };
  }

  // ======== Helper Methods ========

  private indexTreasure(treasure: Treasure): void {
    // Index by tags
    for (const tag of treasure.tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(treasure.id);
    }

    // Index by language
    if (!this.languageIndex.has(treasure.language)) {
      this.languageIndex.set(treasure.language, new Set());
    }
    this.languageIndex.get(treasure.language)!.add(treasure.id);
  }

  private removeFromIndex(id: string): void {
    // Remove from tag index
    for (const [tag, ids] of this.tagIndex) {
      ids.delete(id);
      if (ids.size === 0) {
        this.tagIndex.delete(tag);
      }
    }

    // Remove from language index
    for (const [lang, ids] of this.languageIndex) {
      ids.delete(id);
      if (ids.size === 0) {
        this.languageIndex.delete(lang);
      }
    }
  }

  private assessComplexity(code: string): Treasure["complexity"] {
    const lines = code.split("\n").length;
    const nestingDepth = this.calculateNestingDepth(code);
    const functionCount = (code.match(/function|def|async|=>/g) || []).length;

    if (lines > 50 || nestingDepth > 4 || functionCount > 3) {
      return "complex";
    }
    if (lines > 20 || nestingDepth > 2 || functionCount > 1) {
      return "medium";
    }
    return "simple";
  }

  private assessQuality(code: string, language: string): number {
    let score = 5; // Base

    // Documentation
    if (code.includes("/**") || code.includes('"""')) score += 1;
    if (code.includes("//") || code.includes("# ")) score += 0.5;

    // Error handling
    if (/try.*catch|catch|error/i.test(code)) score += 1;

    // Type safety
    if (language === "typescript" && /:\s*\w+/.test(code)) score += 1;

    // Testing
    if (/test|describe|it\(/i.test(code)) score += 1;

    // Patterns
    for (const pattern of this.valuablePatterns) {
      if (pattern.pattern.test(code)) score += 0.2;
    }

    return Math.min(10, score);
  }

  private detectLanguage(filePath: string): string {
    for (const [lang, pattern] of Object.entries(this.languagePatterns)) {
      if (pattern.test(filePath)) return lang;
    }
    return "unknown";
  }

  private extractFunctions(code: string, language: string): Array<{ name: string; body: string }> {
    // Simplified extraction
    const functions: Array<{ name: string; body: string }> = [];

    // TypeScript/JavaScript
    if (["typescript", "javascript"].includes(language)) {
      const functionRegex =
        /(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
      // This is simplified - real implementation would parse AST
    }

    return functions;
  }

  private extractClasses(code: string, language: string): Array<{ name: string; body: string }> {
    // Simplified - real implementation would parse AST
    return [];
  }

  private shouldTreasure(code: string): boolean {
    // Check if code is valuable enough to treasure

    // Minimum size
    if (code.length < 50) return false;

    // Check for valuable patterns
    for (const pattern of this.valuablePatterns) {
      if (pattern.pattern.test(code)) return true;
    }

    // Unique solution (no generic boilerplate)
    if (/console\.log\(|print\(|println\(/i.test(code) && code.split("\n").length < 5) {
      return false;
    }

    return true;
  }

  private extractKeywords(text: string): string[] {
    // Extract meaningful keywords
    const words = text
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .filter((w) => !["this", "that", "with", "from", "have", "been"].includes(w));

    // Remove duplicates
    return [...new Set(words)];
  }

  private calculateRelevance(treasure: Treasure, task: string, searchScore: number): number {
    let relevance = searchScore * 0.5;

    // Usefulness boost
    relevance += treasure.usefulness * 0.2;

    // Quality boost
    relevance += (treasure.quality / 10) * 0.2;

    // Recency boost
    const daysSinceAccess = (Date.now() - treasure.lastAccessed) / (1000 * 60 * 60 * 24);
    if (daysSinceAccess < 7) relevance += 0.1;

    return Math.min(1.0, relevance);
  }

  private generateReason(treasure: Treasure, task: string, matchedTags: string[]): string {
    if (matchedTags.length > 0) {
      return `Contains ${treasure.name} (${treasure.language}) with relevant patterns: ${matchedTags.join(", ")}`;
    }
    return `Useful ${treasure.complexity} ${treasure.language} pattern for this task`;
  }

  private calculateNestingDepth(code: string): number {
    let maxDepth = 0;
    let currentDepth = 0;

    for (const char of code) {
      if (char === "{" || char === "[") {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === "}" || char === "]") {
        currentDepth--;
      }
    }

    return maxDepth;
  }
}

// Export singleton
export const getDraconicHoardSystem = DraconicHoardSystem.getInstance;

// Convenience functions
export function treasureSnippet(request: CreateTreasureRequest): string {
  return getDraconicHoardSystem().treasure(request);
}

export function findTreasures(query: string, limit?: number): TreasureSearchResult[] {
  return getDraconicHoardSystem().search(query, { limit });
}

export function suggestTreasuresForTask(task: string, language?: string): TreasureSuggestion[] {
  return getDraconicHoardSystem().suggestTreasures(task, { language });
}
