#!/usr/bin/env bun
/**
 * Migration script: Perennial Memory → PI-Learn
 * 
 * Migrates memories, categories, and metadata from perennial-memory to pi-learn.
 * Perennial stores categorized facts, PI-Learn stores peer observations/representations.
 * 
 * Mapping:
 * - Perennial memories → PI-Learn observations (with category as metadata)
 * - Perennial categories → PI-Learn session tags
 * - Session context → preserved in observation metadata
 */

import { Database } from 'bun:sqlite';
import { resolve, dirname } from 'path';
import { existsSync, mkdirSync } from 'fs';

// Configuration
const PERENNIAL_DB_PATH = resolve(process.env.HOME || '~', '.0xkobold/memory/perennial/knowledge.db');
const PILEARN_DB_PATH = resolve(process.env.HOME || '~', '.pi/memory/pi-learn.db');
const DEFAULT_WORKSPACE = 'default';
const DEFAULT_PEER = 'moikapy';

interface PerennialMemory {
  id: string;
  content: string;
  timestamp: string;
  category: string;
  tags: string;
  project: string | null;
  importance: number;
  session_id: string | null;
}

interface PerennialCategory {
  id: string;
  name: string;
  summary: string | null;
  item_count: number;
}

function openPerennial(): Database | null {
  if (!existsSync(PERENNIAL_DB_PATH)) {
    console.log(`⚠️  Perennial database not found: ${PERENNIAL_DB_PATH}`);
    return null;
  }
  return new Database(PERENNIAL_DB_PATH, { readonly: true });
}

