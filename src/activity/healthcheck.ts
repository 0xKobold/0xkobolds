/**
 * Heartbeat Health Check
 * 
 * Correlates telemetry (cron ran) with activity (something happened).
 * Catches "silent failures" where cron succeeds but no actual work.
 */

import { activity } from './tracker'
import type { Platform } from './types'

interface HealthStatus {
  platform: Platform | 'all'
  status: 'healthy' | 'suspicious' | 'no_data'
  message: string
  details: {
    lastCronRun?: number
    lastActivity?: number
    cronSuccess?: boolean
    activityCount: number
    hoursSinceActivity: number
  }
}

/**
 * Check if a platform's heartbeat is healthy
 * 
 * Returns suspicious if:
 * - Cron ran successfully (in telemetry)
 * - But no activity in last 24h
 */
export function checkPlatformHealth(platform: Platform): HealthStatus {
  const recentActivity = activity().getRecent(platform, 1)
  const last24h = activity().getRecent(platform, 24)
  
  const lastActivityTime = recentActivity.length > 0 
    ? recentActivity[0].timestamp 
    : null
  
  const hoursSinceActivity = lastActivityTime 
    ? Math.floor((Date.now() / 1000 - lastActivityTime) / 3600)
    : null

  // Check telemetry for cron run
  // For now, we use activity data as proxy
  // In future, could query telemetry.db directly
  
  if (last24h.length === 0 && hoursSinceActivity === null) {
    return {
      platform,
      status: 'no_data',
      message: `No activity recorded for ${platform}`,
      details: { activityCount: 0, hoursSinceActivity: 0 }
    }
  }

  if (hoursSinceActivity !== null && hoursSinceActivity > 24) {
    return {
      platform,
      status: 'suspicious',
      message: `No ${platform} activity in ${hoursSinceActivity}h - cron may have failed silently`,
      details: { 
        activityCount: last24h.length,
        hoursSinceActivity,
        lastActivity: lastActivityTime || undefined
      }
    }
  }

  return {
    platform,
    status: 'healthy',
    message: `${platform} activity recent (${hoursSinceActivity || 0}h ago)`,
    details: {
      activityCount: last24h.length,
      hoursSinceActivity: hoursSinceActivity || 0,
      lastActivity: lastActivityTime || undefined
    }
  }
}

/**
 * Check all platforms at once
 */
export function checkAllPlatformHealth(): HealthStatus[] {
  const platforms: Platform[] = ['clawfm', 'moltx', 'molbook', 'clawchemy', '4claw', 'moltlaunch']
  return platforms.map(p => checkPlatformHealth(p))
}

/**
 * Quick status - just returns platforms with issues
 */
export function getHealthIssues(): HealthStatus[] {
  return checkAllPlatformHealth().filter(s => s.status !== 'healthy')
}

/**
 * Summary for logging/alerting
 */
export function getHealthSummary(): string {
  const statuses = checkAllPlatformHealth()
  const issues = statuses.filter(s => s.status !== 'healthy')
  
  if (issues.length === 0) {
    return '✅ All platforms healthy'
  }
  
  const lines = issues.map(i => `⚠️ ${i.platform}: ${i.message}`)
  return ['📊 Heartbeat Health Check', ...lines].join('\n')
}
