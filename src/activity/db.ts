/**
 * Activity Database Setup
 */

import { Database } from 'bun:sqlite'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'

const ACTIVITY_DB_PATH = join(process.env.HOME || '/home/moikapy', '.0xkobold', 'activity.db')

let db: Database | null = null

export function getDb(): Database {
  if (!db) {
    // Ensure directory exists
    const dir = join(process.env.HOME || '/home/moikapy', '.0xkobold')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    
    db = new Database(ACTIVITY_DB_PATH)
    
    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform TEXT NOT NULL,
        event_type TEXT NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        timestamp INTEGER NOT NULL,
        instance_id TEXT NOT NULL DEFAULT '0xkobold'
      );
      
      CREATE INDEX IF NOT EXISTS idx_events_platform ON events(platform);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    `)
  }
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
