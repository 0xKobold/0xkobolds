/**
 * Migration: memory_stream → session_events
 *
 * Consolidates learning-extension's memory_stream into session-store's session_events.
 * Run once after updating to Phase 6.
 *
 * Usage:
 *   bun run src/memory/migrate-memory-stream.ts
 */

import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";

const LEARNING_DB = join(homedir(), ".0xkobold", "generative", "agents.db");
const SESSIONS_DB = join(homedir(), ".0xkobold", "sessions.db");

interface MemoryStreamRow {
  id: string;
  timestamp: string;
  content: string;
  type: string;
  importance: number;
  agent_id: string;
  session_id: string | null;
  location: string | null;
  people: string | null;
  embedding: Buffer | null;
  metadata: string | null;
}

function migrateMemoryStream() {
  console.log("🔄 Starting migration: memory_stream → session_events\n");

  // Open both databases
  const learningDb = new Database(LEARNING_DB, { readonly: true });
  const sessionsDb = new Database(SESSIONS_DB);

  // Check if memory_stream table exists
  const tableCheck = learningDb.query(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='memory_stream'
  `).get();

  if (!tableCheck) {
    console.log("✅ No memory_stream table found - migration not needed");
    learningDb.close();
    sessionsDb.close();
    return;
  }

  // Count existing events
  const existingCount = sessionsDb.query(`
    SELECT COUNT(*) as count FROM session_events
  `).get() as { count: number };

  console.log(`📊 Current session_events count: ${existingCount.count}`);

  // Get all memory_stream entries
  const rows = learningDb.query(`
    SELECT 
      id, timestamp, content, type, importance, 
      agent_id, session_id, location, people, embedding, metadata
    FROM memory_stream
    ORDER BY timestamp ASC
  `).all() as MemoryStreamRow[];

  console.log(`📥 Found ${rows.length} memory_stream entries to migrate\n`);

  if (rows.length === 0) {
    console.log("✅ No entries to migrate");
    learningDb.close();
    sessionsDb.close();
    return;
  }

  // Prepare insert statement
  const insert = sessionsDb.prepare(`
    INSERT OR REPLACE INTO session_events (
      id, session_id, timestamp, type, content, importance,
      agent_id, location, people, embedding, metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    // Skip if no session_id (can't link to session)
    // Use agent_id as fallback for session_id if needed
    const sessionId = row.session_id || `agent-${row.agent_id}`;
    
    // Convert timestamp to Unix epoch ms
    const timestamp = new Date(row.timestamp).getTime();

    try {
      insert.run(
        row.id,
        sessionId,
        timestamp,
        row.type, // observation, thought, action, reflection
        row.content,
        row.importance,
        row.agent_id,
        row.location,
        row.people,
        row.embedding,
        row.metadata
      );
      migrated++;

      if (migrated % 100 === 0) {
        console.log(`  Migrated ${migrated}/${rows.length}...`);
      }
    } catch (error) {
      console.error(`  ⚠️  Skipped ${row.id}: ${error}`);
      skipped++;
    }
  }

  console.log(`\n✨ Migration complete!`);
  console.log(`   Migrated: ${migrated}`);
  console.log(`   Skipped: ${skipped}`);

  // Verify
  const newCount = sessionsDb.query(`
    SELECT COUNT(*) as count FROM session_events
  `).get() as { count: number };

  console.log(`\n📊 New session_events count: ${newCount.count}`);

  // Clean up
  learningDb.close();
  sessionsDb.close();

  console.log("\n💡 Next steps:");
  console.log("   1. Verify migrated data with: bun run src/memory/verify-migration.ts");
  console.log("   2. Update learning-extension to use session_events");
  console.log("   3. (Optional) Remove memory_stream table from learning.db");
}

// Run migration
migrateMemoryStream();