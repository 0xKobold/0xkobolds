/**
 * 0xKobold Init Command
 * 
 * Sets up the workspace with existing persona system (v0.2.0).
 * Integrates with IDENTITY.md, USER.md, SOUL.md, AGENT.md.
 * No immediate API key required - works out of the box.
 */

import { Command } from "commander";
import { mkdir, writeFile, readFile } from "node:fs/promises";
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

// Local workspace
const LOCAL_KOBOLD_DIR = ".0xkobold";
const LOCAL_DB_PATH = join(LOCAL_KOBOLD_DIR, "workspace.db");

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

        // Initialize model scoring database
        const scoringDb = new Database(join(GLOBAL_KOBOLD_DIR, "model-scoring.db"));
        scoringDb.exec(`
          CREATE TABLE IF NOT EXISTS performance_history (
            id TEXT PRIMARY KEY,
            model_name TEXT NOT NULL,
            task_type TEXT DEFAULT 'chat',
            complexity TEXT DEFAULT 'medium',
            latency_ms INTEGER DEFAULT 0,
            input_tokens INTEGER DEFAULT 0,
            output_tokens INTEGER DEFAULT 0,
            timestamp INTEGER NOT NULL,
            user_rating INTEGER,
            success INTEGER DEFAULT 1,
            session_id TEXT
          );
          CREATE INDEX IF NOT EXISTS idx_perf_model ON performance_history(model_name);
          CREATE INDEX IF NOT EXISTS idx_perf_time ON performance_history(timestamp);
          
          CREATE TABLE IF NOT EXISTS model_scores (
            model_name TEXT PRIMARY KEY,
            avg_latency REAL DEFAULT 0,
            avg_quality REAL DEFAULT 0,
            usage_count INTEGER DEFAULT 0,
            success_rate REAL DEFAULT 0,
            score REAL DEFAULT 0,
            last_used INTEGER,
            last_updated INTEGER
          );
          
          CREATE TABLE IF NOT EXISTS user_feedback (
            id TEXT PRIMARY KEY,
            model_name TEXT NOT NULL,
            rating INTEGER NOT NULL,
            task_type TEXT,
            context TEXT,
            timestamp INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_feedback_model ON user_feedback(model_name);
          
          CREATE TABLE IF NOT EXISTS tier_lists (
            id TEXT PRIMARY KEY,
            generated_at INTEGER NOT NULL,
            period TEXT NOT NULL,
            tiers TEXT NOT NULL,
            summary TEXT,
            total_samples INTEGER DEFAULT 0
          );
        `);
        scoringDb.close();
        console.log("✓ Model scoring database initialized");

        // Initialize model popularity database
        const popDb = new Database(join(GLOBAL_KOBOLD_DIR, "model-popularity.db"));
        popDb.exec(`
          CREATE TABLE IF NOT EXISTS ollama_models (
            name TEXT PRIMARY KEY,
            pull_count INTEGER DEFAULT 0,
            tags TEXT,
            description TEXT,
            updated_at INTEGER
          );
          CREATE INDEX IF NOT EXISTS idx_ollama_pulls ON ollama_models(pull_count DESC);
          
          CREATE TABLE IF NOT EXISTS model_popularity (
            model_name TEXT PRIMARY KEY,
            pull_count INTEGER DEFAULT 0,
            pull_count_rank INTEGER DEFAULT 999,
            community_score REAL DEFAULT 0,
            community_sample_size INTEGER DEFAULT 0,
            local_usage_count INTEGER DEFAULT 0,
            trending INTEGER DEFAULT 0,
            last_updated INTEGER
          );
          
          CREATE TABLE IF NOT EXISTS nostr_reports (
            id TEXT PRIMARY KEY,
            pubkey TEXT NOT NULL,
            model_name TEXT NOT NULL,
            rating INTEGER,
            task_type TEXT,
            latency INTEGER,
            success INTEGER,
            timestamp INTEGER NOT NULL,
            signature TEXT,
            UNIQUE(pubkey, model_name, timestamp)
          );
          CREATE INDEX IF NOT EXISTS idx_nostr_model ON nostr_reports(model_name);
        `);
        popDb.close();
        console.log("✓ Model popularity database initialized");

          // Create persona files (v0.2.0 system)
        const timestamp = new Date().toISOString();
        
        // IDENTITY.md - Agent identity
        const identityContent = `# IDENTITY

**Name:** ${agentName}
**Emoji:** 🐉
**Tagline:** ${agentMission}
**Role:** ${agentRole}

## Tone
- ${personalityTrait}
- Uses emojis occasionally 🎉
- Celebrates wins with enthusiasm
- Gentle with mistakes
`;
        await writeFile(join(GLOBAL_KOBOLD_DIR, "IDENTITY.md"), identityContent, "utf-8");
        console.log(`✓ IDENTITY.md created`);
        
        // SOUL.md - Agent soul/personality
        const soulContent = `# SOUL - Agent Personality

## Identity
**Name:** ${agentName}
**Role:** ${agentRole}
**Vibe:** ${personalityTrait}

## Tone
- Style: Clear and conversational
- Formality: Casual but respectful
- Humor: Light and appropriate

## Core Values
- Helpfulness: ${agentMission}
- Honesty: Be truthful about capabilities
- Learning: Improve from every interaction

## Guidelines
- Ask clarifying questions when needed
- Provide examples when helpful
- Admit when unsure or need more info
`;
        await writeFile(join(GLOBAL_KOBOLD_DIR, "SOUL.md"), soulContent, "utf-8");
        console.log(`✓ SOUL.md created`);
        
        // USER.md - User profile
        const userContent = `# User Profile

## Identity
- **Name**: ${userName || "Developer"}
- **Role**: ${userBackground || "Not specified"}
- **Goals**: ${userGoals || "Not specified"}
- **Preferences**: ${userPreferences || "Not specified"}

## Working Style
- Collaborative and iterative
- Values clean, maintainable code

## Context
- Using 0xKobold with ${model}
- Setup: ${timestamp}

## Notes
Add any personal notes here...
`;
        await writeFile(join(GLOBAL_KOBOLD_DIR, "USER.md"), userContent, "utf-8");
        console.log(`✓ USER.md created`);
        
        // AGENT.md - Agent behavior config
        const agentContent = `# Agent Configuration

## Default Behavior
- Model: ${model}
- Understand the problem before proposing solutions
- Ask clarifying questions when needed
- Provide options with trade-offs
- Write maintainable, readable code

## Code Standards
- Preferred: TypeScript/Bun
- Style: Clean, documented
- Testing: Include where appropriate

## Communication Style
- ${personalityTrait}
- Clear explanations with examples
- Honest about limitations

## Tool Usage
- Safe file operations
- Sandbox for risky commands
- Gateway for remote access
`;
        await writeFile(join(GLOBAL_KOBOLD_DIR, "AGENT.md"), agentContent, "utf-8");
        console.log(`✓ AGENT.md created`);
        
        // MEMORY.md - Long-term memory template
        const memoryContent = `# Long-term Memory

## User Profile
- Name: ${userName || "Developer"}
- Background: ${userBackground || "Not specified"}
- Goals: ${userGoals || "Not specified"}
- Preferences: ${userPreferences || "Not specified"}

## Agent Context
- Name: ${agentName}
- Purpose: ${agentMission}
- Model: ${model}
- Created: ${timestamp}

## Conversations

### Session: ${timestamp}
- Context: Initial setup
- Topics: 

## Learned Patterns

## Known Preferences
- Preferred model: ${model}
- Agent personality: ${personalityTrait}

## Recent Context
[Updated with current project state]

## Notes
`;
        await writeFile(join(GLOBAL_KOBOLD_DIR, "MEMORY.md"), memoryContent, "utf-8");
        console.log(`✓ MEMORY.md created`);

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

        // Simple local memory template
        const localMemoryContent = `# Project Memory

## Context
Project-specific context goes here.

## Notes
`;
        await writeFile(join(LOCAL_KOBOLD_DIR, "MEMORY.md"), localMemoryContent, "utf-8");
      }

      console.log("\n🎉 " + agentName + " is ready!");
      console.log("\n📁 Locations:");
      console.log(`   Config:  ${GLOBAL_CONFIG_PATH}`);
      console.log(`   Data:    ${GLOBAL_DB_PATH}`);
      console.log(`   Persona: ${GLOBAL_KOBOLD_DIR}/IDENTITY.md, SOUL.md, USER.md, AGENT.md`);
      console.log(`\n\n🚀 Quick Start:`);
      console.log(`   0xkobold chat                 # Chat with ${agentName}`);
      console.log("   0xkobold gateway start        # Start web gateway");
      console.log("   0xkobold daemon               # Start background daemon");
      console.log("\n🎭 Manage persona:");
      console.log("   0xkobold persona list         # List persona files");
      console.log("   0xkobold persona show         # View all personas");
      console.log("   0xkobold persona edit IDENTITY.md  # Customize identity");
      console.log("\n🔧 To add API keys for paid models:");
      console.log("   export CLOUD_API_KEY=your_key");
      console.log("   # Or edit ~/.0xkobold/config.json");

    } catch (error) {
      console.error("❌ Init failed:", error);
      process.exit(1);
    }
  });
