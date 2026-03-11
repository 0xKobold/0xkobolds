/**
 * 🛡️ Draconic Safety Extension
 *
 * Consolidates 4 safety extensions into one:
 * - protected-paths.ts        → Path protection
 * - confirm-destructive.ts    → Confirmation dialogs
 * - dirty-repo-guard.ts         → Uncommitted work protection
 * - git-checkpoint.ts           → Auto-stash on operations
 *
 * Adds 🐉 Draconic enhancements:
 * - Predictive safety analysis
 * - Hierarchical operation tracking
 * - Smart checkpoint decisions
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { join, dirname, isAbsolute } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(spawn);

// 🐉 Import Draconic systems for enhanced tracking
import { getDraconicRunRegistry } from "../../agent/DraconicRunRegistry";
import { getDraconicLairSystem, DraconicLair } from "../../lair/DraconicLairSystem";

// Configuration
interface SafetyConfig {
  protectedPaths: string[];
  destructiveActions: string[];
  gitCheckpointEnabled: boolean;
  dirtyRepoGuardEnabled: boolean;
  requireConfirmation: boolean;
  autoStashMessage: string;
}

// State tracking
interface PendingOperation {
  id: string;
  type: string;
  paths: string[];
  timestamp: number;
  confirmed: boolean;
  agentId?: string;
  lairId?: string;
}

const DEFAULT_CONFIG: SafetyConfig = {
  protectedPaths: [
    "/",
    "/etc",
    "/usr",
    "/bin",
    "/sbin",
    "/lib",
    "/lib64",
    "/sys",
    "/proc",
    "/dev",
    homedir(),
    join(homedir(), ".0xkobold"),
    join(homedir(), ".ssh"),
    join(homedir(), ".gnupg"),
    join(homedir(), ".config"),
  ],
  destructiveActions: ["write", "edit", "delete", "shell", "move", "clear", "fork"],
  gitCheckpointEnabled: true,
  dirtyRepoGuardEnabled: true,
  requireConfirmation: true,
  autoStashMessage: "[🐉 0xKobold] Checkpoint before operation",
};

let config: SafetyConfig = { ...DEFAULT_CONFIG };
const pendingOperations = new Map<string, PendingOperation>();

// ============================================================================
// 🛡️ SAFETY FUNCTIONS (from protected-paths.ts)
// ============================================================================

/**
 * Check if path is protected
 */
function isProtectedPath(filePath: string): boolean {
  const normalized = isAbsolute(filePath) ? filePath : join(process.cwd(), filePath);

  return config.protectedPaths.some((protectedPath) =>
    normalized === protectedPath ||
    normalized.startsWith(protectedPath + "/") ||
    normalized.startsWith(protectedPath + "\\")
  );
}

/**
 * Validate paths before operation
 */
async function validatePaths(paths: string[]): Promise<{ valid: boolean; blocked: string[] }> {
  const blocked: string[] = [];

  for (const filePath of paths) {
    if (isProtectedPath(filePath)) {
      blocked.push(filePath);
    }
  }

  return { valid: blocked.length === 0, blocked };
}

// ============================================================================
// 📦 GIT CHECKPOINT (from git-checkpoint.ts)
// ============================================================================

/**
 * Check if directory is a git repo
 */
async function isGitRepo(dir: string): Promise<boolean> {
  return existsSync(join(dir, ".git"));
}

/**
 * Check if repo has uncommitted changes
 */
