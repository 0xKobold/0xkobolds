/**
 * Verify Migration: memory_stream → session_events
 *
 * Compares data integrity after migration.
 *
 * Usage:
 *   bun run src/memory/verify-migration.ts
 */

import { Database } from "bun:sqlite";
import { homedir } from "node:os";
import { join } from "node:path";

const LEARNING_DB = join(homedir(), ".0xkobold", "generative", "agents.db");
const SESSIONS_DB = join(homedir(), ".0xkobold", "sessions.db");

function verifyMigration() {
  console.log("🔍 Verifying migration integrity...\n");

  try {
    const learningDb = new Database(LEARNING_DB, { readonly: true });
    const sessionsDb = new Database(SESSIONS_DB, { readonly: true });

    // Count source
    const sourceCount = learningDb.query(`
      SELECT COUNT(*) as count FROM memory_stream
    `).get() as { count: number } | undefined;

    // Count destination
    const destCount = sessionsDb.query(`
      SELECT COUNT(*) as count FROM session_events
    `).get() as { count: number };

    console.log("📊 Counts:");
    console.log(`   memory_stream: ${sourceCount?.count ?? 0}`);
    console.log(`   session_events: ${destCount.count}`);

    // Check types distribution
    const typesSource = learningDb.query(`
      SELECT type, COUNT(*) as count 
      FROM memory_stream 
      GROUP BY type
    `).all() as { type: string; count: number }[];

    const typesDest = sessionsDb.query(`
      SELECT type, COUNT(*) as count 
      FROM session_events 
      GROUP BY type
    `).all() as { type: string; count: number }[];

    console.log("\n📋 Type distribution:");
    console.log("   Source (memory_stream):");
    for (const t of typesSource) {
      console.log(`     ${t.type}: ${t.count}`);
    }

    console.log("   Destination (session_events):");
    for (const t of typesDest) {
      console.log(`     ${t.type}: ${t.count}`);
    }

    // Check importance range
    const importanceSource = learningDb.query(`
      SELECT MIN(importance) as min, MAX(importance) as max, AVG(importance) as avg
      FROM memory_stream
    `).get() as { min: number; max: number; avg: number };

    const importanceDest = sessionsDb.query(`
      SELECT MIN(importance) as min, MAX(importance) as max, AVG(importance) as avg
      FROM session_events
    `).get() as { min: number; max: number; avg: number };

    console.log("\n📊 Importance range:");
    console.log(`   Source: ${importanceSource.min} - ${importanceSource.max} (avg: ${importanceSource.avg?.toFixed(2) ?? 'N/A'})`);
    console.log(`   Destination: ${importanceDest.min} - ${importanceDest.max} (avg: ${importanceDest.avg?.toFixed(2) ?? 'N/A'})`);

    // Sample comparison
    const sampleSource = learningDb.query(`
      SELECT id, content, type, importance FROM memory_stream LIMIT 3
    `).all() as { id: string; content: string; type: string; importance: number }[];

    console.log("\n🔎 Sample comparison:");
    for (const src of sampleSource) {
      const dest = sessionsDb.query(`
        SELECT content, type, importance FROM session_events WHERE id = ?
      `).get(src.id) as { content: string; type: string; importance: number } | undefined;

      if (dest) {
        const match = 
          dest.content === src.content && 
          dest.type === src.type && 
          dest.importance === src.importance;
        console.log(`   ${src.id}: ${match ? '✅' : '❌'} ${src.type} - "${src.content.slice(0, 30)}..."`);
      } else {
        console.log(`   ${src.id}: ❌ NOT FOUND in session_events`);
      }
    }

    // Final verdict
    const diff = Math.abs((sourceCount?.count ?? 0) - destCount.count);
    if (diff === 0) {
      console.log("\n✅ Migration verified: counts match");
    } else {
      console.log(`\n⚠️  Migration note: ${diff} entries difference`);
      console.log("   This may be expected (entries without session_id)");
    }

    learningDb.close();
    sessionsDb.close();

  } catch (error) {
    console.error("❌ Verification failed:", error);
    process.exit(1);
  }
}

verifyMigration();