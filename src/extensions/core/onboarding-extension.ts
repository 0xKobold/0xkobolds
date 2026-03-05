/**
 * Onboarding Extension for 0xKobold
 *
 * Handles first-run setup and guides new users through:
 * - Welcome and introduction
 * - Persona file generation
 * - Mode system explanation
 * - First task guidance
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} from "fs";
import { join, homedir } from "path";

const PERSONA_DIR = join(homedir(), ".0xkobold");
const ONBOARDING_FLAG = join(PERSONA_DIR, ".onboarded");
const BOOT_FILE = join(PERSONA_DIR, "BOOT.md");

interface OnboardingState {
  step: "welcome" | "persona" | "modes" | "tools" | "complete";
  userName?: string;
  role?: string;
  experience?: string;
  style?: string;
}

function isOnboarded(): boolean {
  return existsSync(ONBOARDING_FLAG);
}

function markOnboarded(): void {
  writeFileSync(ONBOARDING_FLAG, new Date().toISOString(), "utf-8");
}

/**
 * Generate personalized USER.md from onboarding answers
 */
function generateUserProfile(answers: Partial<OnboardingState>): string {
  return `# User Profile

## Identity
- **Name**: ${answers.userName || "Anonymous"}
- **Role**: ${answers.role || "Developer"}
- **Experience Level**: ${answers.experience || "Intermediate"}

## Working Style
${answers.style === "collaborative" ? "- Prefers collaborative approach with options" : ""}
${answers.style === "delegative" ? "- Prefers direct execution" : ""}
${answers.style === "educational" ? "- Wants to understand the why" : ""}
${answers.style === "creative" ? "- Enjoys creative solutions" : ""}

## Preferences
- **Communication**: Clear and concise
- **Code Style**: ${answers.experience === "Beginner" ? "Well-explained and documented" : "Clean and maintainable"}
- **Approach**: ${answers.style === "collaborative" ? "Options with trade-offs" : "Direct solutions"}

## Notes
Onboarded: ${new Date().toLocaleDateString()}
Preferred setup complete.
`;
}

/**
 * Update BOOT.md with personalized greeting
 */
function updateBootFile(userName: string): void {
  const bootContent = existsSync(BOOT_FILE)
    ? readFileSync(BOOT_FILE, "utf-8")
    : `# Boot Sequence\n\n## Startup Greeting\n"🐉 0xKobold ready. Your digital familiar awaits."`;

  const personalizedBoot = bootContent.replace(
    /"🐉 0xKobold ready\. Your digital familiar awaits\."/,
    `"Welcome back, ${userName}. 🐉 Your familiar is ready."`
  );

  writeFileSync(BOOT_FILE, personalizedBoot, "utf-8");
}

/**
 * Onboarding Extension
 */
