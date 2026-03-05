/**
 * Onboarding Extension for 0xKobold
 *
 * Handles first-run setup by creating default persona files.
 * Interactive editing can be done later via /persona-edit command.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const PERSONA_DIR = join(homedir(), ".0xkobold");
const ONBOARDING_FLAG = join(PERSONA_DIR, ".onboarded");

function isOnboarded(): boolean {
  return existsSync(ONBOARDING_FLAG);
}

function markOnboarded(): void {
  writeFileSync(ONBOARDING_FLAG, new Date().toISOString(), "utf-8");
}

/**
 * Generate default USER.md
 */
function generateDefaultUserProfile(): string {
  return `# User Profile

## Identity
- **Name**: Developer
- **Role**: Software Developer
- **Experience Level**: Intermediate
- **Preferred Languages**: TypeScript, JavaScript

## Working Style
- Prefers collaborative approach
- Wants to understand the "why" behind suggestions
- Values clean git history

## Preferences
- **Communication**: Clear and concise
- **Code Style**: Clean and maintainable
- **Approach**: Options with trade-offs

## Notes
Onboarded: ${new Date().toLocaleDateString()}
Edit this file at ~/.0xkobold/USER.md
`;
}

/**
 * Onboarding Extension
 */
export default function onboardingExtension(pi: ExtensionAPI) {
  // Check onboarding on session start
  pi.on("session_start", async (_event, ctx) => {
    if (isOnboarded()) {
      return;
    }

    await runOnboarding(ctx);
  });

  async function runOnboarding(ctx: any): Promise<void> {
    try {
      // Ensure persona directory exists
      if (!existsSync(PERSONA_DIR)) {
        mkdirSync(PERSONA_DIR, { recursive: true });
      }

      // Show welcome message
      ctx.ui?.notify?.(
        "🐉 Welcome to 0xKobold!\n\n" +
          "Your digital familiar is ready.\n" +
          "I've created default persona files for you.\n\n" +
          "To customize:\n" +
          "  - Edit ~/.0xkobold/USER.md\n" +
          "  - Or run: 0xkobold persona init\n" +
          "  - Then: 0xkobold persona edit USER.md\n\n" +
          "Use /help to see all commands.",
        "info"
      );

      // Create USER.md if it doesn't exist
      const userFile = join(PERSONA_DIR, "USER.md");
      if (!existsSync(userFile)) {
        writeFileSync(userFile, generateDefaultUserProfile(), "utf-8");
      }

      // Mark as onboarded
      markOnboarded();
    } catch (error) {
      console.error("[Onboarding] Error:", error);
      ctx.ui?.notify?.("Onboarding error. You can run /setup manually.", "warning");
    }
  }

  // Register commands
  pi.registerCommand("onboarding", {
    description: "Run onboarding (create default persona files)",
    handler: async (_args, ctx) => {
      if (isOnboarded()) {
        ctx.ui?.notify?.("Already onboarded. Run /reset-onboarding to redo.", "info");
        return;
      }
      await runOnboarding(ctx);
    },
  });

  pi.registerCommand("setup", {
    description: "Alias for /onboarding",
    handler: async (_args, ctx) => {
      await runOnboarding(ctx);
    },
  });

  pi.registerCommand("reset-onboarding", {
    description: "Reset onboarding (run it again next session)",
    handler: async (_args, ctx) => {
      try {
        const { unlinkSync } = await import("fs");
        if (existsSync(ONBOARDING_FLAG)) {
          unlinkSync(ONBOARDING_FLAG);
          ctx.ui?.notify?.("Onboarding reset. Restart to run again.", "success");
        } else {
          ctx.ui?.notify?.("Not yet onboarded.", "info");
        }
      } catch (error) {
        ctx.ui?.notify?.("Error: " + error, "error");
      }
    },
  });

  console.log("[Onboarding] Extension loaded");
}
