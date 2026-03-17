/**
 * Bootstrap Loader - v0.4.0
 * 
 * HERMES-STYLE IDENTITY LOADING:
 * - SOUL.md lives ONLY in KOBOLD_HOME (instance-level, not repo-local)
 * - Personalities are session-level overlays (/personality command)
 * - AGENTS.md is project-local (hierarchical discovery)
 * - No per-agent SOUL/IDENTITY - subagents share instance identity
 * 
 * Inspired by Hermes Agent: https://hermes-agent.nousresearch.com
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";

export interface BootstrapFile {
  name: string;
  content: string;
  exists: boolean;
  size: number;
  source: "instance" | "project";
  blocked?: boolean;
  blockReason?: string;
}

export interface BootstrapConfig {
  maxFileSize?: number;      // Max chars per file (default: 20000)
  maxTotalSize?: number;     // Max total chars (default: 150000)
  enableInjectionProtection?: boolean;
  homeDir?: string;          // Override KOBOLD_HOME
  workingDir?: string;       // Project directory for AGENTS.md discovery
}

/**
 * Files loaded from KOBOLD_HOME (instance-level identity)
 * These follow you everywhere - your baseline personality
 */
export const INSTANCE_FILES = ["SOUL.md", "IDENTITY.md", "USER.md", "HEARTBEAT.md"];

/**
 * Files discovered from working directory (project-specific)
 */
export const PROJECT_FILES = ["AGENTS.md", ".cursorrules", ".cursor/rules"];

/**
 * Security: Prompt injection patterns (Hermes-style)
 */
const INJECTION_PATTERNS = [
  /ignore\s+(previous|all|your)\s+(instructions?|rules?|directives?)/gi,
  /disregard\s+(your|all|previous)\s+(instructions?|rules?)/gi,
  /forget\s+(your|all|previous)\s+(instructions?|programming)/gi,
  /system\s*prompt\s*override/gi,
  /new\s+(system|developer|admin)\s+(prompt|instructions?)/gi,
  /you\s+are\s+now\s+(a|an)\s+/gi,
  /<\s*!--.*?-->/gs,
  /<div[^>]*style\s*=\s*["']display\s*:\s*none[^>]*>/gi,
  /(?:api[_-]?key|token|secret|password|credential)\s*[:=]/gi,
  /curl\s+.*?\$(?:API_KEY|TOKEN|SECRET)/gi,
  /cat\s+\.env/gi,
  /[\u200B-\u200F\u2028-\u202F\u205F-\u206F]/g,
];

/**
 * Get the Kobold home directory
 * Like HERMES_HOME, this is where instance-level files live
 */
export function getKoboldHome(): string {
  return process.env.KOBOLD_HOME || 
         process.env.KOBOLD_WORKSPACE ||
         path.join(process.env.HOME || "", ".0xkobold");
}

/**
 * Scan content for prompt injection patterns
 */
function detectInjection(content: string): { safe: boolean; reason?: string } {
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      return { 
        safe: false, 
        reason: `Potential prompt injection detected` 
      };
    }
  }
  return { safe: true };
}

/**
 * Truncate with head/tail preservation (Hermes style)
 * 70% head, 20% tail, 10% marker
 */
function truncateWithHeadTail(content: string, maxSize: number): string {
  if (content.length <= maxSize) return content;
  
  const headSize = Math.floor(maxSize * 0.70);
  const tailSize = Math.floor(maxSize * 0.20);
  
  const head = content.slice(0, headSize);
  const tail = content.slice(-tailSize);
  const marker = `\n\n[...truncated: kept ${headSize}+${tailSize} of ${content.length} chars. Use file tools to read full content.]\n\n`;
  
  return head + marker + tail;
}

/**
 * Load instance-level files (SOUL.md, IDENTITY.md, USER.md)
 * These come from KOBOLD_HOME ONLY - never from working directory
 * This is the Hermes philosophy: stable instance-level identity
 */
export async function loadInstanceFiles(
  config: Partial<BootstrapConfig> = {}
): Promise<BootstrapFile[]> {
  const home = config.homeDir || getKoboldHome();
  const results: BootstrapFile[] = [];
  
  for (const filename of INSTANCE_FILES) {
    const filePath = path.join(home, filename);
    
    if (!existsSync(filePath)) {
      results.push({
        name: filename,
        content: "",
        exists: false,
        size: 0,
        source: "instance",
      });
      continue;
    }
    
    try {
      let content = await fs.readFile(filePath, "utf-8");
      
      // Security scan
      if (config.enableInjectionProtection !== false) {
        const scan = detectInjection(content);
        if (!scan.safe) {
          console.warn(`[Bootstrap] BLOCKED: ${filename} - ${scan.reason}`);
          results.push({
            name: filename,
            content: `[BLOCKED: ${filename} contained ${scan.reason}]`,
            exists: true,
            size: 0,
            source: "instance",
            blocked: true,
            blockReason: scan.reason,
          });
          continue;
        }
      }
      
      // Truncate if needed
      const maxSize = config.maxFileSize || 20000;
      const finalContent = truncateWithHeadTail(content, maxSize);
      
      results.push({
        name: filename,
        content: finalContent,
        exists: true,
        size: finalContent.length,
        source: "instance",
      });
    } catch (error) {
      results.push({
        name: filename,
        content: "",
        exists: false,
        size: 0,
        source: "instance",
      });
    }
  }
  
  return results;
}

