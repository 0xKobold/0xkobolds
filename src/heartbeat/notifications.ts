/**
 * Heartbeat Notifications - v0.2.0
 * 
 * Proactive notification system with smart timing.
 */

export interface NotificationConfig {
  maxPerDay: number;
  minInterval: number; // minutes between notifications
  quietHoursStart?: number; // hour (0-23)
  quietHoursEnd?: number;   // hour (0-23)
  enabled: boolean;
}

export interface Notification {
  id: string;
  type: 'checkin' | 'reminder' | 'alert' | 'nurture';
  title: string;
  message: string;
  timestamp: Date;
  priority: 'low' | 'normal' | 'high';
  actions?: string[];
}

export interface NotificationStats {
  sent: number;
  sentToday: number;
  lastSent: Date | null;
  categories: Record<string, number>;
}

const DEFAULT_CONFIG: NotificationConfig = {
  enabled: true,
  maxPerDay: 5,
  minInterval: 30, // 30 minutes minimum between notifications
};

class NotificationManager {
  private config: NotificationConfig;
  private stats: NotificationStats;
  private queue: Notification[] = [];

  constructor(config: Partial<NotificationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = {
      sent: 0,
      sentToday: 0,
      lastSent: null,
      categories: {},
    };
  }

  /**
   * Check if quiet hours
   */
  isQuietHours(): boolean {
    if (
      this.config.quietHoursStart === undefined ||
      this.config.quietHoursEnd === undefined
    ) {
      return false;
    }

    const now = new Date();
    const hour = now.getHours();

    // Handle wrap-around (e.g., 22:00 - 08:00)
    if (this.config.quietHoursStart > this.config.quietHoursEnd) {
      return hour >= this.config.quietHoursStart || hour < this.config.quietHoursEnd;
    }

    return hour >= this.config.quietHoursStart && hour < this.config.quietHoursEnd;
  }

  /**
   * Check if can send notification (rate limiting)
   */
  canSend(): boolean {
    if (!this.config.enabled) return false;
    if (this.isQuietHours()) return false;
    if (this.stats.sentToday >= this.config.maxPerDay) return false;

    // Check min interval
    if (this.stats.lastSent) {
      const minutesSinceLast =
        (Date.now() - this.stats.lastSent.getTime()) / 60000;
      if (minutesSinceLast < this.config.minInterval) {
        return false;
      }
    }

    return true;
  }

  /**
   * Send notification
   */
  send(notification: Omit<Notification, 'id' | 'timestamp'>): Notification | null {
    if (!this.canSend()) {
      this.queue.push({
        ...notification,
        id: this.generateId(),
        timestamp: new Date(),
      });
      console.log('[Notification] Queued (rate limited or quiet hours)');
      return null;
    }

    const fullNotification: Notification = {
      ...notification,
      id: this.generateId(),
      timestamp: new Date(),
    };

    // Update stats
    this.stats.sent++;
    this.stats.sentToday++;
    this.stats.lastSent = fullNotification.timestamp;
    
    const category = notification.type;
    this.stats.categories[category] = (this.stats.categories[category] || 0) + 1;

    // Actually send
    this.deliver(fullNotification);

    return fullNotification;
  }

  /**
   * Queue notification for later
   */
  queueNotification(
    notification: Omit<Notification, 'id' | 'timestamp'>
  ): void {
    this.queue.push({
      ...notification,
      id: this.generateId(),
      timestamp: new Date(),
    });
  }

  /**
   * Process queued notifications
   */
  processQueue(): Notification[] {
    const sent: Notification[] = [];
    
    while (this.queue.length > 0 && this.canSend()) {
      const notification = this.queue.shift();
      if (notification) {
        const result = this.send({
          type: notification.type,
          title: notification.title,
          message: notification.message,
          priority: notification.priority,
          actions: notification.actions,
        });
        if (result) sent.push(result);
      }
    }

    return sent;
  }

  /**
   * Deliver notification (platform-specific)
   */
  private deliver(notification: Notification): void {
    // Log for now - could integrate with system notifications
    console.log(
      `[Notification] ${notification.type.toUpperCase()}: ${notification.title}`
    );
    console.log(`  ${notification.message}`);
    
    if (notification.actions) {
      console.log(`  Actions: ${notification.actions.join(', ')}`);
    }
  }

  /**
   * Send check-in notification
   */
  sendCheckIn(message: string): Notification | null {
    return this.send({
      type: 'checkin',
      title: 'Check-in',
      message,
      priority: 'low',
    });
  }

  /**
   * Send reminder notification
   */
  sendReminder(message: string, priority: 'low' | 'normal' | 'high' = 'normal'): Notification | null {
    return this.send({
      type: 'reminder',
      title: 'Reminder',
      message,
      priority,
    });
  }

  /**
   * Send nurture notification
   */
  sendNurture(message: string): Notification | null {
    return this.send({
      type: 'nurture',
      title: '👋 Hi there',
      message,
      priority: 'low',
      actions: ['respond', 'dismiss'],
    });
  }

  /**
   * Get stats
   */
  getStats(): NotificationStats {
    return { ...this.stats };
  }

  /**
   * Reset daily stats
   */
  resetDailyStats(): void {
    this.stats.sentToday = 0;
    this.stats.categories = {};
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<NotificationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get config
   */
  getConfig(): NotificationConfig {
    return { ...this.config };
  }

  private generateId(): string {
    return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

// Singleton instance
let manager: NotificationManager | null = null;

/**
 * Get notification manager
 */
export function getNotificationManager(
  config?: Partial<NotificationConfig>
): NotificationManager {
  if (!manager) {
    manager = new NotificationManager(config);
  }
  return manager;
}

/**
 * Reset notification manager
 */
export function resetNotificationManager(): void {
  manager = null;
}

export default getNotificationManager;
