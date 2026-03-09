import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";

/**
 * Persona Loader Extension - v0.2.0
 * 
 * Creates default bootstrap files (SOUL.md, IDENTITY.md) if they don't exist.
 * Users should read these files manually or the agent can read them naturally.
 * 
 * Note: Automatic injection into system prompt requires pi-coding-agent 
 * provider-level hooks which are not available in ExtensionAPI.
 */

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
  const workspaceDir = process.cwd();
  
  const soulPath = path.join(workspaceDir, "SOUL.md");
  const identityPath = path.join(workspaceDir, "IDENTITY.md");
  
  let created = 0;
  
  if (!existsSync(soulPath)) {
    await fs.writeFile(soulPath, DEFAULT_SOUL);
    created++;
    console.log("[PersonaLoader] Created SOUL.md");
  }
  
  if (!existsSync(identityPath)) {
    await fs.writeFile(identityPath, DEFAULT_IDENTITY);
    created++;
    console.log("[PersonaLoader] Created IDENTITY.md");
  }
  
  if (created > 0) {
    console.log(`[PersonaLoader] Created ${created} bootstrap files`);
    console.log("[PersonaLoader] Tip: 'Read my SOUL.md and IDENTITY.md' to load personality");
  } else {
    console.log("[PersonaLoader] Bootstrap files exist");
  }
}