function openPiLearn(): Database | null {
  // Ensure directory exists
  const dir = dirname(PILEARN_DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  
  if (!existsSync(PILEARN_DB_PATH)) {
    console.log(`⚠️  PI-Learn database not found: ${PILEARN_DB_PATH}`);
    console.log(`    PI-Learn will create it on first use. Run 'bun run tui' first.`);
    return null;
  }
  return new Database(PILEARN_DB_PATH);
}

function ensureWorkspaceAndPeer(db: Database): { workspaceId: string; peerId: string } {
  // Create default workspace if not exists
  db.exec(`
    INSERT OR IGNORE INTO workspaces (id, name, created_at, config)
    VALUES ('${DEFAULT_WORKSPACE}', 'Default Workspace', ${Date.now()}, '{}')
  `);
  
  // Create default peer if not exists
  db.exec(`
    INSERT OR IGNORE INTO peers (id, workspace_id, name, type, created_at, metadata)
    VALUES ('${DEFAULT_PEER}', '${DEFAULT_WORKSPACE}', '${DEFAULT_PEER}', 'user', ${Date.now()}, '{}')
  `);
  
  // Ensure default session
  const sessionId = 'migration-session';
  db.exec(`
    INSERT OR IGNORE INTO sessions (id, workspace_id, peer_ids, message_count, created_at, updated_at, config, tags)
    VALUES ('${sessionId}', '${DEFAULT_WORKSPACE}', '["${DEFAULT_PEER}"]', 0, ${Date.now()}, ${Date.now()}, '{}', '["migrated", "from-perennial"]')
  `);
  
  return { workspaceId: DEFAULT_WORKSPACE, peerId: DEFAULT_PEER };
}

function getMemories(perennial: Database): PerennialMemory[] {
  try {
    return perennial.prepare('SELECT * FROM memories ORDER BY timestamp DESC').all() as PerennialMemory[];
  } catch (e) {
    console.error('Error reading memories:', e);
    return [];
  }
}

function getCategories(perennial: Database): PerennialCategory[] {
  try {
    return perennial.prepare('SELECT * FROM memory_categories').all() as PerennialCategory[];
  } catch (e) {
    console.error('Error reading categories:', e);
    return [];
  }
}

function migrateObservations(
  db: Database,
  memories: PerennialMemory[],
  workspaceId: string,
  peerId: string
): { migrated: number; skipped: number } {
  let migrated = 0;
  let skipped = 0;
  
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO observations 
    (id, peer_id, workspace_id, session_id, role, content, created_at, processed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const memory of memories) {
    try {
      // Parse tags and category
      let tags: string[] = [];
      try {
        tags = JSON.parse(memory.tags || '[]');
      } catch {
        // Use category as tag if parsing fails
      }
      tags.push(memory.category);
      
      // Include category in content for searchability
      const enrichedContent = `[${memory.category.toUpperCase()}] ${memory.content}`;
      
      // Convert timestamp to unix ms
      const timestamp = new Date(memory.timestamp).getTime() || Date.now();
      
      insertStmt.run(
        `migrated-${memory.id}`,
        peerId,
        workspaceId,
        'migration-session',
        'user',
        enrichedContent,
        timestamp,
        1 // Mark as processed since it's already processed content
      );
      
      migrated++;
    } catch (e) {
      console.error(`Error migrating memory ${memory.id}:`, e);
      skipped++;
    }
  }
  
  return { migrated, skipped };
}

function migrateConclusions(
  db: Database,
  memories: PerennialMemory[],
  workspaceId: string,
  peerId: string
): number {
  let migrated = 0;
  
  // Create conclusions from high-importance memories
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO conclusions
    (id, peer_id, workspace_id, type, content, premises, confidence, created_at, source_session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const memory of memories) {
    if (memory.importance >= 0.7) {
      try {
        const timestamp = new Date(memory.timestamp).getTime() || Date.now();
        
        // Determine conclusion type based on category
        let type = 'inductive';
        if (memory.category === 'context') type = 'deductive';
        if (memory.category === 'learning') type = 'abductive';
        
        insertStmt.run(
          `conclusion-${memory.id}`,
          peerId,
          workspaceId,
          type,
          `[From ${memory.category} memory] ${memory.content}`,
          JSON.stringify([`Original memory: ${memory.id}`]),
          memory.importance,
          timestamp,
          'migration-session'
        );
        
        migrated++;
      } catch (e) {
        // Skip duplicates or errors
      }
    }
  }
  
  return migrated;
}

function getPiLearnStats(db: Database, workspaceId: string): { observations: number; conclusions: number } {
  try {
    const obs = db.prepare(`SELECT COUNT(*) as count FROM observations WHERE workspace_id = ?`).get(workspaceId) as any;
    const con = db.prepare(`SELECT COUNT(*) as count FROM conclusions WHERE workspace_id = ?`).get(workspaceId) as any;
    return {
      observations: obs?.count || 0,
      conclusions: con?.count || 0
    };
  } catch {
    return { observations: 0, conclusions: 0 };
  }
}

export async function runMigration(): Promise<void> {
  console.log('🔄 Perennial Memory → PI-Learn Migration');
  console.log('=========================================\n');
  
  // Open databases
  const perennial = openPerennial();
  if (!perennial) {
    console.log('❌ Cannot proceed without perennial database');
    return;
  }
  
  const piLearn = openPiLearn();
  if (!piLearn) {
    console.log('❌ Cannot proceed without PI-Learn database');
    console.log('   Run `bun run tui` first to initialize PI-Learn');
    return;
  }
  
  // Get source data
  const memories = getMemories(perennial);
  const categories = getCategories(perennial);
  
  console.log(`📦 Found ${memories.length} memories to migrate`);
  console.log(`📁 Found ${categories.length} categories\n`);
  
  if (memories.length === 0) {
    console.log('✅ Nothing to migrate - perennial memory is empty');
    perennial.close();
    piLearn.close();
    return;
  }
  
  // Ensure workspace/peer exist
  const { workspaceId, peerId } = ensureWorkspaceAndPeer(piLearn);
  console.log(`👤 Using workspace: ${workspaceId}, peer: ${peerId}\n`);
  
  // Before stats
  const beforeStats = getPiLearnStats(piLearn, workspaceId);
  console.log(`📊 PI-Learn before: ${beforeStats.observations} observations, ${beforeStats.conclusions} conclusions\n`);
  
  // Migrate
  console.log('📝 Migrating memories as observations...');
  const obsResult = migrateObservations(piLearn, memories, workspaceId, peerId);
  console.log(`   ✅ Migrated: ${obsResult.migrated}, Skipped: ${obsResult.skipped}\n`);
  
  console.log('🧠 Migrating important memories as conclusions...');
  const conclusionsMigrated = migrateConclusions(piLearn, memories, workspaceId, peerId);
  console.log(`   ✅ Migrated: ${conclusionsMigrated} conclusions\n`);
  
  // After stats
  const afterStats = getPiLearnStats(piLearn, workspaceId);
  console.log(`📊 PI-Learn after: ${afterStats.observations} observations, ${afterStats.conclusions} conclusions\n`);
  
  // Summary
  console.log('✅ Migration complete!\n');
  console.log('Summary:');
  console.log(`  • ${obsResult.migrated} memories → observations`);
  console.log(`  • ${conclusionsMigrated} high-importance → conclusions`);
  console.log(`  • ${obsResult.skipped} memories skipped (duplicates/errors)\n`);
  console.log('💡 PI-Learn will now have access to your perennial memories');
  console.log('   Use /learn-query to search your migrated memories\n');
  
  // Cleanup
  perennial.close();
  piLearn.close();
}

// Run if called directly
if (import.meta.main) {
  runMigration().catch(console.error);
}
