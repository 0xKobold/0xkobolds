/**
 * Session Migration Utilities
 *
 * Migrates from old fragmented session system to unified sessions.
 * Also supports OpenClaw migration.
 */

import { Database } from "bun:sqlite";
import { join } from "path";
import { homedir } from "os";
import { existsSync } from "fs";
import type { SessionStore } from "../SessionStore.js";
import type { MigrationResult, LegacySessionData } from "../types.js";

const KOBOLD_DIR = join(homedir(), ".0xkobold");

/**
 * Migrate legacy sessions to unified
 */
export async function migrateLegacySessions(
  unifiedStore: SessionStore
): Promise<MigrationResult> {
  console.log("[Migration] Starting legacy session migration...");

  const result: MigrationResult = {
    migrated: 0,
    orphaned: 0,
    skipped: 0,
    conflicts: 0,
    errors: [],
  };

  // 1. Collect legacy data from all databases
  const legacyData = await collectLegacyData();

  // 2. Create unified sessions
  for (const [system, records] of Object.entries(legacyData)) {
    for (const record of records) {
      try {
        // Check if already migrated
        const existing = await unifiedStore.getByPiSessionId(record.oldSessionId);
        if (existing) {
          result.skipped++;
          continue;
        }

        // Create unified session
        await unifiedStore.getOrCreateSession(record.oldSessionId, {
          source: system as any,
          // Preserve old data in metadata
          metadata: {
            migratedFrom: system,
            migratedAt: Date.now(),
            legacyData: record.data,
          },
        });

        result.migrated++;
      } catch (err) {
        result.errors.push({
          item: `${system}/${record.id}`,
          error: (err as Error).message,
        });
      }
    }
  }

  // 3. Log orphaned data (no session found)
  result.orphaned = countOrphanedRecords(legacyData);

  console.log(
    `[Migration] Complete: ${result.migrated} migrated, ${result.orphaned} orphaned, ${result.skipped} skipped`
  );

  return result;
}

/**
 * Collect data from all legacy databases
 */
async function collectLegacyData(): Promise<LegacySessionData> {
  const data: LegacySessionData = {
    tasks: [],
    channels: [],
    agents: [],
    conversations: [],
  };

  // Tasks
  const tasksDb = join(KOBOLD_DIR, "tasks.db");
  if (existsSync(tasksDb)) {
    try {
      const db = new Database(tasksDb);
      const rows = db
        .query("SELECT id, session_id FROM tasks")
        .all() as any[];
      data.tasks = rows.map((r) => ({
        id: r.id,
        oldSessionId: r.session_id,
        data: {},
      }));
      db.close();
    } catch {}
  }

  // Channels
  const channelsDb = join(KOBOLD_DIR, "channels.db");
  if (existsSync(channelsDb)) {
    try {
      const db = new Database(channelsDb);
      const rows = db
        .query("SELECT id, session_id FROM channel_configs")
        .all() as any[];
      data.channels = rows.map((r) => ({
        id: r.id,
        oldSessionId: r.session_id,
        data: {},
      }));
      db.close();
    } catch {}
  }

  // Agents
  const agentsDb = join(KOBOLD_DIR, "agents-runtime.db");
  if (existsSync(agentsDb)) {
    try {
      const db = new Database(agentsDb);
      const rows = db
        .query("SELECT id, session_key FROM persisted_agents")
        .all() as any[];
      data.agents = rows.map((r) => ({
        id: r.id,
        oldSessionKey: r.session_key,
        data: {},
      }));
      db.close();
    } catch {}
  }

  // Conversations
  const koboldDb = join(KOBOLD_DIR, "kobold.db");
  if (existsSync(koboldDb)) {
    try {
      const db = new Database(koboldDb);
      const rows = db
        .query(
          "SELECT id, session_id FROM conversations GROUP BY session_id"
        )
        .all() as any[];
      data.conversations = rows.map((r) => ({
        id: r.id,
        oldSessionId: r.session_id,
        data: {},
      }));
      db.close();
    } catch {}
  }

  return data;
}

function countOrphanedRecords(data: LegacySessionData): number {
  // Sessions with IDs that don't map to any active session
  // Would need pi-coding-agent session list to verify
  let count = 0;
  for (const records of Object.values(data)) {
    for (const record of records) {
      const sessionId = (record as any).oldSessionId || (record as any).oldSessionKey;
      if (!sessionId || sessionId === "undefined" || sessionId === "null") {
        count++;
      }
    }
  }
  return count;
}

export { migrateLegacySessions as migrateToUnifiedSessions };
