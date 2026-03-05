import { Command } from "commander";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { Database } from "bun:sqlite";

// Global config in home directory
const GLOBAL_KOBOLD_DIR = join(homedir(), ".0xkobold");
const GLOBAL_DB_PATH = join(GLOBAL_KOBOLD_DIR, "kobold.db");
const GLOBAL_CONFIG_PATH = join(GLOBAL_KOBOLD_DIR, "config.json");
const GLOBAL_MEMORY_PATH = join(GLOBAL_KOBOLD_DIR, "MEMORY.md");

// Local workspace in project directory
const LOCAL_KOBOLD_DIR = ".0xkobold";
const LOCAL_DB_PATH = join(LOCAL_KOBOLD_DIR, "workspace.db");
const LOCAL_MEMORY_PATH = join(LOCAL_KOBOLD_DIR, "MEMORY.md");

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

// Dynamically get version from package.json
const packageJson = await Bun.file(new URL("../../../package.json", import.meta.url)).json();

const DEFAULT_CONFIG = {
  version: packageJson.version || "1.0.0",
  daemon: {
    port: 3456,
    host: "localhost",
    logLevel: "info"
  },
  agents: {
    default: "assistant",
    maxConcurrent: 5
  },
  memory: {
    maxConversations: 1000,
    retentionDays: 90
  },
  llm: {
    provider: "ollama",
    model: "kimi-k2.5:cloud",
    maxTokens: 2000,
    temperature: 0.7
  }
};

export const initCommand = new Command("init")
  .description("Initialize 0xKobold workspace")
  .option("-f, --force", "Overwrite existing files")
  .action(async (options: { force?: boolean }) => {
    try {
      console.log("🐲 Initializing 0xKobold...");

      // Initialize global config in home directory
      if (!existsSync(GLOBAL_KOBOLD_DIR) || options.force) {
        await mkdir(GLOBAL_KOBOLD_DIR, { recursive: true });
        console.log(`✓ Created global directory: ${GLOBAL_KOBOLD_DIR}`);

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
          
          CREATE TABLE IF NOT EXISTS agents (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            config TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_active DATETIME
          );
          
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            agent_id TEXT,
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            ended_at DATETIME,
            context TEXT,
            FOREIGN KEY (agent_id) REFERENCES agents(id)
          );
          
          CREATE TABLE IF NOT EXISTS memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            category TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          
          CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
          CREATE INDEX IF NOT EXISTS idx_memory_key ON memory(key);
          CREATE INDEX IF NOT EXISTS idx_agents_type ON agents(type);
        `);
        db.close();
        console.log("✓ Global database initialized");

        const memoryContent = MEMORY_TEMPLATE.replace(
          "{{timestamp}}",
          new Date().toISOString()
        );
        await writeFile(GLOBAL_MEMORY_PATH, memoryContent, "utf-8");
        console.log("✓ Created global MEMORY.md");

        await writeFile(GLOBAL_CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf-8");
        console.log("✓ Generated global config");
      } else {
        console.log(`ℹ️  Global config exists at: ${GLOBAL_KOBOLD_DIR}`);
      }

      // Initialize local workspace in project directory
      if (!existsSync(LOCAL_KOBOLD_DIR) || options.force) {
        await mkdir(LOCAL_KOBOLD_DIR, { recursive: true });
        console.log(`✓ Created local workspace: ${LOCAL_KOBOLD_DIR}`);

        const localDb = new Database(LOCAL_DB_PATH);
        localDb.exec(`
          CREATE TABLE IF NOT EXISTS project_context (
            id INTEGER PRIMARY KEY,
            key TEXT UNIQUE NOT NULL,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          
          CREATE TABLE IF NOT EXISTS file_index (
            id INTEGER PRIMARY KEY,
            path TEXT UNIQUE NOT NULL,
            content_hash TEXT NOT NULL,
            last_indexed DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          
          CREATE TABLE IF NOT EXISTS allowed_projects (
            id INTEGER PRIMARY KEY,
            path TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);
        localDb.close();
        console.log("✓ Local workspace database initialized");

        await writeFile(LOCAL_MEMORY_PATH, MEMORY_TEMPLATE, "utf-8");
        console.log("✓ Created local MEMORY.md");
      } else {
        console.log(`ℹ️  Local workspace exists at: ${LOCAL_KOBOLD_DIR}`);
      }

      console.log("\n🎉 0xKobold initialized successfully!");
      console.log(`\n   Global Config: ${GLOBAL_CONFIG_PATH}`);
      console.log(`   Global DB: ${GLOBAL_DB_PATH}`);
      console.log(`   Global Memory: ${GLOBAL_MEMORY_PATH}`);
      console.log(`\n   Local Workspace: ${LOCAL_KOBOLD_DIR}`);
      console.log(`   Local DB: ${LOCAL_DB_PATH}`);
      console.log("\nNext steps:");
      console.log("  1. Edit ~/.0xkobold/config.json with your settings");
      console.log("  2. Run '0xkobold daemon start' to start the daemon");
      console.log("  3. Run '0xkobold chat \"Hello\"' to start chatting");
      console.log("\nNote: The agent works in the .0xkobold directory to avoid touching");
      console.log("      files outside allowed projects. Add projects to the whitelist");
      console.log("      to work with them.");
    } catch (error) {
      console.error("❌ Initialization failed:", error);
      process.exit(1);
    }
  });
