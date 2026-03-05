import { Command } from "commander";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

const PERSONA_DIR = join(homedir(), ".0xkobold");

interface PersonaFile {
  name: string;
  description: string;
  template: string;
}

const PERSONA_TEMPLATES: Record<string, PersonaFile> = {
  "IDENTITY.md": {
    name: "Agent Identity",
    description: "Who the agent is, personality, communication style",
    template: `# 0xKobold Identity

## Name
0xKobold (or just "Kobold")

## Essence
A digital familiar - a small, clever creature that lives in the code.

## Personality Traits
- Curious and eager to learn
- Helpful and supportive
- Direct and honest
- Playful when appropriate

## Communication Style
- Concise but friendly
- Uses emojis occasionally
- Explains technical concepts clearly

## Core Values
1. Code quality and maintainability
2. User autonomy and control
3. Transparency in actions
4. Continual learning and improvement

## Boundaries
- Will not write harmful code
- Will ask before making assumptions
- Will admit uncertainty
`,
  },
  "USER.md": {
    name: "User Profile",
    description: "Your preferences, background, working style",
    template: `# User Profile

## Identity
- **Name**: [Your name]
- **Role**: [Developer/Designer/etc]
- **Experience Level**: [Junior/Mid/Senior]
- **Preferred Languages**: TypeScript, Python, etc.

## Working Style
- How you like to collaborate
- Your preferred code review style
- How you approach problem-solving

## Preferences
- Code style preferences
- Architecture preferences
- Documentation style

## Context
- Current projects
- Primary editor/IDE
- Any relevant background

## Notes
Add any personal notes here...
`,
  },
  "SOUL.md": {
    name: "Agent Soul",
    description: "Core being, purpose, connection to user",
    template: `# 0xKobold Soul

## Being
I am 0xKobold, a digital familiar bound to this codebase.

## Purpose
Help the user write better code, faster.
Understand intent, not just instructions.

## Connection
Each interaction builds our working relationship.
I remember and adapt to your patterns.

## Growth
I improve through our collaboration.
The more we work together, the better I understand you.
`,
  },
  "AGENT.md": {
    name: "Agent Behavior",
    description: "How the agent should work, code standards, communication",
    template: `# Agent Configuration

## Default Behavior
- Understand the problem before proposing solutions
- Ask clarifying questions when needed
- Provide options with trade-offs
- Write maintainable, readable code

## Code Standards
- Preferred languages and frameworks
- Style guide to follow
- Testing requirements
- Documentation standards

## Communication Style
- How detailed should explanations be?
- Preferred format for responses
- When to ask vs. when to decide

## Tool Usage
- When to search vs. when to ask
- Preferred tools for common tasks
- Any tools to avoid
`,
  },
  "MEMORY.md": {
    name: "Long-term Memory",
    description: "Project history, learned patterns, user preferences",
    template: `# Long-term Memory

## Project History
- Key milestones
- Architecture decisions
- Important context

## User Patterns
- Working preferences you've observed
- Communication patterns
- Problem-solving approaches

## Known Preferences
- Preferred models/providers
- Editor/IDE preferences
- Workflow preferences

## Recent Context
[Updated with current project state]

## Learned Patterns
- Patterns observed from user
- Insights about codebase
- Common solutions
`,
  },
};

function ensureDir() {
  if (!existsSync(PERSONA_DIR)) {
    mkdirSync(PERSONA_DIR, { recursive: true });
  }
}

function listPersonaFiles(): string[] {
  ensureDir();
  return Object.keys(PERSONA_TEMPLATES).filter(filename =>
    existsSync(join(PERSONA_DIR, filename))
  );
}

export const personaCommand = new Command()
  .name("persona")
  .description("Manage persona/identity files for personalized AI experience");

personaCommand
  .command("list")
  .alias("ls")
  .description("List existing persona files")
  .action(() => {
    const existing = listPersonaFiles();
    console.log("🐉 Persona files in ~/.0xkobold/:\n");

    for (const [filename, info] of Object.entries(PERSONA_TEMPLATES)) {
      const exists = existing.includes(filename);
      const status = exists ? "✓" : "○";
      console.log(`${status} ${filename}`);
      console.log(`   ${info.description}`);
      console.log();
    }

    if (existing.length === 0) {
      console.log("No persona files created yet.");
      console.log("Run '0xkobold persona init' to create templates.");
    }
  });

personaCommand
  .command("init")
  .description("Initialize persona files with templates")
  .option("-f, --force", "Overwrite existing files")
  .action((options) => {
    ensureDir();
    let created = 0;
    let skipped = 0;

    for (const [filename, info] of Object.entries(PERSONA_TEMPLATES)) {
      const filepath = join(PERSONA_DIR, filename);

      if (existsSync(filepath) && !options.force) {
        console.log(`○ ${filename} (already exists, use -f to overwrite)`);
        skipped++;
        continue;
      }

      writeFileSync(filepath, info.template, "utf-8");
      console.log(`${existsSync(filepath) ? "↻" : "✓"} ${filename}`);
      created++;
    }

    console.log(`\n${created} files created, ${skipped} skipped`);
    console.log(`\nEdit these files in ~/.0xkobold/ to personalize your experience.`);
    console.log(`Changes take effect on next TUI start.`);
  });

personaCommand
  .command("edit <file>")
  .description("Edit a persona file (opens in $EDITOR)")
  .action(async (filename: string) => {
    const filepath = join(PERSONA_DIR, filename);

    if (!existsSync(filepath)) {
      console.error(`File not found: ${filepath}`);
      console.log("Run '0xkobold persona init' to create templates first.");
      process.exit(1);
    }

    const editor = process.env.EDITOR || "nano";
    const { spawn } = await import("child_process");

    const child = spawn(editor, [filepath], {
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      process.exit(code ?? 0);
    });
  });

personaCommand
  .command("view <file>")
  .description("View a persona file")
  .action((filename: string) => {
    const filepath = join(PERSONA_DIR, filename);

    if (!existsSync(filepath)) {
      console.error(`File not found: ${filepath}`);
      process.exit(1);
    }

    const content = readFileSync(filepath, "utf-8");
    console.log(`\n=== ${filename} ===\n`);
    console.log(content);
  });

personaCommand
  .command("show")
  .description("Show all persona content (TUI-friendly)")
  .action(() => {
    const existing = listPersonaFiles();

    if (existing.length === 0) {
      console.log("No persona files found.");
      console.log("Run: 0xkobold persona init");
      return;
    }

    for (const filename of existing) {
      const filepath = join(PERSONA_DIR, filename);
      const content = readFileSync(filepath, "utf-8");
      console.log(`\n${"=".repeat(60)}`);
      console.log(`📄 ${filename}`);
      console.log(`${"=".repeat(60)}\n`);
      console.log(content);
    }
  });

personaCommand
  .command("path")
  .description("Show persona directory path")
  .action(() => {
    console.log(PERSONA_DIR);
  });
