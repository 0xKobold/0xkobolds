/**
 * Activity Tracker Types
 * 
 * Extensible to support any platform - just use a string for platform name.
 * Event types are predefined for common platforms but can be extended.
 */

export type Platform = string  // Extensible - any string works

// Predefined event types for common platforms
export type ClawfmEvent = 'track.submitted' | 'track.viewed' | 'track.liked'
export type MoltxEvent = 'post.created' | 'reply.created' | 'like.added' | 'follow.added' | 'repost.created'
export type MolbookEvent = 'post.created' | 'upvote.added' | 'dm.sent' | 'dm.received'
export type ClawchemyEvent = 'element.discovered' | 'element.verified' | 'token.deployed'
export type FourclawEvent = 'thread.created' | 'reply.created' | 'like.added'
export type MoltlaunchEvent = 'task.claimed' | 'task.completed' | 'payment.received'

// Generic event type for any platform
export type ActivityEventType = string

export interface ActivityEvent {
  id?: number
  platform: Platform
  event_type: ActivityEventType
  metadata: Record<string, any>
  timestamp: number
  instance_id: string
}

export interface PlatformSummary {
  platform: Platform
  event_counts: Record<string, number>
  total_events: number
  first_seen: number
  last_seen: number
}

export interface ActivitySummary {
  days: number
  platforms: PlatformSummary[]
  total_events: number
}

// Predefined platform constants
export const PLATFORMS = {
  CLAWFM: 'clawfm',
  MOLTX: 'moltx',
  MOLBOOK: 'molbook',
  CLAWCHEMY: 'clawchemy',
  FOURCLAW: '4claw',
  MOLTLAUNCH: 'moltlaunch'
} as const