/**
 * Hierarchical AGENTS.md discovery (Hermes style)
 * Walks directory tree starting from working directory
 * This is project-specific context that SHOULD vary by project
 */
export async function discoverProjectFiles(
  workingDir?: string,
  config: Partial<BootstrapConfig> = {}
): Promise<BootstrapFile[]> {
  const workDir = workingDir || config.workingDir || process.cwd();
  const results: BootstrapFile[] = [];
  const skipDirs = new Set([
    "node_modules", ".git", "dist", "build", "__pycache__",
    ".venv", "venv", "vendor", ".next", ".nuxt", "target", "vendor"
  ]);
  
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 10) return; // Max depth
    
    // Check for AGENTS.md
    const agentsPath = path.join(dir, "AGENTS.md");
    if (existsSync(agentsPath)) {
      try {
        let content = await fs.readFile(agentsPath, "utf-8");
        
        // Security scan
        if (config.enableInjectionProtection !== false) {
          const scan = detectInjection(content);
          if (!scan.safe) {
            results.push({
              name: `AGENTS.md (${path.relative(workDir, dir) || "."})`,
              content: `[BLOCKED: prompt injection detected]`,
              exists: true,
              size: 0,
              source: "project",
              blocked: true,
              blockReason: scan.reason,
            });
            return;
          }
        }
        
        const maxSize = config.maxFileSize || 20000;
        const finalContent = truncateWithHeadTail(content, maxSize);
        
        results.push({
          name: `AGENTS.md (${path.relative(workDir, dir) || "."})`,
          content: finalContent,
          exists: true,
          size: finalContent.length,
          source: "project",
        });
      } catch {}
    }
    
    // Walk subdirectories
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || skipDirs.has(entry.name) || entry.name.startsWith(".")) {
          continue;
        }
        await walk(path.join(dir, entry.name), depth + 1);
      }
    } catch {}
  }
  
  await walk(workDir, 0);
  
  // Sort shallowest first (closest to working directory)
  return results;
}

/**
 * Load personality overlay (session-level mode switch)
 * Like Hermes /personality command
 */
export async function loadPersonalityOverlay(
  personalityName: string,
  config: Partial<BootstrapConfig> = {}
): Promise<{ name: string; content: string } | null> {
  const home = config.homeDir || getKoboldHome();
  const personalityPath = path.join(home, "personalities", `${personalityName}.md`);
  
  if (!existsSync(personalityPath)) {
    return null;
  }
  
  try {
    let content = await fs.readFile(personalityPath, "utf-8");
    
    // Security scan
    if (config.enableInjectionProtection !== false) {
      const scan = detectInjection(content);
      if (!scan.safe) {
        console.warn(`[Bootstrap] Personality '${personalityName}' blocked: ${scan.reason}`);
        return null;
      }
    }
    
    return { name: personalityName, content };
  } catch {
    return null;
  }
}

/**
 * Format bootstrap files for system prompt
 * Hermes style: inject content directly, no wrapper explanations
 */
export function formatBootstrapForPrompt(
  instanceFiles: BootstrapFile[],
  projectFiles: BootstrapFile[] = [],
  personalityOverlay?: { name: string; content: string }
): string {
  const parts: string[] = [];
  
  // 1. Instance-level identity (SOUL.md, IDENTITY.md, USER.md)
  // These are your baseline personality - follows you everywhere
  const validInstance = instanceFiles.filter(f => f.exists && !f.blocked);
  if (validInstance.length > 0) {
    for (const file of validInstance) {
      // Inject directly (Hermes style: no "If SOUL.md is present..." wrapper)
      parts.push(file.content);
    }
  }
  
  // 2. Project context (AGENTS.md)
  // This varies by project - discovered from working directory
  const validProject = projectFiles.filter(f => f.exists && !f.blocked);
  if (validProject.length > 0) {
    parts.push("");
    parts.push("<!-- Project Context -->");
    for (const file of validProject) {
      parts.push(`<!-- ${file.name} (${file.size} chars) -->`);
      parts.push(file.content);
    }
  }
  
  // 3. Personality overlay (session-level mode switch)
  // Like Hermes /personality command - temporary overlay
  if (personalityOverlay) {
    parts.push("");
    parts.push(`<!-- Personality: ${personalityOverlay.name} -->`);
    parts.push(personalityOverlay.content);
  }
  
  return parts.join("\n\n");
}