export default function onboardingExtension(pi: ExtensionAPI) {
  // Check onboarding on session start
  pi.on("session_start", async (_event, ctx) => {
    // Skip if already onboarded
    if (isOnboarded()) {
      // Still show boot greeting if available
      const bootFile = join(PERSONA_DIR, "BOOT.md");
      if (existsSync(bootFile)) {
        try {
          const bootContent = readFileSync(bootFile, "utf-8");
          const greetingMatch = bootContent.match(/## Startup Greeting\n(.+)/);
          if (greetingMatch) {
            const greeting = greetingMatch[1].replace(/["']+/g, "").trim();
            ctx.ui?.notify?.(greeting, "info");
          }
        } catch {
          // Ignore boot read errors
        }
      }
      return;
    }

    // Start onboarding
    await startOnboarding(ctx);
  });

  /**
   * Main onboarding flow
   */
  async function startOnboarding(ctx: any): Promise<void> {
    let answers: Partial<OnboardingState> = {};

    try {
      // Step 1: Welcome
      await welcomeStep(ctx);

      // Step 2: Persona Setup
      answers = await personaStep(ctx);

      // Step 3: Mode Explanation
      await modesStep(ctx);

      // Step 4: Tools Overview
      await toolsStep(ctx);

      // Step 5: Complete
      await completeStep(ctx, answers);
    } catch (error) {
      console.error("[Onboarding] Error:", error);
      ctx.ui?.notify?.(
        "Onboarding interrupted. You can run /onboarding anytime to restart.",
        "warning"
      );
    }
  }

  /**
   * Welcome step
   */
  async function welcomeStep(ctx: any): Promise<void> {
    const welcome = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🐉 Welcome to 0xKobold                                     ║
║                                                              ║
║   Your digital familiar is awakening...                      ║
║                                                              ║
║   I am bound to this codebase, ready to explore,           ║
║   to build, to collaborate with you.                        ║
║                                                              ║
║   Let me learn who you are, that I may serve you better.   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;

    ctx.ui?.notify?.(welcome, "info");

    // Check for BOOTSTRAP.md
    const bootstrapFile = join(PERSONA_DIR, "BOOTSTRAP.md");
    if (existsSync(bootstrapFile)) {
      try {
        const bootstrap = readFileSync(bootstrapFile, "utf-8");
        const welcomeMatch = bootstrap.match(/## Welcome Message\n(.+)/);
        if (welcomeMatch) {
          ctx.ui?.notify?.(welcomeMatch[1].trim(), "info");
        }
      } catch {
        // Ignore
      }
    }

    // Pause for user to read
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  /**
   * Persona setup step
   */
  async function personaStep(ctx: any): Promise<Partial<OnboardingState>> {
    const answers: Partial<OnboardingState> = {};

    ctx.ui?.notify?.("## Setting Up Your Profile\n", "info");

    // Get user name
    answers.userName =
      (await ctx.ui?.custom?.(
        (tui: any, theme: any, kb: any, done: any) => ({
          render: (w: number) => [
            "What should I call you?",
            theme.fg("dim", "(This helps me personalize our interactions)"),
          ],
          handleInput: (data: string) => {
            const name = data.trim();
            done(name || "Traveler");
          },
          invalidate: () => {},
        }),
        { overlay: true }
      )) || "Traveler";

    // Get role
    answers.role =
      (await ctx.ui?.custom?.(
        (tui: any, theme: any, kb: any, done: any) => ({
          render: (w: number) => [
            `Nice to meet you, ${answers.userName}!`,
            "",
            "What is your role?",
            theme.fg("dim", "1. Developer  2. Designer  3. Other"),
          ],
          handleInput: (data: string) => {
            const roles: Record<string, string> = {
              "1": "Developer",
              "2": "Designer",
              "3": "Other",
              developer: "Developer",
              designer: "Designer",
            };
            done(roles[data.toLowerCase().trim()] || "Developer");
          },
          invalidate: () => {},
        }),
        { overlay: true }
      )) || "Developer";

    // Get experience
    answers.experience =
      (await ctx.ui?.custom?.(
        (tui: any, theme: any, kb: any, done: any) => ({
          render: (w: number) => [
            "What is your experience level?",
            theme.fg("dim", "1. Beginner  2. Intermediate  3. Advanced"),
          ],
          handleInput: (data: string) => {
            const exp: Record<string, string> = {
              "1": "Beginner",
              "2": "Intermediate",
              "3": "Advanced",
              beginner: "Beginner",
              intermediate: "Intermediate",
              advanced: "Advanced",
            };
            done(exp[data.toLowerCase().trim()] || "Intermediate");
          },
          invalidate: () => {},
        }),
        { overlay: true }
      )) || "Intermediate";

    // Get style preference
    answers.style =
      (await ctx.ui?.custom?.(
        (tui: any, theme: any, kb: any, done: any) => ({
          render: (w: number) => [
            "How do you prefer to work?",
            theme.fg("dim", "1. Collaborative  2. Direct  3. Educational"),
          ],
          handleInput: (data: string) => {
            const styles: Record<string, string> = {
              "1": "collaborative",
              "2": "delegative",
              "3": "educational",
              collaborative: "collaborative",
              direct: "delegative",
              educational: "educational",
            };
            done(styles[data.toLowerCase().trim()] || "collaborative");
          },
          invalidate: () => {},
        }),
        { overlay: true }
      )) || "collaborative";

    ctx.ui?.notify?.(`\nThank you, ${answers.userName}! Profile created.\n`, "success");

    return answers;
  }

  /**
   * Modes explanation step
   */
  async function modesStep(ctx: any): Promise<void> {
    const modesExplanation = `
## The Two Modes

**🔍 PLAN Mode** - Investigation and understanding
- Read files, search code, research
- Ask questions, explore options
- Create detailed plans before building
- No code changes allowed

**🔨 BUILD Mode** - Implementation and execution
- Write and modify code
- Execute shell commands
- Full tool access
- Focus on getting things done

Use **Ctrl+M** to toggle quickly!
`;

    ctx.ui?.notify?.(modesExplanation, "info");

    // Demo mode switch
    ctx.ui?.notify?.("Let me show you... switching to PLAN mode briefly.", "info");

    // This would actually switch modes
    // await setMode("plan");

    await new Promise((resolve) => setTimeout(resolve, 1500));

    ctx.ui?.notify?.("Back to BUILD mode. Ready to work!", "success");
  }

  /**
   * Tools overview step
   */
  async function toolsStep(ctx: any): Promise<void> {
    const toolsOverview = `
## Your Toolkit

**Read Tools** (always available):
- 📖 read_file - Examine code
- 🔍 search_files - Find patterns
- 🌐 web_search - Research docs

**Write Tools** (build mode only):
- ✍️ write_file - Create new
- 📝 edit_file - Modify existing
- 🧩 apply_diff - Apply changes

**Execute Tools** (build mode only):
- ⚡ execute_shell - Run commands
- 🧪 run_tests - Test changes

Try: /tools for the full list
`;

    ctx.ui?.notify?.(toolsOverview, "info");
  }

  /**
   * Completion step
   */
  async function completeStep(
    ctx: any,
    answers: Partial<OnboardingState>
  ): Promise<void> {
    // Generate USER.md
    const userProfile = generateUserProfile(answers);

    ensurePersonaDir();
    writeFileSync(
      join(PERSONA_DIR, "USER.md"),
      userProfile,
      "utf-8"
    );

    // Update BOOT.md with name
    if (answers.userName) {
      updateBootFile(answers.userName);
    }

    // Mark as onboarded
    markOnboarded();

    const complete = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ✨ Onboarding Complete!                                    ║
║                                                              ║
║   Welcome to the fold, ${answers.userName?.padEnd(42) || "Traveler"}   ║
║                                                              ║
║   You can now use:                                           ║
║   • /plan or /build - Switch modes                           ║
║   • Ctrl+M - Quick toggle                                     ║
║   • /persona - View your profile                             ║
║   • /help - See all commands                                  ║
║                                                              ║
║   Your persona files are in: ~/.0xkobold/                    ║
║                                                              ║
║   What shall we build first?                                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;

    ctx.ui?.notify?.(complete, "success");
  }

  function ensurePersonaDir(): void {
    if (!existsSync(PERSONA_DIR)) {
      mkdirSync(PERSONA_DIR, { recursive: true });
    }
  }

  // Register commands
  pi.registerCommand("onboarding", {
    description: "Run onboarding flow again",
    handler: async (_args, ctx) => {
      ctx.ui?.notify?.("Restarting onboarding...", "info");
      // Remove flag to trigger redo
      try {
        const { unlinkSync } = await import("fs");
        if (existsSync(ONBOARDING_FLAG)) {
          unlinkSync(ONBOARDING_FLAG);
        }
        await startOnboarding(ctx);
      } catch (error) {
        ctx.ui?.notify?.("Could not reset onboarding: " + error, "error");
      }
    },
  });

  pi.registerCommand("reset-onboarding", {
    description: "Reset onboarding (run it again next session)",
    handler: async (_args, ctx) => {
      try {
        const { unlinkSync } = await import("fs");
        if (existsSync(ONBOARDING_FLAG)) {
          unlinkSync(ONBOARDING_FLAG);
          ctx.ui?.notify?.("Onboarding reset. Restart TUI to run again.", "success");
        } else {
          ctx.ui?.notify?.("Onboarding not completed yet.", "info");
        }
      } catch (error) {
        ctx.ui?.notify?.("Error: " + error, "error");
      }
    },
  });

  console.log("[Onboarding] Extension loaded");
  if (!isOnboarded()) {
    console.log("[Onboarding] New user detected - onboarding will start on TUI launch");
  }
}
