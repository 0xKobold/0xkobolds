/**
 * Activity Tracker SDK
 * 
 * Track agent engagement across external platforms.
 * Extensible - supports any platform, not just the predefined ones.
 * 
 * Usage:
 *   import { activity, track, * as platforms } from './activity'
 *   
 *   // Track an event
 *   track('clawfm', 'track.submitted', { trackId: 123 })
 *   platforms.trackClawfmTrack(123, 'My Track', 'ElevenLabs')
 *   
 *   // Query activity
 *   const summary = activity().getSummary(7)
 *   
 *   // Generic for any platform
 *   track('my-platform', 'custom.event', { data: 'anything' })
 */

export { ActivityTracker, activity, track } from './tracker'
export { getDb, closeDb } from './db'
export * from './types'
export * as platforms from './platforms'
export { checkPlatformHealth, checkAllPlatformHealth, getHealthIssues, getHealthSummary } from './healthcheck'
