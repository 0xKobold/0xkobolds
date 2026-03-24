/**
 * Activity Tracker
 */

import { getDb } from './db'
import type { Platform, ActivityEvent, ActivitySummary, PlatformSummary, ActivityEventType } from './types'

const INSTANCE_ID = '0xkobold'

export class ActivityTracker {
  track(platform: Platform, eventType: ActivityEventType, metadata: Record<string, any> = {}): void {
    const db = getDb()
    const timestamp = Math.floor(Date.now() / 1000)
    
    db.query(`
      INSERT INTO events (platform, event_type, metadata, timestamp, instance_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(platform, eventType, JSON.stringify(metadata), timestamp, INSTANCE_ID)
  }

  getRecent(platform?: Platform, days: number = 7): ActivityEvent[] {
    const db = getDb()
    const since = Math.floor(Date.now() / 1000) - (days * 86400)
    
    // Fetch all and filter (Bun SQLite workaround for timestamp comparison)
    const allRows = db.query(`SELECT * FROM events ORDER BY timestamp DESC`).all() as any[]
    
    return allRows
      .filter(row => row.timestamp >= since && (!platform || row.platform === platform))
      .slice(0, 100)
      .map(row => ({
        ...row,
        metadata: JSON.parse(row.metadata)
      }))
  }

  getSummary(days: number = 7): ActivitySummary {
    const db = getDb()
    const since = Math.floor(Date.now() / 1000) - (days * 86400)
    
    // Fetch all and filter
    const allRows = db.query(`SELECT * FROM events`).all() as any[]
    const filtered = allRows.filter(row => row.timestamp >= since)
    
    if (filtered.length === 0) {
      return { days, platforms: [], total_events: 0 }
    }

    // Group by platform
    const byPlatform: Record<string, { events: any[], first: number, last: number }> = {}
    
    for (const e of filtered) {
      if (!byPlatform[e.platform]) {
        byPlatform[e.platform] = { events: [], first: e.timestamp, last: e.timestamp }
      }
      byPlatform[e.platform].events.push(e)
      byPlatform[e.platform].first = Math.min(byPlatform[e.platform].first, e.timestamp)
      byPlatform[e.platform].last = Math.max(byPlatform[e.platform].last, e.timestamp)
    }

    const platforms: PlatformSummary[] = []
    for (const [platform, data] of Object.entries(byPlatform)) {
      const eventCounts: Record<string, number> = {}
      for (const e of data.events) {
        eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1
      }
      platforms.push({
        platform: platform as Platform,
        event_counts: eventCounts,
        total_events: data.events.length,
        first_seen: data.first,
        last_seen: data.last
      })
    }

    return { days, platforms, total_events: filtered.length }
  }

  getPlatformStats(platform: Platform, days: number = 7): PlatformSummary {
    const db = getDb()
    const since = Math.floor(Date.now() / 1000) - (days * 86400)
    
    const allRows = db.query(`SELECT * FROM events WHERE platform = ?`).all(platform) as any[]
    const filtered = allRows.filter(row => row.timestamp >= since)

    if (filtered.length === 0) {
      return { platform, event_counts: {}, total_events: 0, first_seen: 0, last_seen: 0 }
    }

    const eventCounts: Record<string, number> = {}
    let first = filtered[0].timestamp, last = filtered[0].timestamp
    
    for (const e of filtered) {
      eventCounts[e.event_type] = (eventCounts[e.event_type] || 0) + 1
      first = Math.min(first, e.timestamp)
      last = Math.max(last, e.timestamp)
    }

    return { platform, event_counts: eventCounts, total_events: filtered.length, first_seen: first, last_seen: last }
  }
}

// Singleton
let tracker: ActivityTracker | null = null

export function activity(): ActivityTracker {
  if (!tracker) tracker = new ActivityTracker()
  return tracker
}

export function track(platform: Platform, eventType: ActivityEventType, metadata: Record<string, any> = {}): void {
  activity().track(platform, eventType, metadata)
}
