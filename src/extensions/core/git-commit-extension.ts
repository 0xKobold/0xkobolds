/**
 * Git Commit Extension for 0xKobold
 *
 * Provides conventional commit message generation and commit workflow.
 * Based on: https://skills.sh/github/awesome-copilot/git-commit
 * 
 * Official Skill: github/awesome-copilot - conventional-commit
 * 
 * SAFETY PROTOCOLS:
 * - NEVER update git config
 * - NEVER run destructive commands (--force, hard reset) without explicit request
 * - NEVER skip hooks (--no-verify) unless user asks
 * - NEVER force push to main/master
 * - If commit fails due to hooks, fix and create NEW commit (don't amend)
 * - Never commit secrets (.env, credentials.json, private keys)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { execSync } from "child_process";

// Safety blocklist - files that should never be committed
const SECRET_PATTERNS = [
  /\.env$/i,
  /\.env\.local$/i,
  /\.env\.production$/i,
  /credentials/i,
  /secret/i,
  /private.*key/i,
  /id_rsa/i,
  /id_ed25519/i,
  /\.pem$/i,
  /\.key$/i,
  /token/i,
  /password/i,
];

/**
 * Check if file might contain secrets
 */
function checkForSecrets(files: string[]): string[] {
  return files.filter(f => SECRET_PATTERNS.some(pattern => pattern.test(f)));
}

// Conventional commit types
const COMMIT_TYPES = [
  { type: "feat", desc: "A new feature" },
  { type: "fix", desc: "A bug fix" },
  { type: "docs", desc: "Documentation only changes" },
  { type: "style", desc: "Code style changes (formatting, semicolons, etc)" },
  { type: "refactor", desc: "Code refactoring without changing functionality" },
  { type: "perf", desc: "Performance improvements" },
  { type: "test", desc: "Adding or fixing tests" },
  { type: "build", desc: "Build system or dependency changes" },
  { type: "ci", desc: "CI/CD configuration changes" },
  { type: "chore", desc: "Other changes that don't modify src or test files" },
  { type: "revert", desc: "Reverting a previous commit" },
];

interface GitStatus {
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

/**
 * Get git status
 */
function getGitStatus(): GitStatus {
  try {
    const status = execSync("git status --porcelain", { encoding: "utf-8" });
    const lines = status.trim().split("\n").filter(Boolean);

    const staged: string[] = [];
    const unstaged: string[] = [];
    const untracked: string[] = [];

    for (const line of lines) {
      const stagedFlag = line[0];
      const unstagedFlag = line[1];
      const filename = line.slice(3).trim();

      if (stagedFlag !== " " && stagedFlag !== "?") {
        staged.push(filename);
      }
      if (unstagedFlag !== " ") {
        unstaged.push(filename);
      }
      if (stagedFlag === "?") {
        untracked.push(filename);
      }
    }

    return { staged, unstaged, untracked };
  } catch (error) {
    return { staged: [], unstaged: [], untracked: [] };
  }
}

/**
 * Get git diff for staged files
 */
function getStagedDiff(): string {
  try {
    return execSync("git diff --cached", { encoding: "utf-8", maxBuffer: 1024 * 1024 });
  } catch (error) {
    return "";
  }
}

/**
 * Get git diff for unstaged files
 */
function getUnstagedDiff(): string {
  try {
    return execSync("git diff", { encoding: "utf-8", maxBuffer: 1024 * 1024 });
  } catch (error) {
    return "";
  }
}

/**
 * Analyze changes and suggest commit type
 */
function suggestCommitType(files: string[], diff: string): string {
  const fileStr = files.join(" ").toLowerCase();
  const diffStr = diff.toLowerCase();

  // Test files
  if (fileStr.includes("test") || fileStr.includes("spec")) {
    return "test";
  }

  // Documentation
  if (fileStr.includes("readme") || fileStr.includes(".md") || fileStr.includes("docs/")) {
    return "docs";
  }

  // Configuration/CI
  if (fileStr.includes(".yml") || fileStr.includes(".yaml") || fileStr.includes(".json")) {
    if (fileStr.includes(".github/") || fileStr.includes("workflow")) {
      return "ci";
    }
    if (fileStr.includes("package.json") || fileStr.includes("tsconfig")) {
      return "build";
    }
  }

  // Check diff for patterns
  if (diffStr.includes("delete") || diffStr.includes("remove")) {
    // Could be refactor or chore
  }

  if (diffStr.includes("fix") || diffStr.includes("bug") || diffStr.includes("error")) {
    return "fix";
  }

  if (diffStr.includes("feat") || diffStr.includes("add") || diffStr.includes("new")) {
    return "feat";
  }

  if (diffStr.includes("perf") || diffStr.includes("optim")) {
    return "perf";
  }

  if (diffStr.includes("refactor")) {
    return "refactor";
  }

  return "feat"; // Default
}

/**
 * Parse commit message components
 */
function parseCommitMessage(input: string): { type: string; scope: string; description: string; body: string; footer: string } {
  // Match conventional commit pattern
  const regex = /^(\w+)(?:\(([^)]+)\))?!?: (.+)$/m;
  const match = input.match(regex);

