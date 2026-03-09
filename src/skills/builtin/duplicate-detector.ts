/**
 * Duplicate Detection Skill - v0.3.0
 *
 * Prevents duplicate implementations by scanning codebase
 * before adding new features.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";

export interface DuplicateCheckConfig {
  similarityThreshold: number;  // 0.0 - 1.0
  maxResults: number;
  scanPaths: string[];
  excludePatterns: string[];
}

export interface DuplicateResult {
  exists: boolean;
  confidence: number;
  matches: Array<{
    file: string;
    line: number;
    snippet: string;
    similarity: number;
  }>;
  suggestion: string;
}

const DEFAULT_CONFIG: DuplicateCheckConfig = {
  similarityThreshold: 0.7,
  maxResults: 5,
  scanPaths: ["src", "lib", "dist"],
  excludePatterns: ["node_modules", ".git", "test", "*.test.ts", "*.spec.ts"],
};

class DuplicateDetector {
  private config: DuplicateCheckConfig;
  private fileCache: Map<string, string> = new Map();

  constructor(config: Partial<DuplicateCheckConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if implementation already exists
   */
  async check(
    description: string,
    codeSnippet?: string
  ): Promise<DuplicateResult> {
    console.log(`🔍 Checking for existing: ${description}`);

    const matches: DuplicateResult["matches"] = [];

    // Search by description keywords
    const keywordMatches = await this.findByKeywords(description);
    matches.push(...keywordMatches);

    // Search by code similarity
    if (codeSnippet) {
      const codeMatches = await this.findByCodeSimilarity(codeSnippet);
      matches.push(...codeMatches);
    }

    // Sort by similarity and deduplicate
    const uniqueMatches = this.deduplicateMatches(matches)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, this.config.maxResults);

    const maxSimilarity = uniqueMatches[0]?.similarity || 0;
    const exists = maxSimilarity >= this.config.similarityThreshold;

    return {
      exists,
      confidence: maxSimilarity,
      matches: uniqueMatches,
      suggestion: this.generateSuggestion(uniqueMatches, description),
    };
  }

  /**
   * Check function implementation
   */
  async checkFunction(
    functionName: string,
    signature: string,
    filePath?: string
  ): Promise<DuplicateResult> {
    console.log(`🔍 Checking function: ${functionName}`);

    // Search for existing function
    const pattern = new RegExp(
      `export\\s+(?:async\\s+)?function\\s+${functionName}\\s*\\(`,
      "i"
    );
    const matches = await this.searchPattern(pattern, filePath);

    // Also check by signature similarity
    const signatureMatches = await this.findBySignature(signature);

    const allMatches = [...matches, ...signatureMatches]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, this.config.maxResults);

    const maxSimilarity = allMatches[0]?.similarity || 0;

    return {
      exists: maxSimilarity >= this.config.similarityThreshold,
      confidence: maxSimilarity,
      matches: allMatches,
      suggestion: this.generateSuggestion(allMatches, `function "${functionName}"`),
    };
  }

  /**
   * Check class implementation
   */
  async checkClass(
    className: string,
    methods?: string[]
  ): Promise<DuplicateResult> {
    console.log(`🔍 Checking class: ${className}`);

    // Search for existing class
    const pattern = new RegExp(
      `class\\s+${className}\\s*[{(]`,
      "i"
    );
    const matches = await this.searchPattern(pattern);

    // Check for similar classes by method signatures
    let methodMatches: DuplicateResult["matches"] = [];
    if (methods && methods.length > 0) {
      methodMatches = await this.findByMethodSignatures(methods);
    }

    const allMatches = [...matches, ...methodMatches]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, this.config.maxResults);

    const maxSimilarity = allMatches[0]?.similarity || 0;

    return {
      exists: maxSimilarity >= this.config.similarityThreshold,
      confidence: maxSimilarity,
      matches: allMatches,
      suggestion: this.generateSuggestion(allMatches, `class "${className}"`),
    };
  }

  /**
   * Check file existence by purpose
   */
  async checkFile(purpose: string, extension = ".ts"): Promise<DuplicateResult> {
    console.log(`🔍 Checking file for: ${purpose}`);

    // Generate likely filenames
    const keywords = purpose.toLowerCase().split(/\s+/);
    const candidates = [
      ...keywords,
      keywords.join("-"),
      keywords.join("_"),
    ];

    const matches: DuplicateResult["matches"] = [];

    for (const scanPath of this.config.scanPaths) {
      if (!existsSync(scanPath)) continue;

      const files = await this.getFiles(scanPath, extension);

      for (const file of files) {
        const basename = path.basename(file, extension);
        const similarity = this.calculateStringSimilarity(
          purpose.toLowerCase(),
          basename.toLowerCase().replace(/[-_]/g, " ")
        );

        if (similarity > 0.5) {
          const content = await this.readFile(file);
          matches.push({
            file,
            line: 1,
            snippet: content.slice(0, 200),
            similarity,
          });
        }
      }
    }

    const sorted = matches
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, this.config.maxResults);

    return {
      exists: sorted.length > 0 && sorted[0].similarity >= this.config.similarityThreshold,
      confidence: sorted[0]?.similarity || 0,
      matches: sorted,
      suggestion: this.generateSuggestion(sorted, `file for "${purpose}"`),
    };
  }

  // Private methods

  private async findByKeywords(keywords: string): Promise<DuplicateResult["matches"]> {
    const matches: DuplicateResult["matches"] = [];
    const terms = keywords.toLowerCase().split(/\s+/).filter(t => t.length > 3);

    for (const scanPath of this.config.scanPaths) {
      if (!existsSync(scanPath)) continue;

      const files = await this.getFiles(scanPath, ".ts");

      for (const file of files) {
        const content = await this.readFile(file);
        const lines = content.split("\n");

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].toLowerCase();
          let matchCount = 0;

          for (const term of terms) {
            if (line.includes(term)) matchCount++;
          }

          const similarity = matchCount / terms.length;
          if (similarity > 0.3) {
            matches.push({
              file,
              line: i + 1,
              snippet: lines[i].trim().slice(0, 100),
              similarity,
            });
          }
        }
      }
    }

    return matches;
  }

  private async findByCodeSimilarity(code: string): Promise<DuplicateResult["matches"]> {
    const matches: DuplicateResult["matches"] = [];
    const normalizedCode = this.normalizeCode(code);

    for (const scanPath of this.config.scanPaths) {
      if (!existsSync(scanPath)) continue;

      const files = await this.getFiles(scanPath, ".ts");

      for (const file of files) {
        const content = await this.readFile(file);
        const normalizedContent = this.normalizeCode(content);

        const similarity = this.calculateCodeSimilarity(normalizedCode, normalizedContent);

        if (similarity > 0.3) {
          matches.push({
            file,
            line: 1,
            snippet: content.slice(0, 200),
            similarity,
          });
        }
      }
    }

    return matches;
  }

  private async findBySignature(signature: string): Promise<DuplicateResult["matches"]> {
    const matches: DuplicateResult["matches"] = [];
    
    // Parse the input signature
    const parsedSig = this.parseSignature(signature);
    const normalizedSignature = this.normalizeSignature(signature);

    for (const scanPath of this.config.scanPaths) {
      if (!existsSync(scanPath)) continue;

      const files = await this.getFiles(scanPath, ".ts");

      for (const file of files) {
        const content = await this.readFile(file);
        const signatures = this.extractSignatures(content);

        for (const foundSig of signatures) {
          // Calculate similarity using parsed signatures
          const similarity = this.calculateSignatureSimilarity(parsedSig, foundSig);

          if (similarity > 0.6) {
            matches.push({
              file,
              line: foundSig.line,
              snippet: foundSig.text,
              similarity,
            });
          }
        }
      }
    }

    return matches;
  }

  /**
   * Parse function signature
   */
  private parseSignature(signature: string): { name: string; params: string[] } {
    const match = signature.match(/\s*(\w+)\s*\(([^)]*)\)/);
    if (match) {
      return {
        name: match[1],
        params: match[2]
          ? match[2].split(",").map(p => p.trim()).filter(Boolean)
          : [],
      };
    }
    return { name: "", params: [] };
  }

  private async findByMethodSignatures(methods: string[]): Promise<DuplicateResult["matches"]> {
    const matches: DuplicateResult["matches"] = [];

    for (const scanPath of this.config.scanPaths) {
      if (!existsSync(scanPath)) continue;

      const files = await this.getFiles(scanPath, ".ts");

      for (const file of files) {
        const content = await this.readFile(file);
        const classMatches: string[] = [];

        // Extract class definitions
        const classRegex = /class\s+(\w+)\s*\{/g;
        let match;
        while ((match = classRegex.exec(content)) !== null) {
          classMatches.push(match[1]);
        }

        // Check for method presence
        const methodMatches = methods.filter(m =>
          content.includes(m) || content.includes(this.camelToKebab(m))
        );

        const similarity = methodMatches.length / methods.length;

        if (similarity > 0.5) {
          matches.push({
            file,
            line: 1,
            snippet: `Classes: ${classMatches.join(", ")}`,
            similarity,
          });
        }
      }
    }

    return matches;
  }

  private async searchPattern(
    pattern: RegExp,
    specificPath?: string
  ): Promise<DuplicateResult["matches"]> {
    const matches: DuplicateResult["matches"] = [];
    const paths = specificPath ? [specificPath] : this.config.scanPaths;

    for (const scanPath of paths) {
      if (!existsSync(scanPath)) continue;

      const files = await this.getFiles(scanPath, ".ts");

      for (const file of files) {
        const content = await this.readFile(file);

        if (pattern.test(content)) {
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
              matches.push({
                file,
                line: i + 1,
                snippet: lines[i].trim(),
                similarity: 0.9, // Direct pattern match
              });
            }
          }
        }
      }
    }

    return matches;
  }

  private async getFiles(dir: string, extension: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (this.shouldExclude(entry.name)) continue;
          files.push(...(await this.getFiles(fullPath, extension)));
        } else if (entry.name.endsWith(extension)) {
          files.push(fullPath);
        }
      }
    } catch {
      // Directory doesn't exist or no access
    }

    return files;
  }

  private async readFile(filePath: string): Promise<string> {
    if (this.fileCache.has(filePath)) {
      return this.fileCache.get(filePath)!;
    }

    try {
      const content = await fs.readFile(filePath, "utf-8");
      this.fileCache.set(filePath, content);
      return content;
    } catch {
      return "";
    }
  }

  private shouldExclude(name: string): boolean {
    return this.config.excludePatterns.some(pattern => {
      if (pattern.includes("*")) {
        const regex = new RegExp(pattern.replace("*", ".*"));
        return regex.test(name);
      }
      return name === pattern;
    });
  }

  private normalizeCode(code: string): string {
    return code
      .replace(/\s+/g, " ")
      .replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\s*(\{|\}|\(|\)|;|,|:)\s*/g, "$1")
      .toLowerCase()
      .trim();
  }

  private normalizeSignature(sig: string): string {
    return sig
      .replace(/\s+/g, "")
      .replace(/\w+\s*:\s*\w+/g, "_")
      .toLowerCase();
  }

  private calculateCodeSimilarity(a: string, b: string): number {
    // Simple substring-based similarity
    if (a.length === 0 || b.length === 0) return 0;
    if (a === b) return 1;

    // Check for significant substring matches
    const minLen = Math.min(a.length, b.length);
    const maxLen = Math.max(a.length, b.length);

    let longestMatch = 0;
    for (let i = 0; i < a.length; i++) {
      for (let j = minLen; j > longestMatch && i + j <= a.length; j--) {
        const substr = a.slice(i, i + j);
        if (b.includes(substr)) {
          longestMatch = j;
          break;
        }
      }
    }

    return longestMatch / maxLen;
  }

  private calculateStringSimilarity(a: string, b: string): number {
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;

    if (longer.length === 0) return 1;

    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  private calculateSignatureSimilarity(
    a: { name: string; params: string[] },
    b: { name: string; params: string[]; line: number; text: string }
  ): number {
    const nameSim = a.name === b.name ? 1 : 0;
    const paramSim = this.jaccardSimilarity(
      new Set(a.params),
      new Set(b.params)
    );
    return (nameSim + paramSim) / 2;
  }

  private jaccardSimilarity<T>(a: Set<T>, b: Set<T>): number {
    const intersection = new Set([...a].filter(x => b.has(x)));
    const union = new Set([...a, ...b]);
    return intersection.size / union.size;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  private extractSignatures(content: string): Array<{
    name: string;
    params: string[];
    line: number;
    text: string;
  }> {
    const signatures: Array<{
      name: string;
      params: string[];
      line: number;
      text: string;
    }> = [];

    const lines = content.split("\n");
    const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/;

    lines.forEach((line, index) => {
      const match = functionRegex.exec(line);
      if (match) {
        const params = match[2]
          .split(",")
          .map(p => p.trim().split(":")[0])
          .filter(Boolean);
        signatures.push({
          name: match[1],
          params,
          line: index + 1,
          text: line.trim(),
        });
      }
    });

    return signatures;
  }

  private camelToKebab(str: string): string {
    return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
  }

  private deduplicateMatches(
    matches: DuplicateResult["matches"]
  ): DuplicateResult["matches"] {
    const seen = new Set<string>();
    return matches.filter(match => {
      const key = `${match.file}:${match.line}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private generateSuggestion(
    matches: DuplicateResult["matches"],
    description: string
  ): string {
    if (matches.length === 0) {
      return `No existing implementation found for ${description}. Safe to proceed.`;
    }

    const topMatch = matches[0];
    if (topMatch.similarity >= 0.9) {
      return `⚠️  **HIGH SIMILARITY DETECTED** (${Math.round(topMatch.similarity * 100)}%)\n` +
        `Existing implementation at ${topMatch.file}:${topMatch.line}\n` +
        `Consider using existing code or extending it rather than duplicating.`;
    }

    if (matches.length === 1) {
      return `⚡ Similar implementation found (${Math.round(topMatch.similarity * 100)}% match) at ${topMatch.file}\n` +
        `Review before creating new implementation.`;
    }

    return `⚡ ${matches.length} similar implementations found:\n` +
      matches.slice(0, 3).map(m => `  - ${m.file} (${Math.round(m.similarity * 100)}%)`).join("\n") +
      `\nReview existing code before creating new implementation.`;
  }
}

// Export singleton
let detector: DuplicateDetector | null = null;

export function getDuplicateDetector(
  config?: Partial<DuplicateCheckConfig>
): DuplicateDetector {
  if (!detector) {
    detector = new DuplicateDetector(config);
  }
  return detector;
}

export { DuplicateDetector, DEFAULT_CONFIG };
export default DuplicateDetector;
