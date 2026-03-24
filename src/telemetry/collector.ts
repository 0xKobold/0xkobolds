/**
 * TelemetryCollector - Centralized System Monitoring
 * 
 * Auto-polls system metrics (memory, CPU) at configurable intervals.
 * Integrates with existing telemetry SDK.
 * 
 * Usage:
 *   import { collector } from './telemetry/collector';
 *   collector.start({ autoStart: true });
 *   collector.stop();
 */

import { telemetry } from './index.js';
import { cpus, loadavg, totalmem, freemem } from 'os';

// ============================================================================
// Types
// ============================================================================

export interface CollectorConfig {
  /** Track memory usage (heap, RSS, system) */
  memory?: boolean;
  /** Track CPU load averages */
  cpu?: boolean;
  /** Polling interval in ms (default: 60_000) */
  intervalMs?: number;
  /** Enable at startup (default: false) */
  autoStart?: boolean;
}

export interface SystemMetrics {
  timestamp: number;
  memory: {
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
    systemTotalMb: number;
    systemFreeMb: number;
    systemUsedPercent: number;
  };
  cpu: {
    loadAvg1m: number;
    loadAvg5m: number;
    loadAvg15m: number;
    coreCount: number;
  };
}

// ============================================================================
// Collector
// ============================================================================

class TelemetryCollector {
  private config: CollectorConfig = {};
  private timers: number[] = [];
  private isRunning = false;
  private pollCount = 0;

  /**
   * Start collecting system metrics
   */
  start(config: CollectorConfig = {}): void {
    if (this.isRunning) {
      console.log('[TelemetryCollector] Already running, stopping first...');
      this.stop();
    }

    // Merge config with defaults
    this.config = {
      memory: config.memory ?? true,
      cpu: config.cpu ?? true,
      intervalMs: config.intervalMs ?? 60_000,
      autoStart: config.autoStart ?? false,
    };

    // Don't auto-start unless explicitly enabled
    if (!this.config.autoStart) {
      console.log('[TelemetryCollector] Ready. Call start({ autoStart: true }) or collector.start() to begin polling.');
      return;
    }

    this.isRunning = true;
    this.pollCount = 0;
    
    console.log(`[TelemetryCollector] Starting with config:`, this.config);
    
    // Immediate first poll
    this.poll();
    
    // Schedule periodic polling
    const timer = setInterval(() => this.poll(), this.config.intervalMs!);
    this.timers.push(timer as unknown as number);
  }

  /**
   * Stop collecting
   */
  stop(): void {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
    this.isRunning = false;
    console.log(`[TelemetryCollector] Stopped. Collected ${this.pollCount} samples.`);
  }

  /**
   * Get current config
   */
  getConfig(): CollectorConfig {
    return { ...this.config };
  }

  /**
   * Check if running
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get sample count
   */
  getSampleCount(): number {
    return this.pollCount;
  }

  /**
   * Poll once (for manual sampling)
   */
  poll(): SystemMetrics | null {
    this.pollCount++;
    const metrics = this.collect();
    
    // Send to telemetry
    if (metrics) {
      this.sendToTelemetry(metrics);
    }
    
    return metrics;
  }

  /**
   * Collect all metrics
   */
  private collect(): SystemMetrics | null {
    const timestamp = Date.now();
    
    // Memory metrics
    let memory: SystemMetrics['memory'] | null = null;
    if (this.config.memory) {
      const processMem = process.memoryUsage();
      memory = {
        heapUsedMb: Math.round(processMem.heapUsed / 1024 / 1024 * 100) / 100,
        heapTotalMb: Math.round(processMem.heapTotal / 1024 / 1024 * 100) / 100,
        rssMb: Math.round(processMem.rss / 1024 / 1024 * 100) / 100,
        systemTotalMb: Math.round(totalmem() / 1024 / 1024),
        systemFreeMb: Math.round(freemem() / 1024 / 1024),
        systemUsedPercent: Math.round((1 - freemem() / totalmem()) * 10000) / 100,
      };
    }

    // CPU metrics
    let cpu: SystemMetrics['cpu'] | null = null;
    if (this.config.cpu) {
      const avg = loadavg();
      cpu = {
        loadAvg1m: Math.round((avg[0] || 0) * 100) / 100,
        loadAvg5m: Math.round((avg[1] || 0) * 100) / 100,
        loadAvg15m: Math.round((avg[2] || 0) * 100) / 100,
        coreCount: (cpus() as unknown as any[]).length,
      };
    }

    if (!memory && !cpu) {
      return null;
    }

    return { timestamp, memory: memory!, cpu: cpu! };
  }

  /**
   * Send metrics to telemetry
   */
  private sendToTelemetry(metrics: SystemMetrics): void {
    // Memory telemetry
    if (metrics.memory) {
      telemetry().system.memory({
        heap_used_mb: metrics.memory.heapUsedMb,
        heap_total_mb: metrics.memory.heapTotalMb,
      });
      
      // Also log to event for historical tracking
      telemetry().event('system', 'memory.snapshot', {
        properties: {
          rss_mb: metrics.memory.rssMb,
          system_used_percent: metrics.memory.systemUsedPercent,
          heap_usage_percent: Math.round((metrics.memory.heapUsedMb / metrics.memory.heapTotalMb) * 100),
        },
      });
    }

    // CPU telemetry
    if (metrics.cpu) {
      // Record as metric (raw load average - more useful than fake percentage)
      telemetry().system.cpu({
        usage_percent: metrics.cpu.loadAvg1m, // Raw load, not %
      });
      
      // Also log to event for historical tracking
      telemetry().event('system', 'cpu.snapshot', {
        properties: {
          load_1m: metrics.cpu.loadAvg1m,
          load_5m: metrics.cpu.loadAvg5m,
          cores: metrics.cpu.coreCount,
        },
      });
    }

    // Summary event for dashboard
    telemetry().event('system', 'health', {
      properties: {
        memory_heap_mb: metrics.memory?.heapUsedMb,
        memory_rss_mb: metrics.memory?.rssMb,
        cpu_load_1m: metrics.cpu?.loadAvg1m,
        sample_count: this.pollCount,
      },
    });
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

const _collector = new TelemetryCollector();
export { _collector as collector };
export { TelemetryCollector };

// ============================================================================
// CLI Helper
// ============================================================================

export function showCollectorStatus(): void {
  const c = _collector.getConfig();
  console.log('\n📊 TelemetryCollector Status');
  console.log('─'.repeat(40));
  console.log(`Running: ${_collector.isActive() ? '✅ Yes' : '❌ No'}`);
  console.log(`Samples collected: ${_collector.getSampleCount()}`);
  console.log(`Memory tracking: ${c.memory ? '✅ On' : '❌ Off'}`);
  console.log(`CPU tracking: ${c.cpu ? '✅ On' : '❌ Off'}`);
  console.log(`Interval: ${c.intervalMs ? `${c.intervalMs / 1000}s` : 'N/A'}`);
  
  if (_collector.isActive()) {
    console.log('\n💡 To stop: collector.stop()');
  } else {
    console.log('\n💡 To start: collector.start({ autoStart: true })');
  }
}
