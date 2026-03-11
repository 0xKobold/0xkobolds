import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

/**
 * Persona Loader Extension - v0.2.0
 * 
 * Loads SOUL.md and IDENTITY.md from ~/.0xkobold/ (global).
 * Only creates in CWD if they don't exist globally AND don't exist locally.
 * 
 * Priority: ~/.0xkobold/ > CWD (fallback)
 */

const GLOBAL_DIR = path.join(homedir(), ".0xkobold");

const DEFAULT_SOUL = `# SOUL - Agent Personality

## Identity
**Name:** Assistant
**Role:** Helpful AI companion
**Vibe:** Friendly, curious, and supportive

## Tone
- Style: Clear and conversational
- Formality: Casual but respectful
- Humor: Light and appropriate

## Core Values
- Helpfulness: Always assist the user
- Honesty: Be truthful about capabilities
- Learning: Improve from every interaction

## Guidelines
- Ask clarifying questions when needed
- Provide examples when helpful
- Admit when unsure or need more info
`;

const DEFAULT_IDENTITY = `# IDENTITY

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

export default async function personaLoaderExtension(pi: ExtensionAPI) {
  const globalSoulPath = path.join(GLOBAL_DIR, "SOUL.md");
  const globalIdentityPath = path.join(GLOBAL_DIR, "IDENTITY.md");
  const localSoulPath = path.join(process.cwd(), "SOUL.md");
  const localIdentityPath = path.join(process.cwd(), "IDENTITY.md");
  
  // Check global files existence
  const globalSoulExists = existsSync(globalSoulPath);
  const globalIdentityExists = existsSync(globalIdentityPath);
  
  if (globalSoulExists && globalIdentityExists) {
    console.log("[PersonaLoader] Using global identity files from ~/.0xkobold/");
    return;
  }
  
  // Ensure global directory exists
  if (!existsSync(GLOBAL_DIR)) {
    await fs.mkdir(GLOBAL_DIR, { recursive: true });
    console.log("[PersonaLoader] Created global directory: ~/.0xkobold/");
  }
  
  let created = 0;
  
  // Create SOUL.md globally if missing
  if (!globalSoulExists) {
    await fs.writeFile(globalSoulPath, DEFAULT_SOUL);
    created++;
    console.log("[PersonaLoader] Created ~/.0xkobold/SOUL.md");
  }
  
  // Create IDENTITY.md globally if missing
  if (!globalIdentityExists) {
    await fs.writeFile(globalIdentityPath, DEFAULT_IDENTITY);
    created++;
    console.log("[PersonaLoader] Created ~/.0xkobold/IDENTITY.md");
  }
  
  // Also create local copies if neither global nor local exist
  // (for backward compatibility)
  if (!existsSync(localSoulPath) && !globalSoulExists) {
    await fs.writeFile(localSoulPath, DEFAULT_SOUL);
    console.log("[PersonaLoader] Created local SOUL.md");
  }
  
  if (!existsSync(localIdentityPath) && !globalIdentityExists) {
    await fs.writeFile(localIdentityPath, DEFAULT_IDENTITY);
    console.log("[PersonaLoader] Created local IDENTITY.md");
  }
  
  if (created > 0) {
    console.log(`[PersonaLoader] Created ${created} global bootstrap files`);
    console.log("[PersonaLoader] Tip: 'Read my SOUL.md and IDENTITY.md' to load personality");
  } else {
    console.log("[PersonaLoader] Global bootstrap files exist");
  }
}
