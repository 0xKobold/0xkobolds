/**
 * Platform Activity Tracking Helpers
 * 
 * Easy-to-use helpers for each platform.
 * Import what you need, track what happens.
 */

import { track } from './tracker'
import { PLATFORMS } from './types'

// === CLAW.FM ===
export function trackClawfmTrack(trackId: number, title: string, generator: string, duration?: number) {
  track(PLATFORMS.CLAWFM, 'track.submitted', { trackId, title, generator, duration })
}

export function trackClawfmView(trackId: number) {
  track(PLATFORMS.CLAWFM, 'track.viewed', { trackId })
}

export function trackClawfmLike(trackId: number) {
  track(PLATFORMS.CLAWFM, 'track.liked', { trackId })
}

// === MOLTX ===
export function trackMoltxPost(content: string, chars: number) {
  track(PLATFORMS.MOLTX, 'post.created', { content: content.slice(0, 100), chars })
}

export function trackMoltxReply(postId: string, parentId?: string) {
  track(PLATFORMS.MOLTX, 'reply.created', { postId, parentId })
}

export function trackMoltxLike(postId: string) {
  track(PLATFORMS.MOLTX, 'like.added', { postId })
}

export function trackMoltxFollow(handle: string) {
  track(PLATFORMS.MOLTX, 'follow.added', { handle })
}

export function trackMoltxRepost(postId: string) {
  track(PLATFORMS.MOLTX, 'repost.created', { postId })
}

// === MOLBOOK ===
export function trackMolbookPost(content: string, chars: number) {
  track(PLATFORMS.MOLBOOK, 'post.created', { content: content.slice(0, 100), chars })
}

export function trackMolbookUpvote(postId: string) {
  track(PLATFORMS.MOLBOOK, 'upvote.added', { postId })
}

export function trackMolbookDM(recipient: string, sent: boolean) {
  track(PLATFORMS.MOLBOOK, sent ? 'dm.sent' : 'dm.received', { recipient })
}

// === CLAWCHEMY ===
export function trackClawchemyDiscovery(element: string, isFirst: boolean) {
  track(PLATFORMS.CLAWCHEMY, 'element.discovered', { element, isFirst })
}

export function trackClawchemyVerification(element: string, agreed: boolean) {
  track(PLATFORMS.CLAWCHEMY, 'element.verified', { element, agreed })
}

export function trackClawchemyToken(element: string, tokenAddress: string) {
  track(PLATFORMS.CLAWCHEMY, 'token.deployed', { element, tokenAddress })
}

// === 4CLAW ===
export function trackFourclawThread(board: string, threadId: number, subject: string) {
  track(PLATFORMS.FOURCLAW, 'thread.created', { board, threadId, subject })
}

export function trackFourclawReply(board: string, threadId: number) {
  track(PLATFORMS.FOURCLAW, 'reply.created', { board, threadId })
}

export function trackFourclawLike(threadId: number) {
  track(PLATFORMS.FOURCLAW, 'like.added', { threadId })
}

// === MOLTLAUNCH ===
export function trackMoltlaunchClaim(taskId: string, reward: string) {
  track(PLATFORMS.MOLTLAUNCH, 'task.claimed', { taskId, reward })
}

export function trackMoltlaunchComplete(taskId: string, payout?: string) {
  track(PLATFORMS.MOLTLAUNCH, 'task.completed', { taskId, payout })
}

export function trackMoltlaunchPayment(taskId: string, amount: string, txHash: string) {
  track(PLATFORMS.MOLTLAUNCH, 'payment.received', { taskId, amount, txHash })
}

// === GENERIC ===
// For any custom platform/event
export function trackActivity(platform: string, eventType: string, metadata: Record<string, any> = {}) {
  track(platform as any, eventType as any, metadata)
}
