/**
 * Real Heartbeat Scheduler - v0.2.0
 * 
 * ACTUAL cron-based scheduler for check-ins and notifications.
 * Replaces setTimeout mocks with real scheduling.
 */

import { EventEmitter } from "events";

export type CheckInType = 'morning' | 'evening' | 'periodic' | 'idle' | 'nurture';

export interface ScheduleConfig {
  morning?: string;      // "09:00" (24h format, local time)
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

interface CheckInJob {
  id: string;
  type: CheckInType;
  schedule: string; // cron-like or time string
  nextRun: Date;
  timer?: Timer;
}

class HeartbeatScheduler extends EventEmitter {
  private config: ScheduleConfig;
  private jobs: Map<string, CheckInJob> = new Map();
  private running = false;
  private lastInteraction: Date = new Date();
  private idleCheckTimer?: Timer;
  private nurtureTimer?: Timer;

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

  /**
   * Start the scheduler - ACTUALLY runs now
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log(`[Heartbeat] Scheduler started (timezone: ${this.config.timezone})`);

    // Schedule morning check-in
    if (this.config.morning) {
      this.scheduleTimeBasedCheckIn('morning', this.config.morning);
    }

    // Schedule evening check-in
    if (this.config.evening) {
      this.scheduleTimeBasedCheckIn('evening', this.config.evening);
    }

    // Schedule periodic check-ins
    if (this.config.periodic) {
      this.schedulePeriodicCheckIn('periodic', this.config.periodic);
    }

    // Start idle monitoring (ACTUAL implementation)
    this.startIdleMonitoring();

    // Start nurture monitoring (ACTUAL implementation)
    if (this.config.nurtureAfter) {
      this.startNurtureMonitoring();
    }

    this.emit('started');
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    this.running = false;

    // Clear all timers
    for (const job of this.jobs.values()) {
      if (job.timer) {
        clearTimeout(job.timer);
      }
    }
    this.jobs.clear();

    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
    }
    if (this.nurtureTimer) {
      clearInterval(this.nurtureTimer);
    }

    console.log("[Heartbeat] Scheduler stopped");
    this.emit('stopped');
  }

  /**
   * Schedule a time-based check-in (e.g., "09:00")
   * ACTUALLY calculates next occurrence and sets timer
   */
  private scheduleTimeBasedCheckIn(type: CheckInType, timeStr: string): void {
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    const calculateNextRun = (): Date => {
      const now = new Date();
      const next = new Date();
      next.setHours(hours, minutes, 0, 0);
      
      // If time already passed today, schedule for tomorrow
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      
      return next;
    };

    const scheduleNext = () => {
      const nextRun = calculateNextRun();
      const delay = nextRun.getTime() - Date.now();
      
      console.log(`[Heartbeat] ${type} check-in scheduled for ${timeStr} (in ${Math.round(delay / 60000)} minutes)`);
      
      const timer = setTimeout(() => {
        this.triggerCheckIn(type);
        // Reschedule for next day
        scheduleNext();
      }, delay);

      const jobId = `daily-${type}`;
      this.jobs.set(jobId, {
        id: jobId,
        type,
        schedule: timeStr,
        nextRun,
        timer,
      });
    };

    scheduleNext();
  }

  /**
   * Schedule periodic check-ins (e.g., every 30 minutes)
   */
  private schedulePeriodicCheckIn(type: CheckInType, intervalMinutes: number): void {
    const intervalMs = intervalMinutes * 60 * 1000;
    
    const timer = setInterval(() => {
      this.triggerCheckIn(type);
    }, intervalMs);

    this.jobs.set(`periodic-${type}`, {
      id: `periodic-${type}`,
      type,
      schedule: `every ${intervalMinutes}m`,
      nextRun: new Date(Date.now() + intervalMs),
      timer,
    });

    console.log(`[Heartbeat] Periodic ${type} check-ins every ${intervalMinutes} minutes`);
  }

