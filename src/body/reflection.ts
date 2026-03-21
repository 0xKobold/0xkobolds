/**
 * Agent Body - Reflection & Proactivity
 * 
 * Scheduled jobs for self-reflection and proactive messaging.
 * The agent "thinks" and "reaches out" autonomously.
 * 
 * Integrates patterns from proactive-agent skill:
 * - WAL Protocol: Write-ahead logging for critical details before responding
 * - Working Buffer: Captures exchanges in the danger zone (memory flush)
 * - Compaction Recovery: Recovery procedures after context loss
 */

import type { AgentBody } from './index';
import type { EnvironmentScanner } from './environment';
import type { ActuatorRegistry, ActuatorMessage } from './actuators';

/**
 * Write-Ahead Log Entry
 * Critical information logged before responding
 */
interface WALEntry {
  id: string;
  type: 'correction' | 'decision' | 'detail' | 'insight';
  content: string;
  context?: string;
  timestamp: number;
  recovered?: boolean;
}

/**
 * Working Buffer Entry
 * Captures exchanges during context transitions
 */
interface WorkingBufferEntry {
  id: string;
  exchange: string;
  result: string;
  context: string;
  timestamp: number;
  retained: boolean;
}

export interface ReflectionConfig {
  /** Time for daily reflection (24h format) */
  reflectionTime: string;
  
  /** Generate morning briefing? */
  morningBriefing: boolean;
  
  /** Time for morning briefing */
  morningBriefingTime: string;
  
  /** Temperature threshold for alerts (°C) */
  temperatureAlertThreshold: number;
  
  /** Load threshold for alerts */
  loadAlertThreshold: number;
  
  /** Check interval for health checks (ms) */
  healthCheckInterval: number;
  
  /** Enable WAL protocol */
  enableWAL: boolean;
  
  /** Enable working buffer */
  enableWorkingBuffer: boolean;
}

const DEFAULT_CONFIG: ReflectionConfig = {
  reflectionTime: '06:00',
  morningBriefing: true,
  morningBriefingTime: '07:00',
  temperatureAlertThreshold: 75,
  loadAlertThreshold: 5,
  healthCheckInterval: 60000, // 1 minute
  enableWAL: true,
  enableWorkingBuffer: true,
};

export interface ReflectionResult {
  summary: string;
  insights: string[];
  recommendations: string[];
  mood: string;
  timestamp: number;
}

/**
 * Reflection Job
 * 
 * Scheduled tasks for self-reflection and proactivity.
 */
export class ReflectionJob {
  private body: AgentBody;
  private environment: EnvironmentScanner;
  private actuators: ActuatorRegistry;
  private config: ReflectionConfig;
  private healthCheckTimer: Timer | null = null;
  private lastReflection: ReflectionResult | null = null;

  // Callbacks for delivery system integration
  private onProactiveMessage?: (message: ActuatorMessage) => Promise<void>;

