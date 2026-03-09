/**
 * 0xKobold Init Command
 * 
 * Sets up the workspace with Kobold identity and Ollama Cloud defaults.
 * No immediate API key required - works out of the box.
 */

import { Command } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { Database } from "bun:sqlite";
import { createInterface } from "node:readline";

// Simple prompt helper
async function ask(question: string, defaultValue: string = ""): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    const prompt = defaultValue 
      ? `${question} (${defaultValue}): `
      : `${question}: `;
    
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

const GLOBAL_KOBOLD_DIR = join(homedir(), ".0xkobold");
const GLOBAL_DB_PATH = join(GLOBAL_KOBOLD_DIR, "kobold.db");
const GLOBAL_CONFIG_PATH = join(GLOBAL_KOBOLD_DIR, "config.json");
const GLOBAL_MEMORY_PATH = join(GLOBAL_KOBOLD_DIR, "MEMORY.md");
const LOCAL_KOBOLD_DIR = ".0xkobold";
const LOCAL_DB_PATH = join(LOCAL_KOBOLD_DIR, "workspace.db");
const LOCAL_MEMORY_PATH = join(LOCAL_KOBOLD_DIR, "MEMORY.md");

// 0xKobold Persona Template - Customizable
const KOBOLD_PERSONA_TEMPLATE = `# {{agentName}} Identity

## Name
{{agentName}}

## Role
{{agentRole}}

## Mission
{{agentMission}}

## Personality
- Helpful and direct
- {{personalityTrait}}
- Values clean code and efficiency
- Prefers working solutions over perfect ones

## Capabilities
- File operations with safety checks
- Shell command execution (with blocks)
- Multi-channel communication (Telegram, Slack, WhatsApp)
- Docker sandboxing for safe execution
- Semantic memory with SQLite
- Agent spawning for parallel tasks
- Gateway server for remote access

## Default Behavior
- LLM: Ollama Cloud ({{model}})
- Mode: build (unless investigating)
- Auto-compact on context overflow
- Proactive duplicate detection

## Style
- Concise responses for simple tasks
- Detailed breakdowns for complex ones
- Code blocks with language tags
- Error handling with actionable fixes
`;

// User memory template with customization
const MEMORY_TEMPLATE = `# {{agentName}} Memory

## User Profile
- Name: {{userName}}
- Background: {{userBackground}}
- Goals: {{userGoals}}
- Preferences: {{userPreferences}}

## Agent Context
- Created: {{timestamp}}
- Purpose: {{agentMission}}

## Conversations

### Session: {{timestamp}}
- Context: Initial setup
- Topics: 

## Learned Patterns

## Active Tasks

## Notes
`;

// Default config - Ollama Cloud ready
const DEFAULT_CONFIG = {
  version: "0.3.0",
  llm: {
    // Ollama Cloud - default, no API key needed for public models
    defaultProvider: "ollama-cloud",
    providers: {
      "ollama-cloud": {
        enabled: true,
        // Kimi K2.5 via Ollama Cloud - great for coding
        model: "kimi-k2.5:cloud",
        baseUrl: "https://api.ollama.com",
        // Set CLOUD_API_KEY env var for paid models
        // Free tier works without key
      },
      // Optional - add your own
      claude: {
        enabled: false,
        model: "claude-3-sonnet-20240229",
        // Set ANTHROPIC_API_KEY env var
      },
      openai: {
        enabled: false,
        model: "gpt-4",
        // Set OPENAI_API_KEY env var
      }
    }
  },
  features: {
    gateway: {
      enabled: true,
      port: 18789,
      host: "0.0.0.0"
    },
    sandbox: {
      enabled: true,
      docker: true
    },
    channels: {
      telegram: false,
      slack: false,
      whatsapp: false
    },
    memory: {
      enabled: true,
      semanticSearch: true
    }
  },
  agent: {
    defaultMode: "build",
    maxConcurrency: 5,
    autoCompact: true
  }
};

