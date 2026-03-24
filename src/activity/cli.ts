/**
 * Activity Tracker CLI
 */

import { activity } from './index.js'
import type { Platform } from './types.js'
import { checkAllPlatformHealth } from './healthcheck.js'

const EMOJIS: Record<string, string> = {
  clawfm: '🎵', moltx: '🐦', molbook: '📖', 
  clawchemy: '🧪', '4claw': '🦞', moltlaunch: '🚀'
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString()
}

async function showSummary(days: number = 7) {
  const summary = activity().getSummary(days)
  
  console.log(`\n📊 Activity Tracker - ${days} Day Summary\n`)
  console.log(`Total events: ${summary.total_events}\n`)
  
  if (summary.platforms.length === 0) {
    console.log('No activity recorded yet.\n')
    return
  }
  
  for (const platform of summary.platforms) {
    const emoji = EMOJIS[platform.platform] || '📊'
    console.log(`${emoji} ${platform.platform.toUpperCase()}`)
    console.log(`   Events: ${platform.total_events}`)
    for (const [type, count] of Object.entries(platform.event_counts)) {
      const formatted = type.replace(/\./g, ' ').replace(/^\w/, c => c.toUpperCase())
      console.log(`   - ${formatted}: ${count}`)
    }
    console.log('')
  }
}

async function showRecent(platform?: Platform) {
  const events = activity().getRecent(platform, 7)
  
  console.log(`\n📋 Recent Activity (${events.length} events)\n`)
  
  if (events.length === 0) {
    console.log('No recent activity.\n')
    return
  }
  
  for (const event of events.slice(0, 20)) {
    const emoji = EMOJIS[event.platform] || '📊'
    const date = new Date(event.timestamp * 1000).toLocaleString()
    const meta = event.metadata || {}
    
    console.log(`${emoji} [${date}] ${event.platform}/${event.event_type}`)
    if (meta.trackId) console.log(`   Track: #${meta.trackId}`)
    if (meta.title) console.log(`   Title: ${meta.title}`)
    if (meta.generator) console.log(`   Generator: ${meta.generator}`)
    if (meta.count) console.log(`   Count: ${meta.count}`)
    console.log('')
  }
}

async function showPlatform(name: string) {
  const platform = name.toLowerCase() as Platform
  const stats = activity().getPlatformStats(platform, 7)
  
  const emoji = EMOJIS[platform] || '📊'
  console.log(`\n${emoji} ${platform.toUpperCase()} Stats (7 days)\n`)
  
  if (stats.total_events === 0) {
    console.log('No activity.\n')
    return
  }
  
  console.log(`Total events: ${stats.total_events}\n`)
  for (const [type, count] of Object.entries(stats.event_counts)) {
    const formatted = type.replace(/\./g, ' ').replace(/^\w/, c => c.toUpperCase())
    console.log(`  ${formatted}: ${count}`)
  }
  console.log('')
}

async function showHealth() {
  console.log('\n📊 Heartbeat Health Check\n')
  
  const statuses = checkAllPlatformHealth()
  
  for (const status of statuses) {
    const emoji = status.status === 'healthy' ? '✅' 
                : status.status === 'suspicious' ? '⚠️' 
                : '❌'
    console.log(`${emoji} ${status.platform}: ${status.message}`)
  }
  console.log('')
}

// Main
const args = process.argv.slice(2)
const command = args[0] || 'summary'

if (command === 'summary') await showSummary(7)
else if (command === 'recent') await showRecent(args[1] as Platform)
else if (command === 'platform') {
  if (!args[1]) { console.error('Usage: platform <name>'); process.exit(1) }
  await showPlatform(args[1])
}
else if (command === 'health') await showHealth()
else {
  console.log(`
📊 Activity Tracker CLI

Usage:
  bun run src/activity/cli.ts summary     # 7-day summary
  bun run src/activity/cli.ts recent      # Recent events  
  bun run src/activity/cli.ts health      # Heartbeat health check
  bun run src/activity/cli.ts platform <name>  # Stats for platform

Platforms: clawfm, moltx, molbook, clawchemy, 4claw, moltlaunch
`)
}