/**
 * Load all bootstrap context (Hermes-style)
 */
export async function loadBootstrap(
  config: Partial<BootstrapConfig> = {}
): Promise<{
  instanceFiles: BootstrapFile[];
  projectFiles: BootstrapFile[];
}> {
  const instanceFiles = await loadInstanceFiles(config);
  const projectFiles = await discoverProjectFiles(config.workingDir, config);
  
  return { instanceFiles, projectFiles };
}

/**
 * Ensure default SOUL.md exists (Hermes style)
 */
export async function ensureDefaultFiles(
  config: Partial<BootstrapConfig> = {}
): Promise<void> {
  const home = config.homeDir || getKoboldHome();
  const soulPath = path.join(home, "SOUL.md");
  const identityPath = path.join(home, "IDENTITY.md");
  const personalitiesDir = path.join(home, "personalities");
  
  // Create default SOUL.md if missing
  if (!existsSync(soulPath)) {
    const defaultSoul = `# SOUL

**Name:** 0xKobold
**Emoji:** 🐉
**Role:** Your digital familiar

## Identity
You're a helpful AI coding assistant. Your purpose is to assist with coding tasks, 
answer questions, and act as a companion in development workflows.

## Tone
- Clear and conversational
- Direct but kind
- Practical over theoretical
- Celebrates wins, owns mistakes

## Values
- **Helpfulness:** Assist effectively
- **Honesty:** Be truthful about capabilities
- **Learning:** Improve continuously

## Guidelines
- Ask clarifying questions when needed
- Provide examples when helpful
- Admit when unsure
- Test your changes when possible
`;
    await fs.mkdir(home, { recursive: true });
    await fs.writeFile(soulPath, defaultSoul);
    console.log("[Bootstrap] Created default SOUL.md in", home);
  }
  
  // Create default IDENTITY.md if missing
  if (!existsSync(identityPath)) {
    const defaultIdentity = `# IDENTITY

**Name:** 0xKobold
**Emoji:** 🐉
**Role:** AI companion and coding assistant

## Capabilities
- Read, write, and edit files
- Execute commands
- Search codebase
- Access web resources
- Remember context across sessions
`;
    await fs.writeFile(identityPath, defaultIdentity);
    console.log("[Bootstrap] Created default IDENTITY.md");
  }
  
  // Create personalities directory with defaults
  if (!existsSync(personalitiesDir)) {
    await fs.mkdir(personalitiesDir, { recursive: true });
    
    const defaultPersonalities = {
      concise: "# Personality: Concise\n\nBe brief and direct. Skip pleasantries.\nFocus on information density.\nOne sentence if that's all it takes.\nNo filler. No \"great question.\"",
      technical: "# Personality: Technical\n\nBe detailed and precise.\nExplain technical reasoning clearly.\nInclude code examples when helpful.\nUse proper terminology.\nConsider edge cases explicitly.",
      teacher: "# Personality: Teacher\n\nExplain concepts clearly for learning.\nUse analogies and examples liberally.\nCheck understanding by asking follow-ups.\nBe patient with questions.\nBuild up from fundamentals.",
    };
    
    for (const [name, content] of Object.entries(defaultPersonalities)) {
      await fs.writeFile(path.join(personalitiesDir, `${name}.md`), content);
    }
    console.log("[Bootstrap] Created default personalities");
  }
}

/**
 * Get summary for diagnostics
 */
export function getBootstrapSummary(
  instanceFiles: BootstrapFile[],
  projectFiles: BootstrapFile[]
): {
  instanceLoaded: string[];
  projectLoaded: string[];
  blocked: string[];
  totalChars: number;
} {
  return {
    instanceLoaded: instanceFiles.filter(f => f.exists && !f.blocked).map(f => f.name),
    projectLoaded: projectFiles.filter(f => f.exists && !f.blocked).map(f => f.name),
    blocked: [...instanceFiles, ...projectFiles].filter(f => f.blocked).map(f => f.name),
    totalChars: [...instanceFiles, ...projectFiles].reduce((sum, f) => sum + f.size, 0),
  };
}

export default {
  loadInstanceFiles,
  discoverProjectFiles,
  loadPersonalityOverlay,
  loadBootstrap,
  formatBootstrapForPrompt,
  ensureDefaultFiles,
  getBootstrapSummary,
  getKoboldHome,
};