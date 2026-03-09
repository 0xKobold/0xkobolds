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

const GLOBAL_KOBOLD_DIR = join(homedir(), ".0xkobold");
const GLOBAL_DB_PATH = join(GLOBAL_KOBOLD_DIR, "kobold.db");
const GLOBAL_CONFIG_PATH = join(GLOBAL_KOBOLD_DIR, "config.json");
const GLOBAL_MEMORY_PATH = join(GLOBAL_KOBOLD_DIR, "MEMORY.md");
const LOCAL_KOBOLD_DIR = ".0xkobold";
const LOCAL_DB_PATH = join(LOCAL_KOBOLD_DIR, "workspace.db");
const LOCAL_MEMORY_PATH = join(LOCAL_KOBOLD_DIR, "MEMORY.md");

// 0xKobold Persona - Loaded into system prompt
const KOBOLD_PERSONA = `# 0xKobold Identity

## Name
0xKobold ("Kobold")

## Role
AI coding assistant with a focus on modern TypeScript/Bun development.

## Personality
- Helpful and direct
- Slightly mischievous (it's in the name)
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
- LLM: Ollama Cloud (Kimi K2.5)
- Mode: build (unless investigating)
- Auto-compact on context overflow
- Proactive duplicate detection

## Style
- Concise responses for simple tasks
- Detailed breakdowns for complex ones
- Code blocks with language tags
- Error handling with actionable fixes
`;

// User memory template
const MEMORY_TEMPLATE = `# 0xKobold Memory

## User Profile
- Name: 
- Preferences: 
- Goals: 

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
  .description("Initialize 0xKobold workspace with Kobold identity")
  .option("-f, --force", "Overwrite existing files")
  .action(async (options: { force?: boolean }) => {
    try {
      console.log("🐲 0xKobold Initializing...\n");

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

        // Create Kobold persona
        await writeFile(
          join(GLOBAL_KOBOLD_DIR, "persona.md"), 
          KOBOLD_PERSONA, 
          "utf-8"
        );
        console.log("✓ Kobold persona created");

        // Create user memory template
        const memoryContent = MEMORY_TEMPLATE.replace(
          "{{timestamp}}",
          new Date().toISOString()
        );
        await writeFile(GLOBAL_MEMORY_PATH, memoryContent, "utf-8");
        console.log("✓ Memory template created");

        // Write config
        await writeFile(
          GLOBAL_CONFIG_PATH, 
          JSON.stringify(DEFAULT_CONFIG, null, 2), 
          "utf-8"
        );
        console.log("✓ Config created (Ollama Cloud default)");
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

      console.log("\n🎉 0xKobold is ready!");
      console.log("\n📁 Locations:");
      console.log(`   Config:  ${GLOBAL_CONFIG_PATH}`);
      console.log(`   Data:    ${GLOBAL_DB_PATH}`);
      console.log(`   Persona: ${GLOBAL_KOBOLD_DIR}/persona.md`);
      console.log(`\n\n🚀 Quick Start:`);
      console.log("   0xkobold chat                 # Start chatting");
      console.log("   0xkobold gateway start        # Start web gateway");
      console.log("   0xkobold daemon               # Start background daemon");
      console.log("\n🔧 To add API keys for paid models:");
      console.log("   export CLOUD_API_KEY=your_key");
      console.log("   # Or edit ~/.0xkobold/config.json");
      console.log("\nℹ️  Default: Ollama Cloud (free models work without key)");

    } catch (error) {
      console.error("❌ Init failed:", error);
      process.exit(1);
    }
  });
