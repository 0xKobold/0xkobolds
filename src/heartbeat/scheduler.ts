/**
 * Heartbeat Scheduler - v0.2.0
 * 
 * Cron-based scheduling for check-ins and notifications.
 * Part of Phase 2.2: Heartbeat System
 */

import { EventEmitter } from "events";

export type CheckInType = 'morning' | 'evening' | 'periodic' | 'idle' | 'nurture';

export interface ScheduleConfig {
  morning?: string;      // "09:00" (24h format)
  evening?: string;      // "18:00"
  periodic?: number;     // minutes between check-ins
  idleThreshold?: number; // minutes of idle to trigger
  nurtureAfter?: number;  // minutes of no interaction
  timezone?: string;      // e.g., "America/New_York"
  quietHoursStart?: number; // hour (0-23)
  quietHoursEnd?: number;   // hour (0-23)
}

export interface ScheduledEvent {
  id: string;
  type: CheckInType;
  scheduledTime: Date;
  payload?: Record<string, unknown>;
}

export interface HeartbeatScheduler extends EventEmitter {
  start(): void;
  stop(): void;
  scheduleCheckIn(type: CheckInType, delay?: number): string;
  cancelCheckIn(id: string): boolean;
  isQuietHours(): boolean;
  getNextScheduled(): ScheduledEvent | null;
}

class HeartbeatSchedulerImpl extends EventEmitter implements HeartbeatScheduler {
  private config: ScheduleConfig;
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private running = false;
  private lastInteraction: Date = new Date();

  constructor(config: ScheduleConfig = {}) {
    super();
    this.config = {
      morning: "09:00",
      evening: "18:00",
      idleThreshold: 30,
      nurtureAfter: 60,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      quietHoursStart: 22,
      quietHoursEnd: 8,
      ...config,
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    console.log("[Heartbeat] Scheduler started");

    // Schedule morning check-in
    if (this.config.morning) {
      this.scheduleDailyCheckIn('morning', this.config.morning);
    }

    // Schedule evening check-in
    if (this.config.evening) {
      this.scheduleDailyCheckIn('evening', this.config.evening);
    }

    // Start idle monitoring
    this.startIdleMonitoring();

    // Start nurture monitoring
    if (this.config.nurtureAfter) {
      this.startNurtureMonitoring();
    }

    this.emit('started');
  }

  stop(): void {
    this.running = false;
    
    // Clear all timers
    for (const [id, timer] of this.timers) {
      clearTimeout(timer);
      clearInterval(timer as unknown as number);
    }
    this.timers.clear();

    console.log("[Heartbeat] Scheduler stopped");
    this.emit('stopped');
  }

  /**
   * Schedule a daily check-in at specific time
   */
  private scheduleDailyCheckIn(type: CheckInType, timeStr: string): void {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();
    const scheduled = new Date();
    scheduled.setHours(hours, minutes, 0, 0);

    // If time already passed today, schedule for tomorrow
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }

    const delay = scheduled.getTime() - now.getTime();
    
    const id = `daily-${type}`;
    const timer = setTimeout(() => {
      this.triggerCheckIn(type);
      // Reschedule for next day
      this.scheduleDailyCheckIn(type, timeStr);
    }, delay);

    this.timers.set(id, timer as unknown as NodeJS.Timeout);
    console.log(`[Heartbeat] Scheduled ${type} check-in at ${timeStr} (${Math.round(delay / 1000 / 60)} min)`);
  }

  /**
   * Schedule a one-time check-in
   */
  scheduleCheckIn(type: CheckInType, delayMinutes = 0): string {
    const id = `${type}-${Date.now()}`;
    const delay = delayMinutes * 60 * 1000;

    const timer = setTimeout(() => {
      this.triggerCheckIn(type);
      this.timers.delete(id);
    }, delay);

    this.timers.set(id, timer as unknown as NodeJS.Timeout);
    return id;
  }

  /**
   * Cancel a scheduled check-in
   */
  cancelCheckIn(id: string): boolean {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      clearInterval(timer as unknown as number);
      this.timers.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Start idle detection
   */
  private startIdleMonitoring(): void {
    const checkInterval = 60 * 1000; // Check every minute
    
    const timer = setInterval(() => {
      if (!this.config.idleThreshold) return;
      
      const idleTime = Date.now() - this.lastInteraction.getTime();
      const threshold = this.config.idleThreshold * 60 * 1000;
      
      if (idleTime >= threshold) {
        this.triggerCheckIn('idle', { idleMinutes: Math.round(idleTime / 60000) });
        this.lastInteraction = new Date(); // Reset after triggering
      }
    }, checkInterval);

    this.timers.set('idle-monitor', timer as unknown as NodeJS.Timeout);
  }

  /**
   * Start nurture prompt monitoring
   */
  private startNurtureMonitoring(): void {
    const checkInterval = 5 * 60 * 1000; // Check every 5 minutes
    
    const timer = setInterval(() => {
      if (!this.config.nurtureAfter) return;
      if (this.isQuietHours()) return;
      
      const timeSinceLastInteraction = Date.now() - this.lastInteraction.getTime();
      const threshold = this.config.nurtureAfter * 60 * 1000;
      
      if (timeSinceLastInteraction >= threshold) {
        this.triggerCheckIn('nurture');
        this.lastInteraction = new Date(); // Reset
      }
    }, checkInterval);

    this.timers.set('nurture-monitor', timer as unknown as NodeJS.Timeout);
  }

  /**
   * Trigger a check-in event
   */
  private triggerCheckIn(type: CheckInType, payload?: Record<string, unknown>): void {
    if (this.isQuietHours() && type !== 'periodic') {
      console.log(`[Heartbeat] Skipping ${type} check-in (quiet hours)`);
      return;
    }

    const event: ScheduledEvent = {
      id: `${type}-${Date.now()}`,
      type,
      scheduledTime: new Date(),
      payload,
    };

    console.log(`[Heartbeat] Triggering ${type} check-in`);
    this.emit('checkin', event);
  }

  /**
   * Record user interaction (resets idle timer)
   */
  recordInteraction(): void {
    this.lastInteraction = new Date();
  }

  /**
   * Check if currently in quiet hours
   */
  isQuietHours(): boolean {
    if (this.config.quietHoursStart === undefined || this.config.quietHoursEnd === undefined) {
      return false;
    }

    const now = new Date();
    const currentHour = now.getHours();

    // Handle wrap-around (e.g., 22:00 - 08:00)
    if (this.config.quietHoursStart > this.config.quietHoursEnd) {
      return currentHour >= this.config.quietHoursStart || currentHour < this.config.quietHoursEnd;
    }

    return currentHour >= this.config.quietHoursStart && currentHour < this.config.quietHoursEnd;
  }

  /**
   * Get next scheduled event
   */
  getNextScheduled(): ScheduledEvent | null {
    // Simplified - would need timer introspection for real implementation
    return null;
  }
}

/**
 * Create scheduler instance
 */
export function createScheduler(config?: ScheduleConfig): HeartbeatScheduler {
  return new HeartbeatSchedulerImpl(config);
}

/**
 * Parse crontab-style schedule (simplified)
 */
export function parseSchedule(cron: string): { hours: number; minutes: number } {
  // Simple format: "HH:MM" only for now
  const [hours, minutes] = cron.split(':').map(Number);
  return { hours, minutes };
}

export default createScheduler;