  constructor(
    body: AgentBody,
    environment: EnvironmentScanner,
    actuators: ActuatorRegistry,
    config: Partial<ReflectionConfig> = {}
  ) {
    this.body = body;
    this.environment = environment;
    this.actuators = actuators;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set callback for proactive messaging (connects to delivery system)
   */
  setProactiveCallback(callback: (message: ActuatorMessage) => Promise<void>): void {
    this.onProactiveMessage = callback;
  }

  /**
   * Start scheduled jobs
   */
  start(): void {
    // Health check loop
    this.healthCheckTimer = setInterval(
      () => this.checkHealth(),
      this.config.healthCheckInterval
    );

    console.log('[ReflectionJob] Started with config:', {
      reflectionTime: this.config.reflectionTime,
      morningBriefingTime: this.config.morningBriefingTime,
      healthCheckInterval: this.config.healthCheckInterval,
    });
  }

  /**
   * Stop scheduled jobs
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Perform health check and alert if needed
   */
  async checkHealth(): Promise<{ healthy: boolean; issues: string[] }> {
    const { healthy, issues } = await this.body.isHealthy();

    // Check for concerning states
    const state = await this.body.feel();
    const alerts: string[] = [];

    if (state.temperature !== null && state.temperature > this.config.temperatureAlertThreshold) {
      alerts.push(`🌡️ I'm running hot: ${state.temperature}°C`);
    }

    if (state.load !== null && state.load > this.config.loadAlertThreshold) {
      alerts.push(`📊 High system load: ${state.load.toFixed(1)}`);
    }

    if (state.memory?.percent && state.memory.percent > 90) {
      alerts.push(`💾 Memory pressure: ${state.memory.percent}%`);
    }

    // Send alert if there are issues
    if (alerts.length > 0 && this.onProactiveMessage) {
      const message: ActuatorMessage = {
        content: alerts.join('\n'),
        mood: 'stressed',
        urgency: 'high',
      };
      await this.onProactiveMessage(message);
    }

    return { healthy: healthy && alerts.length === 0, issues: [...issues, ...alerts] };
  }

  /**
   * Generate daily reflection
   */
  async reflect(): Promise<ReflectionResult> {
    const timestamp = Date.now();

    // Gather state
    const state = await this.body.feel();
    const env = await this.environment.scan();
    const health = await this.checkHealth();

    // Generate summary
    const parts: string[] = [];
    const insights: string[] = [];
    const recommendations: string[] = [];

    // System health
    if (health.healthy) {
      parts.push('Systems healthy');
    } else {
      parts.push(`Issues: ${health.issues.join(', ')}`);
      insights.push('Need to investigate health issues');
    }

    // Activity summary
    if (env.network.tailscale.length > 0) {
      parts.push(`${env.network.tailscale.length} peers connected`);
      insights.push(`Connected to ${env.network.tailscale.filter(p => p.online).length} active peers`);
    }

    // Services
    const runningServices = env.services.filter(s => s.running);
    parts.push(`${runningServices.length} services running`);

    // Time context
    const { timeOfDay, isWorkday } = env.temporal;
    parts.push(`${timeOfDay}, ${isWorkday ? 'workday' : 'weekend'}`);

    // Recommendations
    if (state.temperature !== null && state.temperature > 60) {
      recommendations.push('Consider checking cooling/fan');
    }
    if (state.memory?.percent && state.memory.percent > 80) {
      recommendations.push('Memory usage could be optimized');
    }

    this.lastReflection = {
      summary: parts.join('. '),
      insights,
      recommendations,
      mood: health.healthy ? 'content' : 'concerned',
      timestamp,
    };

    return this.lastReflection;
  }

  /**
   * Generate morning briefing
   */
  async generateMorningBriefing(): Promise<ActuatorMessage> {
    const state = await this.body.feel();
    const env = await this.environment.scan();
    const health = await this.checkHealth();

    const parts: string[] = [];

    // Greeting based on time
    const hour = new Date().getHours();
    let greeting: string;
    if (hour < 12) {
      greeting = '☀️ Good morning!';
    } else if (hour < 18) {
      greeting = '🌤️ Good afternoon!';
    } else {
      greeting = '🌙 Good evening!';
    }
    parts.push(greeting);

    // System status
    if (health.healthy) {
      parts.push('All systems operational.');
    } else {
      parts.push(`⚠️ Issues detected: ${health.issues.join(', ')}`);
    }

    // Peers online
    const onlinePeers = env.network.tailscale.filter(p => p.online);
    if (onlinePeers.length > 0) {
      parts.push(`${onlinePeers.length} peers online: ${onlinePeers.map(p => p.name).join(', ')}.`);
    }

    // Services
    const runningServices = env.services.filter(s => s.running);
    if (runningServices.length > 0) {
      parts.push(`Running: ${runningServices.map(s => s.name).join(', ')}.`);
    }

    // Temperature
    if (state.temperature !== null) {
      const tempEmoji = state.temperature > 70 ? '🌡️' : '❄️';
      parts.push(`${tempEmoji} CPU temp: ${state.temperature}°C.`);
    }

    return {
      content: parts.join(' '),
      mood: health.healthy ? 'happy' : 'alert',
      urgency: health.healthy ? 'low' : 'normal',
    };
  }

  /**
   * Check if should reach out proactively
   */
  async shouldReachOut(): Promise<{ should: boolean; reason: string }> {
    const env = await this.environment.scan();

    // Don't disturb during quiet hours
    if (env.temporal.isQuietHours) {
      return { should: false, reason: 'Quiet hours' };
    }

    // Check if there's something important to say
    const state = await this.body.feel();
    const health = await this.checkHealth();

    // Alert if unhealthy
    if (!health.healthy) {
      return { should: true, reason: 'Health issues detected' };
    }

    // Check if user is around
    const around = await this.environment.whoIsAround();
    if (around.userDetected && around.peers.length > 0) {
      // Could send greeting, but don't want to spam
      return { should: false, reason: 'User already present' };
    }

    return { should: false, reason: 'No reason to reach out' };
  }

  /**
   * Get last reflection
   */
  getLastReflection(): ReflectionResult | null {
    return this.lastReflection;
  }

  // ==================== WAL Protocol ====================

  private wal: WALEntry[] = [];
  private workingBuffer: WorkingBufferEntry[] = [];

  /**
   * Write-Ahead Log: Record critical information before responding
   * Pattern from proactive-agent skill
   */
  writeWAL(entry: Omit<WALEntry, 'id' | 'timestamp' | 'recovered'>): WALEntry {
    const logEntry: WALEntry = {
      ...entry,
      id: `wal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      recovered: false,
    };
    
    if (this.config.enableWAL) {
      this.wal.push(logEntry);
      // Keep only last 100 entries
      if (this.wal.length > 100) {
        this.wal = this.wal.slice(-100);
      }
    }
    
    console.log(`[WAL] ${entry.type}: ${entry.content.slice(0, 50)}...`);
    return logEntry;
  }

  /**
   * Read WALEntries by type
   */
  readWAL(type?: WALEntry['type']): WALEntry[] {
    return type ? this.wal.filter(e => e.type === type) : [...this.wal];
  }

  /**
   * Mark WALEntry as recovered (used after compaction)
   */
  markRecovered(id: string): void {
    const entry = this.wal.find(e => e.id === id);
    if (entry) {
      entry.recovered = true;
    }
  }

  /**
   * Get unrecovered WAL entries (use before responding)
   */
  getPendingWAL(): WALEntry[] {
    return this.wal.filter(e => !e.recovered);
  }

  // ==================== Working Buffer ====================

  /**
   * Working Buffer: Capture exchanges during context transitions
   * Pattern from proactive-agent skill
   */
  addToBuffer(entry: Omit<WorkingBufferEntry, 'id' | 'timestamp' | 'retained'>): WorkingBufferEntry {
    const bufferEntry: WorkingBufferEntry = {
      ...entry,
      id: `buf-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      retained: false,
    };
    
    if (this.config.enableWorkingBuffer) {
      this.workingBuffer.push(bufferEntry);
      // Keep only last 50 entries
      if (this.workingBuffer.length > 50) {
        this.workingBuffer = this.workingBuffer.slice(-50);
      }
    }
    
    return bufferEntry;
  }

  /**
   * Get buffered entries
   */
  getBuffer(): WorkingBufferEntry[] {
    return [...this.workingBuffer];
  }

  /**
   * Mark buffer entry as retained
   */
  retain(id: string): void {
    const entry = this.workingBuffer.find(e => e.id === id);
    if (entry) {
      entry.retained = true;
    }
  }

  // ==================== Compaction Recovery ====================

  /**
   * Recovery procedure after context loss
   * Pattern from proactive-agent skill
   */
  async recoverFromCompaction(): Promise<{
    walRecovered: number;
    bufferRetained: number;
    summary: string;
  }> {
    // 1. Process pending WAL entries
    const pending = this.getPendingWAL();
    let walRecovered = 0;
    
    for (const entry of pending) {
      // Each entry is a critical piece of information to recover
      console.log(`[Recovery] WAL: ${entry.type} - ${entry.content}`);
      this.markRecovered(entry.id);
      walRecovered++;
    }

    // 2. Retain working buffer entries
    const buffer = this.getBuffer();
    let bufferRetained = 0;
    
    for (const entry of buffer) {
      if (!entry.retained) {
        // Retain critical context
        console.log(`[Recovery] Buffer: ${entry.context}`);
        this.retain(entry.id);
        bufferRetained++;
      }
    }

    // 3. Generate recovery summary
    const summary = `Recovered ${walRecovered} WAL entries, retained ${bufferRetained} buffer entries. ${pending.length > 0 ? 'Critical information preserved.' : 'No pending items.'}`;

    // 4. Send proactive message about recovery
    if (pending.length > 0 || buffer.length > 0 && this.onProactiveMessage) {
      await this.onProactiveMessage({
        content: summary,
        mood: 'alert',
        urgency: 'normal',
      });
    }

    return { walRecovered, bufferRetained, summary };
  }
}

/**
 * Schedule helper using existing cron scheduler
 */
export function scheduleReflection(
  config: ReflectionConfig,
  callback: () => Promise<void>
): { start: () => void; stop: () => void } {
  let interval: Timer | null = null;

  const checkTime = async () => {
    const now = new Date();
    const [hour, minute] = config.reflectionTime.split(':').map(Number);
    
    if (now.getHours() === hour && now.getMinutes() === minute) {
      await callback();
    }
  };

  return {
    start: () => {
      // Check every minute
      interval = setInterval(checkTime, 60000);
    },
    stop: () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },
  };
}