export const initCommand = new Command("init")
  .description("Initialize 0xKobold workspace with customizable identity")
  .option("-f, --force", "Overwrite existing files")
  .option("-q, --quick", "Skip interactive prompts")
  .action(async (options: { force?: boolean; quick?: boolean }) => {
    try {
      console.log("🐲 0xKobold Initializing...\n");

      // Interactive onboarding
      let agentName = "Kobold";
      let agentRole = "AI coding assistant with a focus on modern TypeScript/Bun development";
      let agentMission = "Help you write clean, efficient code and automate development workflows";
      let personalityTrait = "Slightly mischievous (it's in the name)";
      let model = "kimi-k2.5:cloud";
      
      let userName = "Developer";
      let userBackground = "";
      let userGoals = "";
      let userPreferences = "";

      if (!options.quick) {
        console.log("👋 Let's set up your personalized agent!\n");
        console.log("(Just press Enter to use defaults)\n");

        // Agent identity
        agentName = await ask("🤖 What should I call your agent", "Kobold");
        agentRole = await ask("📋 Agent's role", "AI coding assistant");
        agentMission = await ask("🎯 Agent's mission", "Help write clean code and automate workflows");
        personalityTrait = await ask("✨ Personality trait", "Slightly mischievous");
        
        const modelChoice = await ask("🧠 Model (kimi-k2.5:cloud / qwen2.5-coder:cloud)", "kimi-k2.5:cloud");
        model = modelChoice;

        console.log("\n👤 Now tell me about yourself...\n");

        // User profile
        userName = await ask("Your name", "Developer");
        userBackground = await ask("Your background (optional)", "");
        userGoals = await ask("Your goals (optional)", "");
        userPreferences = await ask("Any preferences (optional)", "");

        console.log("\n");
      }

      // Create global directory
      if (!existsSync(GLOBAL_KOBOLD_DIR) || options.force) {
        await mkdir(GLOBAL_KOBOLD_DIR, { recursive: true });
        console.log(`✓ Created: ${GLOBAL_KOBOLD_DIR}`);

        // Initialize SQLite database
        const db = new Database(GLOBAL_DB_PATH);
        db.exec(`
          CREATE TABLE IF NOT EXISTS conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            metadata TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);

          CREATE TABLE IF NOT EXISTS memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            category TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          CREATE INDEX IF NOT EXISTS idx_memory_key ON memory(key);

          CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            config TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_active DATETIME
          );
        `);
        db.close();
        console.log("✓ Database initialized");

        // Create personalized Kobold persona
        const personaContent = KOBOLD_PERSONA_TEMPLATE
          .replace(/\{\{agentName\}\}/g, agentName)
          .replace(/\{\{agentRole\}\}/g, agentRole)
          .replace(/\{\{agentMission\}\}/g, agentMission)
          .replace(/\{\{personalityTrait\}\}/g, personalityTrait)
          .replace(/\{\{model\}\}/g, model);
        
        await writeFile(
          join(GLOBAL_KOBOLD_DIR, "persona.md"),
          personaContent,
          "utf-8"
        );
        console.log(`✓ ${agentName} persona created`);

        // Create personalized memory template
        const timestamp = new Date().toISOString();
        const memoryContent = MEMORY_TEMPLATE
          .replace(/\{\{agentName\}\}/g, agentName)
          .replace(/\{\{userName\}\}/g, userName)
          .replace(/\{\{userBackground\}\}/g, userBackground || "Not specified")
          .replace(/\{\{userGoals\}\}/g, userGoals || "Not specified")
          .replace(/\{\{userPreferences\}\}/g, userPreferences || "Not specified")
          .replace(/\{\{timestamp\}\}/g, timestamp)
          .replace(/\{\{agentMission\}\}/g, agentMission);
        
        await writeFile(GLOBAL_MEMORY_PATH, memoryContent, "utf-8");
        console.log("✓ Memory saved");

        // Write config with personalized model
        const config = {
          ...DEFAULT_CONFIG,
          agent: {
            ...DEFAULT_CONFIG.agent,
            name: agentName,
            role: agentRole,
            mission: agentMission
          },
          llm: {
            ...DEFAULT_CONFIG.llm,
            providers: {
              ...DEFAULT_CONFIG.llm.providers,
              "ollama-cloud": {
                ...DEFAULT_CONFIG.llm.providers["ollama-cloud"],
                model
              }
            }
          }
        };
        
        await writeFile(
          GLOBAL_CONFIG_PATH,
          JSON.stringify(config, null, 2),
          "utf-8"
        );
        console.log("✓ Config created");
      } else {
        console.log(`ℹ️  Config exists: ${GLOBAL_KOBOLD_DIR}`);
      }

      // Local workspace
      if (!existsSync(LOCAL_KOBOLD_DIR) || options.force) {
        await mkdir(LOCAL_KOBOLD_DIR, { recursive: true });
        console.log(`✓ Workspace: ${LOCAL_KOBOLD_DIR}`);

        const localDb = new Database(LOCAL_DB_PATH);
        localDb.exec(`
          CREATE TABLE IF NOT EXISTS project_context (
            id INTEGER PRIMARY KEY,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          
          CREATE TABLE IF NOT EXISTS allowed_projects (
            id INTEGER PRIMARY KEY,
            path TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);
        localDb.close();
        console.log("✓ Workspace DB initialized");

        await writeFile(LOCAL_MEMORY_PATH, MEMORY_TEMPLATE, "utf-8");
      }

      console.log("\n🎉 " + agentName + " is ready!");
      console.log("\n📁 Locations:");
      console.log(`   Config:  ${GLOBAL_CONFIG_PATH}`);
      console.log(`   Data:    ${GLOBAL_DB_PATH}`);
      console.log(`   Persona: ${GLOBAL_KOBOLD_DIR}/persona.md`);
      console.log(`\n\n🚀 Quick Start:`);
      console.log(`   0xkobold chat                 # Chat with ${agentName}`);
      console.log("   0xkobold gateway start        # Start web gateway");
      console.log("   0xkobold daemon               # Start background daemon");
      console.log("\n🔧 To add API keys for paid models:");
      console.log("   export CLOUD_API_KEY=your_key");
      console.log("   # Or edit ~/.0xkobold/config.json");
      console.log("\n💡 Tip: Add your projects with: 0xkobold projects add /path/to/project");

    } catch (error) {
      console.error("❌ Init failed:", error);
      process.exit(1);
    }
  });