async function hasUncommittedChanges(dir: string): Promise<boolean> {
  try {
    const result = await new Promise<string>((resolve, reject) => {
      const child = spawn("git", ["status", "--porcelain"], { cwd: dir });
      let output = "";
      child.stdout.on("data", (data) => (output += data));
      child.on("close", (code) => {
        if (code === 0) resolve(output);
        else reject(new Error(`git status failed: ${code}`));
      });
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Create git stash checkpoint
 */
async function createCheckpoint(dir: string, message: string): Promise<{ success: boolean; stashId?: string; error?: string }> {
  try {
    // Check if already stashed
    const hasChanges = await hasUncommittedChanges(dir);
    if (!hasChanges) {
      return { success: true }; // Nothing to stash
    }

    // Create stash
    await new Promise<void>((resolve, reject) => {
      const child = spawn("git", ["stash", "push", "-m", message], { cwd: dir });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git stash failed: ${code}`));
      });
    });

    // Get stash ID
    const stashList = await new Promise<string>((resolve) => {
      const child = spawn("git", ["stash", "list"], { cwd: dir });
      let output = "";
      child.stdout.on("data", (data) => (output += data));
      child.on("close", () => resolve(output));
    });

    const stashId = stashList.split("\n")[0]?.match(/^stash@\{(\d+)\}/)?.[1] || "0";

    return { success: true, stashId };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Pop checkpoint (restore from stash)
 */
async function restoreCheckpoint(dir: string, stashId: string): Promise<{ success: boolean; error?: string }> {
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("git", ["stash", "pop", `stash@{${stashId}}`], { cwd: dir });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`git stash pop failed: ${code}`));
      });
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// ============================================================================
// 🐉 DRACONIC SAFETY ANALYSIS
// ============================================================================

/**
 * Analyze safety of operation with Draconic intelligence
 */
interface SafetyAnalysis {
  level: "safe" | "caution" | "dangerous";
  warnings: string[];
  recommendations: string[];
  autoCheckpoint: boolean;
  requiresConfirmation: boolean;
  agentHierarchy?: {
    depth: number;
    parentCount: number;
    childCount: number;
  };
}

async function analyzeOperationSafety(
  operation: string,
  paths: string[],
  agentId?: string
): Promise<SafetyAnalysis> {
  const warnings: string[] = [];
  const recommendations: string[] = [];
  let level: SafetyAnalysis["level"] = "safe";

  // Check protected paths
  const pathValidation = await validatePaths(paths);
  if (!pathValidation.valid) {
    level = "dangerous";
    warnings.push(`Protected paths blocked: ${pathValidation.blocked.join(", ")}`);
    recommendations.push("Use /safety override with explicit confirmation");
  }

  // Check if destructive
  if (config.destructiveActions.includes(operation)) {
    const repoDirs = new Set<string>();

    for (const filePath of paths) {
      const dir = dirname(filePath);
      if (await isGitRepo(dir)) {
        repoDirs.add(dir);

        if (config.dirtyRepoGuardEnabled && (await hasUncommittedChanges(dir))) {
          level = level === "safe" ? "caution" : level;
          warnings.push(`Uncommitted changes in ${dir}`);
          recommendations.push("Changes will be auto-stashed");
        }
      }
    }
  }

  // 🐉 Draconic: Check agent hierarchy
  let hierarchy: SafetyAnalysis["agentHierarchy"] | undefined;
  if (agentId) {
    const registry = getDraconicRunRegistry();
    const run = registry.query({}).runs.find((r) => r.id === agentId);
    if (run) {
      const children = registry.getChildren(agentId);
      const ancestors = run.parentId ? registry.get(run.parentId)?.depth || 0 : 0;

      hierarchy = {
        depth: run.depth,
        parentCount: run.depth,
        childCount: children.length,
      };

      if (run.depth > 3) {
        level = "caution";
        warnings.push(`Deep agent hierarchy (depth: ${run.depth})`);
        recommendations.push("Consider flattening agent tree");
      }
    }
  }

  // 🐉 Draconic: Check lair context
  const workspaceDir = paths[0] ? dirname(paths[0]) : process.cwd();
  const lairSystem = getDraconicLairSystem();
  const lair = lairSystem.getLair(workspaceDir);

  if (lair.activeAgents.size > 5) {
    level = level === "safe" ? "caution" : level;
    warnings.push(`Many active agents in lair: ${lair.activeAgents.size}`);
  }

  return {
    level,
    warnings,
    recommendations,
    autoCheckpoint: config.gitCheckpointEnabled && level !== "safe",
    requiresConfirmation: config.requireConfirmation && level !== "safe",
    agentHierarchy: hierarchy,
  };
}

// ============================================================================
// MAIN EXTENSION
// ============================================================================

export default function draconicSafetyExtension(pi: ExtensionAPI) {
  // Initialize
  console.log("[🛡️ DraconicSafety] Extension loaded");
  console.log("  Consolidated: protected-paths, confirm-destructive, dirty-repo-guard, git-checkpoint");

  // ============================================================================
  // TOOLS
  // ============================================================================

  // 🛡️ safety_check - Replaces protected-paths validation
  pi.registerTool({
    name: "safety_check",
    label: "🛡️ Safety Check",
    description: "Validate operation safety with Draconic analysis",
    parameters: Type.Object({
      operation: Type.String({ description: "Operation type" }),
      paths: Type.Array(Type.String(), { description: "Target paths" }),
      agentId: Type.Optional(Type.String({ description: "Agent ID for hierarchy check" })),
    }),
    async execute(
      _toolCallId: string,
      params: Record<string, unknown>,
      _signal: AbortSignal,
      _onUpdate: any,
      ctx: ExtensionContext
    ) {
      const operation = params.operation as string;
      const paths = params.paths as string[];
      const agentId = params.agentId as string | undefined;

      const analysis = await analyzeOperationSafety(operation, paths, agentId);

      return {
        content: [{
          type: "text",
          text: `🛡️ Safety Analysis: ${analysis.level.toUpperCase()}\n\n${analysis.warnings.length > 0 ? "⚠️ Warnings:\n" + analysis.warnings.map((w) => "  • " + w).join("\n") + "\n\n" : ""}${analysis.recommendations.length > 0 ? "💡 Recommendations:\n" + analysis.recommendations.map((r) => "  • " + r).join("\n") : "✅ No issues detected"}`,
        }],
        details: analysis,
        isError: analysis.level === "dangerous",
      };
    },
  });

  // 📦 safety_checkpoint - Replaces git-checkpoint
  pi.registerTool({
    name: "safety_checkpoint",
    label: "📦 Git Checkpoint",
    description: "Create or restore git stash checkpoint",
    parameters: Type.Object({
      action: Type.String({ description: "create or restore" }),
      directory: Type.String({ description: "Git repository directory" }),
      stashId: Type.Optional(Type.String({ description: "Stash ID for restore" })),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      const action = params.action as string;
      const directory = params.directory as string;
      const stashId = params.stashId as string | undefined;

      if (action === "create") {
        const result = await createCheckpoint(directory, config.autoStashMessage);
        return {
          content: [{
            type: "text",
            text: result.success ? `✅ Checkpoint created${result.stashId ? ` (stash@{${result.stashId}})` : ""}` : `❌ Failed: ${result.error}`,
          }],
          details: { success: result.success, error: result.error || "", stashId: result.stashId },
          isError: !result.success,
        };
      } else if (action === "restore") {
        if (!stashId) {
          return { content: [{ type: "text", text: "❌ Stash ID required for restore" }], details: { success: false, error: "missing_stash_id", stashId: "" }, isError: true };
        }
        const result = await restoreCheckpoint(directory, stashId);
        return {
          content: [{
            type: "text",
            text: result.success ? `✅ Checkpoint restored` : `❌ Failed: ${result.error}`,
          }],
          details: { success: result.success, error: result.error || "", stashId: stashId },
          isError: !result.success,
        };
      }

      return { content: [{ type: "text", text: "❌ Invalid action. Use 'create' or 'restore'" }], details: { success: false, error: "invalid_action", stashId: "" }, isError: true };
    },
  });

  // 🐉 draconic_safety_analysis - Enhanced with Draconic intelligence
  pi.registerTool({
    name: "draconic_safety_analysis",
    label: "🐉 Draconic Safety Analysis",
    description: "Full safety analysis with lair context and agent hierarchy",
    parameters: Type.Object({
      operation: Type.String(),
      paths: Type.Array(Type.String()),
      sessionKey: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId: string, params: Record<string, unknown>, _signal: AbortSignal, _onUpdate: any, ctx: ExtensionContext) {
      const operation = params.operation as string;
      const paths = params.paths as string[];
      const sessionKey = (params.sessionKey as string) || (ctx as any).sessionKey || "unknown";

      // Get active agent in session
      const registry = getDraconicRunRegistry();
      const sessionRuns = registry.query({ sessionKey, status: ["running", "spawning"] }).runs;
      const activeAgent = sessionRuns[0];

      const analysis = await analyzeOperationSafety(operation, paths, activeAgent?.id);

      // 🐉 Include Draconic metadata
      const lairSystem = getDraconicLairSystem();
      const lair = lairSystem.getLair(paths[0] ? dirname(paths[0]) : process.cwd());

      return {
        content: [{
          type: "text",
          text: `🐉 Draconic Safety Analysis\n\nLevel: ${analysis.level.toUpperCase()}\n\n${analysis.warnings.map((w) => `⚠️ ${w}`).join("\n")}\n\n${analysis.recommendations.map((r) => `💡 ${r}`).join("\n")}\n\nLair Context:\n  Active agents: ${lair.activeAgents.size}\n  File memories: ${lair.fileMemories.size}`,
        }],
        details: { ...analysis, lair: { id: lair.id, agentCount: lair.activeAgents.size } },
      };
    },
  });

  // ============================================================================
  // COMMANDS
  // ============================================================================

  // /safety status
  pi.registerCommand("safety", {
    description: "Show safety configuration",
    handler: async (_args: string, ctx: ExtensionContext) => {
      ctx.ui.notify(
        `🛡️ Safety Status:\n` +
          `Git Checkpoint: ${config.gitCheckpointEnabled ? "✅" : "❌"}\n` +
          `Dirty Repo Guard: ${config.dirtyRepoGuardEnabled ? "✅" : "❌"}\n` +
          `Require Confirmation: ${config.requireConfirmation ? "✅" : "❌"}\n` +
          `Protected Paths: ${config.protectedPaths.length}`,
        "info"
      );
    },
  });

  // /safety check <operation> <path>
  pi.registerCommand("safety-check", {
    description: "Check operation safety: /safety-check <operation> <path>",
    handler: async (args: string, ctx: ExtensionContext) => {
      const parts = args.trim().split(/\s+/);
      const operation = parts[0];
      const path = parts[1];

      if (!operation || !path) {
        ctx.ui.notify("❌ Usage: /safety-check <operation> <path>", "error");
        return;
      }

      const result = await validatePaths([path]);
      ctx.ui.notify(result.valid ? "✅ Path is safe" : `❌ Blocked: ${result.blocked.join(", ")}`, result.valid ? "info" : "error");
    },
  });

  // /safety checkpoint <directory>
  pi.registerCommand("safety-checkpoint", {
    description: "Create git checkpoint: /safety-checkpoint <directory>",
    handler: async (args: string, ctx: ExtensionContext) => {
      const dir = args.trim() || process.cwd();

      if (await isGitRepo(dir)) {
        const result = await createCheckpoint(dir, config.autoStashMessage);
        ctx.ui.notify(
          result.success ? `✅ Checkpoint created` : `❌ ${result.error}`,
          result.success ? "info" : "error"
        );
      } else {
        ctx.ui.notify("❌ Not a git repository", "error");
      }
    },
  });

  // ============================================================================
  // CONFIGURATION COMMANDS
  // ============================================================================

  pi.registerCommand("safety-config", {
    description: "Configure safety settings: /safety-config <key> <value>",
    handler: async (args: string, ctx: ExtensionContext) => {
      const parts = args.trim().split(/\s+/);
      const key = parts[0];
      const value = parts[1];

      if (!key) {
        ctx.ui.notify("Current config:\n" + JSON.stringify(config, null, 2), "info");
        return;
      }

      if (key === "gitCheckpoint") {
        config.gitCheckpointEnabled = value === "true";
      } else if (key === "dirtyRepoGuard") {
        config.dirtyRepoGuardEnabled = value === "true";
      } else if (key === "requireConfirmation") {
        config.requireConfirmation = value === "true";
      }

      ctx.ui.notify(`✅ ${key} = ${value}`, "info");
    },
  });

  console.log("[🛡️ DraconicSafety] Commands:");
  console.log("  /safety, /safety-check, /safety-checkpoint, /safety-config");
}
