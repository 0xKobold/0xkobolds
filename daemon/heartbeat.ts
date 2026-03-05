/**
 * Heartbeat System
 *
 * Minimal implementation to support scheduling lightweight tasks and
 * tracking basic process heartbeat/uptime for monitoring.
 */

export type HeartbeatTask = {
  id: string;
  label: string;
  intervalSeconds: number;
  callback: () => void;
};

export class HeartbeatSystem {
  private readonly startTime: number;
  private beatCount: number;
  private readonly tasks: Map<string, HeartbeatTask>;
  private timer: ReturnType<typeof setInterval> | null;

  constructor() {
    this.startTime = Date.now();
    this.beatCount = 0;
    this.tasks = new Map();
    this.timer = null;
  }

  getState() {
    return {
      beatCount: this.beatCount,
      tasks: this.tasks,
    };
  }

  getUptime(): number {
    return (Date.now() - this.startTime) / 1000;
  }

  schedule(label: string, intervalSeconds: number, callback: () => void): string {
    const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.tasks.set(id, { id, label, intervalSeconds, callback });
    return id;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.beatCount += 1;
      for (const task of this.tasks.values()) {
        try {
          task.callback();
        } catch {
          // Swallow task errors; this is a lightweight monitor
        }
      }
    }, 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