  /**
   * Schedule a one-off check-in (e.g., remind me in 5 minutes)
   */
  scheduleCheckIn(type: CheckInType, delayMinutes: number): string {
    const id = `scheduled-${type}-${Date.now()}`;
    const delayMs = delayMinutes * 60 * 1000;

    const timer = setTimeout(() => {
      this.triggerCheckIn(type);
      this.jobs.delete(id);
    }, delayMs);

    this.jobs.set(id, {
      id,
      type,
      schedule: `in ${delayMinutes}m`,
      nextRun: new Date(Date.now() + delayMs),
      timer,
    });

    return id;
  }

  /**
   * Cancel a scheduled check-in
   */
  cancelCheckIn(id: string): boolean {
    const job = this.jobs.get(id);
    if (job) {
      if (job.timer) clearTimeout(job.timer);
      this.jobs.delete(id);
      return true;
    }
    return false;
  }

  /**
   * ACTUAL idle detection with real monitoring
   */
  private startIdleMonitoring(): void {
    if (!this.config.idleThreshold) return;

    // Check every minute
    this.idleCheckTimer = setInterval(() => {
      if (!this.running) return;

      const idleTime = Date.now() - this.lastInteraction.getTime();
      const thresholdMs = (this.config.idleThreshold || 30) * 60 * 1000;

      if (idleTime >= thresholdMs) {
        const idleMinutes = Math.round(idleTime / 60000);
        console.log(`[Heartbeat] Idle detected: ${idleMinutes} minutes`);
        
        this.triggerCheckIn('idle', { 
          idleMinutes,
          since: this.lastInteraction.toISOString()
        });
        
        // Reset to avoid repeated triggers
        this.lastInteraction = new Date();
      }
    }, 60000); // Check every minute

    console.log(`[Heartbeat] Idle monitoring started (${this.config.idleThreshold} min threshold)`);
  }

  /**
   * ACTUAL nurture monitoring
   */
  private startNurtureMonitoring(): void {
    const thresholdMs = (this.config.nurtureAfter || 60) * 60 * 1000;

    this.nurtureTimer = setInterval(() => {
      if (!this.running || this.isQuietHours()) return;

      const timeSinceInteraction = Date.now() - this.lastInteraction.getTime();
      
      if (timeSinceInteraction >= thresholdMs) {
        console.log('[Heartbeat] Nurture check-in triggered');
        this.triggerCheckIn('nurture');
        this.lastInteraction = new Date(); // Reset
      }
    }, 5 * 60 * 1000); // Check every 5 minutes

    console.log(`[Heartbeat] Nurture monitoring started (${this.config.nurtureAfter} min threshold)`);
  }

  /**
   * Trigger an ACTUAL check-in event
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

    console.log(`[Heartbeat] 🔔 ${type.toUpperCase()} check-in triggered`);
    this.emit('checkin', event);
  }

  /**
   * Record user interaction (resets idle timers)
   * ACTUALLY used by the system
   */
  recordInteraction(): void {
    const wasIdle = Date.now() - this.lastInteraction.getTime() > 5 * 60 * 1000; // 5 min
    this.lastInteraction = new Date();
    
    if (wasIdle) {
      console.log('[Heartbeat] User returned from idle');
      this.emit('active');
    }
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
   * Get upcoming scheduled events
   */
  getUpcoming(): Array<{ type: CheckInType; nextRun: Date }> {
    return Array.from(this.jobs.values())
      .map(job => ({ type: job.type, nextRun: job.nextRun }))
      .sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime());
  }

  /**
   * Get time until next check-in
   */
  getTimeUntilNext(): number {
    const upcoming = this.getUpcoming();
    if (upcoming.length === 0) return Infinity;
    
    const next = upcoming[0];
    return Math.max(0, next.nextRun.getTime() - Date.now());
  }

  isRunning(): boolean {
    return this.running;
  }
}

// Singleton
let scheduler: HeartbeatScheduler | null = null;

export function getScheduler(config?: ScheduleConfig): HeartbeatScheduler {
  if (!scheduler) {
    scheduler = new HeartbeatScheduler(config);
  }
  return scheduler;
}

export function resetScheduler(): void {
  scheduler?.stop();
  scheduler = null;
}

export { HeartbeatScheduler };
export default HeartbeatScheduler;
