/**
 * 🏰 Draconic Lair System
 *
 * Superior workspaces for Draconic Kobolds:
 * - Auto-detected frameworks
 * - Tech stack awareness
 * - Per-file memory
 * - Multi-agent coordination per project
 *
 * "Every project is a lair to be conquered"
 */

import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

// Lair types
export type LairType = "forge" | "library" | "sanctum" | "vault" | "den";

// Framework detection
export type Framework =
  | "nextjs"
  | "react"
  | "vue"
  | "svelte"
  | "angular"
  | "express"
  | "fastify"
  | "nestjs"
  | "django"
  | "flask"
  | "rails"
  | "laravel"
  | "spring"
  | "bun"
  | "node"
  | "go"
  | "rust"
  | "python"
  | "unknown";

// Language detection
export type Language =
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "rust"
  | "java"
  | "ruby"
  | "php"
  | "csharp"
  | "cpp"
  | "unknown";

// Lair configuration
export interface DraconicLair {
  id: string;
  name: string;
  path: string;
  type: LairType;

  // Detected tech
  framework: Framework;
  language: Language;
  packageManager?: "npm" | "yarn" | "pnpm" | "bun" | "pip" | "poetry" | "bundle";

  // Configuration
  detected: {
    hasTests: boolean;
    hasLinting: boolean;
    hasFormatting: boolean;
    hasCI: boolean;
    hasDocker: boolean;
  };

  // Suggested tools
  suggestedTools: string[];
  customRules: string[];

  // Active state
  activeAgents: Set<string>; // Agent IDs
  fileMemories: Map<string, FileMemory>;

  // Metadata
  lastAccessed: number;
  createdAt: number;
}

// Memory per file
export interface FileMemory {
  path: string;
  lastModified: number;
  agentsWorkedOn: Set<string>;
  operations: FileOperation[];
  summary?: string;
  importance: number; // 0-1
}

// File operation record
export interface FileOperation {
  agentId: string;
  operation: "read" | "write" | "modify" | "delete";
  timestamp: number;
  description: string;
}

// Lair stats
export interface LairStats {
  totalLairs: number;
  byType: Record<LairType, number>;
  byFramework: Record<Framework, number>;
  totalAgents: number;
  totalFileMemories: number;
}

// Detection patterns
interface FrameworkPattern {
  files: string[];
  framework: Framework;
  confidence: number;
}

/**
 * 🐉 Draconic Lair System
 *
 * Superior to OpenClaw: Project-aware workspaces
 */
export class DraconicLairSystem extends EventEmitter {
  private lairs = new Map<string, DraconicLair>();
  private pathIndex = new Map<string, string>(); // path -> lairId

  // Framework detection patterns
  private frameworkPatterns: FrameworkPattern[] = [
    { files: ["next.config.js", "next.config.ts", "next.config.mjs"], framework: "nextjs", confidence: 1.0 },
    { files: ["package.json"], framework: "node", confidence: 0.3 },
    { files: ["bun.lockb"], framework: "bun", confidence: 0.9 },
    { files: ["Cargo.toml"], framework: "rust", confidence: 1.0 },
    { files: ["go.mod"], framework: "go", confidence: 1.0 },
    { files: ["requirements.txt", "pyproject.toml"], framework: "python", confidence: 0.8 },
    { files: ["Gemfile"], framework: "rails", confidence: 0.9 },
    { files: ["composer.json"], framework: "laravel", confidence: 0.5 },
    { files: ["pom.xml", "build.gradle"], framework: "spring", confidence: 0.9 },
  ];

  private static instance: DraconicLairSystem | null = null;

  static getInstance(): DraconicLairSystem {
    if (!DraconicLairSystem.instance) {
      DraconicLairSystem.instance = new DraconicLairSystem();
    }
    return DraconicLairSystem.instance;
  }

  /**
   * Create or get lair for path
   */
  getLair(path: string): DraconicLair {
    // Normalize path
    const normalizedPath = this.normalizePath(path);

    // Check existing
    const existing = this.pathIndex.get(normalizedPath);
    if (existing) {
      const lair = this.lairs.get(existing);
      if (lair) {
        lair.lastAccessed = Date.now();
        return lair;
      }
    }

    // Create new
    return this.createLair(normalizedPath);
  }