  if (match) {
    const [, type, scope, description] = match;
    const parts = input.split("\n\n");
    const body = parts[1] || "";
    const footer = parts[2] || "";
    return { type, scope: scope || "", description, body, footer };
  }

  // Fallback: treat entire input as description
  return { type: "", scope: "", description: input.trim(), body: "", footer: "" };
}

export default function gitCommitExtension(pi: ExtensionAPI) {

  // ═════════════════════════════════════════════════════════════════════════
  // USER COMMANDS
  // ═════════════════════════════════════════════════════════════════════════

  pi.registerCommand("commit", {
    description: "Generate conventional commit message (usage: /commit [message] or see status)",
    handler: async (args, ctx) => {
      const status = getGitStatus();
      const { staged, unstaged, untracked } = status;

      // If message provided and files staged, commit directly
      if (args.trim() && staged.length > 0) {
        const message = args.trim();
        const { type, scope, description, body, footer } = parseCommitMessage(message);

        if (!type || !COMMIT_TYPES.some(t => t.type === type)) {
          ctx.ui?.notify?.(
            "❌ Invalid commit type. Use one of:\n" +
            COMMIT_TYPES.map(t => `  ${t.type} - ${t.desc}`).join("\n"),
            "error"
          );
          return;
        }

        try {
          const fullMessage = scope
            ? `${type}(${scope}): ${description}`
            : `${type}: ${description}`;
          const finalMessage = body ? `${fullMessage}\n\n${body}` : fullMessage;
          const command = `git commit -m "${finalMessage.replace(/"/g, '\\"')}"`;

          execSync(command, { encoding: "utf-8" });
          ctx.ui?.notify?.(`✅ Committed: ${fullMessage}`, "info");
        } catch (error) {
          ctx.ui?.notify?.(`❌ Commit failed: ${error}`, "error");
        }
        return;
      }

      // Show status
      let msg = "📊 Git Status:\n\n";

      if (staged.length > 0) {
        msg += `✓ Staged (${staged.length}):\n${staged.map(f => `  ${f}`).join("\n")}\n\n`;
      }

      if (unstaged.length > 0) {
        msg += `○ Unstaged (${unstaged.length}):\n${unstaged.map(f => `  ${f}`).join("\n")}\n\n`;
      }

      if (untracked.length > 0) {
        msg += `? Untracked (${untracked.length}):\n${untracked.map(f => `  ${f}`).join("\n")}\n\n`;
      }

      if (staged.length === 0 && unstaged.length === 0 && untracked.length === 0) {
        msg += "✓ Working directory clean\n";
      } else {
        msg += "Use /commit-suggest to generate message\n";
        msg += "Or /commit \"<type>(<scope>): <description>\" to commit";
      }

      ctx.ui.notify(msg, "info");
    },
  });

  pi.registerCommand("commit-suggest", {
    description: "Suggest conventional commit message based on staged changes",
    handler: async (_args, ctx) => {
      const status = getGitStatus();
      const { staged } = status;

      if (staged.length === 0) {
        ctx.ui.notify("⚠️ No staged changes. Run 'git add <files>' first.", "warning");
        return;
      }

      const diff = getStagedDiff();
      const suggestedType = suggestCommitType(staged, diff);

      // Try to infer scope from file paths
      const dirs = staged.map(f => f.split("/")[0]).filter(Boolean);
      const scope = dirs.length === 1 ? dirs[0] : "";

      // Generate description from file changes
      const fileNames = staged.map(f => f.split("/").pop()?.replace(/\.[^.]+$/, ""));
      const description = staged.length === 1
        ? `update ${fileNames[0]}`
        : `update ${staged.length} files`;

      const commitMsg = scope
        ? `${suggestedType}(${scope}): ${description}`
        : `${suggestedType}: ${description}`;

      ctx.ui.notify(
        `💡 Suggested commit message:\n\n` +
        `  ${commitMsg}\n\n` +
        `Type: ${suggestedType} (${COMMIT_TYPES.find(t => t.type === suggestedType)?.desc})\n` +
        `Files: ${staged.join(", ")}\n\n` +
        `To commit: /commit \"${commitMsg}\"`,
        "info"
      );
    },
  });

  pi.registerCommand("commit-types", {
    description: "Show conventional commit types",
    handler: async (_args, ctx) => {
      const types = COMMIT_TYPES.map(t => `  ${t.type.padEnd(10)} - ${t.desc}`).join("\n");
      ctx.ui.notify(
        `📋 Conventional Commit Types:\n\n${types}\n\n` +
        `Format: type(scope): description\n` +
        `Example: feat(auth): add OAuth login`,
        "info"
      );
    },
  });

  pi.registerCommand("commit-amend", {
    description: "Amend last commit (usage: /commit-amend [new-message])",
    handler: async (args, ctx) => {
      try {
        if (args.trim()) {
          // Amend with new message
          execSync(`git commit --amend -m "${args.replace(/"/g, '\\"')}"`, { encoding: "utf-8" });
          ctx.ui.notify("✅ Commit amended with new message", "info");
        } else {
          // Amend without changing message
          execSync("git commit --amend --no-edit", { encoding: "utf-8" });
          ctx.ui.notify("✅ Commit amended (files added, message unchanged)", "info");
        }
      } catch (error) {
        ctx.ui.notify(`❌ Amend failed: ${error}`, "error");
      }
    },
  });

  pi.registerCommand("commit-last", {
    description: "Show last commit",
    handler: async (_args, ctx) => {
      try {
        const lastCommit = execSync("git log -1 --format='%h %s'", { encoding: "utf-8" }).trim();
        const lastCommitFull = execSync("git log -1 --format='%H%n%an <%ae>%n%ad%n%n%s%n%n%b'", { encoding: "utf-8" }).trim();
        ctx.ui.notify(`📝 Last commit:\n  ${lastCommit}\n\n${lastCommitFull}`, "info");
      } catch (error) {
        ctx.ui.notify("❌ Failed to get last commit", "error");
      }
    },
  });

  // ═════════════════════════════════════════════════════════════════════════
  // AGENT TOOLS
  // ═════════════════════════════════════════════════════════════════════════

  pi.registerTool({
    name: "git_status",
    label: "git_status",
    description: "Get current git status including staged, unstaged, and untracked files. Use before generating commit messages.",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {},
    },
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const status = getGitStatus();
      const { staged, unstaged, untracked } = status;

      const summary = [];
      if (staged.length > 0) summary.push(`${staged.length} staged`);
      if (unstaged.length > 0) summary.push(`${unstaged.length} unstaged`);
      if (untracked.length > 0) summary.push(`${untracked.length} untracked`);

      const summaryStr = summary.length > 0 ? summary.join(", ") : "clean";

      return {
        content: [{
          type: "text",
          text: `Git status: ${summaryStr}\n\n` +
            (staged.length > 0 ? `Staged:\n${staged.map(f => `  - ${f}`).join("\n")}\n\n` : "") +
            (unstaged.length > 0 ? `Unstaged:\n${unstaged.map(f => `  - ${f}`).join("\n")}\n\n` : "") +
            (untracked.length > 0 ? `Untracked:\n${untracked.map(f => `  - ${f}`).join("\n")}` : "")
        }],
        details: { success: true, ...status },
      };
    },
  });

  pi.registerTool({
    name: "git_diff",
    label: "git_diff",
    description: "Get git diff for staged or unstaged changes. Use to understand what changed before generating commit messages.",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        staged: {
          type: "boolean",
          description: "Get diff for staged changes (default: true)",
          default: true,
        },
      },
    },
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { staged = true } = params as { staged?: boolean };
      const diff = staged ? getStagedDiff() : getUnstagedDiff();

      const lines = diff.split("\n").length;
      const truncated = diff.length > 8000 ? diff.slice(0, 8000) + "\n\n... (truncated)" : diff;

      return {
        content: [{
          type: "text",
          text: diff ? `Diff (${lines} lines):\n\n\`\`\`diff\n${truncated}\n\`\`\`` : "No changes"
        }],
        details: { success: true, lineCount: lines, charCount: diff.length },
      };
    },
  });

  pi.registerTool({
    name: "generate_commit_message",
    label: "generate_commit_message",
    description: "Generate a conventional commit message based on staged changes. Analyzes git status and diff to suggest type, scope, and description.",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        custom_scope: {
          type: "string",
          description: "Optional custom scope to override auto-detection",
        },
      },
    },
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const { custom_scope } = params as { custom_scope?: string };
      const status = getGitStatus();
      const { staged } = status;

      if (staged.length === 0) {
        return {
          content: [{ type: "text", text: "No staged changes. Run 'git add' first." }],
          details: { success: false, reason: "no_staged_changes" },
        };
      }

      const diff = getStagedDiff();
      const suggestedType = suggestCommitType(staged, diff);

      // Determine scope
      let scope = custom_scope || "";
      if (!scope) {
        const dirs = staged.map(f => f.split("/")[0]).filter(Boolean);
        const uniqueDirs = [...new Set(dirs)];
        if (uniqueDirs.length === 1) {
          scope = uniqueDirs[0];
        }
      }

      // Generate description
      const fileNames = staged
        .map(f => f.split("/").pop()?.replace(/\.[^.]+$/, ""))
        .filter(Boolean);

      let description = "";
      if (staged.length === 1) {
        const file = staged[0].split("/").pop() || staged[0];
        const action = suggestedType === "fix" ? "fix" : suggestedType === "feat" ? "add" : "update";
        description = `${action} ${file}`;
      } else {
        const action = suggestedType === "fix" ? "fix" : suggestedType === "feat" ? "add" : "update";
        description = `${action} ${staged.length} files`;
      }

      const commitMsg = scope
        ? `${suggestedType}(${scope}): ${description}`
        : `${suggestedType}: ${description}`;

      const typeInfo = COMMIT_TYPES.find(t => t.type === suggestedType);

      return {
        content: [{
          type: "text",
          text: `Suggested commit message:\n\n` +
            `\`\`\`\n${commitMsg}\n\`\`\`\n\n` +
            `Type: ${suggestedType} - ${typeInfo?.desc}\n` +
            `Scope: ${scope || "(none)"}\n` +
            `Files: ${staged.join(", ")}`
        }],
        details: {
          success: true,
          message: commitMsg,
          type: suggestedType,
          scope,
          description,
          files: staged,
        },
      };
    },
  });

  pi.registerTool({
    name: "commit_changes",
    label: "commit_changes",
    description: "Commit staged changes with a conventional commit message. SAFETY: Never commits secrets, never uses --no-verify or force flags.",
    // @ts-ignore TSchema mismatch
    parameters: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Commit message (format: type(scope): description)",
        },
        body: {
          type: "string",
          description: "Optional commit body (additional paragraphs)",
        },
        footer: {
          type: "string",
          description: "Optional footer (e.g., BREAKING CHANGE: ..., Fixes #123)",
        },
      },
      required: ["message"],
    },
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { message, body, footer } = params as { message: string; body?: string; footer?: string };
      const status = getGitStatus();

      if (status.staged.length === 0) {
        return {
          content: [{ type: "text", text: "No staged changes to commit." }],
          details: { success: false, reason: "no_staged_changes" },
        };
      }

      // SAFETY CHECK: Never commit secrets
      const secrets = checkForSecrets(status.staged);
      if (secrets.length > 0) {
        const warning = `⚠️ POTENTIAL SECRETS DETECTED:\n${secrets.map(s => `  - ${s}`).join("\n")}\n\n` +
          `These files may contain sensitive data. Use .gitignore to exclude them.`;
        return {
          content: [{ type: "text", text: warning }],
          details: { success: false, reason: "secrets_detected", files: secrets },
        };
      }

      // Validate message format
      const match = message.match(/^(\w+)(?:\(([^)]+)\))?!?: (.+)$/);
      if (!match) {
        return {
          content: [{
            type: "text",
            text: "Invalid commit message format. Use: type(scope): description\n\n" +
              "Examples:\n" +
              "  feat(auth): add login\n" +
              "  fix: correct typo\n" +
              "  docs: update README"
          }],
          details: { success: false, reason: "invalid_format" },
        };
      }

      const [, type, , description] = match;
      if (!COMMIT_TYPES.some(t => t.type === type)) {
        return {
          content: [{
            type: "text",
            text: `Invalid commit type: "${type}". Use one of:\n` +
              COMMIT_TYPES.map(t => `  ${t.type} - ${t.desc}`).join("\n")
          }],
          details: { success: false, reason: "invalid_type", validTypes: COMMIT_TYPES.map(t => t.type) },
        };
      }

      try {
        // Build full message
        let fullMessage = message;
        if (body) {
          fullMessage += "\n\n" + body;
        }
        if (footer) {
          fullMessage += "\n\n" + footer;
        }

        // SAFETY: Never use --no-verify, always let hooks run
        const command = `git commit -m "${fullMessage.replace(/"/g, '\"')}"`;
        const result = execSync(command, { encoding: "utf-8" });

        if (ctx.ui?.notify) {
          ctx.ui.notify(`✅ Committed: ${message}`, "info");
        }

        return {
          content: [{ type: "text", text: `Committed successfully:\n  ${message}\n\n${result}` }],
          details: { success: true, message, command },
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        // If hooks failed, advise creating new commit rather than amending
        const advice = errorMsg.includes("hook")
          ? "\n\n💡 Pre-commit hooks failed. Fix the issues and create a new commit (don't amend)."
          : "";
        return {
          content: [{ type: "text", text: `Commit failed: ${errorMsg}${advice}` }],
          details: { success: false, error: errorMsg, hooksFailed: errorMsg.includes("hook") },
        };
      }
    },
  });

  console.log("[GitCommit] Extension loaded - /commit, /commit-suggest, /commit-types");
}
