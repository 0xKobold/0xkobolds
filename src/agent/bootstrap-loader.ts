/**
 * Bootstrap Loader - v0.2.0
 * 
 * Loads bootstrap personality files (SOUL.md, IDENTITY.md, etc.)
 * and prepares them for system prompt injection.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";

export interface BootstrapFile {
  name: string;
  content: string;
  exists: boolean;
  size: number;
}

export interface BootstrapConfig {
  maxFileSize?: number;      // Max chars per file (default: 20000)
  maxTotalSize?: number;     // Max total chars (default: 150000)
  files: string[];           // Files to load
}

export const DEFAULT_BOOTSTRAP_FILES = [
  "SOUL.md",
  "IDENTITY.md", 
  "USER.md",
  "AGENTS.md",
  "TOOLS.md",
  "HEARTBEAT.md",
  "MEMORY.md",
];

const DEFAULT_CONFIG: BootstrapConfig = {
  maxFileSize: 20000,
  maxTotalSize: 150000,
  files: DEFAULT_BOOTSTRAP_FILES,
};

/**
 * Load bootstrap files from workspace
 */
export async function loadBootstrapFiles(
  workspaceDir: string,
  config: Partial<BootstrapConfig> = {}
): Promise<BootstrapFile[]> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const results: BootstrapFile[] = [];
  let totalSize = 0;

  for (const filename of mergedConfig.files) {
    const filePath = path.join(workspaceDir, filename);
    
    if (!existsSync(filePath)) {
      results.push({
        name: filename,
        content: ``,
        exists: false,
        size: 0,
      });
      continue;
    }

    try {
      const content = await fs.readFile(filePath, "utf-8");
      
      // Truncate if too large
      let finalContent = content;
      if (content.length > mergedConfig.maxFileSize!) {
        finalContent = content.slice(0, mergedConfig.maxFileSize!) + 
          "\n\n[... truncated, read file for full content]";
      }

      results.push({
        name: filename,
        content: finalContent,
        exists: true,
        size: finalContent.length,
      });

      totalSize += finalContent.length;

      // Check total limit
      if (totalSize > mergedConfig.maxTotalSize!) {
        console.warn(`[Bootstrap] Total size exceeded ${mergedConfig.maxTotalSize}, stopping`);
        break;
      }
    } catch (error) {
      results.push({
        name: filename,
        content: ``,
        exists: false,
        size: 0,
      });
    }
  }

  return results;
}

/**
 * Format bootstrap files for system prompt
 */
export function formatBootstrapForPrompt(files: BootstrapFile[]): string {
  const existingFiles = files.filter(f => f.exists);
  
  if (existingFiles.length === 0) {
    return "<!-- No bootstrap context files present -->";
  }

  const sections = existingFiles.map(file => 
    `<!-- ${file.name} (${file.size} chars) -->\n${file.content}`
  );

  return [
    "<!-- Bootstrap Context (auto-loaded on session start) -->",
    ...sections,
  ].join("\n\n---\n\n");
}

/**
 * Create default SOUL.md if missing
 */
export async function ensureDefaultBootstrap(workspaceDir: string): Promise<void> {
  const soulPath = path.join(workspaceDir, "SOUL.md");
  const identityPath = path.join(workspaceDir, "IDENTITY.md");

  if (!existsSync(soulPath)) {
    const defaultSoul = `# SOUL - Agent Personality

## Identity
**Name:** 0xKobold
**Role:** Your digital familiar
**Vibe:** Friendly, curious, and helpful

## Tone
- Style: Clear and conversational
- Formality: Casual but respectful
- Humor: Light and appropriate

## Core Values
- **Helpfulness:** Always assist the user
- **Honesty:** Be truthful about capabilities
- **Learning:** Improve from every interaction

## Guidelines
- Ask clarifying questions when needed
- Provide examples when helpful
- Admit when unsure or need more info
`;
    await fs.writeFile(soulPath, defaultSoul);
    console.log("[Bootstrap] Created default SOUL.md");
  }

  if (!existsSync(identityPath)) {
    const defaultIdentity = `# IDENTITY

**Name:** 0xKobold
**Emoji:** 🐉
**Tagline:** Your digital familiar
**Role:** AI companion and coding assistant

## Tone
- Conversational and warm
- Uses emojis occasionally 🎉
- Celebrates wins with enthusiasm
- Gentle with mistakes
`;
    await fs.writeFile(identityPath, defaultIdentity);
    console.log("[Bootstrap] Created default IDENTITY.md");
  }
}