  /**
   * Create new lair
   */
  private createLair(path: string): DraconicLair {
    const id = `lair_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const name = basename(path);

    // Detect framework
    const detection = this.detectFramework(path);

    // Determine lair type
    const type = this.determineLairType(detection.framework, path);

    // Detect configuration
    const detected = this.detectConfiguration(path);

    const lair: DraconicLair = {
      id,
      name,
      path,
      type,
      framework: detection.framework,
      language: this.detectLanguage(path, detection.framework),
      packageManager: this.detectPackageManager(path),
      detected,
      suggestedTools: this.suggestTools(detection.framework, detected),
      customRules: [],
      activeAgents: new Set(),
      fileMemories: new Map(),
      lastAccessed: Date.now(),
      createdAt: Date.now(),
    };

    this.lairs.set(id, lair);
    this.pathIndex.set(path, id);

    this.emit("lair.created", { lair });
    console.log(`[LairSystem] Created ${type} lair: ${name} (${detection.framework})`);

    return lair;
  }

  /**
   * Detect framework from files
   */
  private detectFramework(path: string): { framework: Framework; confidence: number } {
    for (const pattern of this.frameworkPatterns) {
      for (const file of pattern.files) {
        if (existsSync(join(path, file))) {
          return { framework: pattern.framework, confidence: pattern.confidence };
        }
      }
    }

    // Check package.json content for more frameworks
    const pkgPath = join(path, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };

        if (deps.next) return { framework: "nextjs", confidence: 1.0 };
        if (deps.react) return { framework: "react", confidence: 1.0 };
        if (deps.vue) return { framework: "vue", confidence: 1.0 };
        if (deps.express) return { framework: "express", confidence: 0.9 };
        if (deps.fastify) return { framework: "fastify", confidence: 0.9 };
        if (deps["@nestjs/core"]) return { framework: "nestjs", confidence: 1.0 };
        if (deps.svelte) return { framework: "svelte", confidence: 1.0 };
      } catch {}
    }

    return { framework: "unknown", confidence: 0 };
  }

  /**
   * Detect language
   */
  private detectLanguage(path: string, framework: Framework): Language {
    const langMap: Record<Framework, Language> = {
      nextjs: "typescript",
      react: "javascript",
      vue: "javascript",
      svelte: "javascript",
      angular: "typescript",
      express: "javascript",
      fastify: "javascript",
      nestjs: "typescript",
      django: "python",
      flask: "python",
      rails: "ruby",
      laravel: "php",
      spring: "java",
      bun: "typescript",
      node: "javascript",
      go: "go",
      rust: "rust",
      python: "python",
      unknown: "unknown",
    };

    const fromFramework = langMap[framework];
    if (fromFramework !== "unknown") return fromFramework;

    // Check file extensions
    if (existsSync(join(path, "src")) || existsSync(join(path, "index.ts"))) {
      return "typescript";
    }
    if (existsSync(join(path, "setup.py")) || existsSync(join(path, "main.py"))) {
      return "python";
    }

    return "unknown";
  }

  /**
   * Detect package manager
   */
  private detectPackageManager(path: string): DraconicLair["packageManager"] {
    if (existsSync(join(path, "bun.lockb"))) return "bun";
    if (existsSync(join(path, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(join(path, "yarn.lock"))) return "yarn";
    if (existsSync(join(path, "package-lock.json"))) return "npm";
    if (existsSync(join(path, "poetry.lock"))) return "poetry";
    if (existsSync(join(path, "Pipfile.lock"))) return "pip";
    if (existsSync(join(path, "Gemfile.lock"))) return "bundle";

    return undefined;
  }

  /**
   * Detect project configuration
   */
  private detectConfiguration(path: string): DraconicLair["detected"] {
    return {
      hasTests: existsSync(join(path, "test")) || existsSync(join(path, "tests")),
      hasLinting: existsSync(join(path, ".eslintrc")) || existsSync(join(path, ".eslint.js")),
      hasFormatting: existsSync(join(path, ".prettierrc")),
      hasCI: existsSync(join(path, ".github", "workflows")),
      hasDocker: existsSync(join(path, "Dockerfile")),
    };
  }

  /**
   * Determine lair type
   */
  private determineLairType(framework: Framework, path: string): LairType {
    if (["nextjs", "react", "vue", "svelte", "django", "rails"].includes(framework)) {
      return "forge"; // Full-stack app
    }
    if (["express", "fastify", "nestjs", "spring", "flask"].includes(framework)) {
      return "sanctum"; // Backend API
    }
    if (existsSync(join(path, "lib")) || existsSync(join(path, "src", "lib"))) {
      return "library"; // Library project
    }
    if (basename(path).includes("api") || framework === "go") {
      return "sanctum";
    }
    return "den"; // Generic
  }

  /**
   * Suggest tools based on framework
   */
  private suggestTools(framework: Framework, detected: DraconicLair["detected"]): string[] {
    const tools: string[] = [];

    // Framework-specific
    const frameworkTools: Record<Framework, string[]> = {
      nextjs: ["next-dev", "next-build", "tailwind"],
      react: ["vite", "react-devtools", "storybook"],
      vue: ["vue-devtools", "vite"],
      svelte: ["svelte-check", "vite"],
      angular: ["ng", "angular-cli"],
      express: ["nodemon", "express-generator"],
      fastify: ["fastify-cli", "pino-pretty"],
      nestjs: ["nest-cli", "swagger"],
      django: ["django-admin", "pytest"],
      rails: ["rails-console", "rspec"],
      bun: ["bun", "bun-test"],
      flask: ["flask", "pytest"],
      laravel: ["artisan", "phpunit"],
      spring: ["mvn", "gradle"],
      node: ["nodemon", "ts-node"],
      rust: ["cargo-watch", "clippy"],
      go: ["air", "gopls"],
      python: ["pytest", "mypy", "black"],
      unknown: [],
    };

    tools.push(...(frameworkTools[framework] || []));

    // Generic based on detected config
    if (!detected.hasTests) tools.push("test-framework");
    if (!detected.hasLinting) tools.push("linter");
    if (!detected.hasFormatting) tools.push("formatter");
    if (!detected.hasCI) tools.push("ci-template");
    if (!detected.hasDocker) tools.push("docker-setup");

    return tools;
  }

  /**
   * Record file operation
   */
  recordFileOperation(
    lairId: string,
    filePath: string,
    agentId: string,
    operation: FileOperation["operation"],
    description: string
  ): void {
    const lair = this.lairs.get(lairId);
    if (!lair) return;

    let memory = lair.fileMemories.get(filePath);
    if (!memory) {
      memory = {
        path: filePath,
        lastModified: Date.now(),
        agentsWorkedOn: new Set(),
        operations: [],
        importance: 0.5,
      };
      lair.fileMemories.set(filePath, memory);
    }

    memory.lastModified = Date.now();
    memory.agentsWorkedOn.add(agentId);
    memory.operations.push({
      agentId,
      operation,
      timestamp: Date.now(),
      description,
    });

    // Update importance based on activity
    memory.importance = Math.min(1.0, memory.importance + 0.05);

    this.emit("file.operation", { lairId, filePath, agentId, operation });
  }

  /**
   * Add agent to lair
   */
  addAgent(lairId: string, agentId: string): boolean {
    const lair = this.lairs.get(lairId);
    if (!lair) return false;

    lair.activeAgents.add(agentId);
    this.emit("agent.added", { lairId, agentId });
    return true;
  }

  /**
   * Remove agent from lair
   */
  removeAgent(lairId: string, agentId: string): boolean {
    const lair = this.lairs.get(lairId);
    if (!lair) return false;

    lair.activeAgents.delete(agentId);
    this.emit("agent.removed", { lairId, agentId });
    return true;
  }

  /**
   * Get lair by ID
   */
  getById(id: string): DraconicLair | undefined {
    return this.lairs.get(id);
  }

  /**
   * Get lair by path
   */
  getByPath(path: string): DraconicLair | undefined {
    const normalized = this.normalizePath(path);
    const id = this.pathIndex.get(normalized);
    return id ? this.lairs.get(id) : undefined;
  }

  /**
   * List all lairs
   */
  listLairs(): DraconicLair[] {
    return Array.from(this.lairs.values()).sort(
      (a, b) => b.lastAccessed - a.lastAccessed
    );
  }

  /**
   * Get lair stats
   */
  getStats(): LairStats {
    const byType: Record<LairType, number> = { forge: 0, library: 0, sanctum: 0, vault: 0, den: 0 };
    const byFramework: Partial<Record<Framework, number>> = {};

    let totalAgents = 0;
    let totalFileMemories = 0;

    for (const lair of this.lairs.values()) {
      byType[lair.type] = (byType[lair.type] || 0) + 1;
      byFramework[lair.framework] = (byFramework[lair.framework] || 0) + 1;
      totalAgents += lair.activeAgents.size;
      totalFileMemories += lair.fileMemories.size;
    }

    return {
      totalLairs: this.lairs.size,
      byType,
      byFramework: byFramework as Record<Framework, number>,
      totalAgents,
      totalFileMemories,
    };
  }

  /**
   * Delete lair
   */
  deleteLair(id: string): boolean {
    const lair = this.lairs.get(id);
    if (!lair) return false;

    this.pathIndex.delete(lair.path);
    this.lairs.delete(id);

    this.emit("lair.deleted", { id });
    return true;
  }

  /**
   * Normalize path
   */
  private normalizePath(path: string): string {
    return path.replace(/\\/g, "/").replace(/\/$/, "");
  }

  /**
   * Cleanup old lairs
   */
  cleanupOldLairs(maxAgeMs = 7 * 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, lair] of this.lairs) {
      if (now - lair.lastAccessed > maxAgeMs) {
        this.deleteLair(id);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// Export singleton
export const getDraconicLairSystem = DraconicLairSystem.getInstance;
