/**
 * Persona Loader Extension for 0xKobold
 *
 * Loads identity files (IDENTITY.md, USER.md, SOUL.md, AGENT.md, MEMORY.md)
 * from ~/.0xkobold/ and injects them into the system prompt.
 *
 * This creates a personalized experience similar to OpenClaw's template system.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PERSONA_DIR = join(homedir(), ".0xkobold");

interface PersonaFiles {
  identity?: string;
  user?: string;
  soul?: string;
  agent?: string;
  memory?: string;
}

/**
 * Load persona files from ~/.0xkobold/
 */
function loadPersonaFiles(): PersonaFiles {
  const files: PersonaFiles = {};
  const fileMap: Record<keyof PersonaFiles, string> = {
    identity: "IDENTITY.md",
    user: "USER.md",
    soul: "SOUL.md",
    agent: "AGENT.md",
    memory: "MEMORY.md",
  };

  for (const [key, filename] of Object.entries(fileMap)) {
    const filepath = join(PERSONA_DIR, filename);
    if (existsSync(filepath)) {
      try {
        files[key as keyof PersonaFiles] = readFileSync(filepath, "utf-8");
      } catch (error) {
        console.warn(`[Persona] Failed to load ${filename}:`, error);
      }
    }
  }

  return files;
}

/**
 * Build the persona prompt from loaded files
 */
function buildPersonaPrompt(files: PersonaFiles): string {
  const sections: string[] = [];

  if (files.identity) {
    sections.push(`## Your Identity\n${files.identity}`);
  }

  if (files.soul) {
    sections.push(`## Your Being\n${files.soul}`);
  }

  if (files.agent) {
    sections.push(`## How You Work\n${files.agent}`);
  }

  if (files.user) {
    sections.push(`## Who You're Helping\n${files.user}`);
  }

  if (files.memory) {
    sections.push(`## Context You Remember\n${files.memory}`);
  }

  if (sections.length === 0) {
    return "";
  }

  return `\n\n=== PERSONA CONTEXT ===\n${sections.join("\n\n---\n\n")}\n\n=== END PERSONA ===\n`;
}

/**
 * Persona Loader Extension
 */
export default function personaLoaderExtension(pi: ExtensionAPI) {
  const files = loadPersonaFiles();
  const personaPrompt = buildPersonaPrompt(files);

  if (!personaPrompt) {
    console.log("[Persona] No persona files found in ~/.0xkobold/");
    console.log("[Persona] Create IDENTITY.md, USER.md, etc. to personalize your experience");
    return;
  }

  console.log("[Persona] Loaded persona files:", Object.keys(files).filter(k => files[k as keyof PersonaFiles]));

  // Inject persona into system prompt on session start
  // @ts-ignore Event type
  pi.on("session_start", async (_event, ctx) => {
    // @ts-ignore ExtensionContext type
    if (ctx.sessionManager?.setSystemPrompt) {
      // @ts-ignore ExtensionContext type
      const currentPrompt = ctx.sessionManager.getSystemPrompt?.() || "";

      // Only add if not already present
      if (!currentPrompt.includes("=== PERSONA CONTEXT ===")) {
        const newPrompt = currentPrompt + personaPrompt;
        // @ts-ignore ExtensionContext type
        ctx.sessionManager.setSystemPrompt(newPrompt);
        console.log("[Persona] Persona context injected into system prompt");
      }
    }
  });

  // Register commands to view/edit persona
  pi.registerCommand("persona", {
    description: "View current persona context",
    handler: async (_args, ctx) => {
      const loaded = Object.keys(files).filter(k => files[k as keyof PersonaFiles]);
      ctx.ui?.notify?.(
        `Persona files loaded: ${loaded.join(", ") || "none"}\n\n` +
        `Edit files in ~/.0xkobold/:\n` +
        `  - IDENTITY.md (who you are)\n` +
        `  - USER.md (who you're helping)\n` +
        `  - SOUL.md (your essence)\n` +
        `  - AGENT.md (how you work)\n` +
        `  - MEMORY.md (what you remember)`,
        "info"
      );
    },
  });

  pi.registerCommand("identity", {
    description: "View/edit identity file",
    handler: async (_args, ctx) => {
      const content = files.identity || "No IDENTITY.md found";
      ctx.ui?.notify?.(content.slice(0, 1000) + (content.length > 1000 ? "..." : ""), "info");
    },
  });

  pi.registerCommand("user-profle", {
    description: "View user profile",
    handler: async (_args, ctx) => {
      const content = files.user || "No USER.md found";
      ctx.ui?.notify?.(content.slice(0, 1000) + (content.length > 1000 ? "..." : ""), "info");
    },
  });

  pi.registerCommand("memory", {
    description: "View/update memory file",
    handler: async (_args, ctx) => {
      const content = files.memory || "No MEMORY.md found";
      ctx.ui?.notify?.(content.slice(0, 1000) + (content.length > 1000 ? "..." : ""), "info");
    },
  });

  pi.registerCommand("persona-reload", {
    description: "Reload persona files from disk",
    handler: async (_args, _ctx) => {
      const newFiles = loadPersonaFiles();
      const newPrompt = buildPersonaPrompt(newFiles);

      // Update the stored persona
      Object.assign(files, newFiles);

      // Note: Can't easily update existing session without restart
      _ctx.ui?.notify?.(
        `Reloaded persona files: ${Object.keys(newFiles).filter(k => newFiles[k as keyof PersonaFiles]).join(", ")}.\n` +
        "Restart session or start new chat to apply changes.",
        "info"
      );
    },
  });
}
