/**
 * Agent Body - Main Interface
 * 
 * The "body" of the AI agent - sensors, actuators, and state.
 * Provides embodiment: feeling internal state and expressing outward.
 */

import { SensorRegistry, type SensorReading } from './sensors';
import { detectPlatform, type PlatformInfo } from './platform';

export interface BodyState {
  // Internal state
  temperature: number | null;   // CPU temp in °C
  load: number | null;         // CPU load average
  memory: {
    used: number;
    total: number;
    percent: number;
  } | null;
  disk: {
    size: string;
    used: string;
    available: string;
    percent: number;
  } | null;
  uptime: {
    seconds: number;
    formatted: string;
  } | null;
  
  // Network state
  network: Record<string, { address: string; family: string }> | null;
  
  // Metadata
  timestamp: number;
  platform: PlatformInfo;
}

export interface ExpressiveState {
  mood: 'idle' | 'thinking' | 'working' | 'stressed' | 'happy' | 'sleepy' | 'alert';
  message?: string;
  urgency: 'low' | 'normal' | 'high' | 'critical';
}

/**
 * Agent Body - The embodiment interface
 * 
 * Usage:
 *   const body = new AgentBody();
 *   await body.initialize();
 *   
 *   // Feel internal state
 *   const state = await body.feel();
 *   console.log(`I'm at ${state.temperature}°C`);
 *   
 *   // Express outward state
 *   await body.express({
 *     mood: 'happy',
 *     message: 'All systems nominal!',
 *     urgency: 'low'
 *   });
 */
export class AgentBody {
  private sensors: SensorRegistry;
  private platform: PlatformInfo | null = null;
  private initialized = false;

  constructor() {
    this.sensors = new SensorRegistry();
  }

  /**
   * Initialize the body - discover platform and sensors
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Detect platform
    this.platform = await detectPlatform();
    
    // Discover available sensors
    await this.sensors.discover();

    this.initialized = true;

    console.log('[AgentBody] Initialized on platform:', this.platform.type);
    console.log('[AgentBody] Model:', this.platform.model || 'Unknown');
    console.log('[AgentBody] Available sensors:', this.sensors.listAvailable());
    console.log('[AgentBody] Recommended avatar:', this.platform.recommended.avatar);
  }

  /**
   * Feel internal state - "What am I feeling?"
   */
  async feel(): Promise<BodyState> {
    if (!this.initialized) {
      await this.initialize();
    }

    const timestamp = Date.now();

    // Read all sensors in parallel
    const [temp, load, memory, disk, network, uptime] = await Promise.all([
      this.sensors.read('cpu_temp'),
      this.sensors.read('cpu_load'),
      this.sensors.read('memory_used'),
      this.sensors.read('disk_space'),
      this.sensors.read('network'),
      this.sensors.read('uptime'),
    ]);

    return {
      temperature: temp?.value as number | null,
      load: load?.value as number | null,
      memory: memory?.value as BodyState['memory'],
      disk: disk?.value as BodyState['disk'],
      uptime: uptime?.value as BodyState['uptime'],
      network: network?.value as BodyState['network'],
      timestamp,
      platform: this.platform!,
    };
  }

  /**
   * Read a specific sensor
   */
  async sense(name: string): Promise<SensorReading | null> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.sensors.read(name);
  }

  /**
   * Get platform info
   */
  getPlatform(): PlatformInfo | null {
    return this.platform;
  }

  /**
   * Check if specific capability is available
   */
  async hasCapability(capability: 'gpio' | 'camera' | 'microphone' | 'speaker' | 'display' | 'battery' | 'touchscreen' | 'pimoroni'): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }
    return this.platform?.capabilities[capability] ?? false;
  }

  /**
   * Get available sensors
   */
  getAvailableSensors(): string[] {
    return this.sensors.listAvailable();
  }

  /**
   * Get all sensors including unavailable
   */
  getAllSensors(): { name: string; category: string; available: boolean }[] {
    return this.sensors.listAll();
  }

  /**
   * Interpret state as emotional/mood state
   */
  async interpretState(): Promise<ExpressiveState> {
    const state = await this.feel();

    // Determine mood based on state
    let mood: ExpressiveState['mood'] = 'idle';
    let urgency: ExpressiveState['urgency'] = 'low';

    // Temperature affects mood
    if (state.temperature !== null) {
      if (state.temperature > 80) {
        mood = 'stressed';
        urgency = 'high';
      } else if (state.temperature > 70) {
        mood = 'working';
      }
    }

    // Load affects mood
    if (state.load !== null) {
      if (state.load > 4) {
        mood = 'stressed';
        urgency = 'normal';
      } else if (state.load > 2) {
        mood = 'working';
      }
    }

    // Memory affects mood
    if (state.memory?.percent && state.memory.percent > 90) {
      mood = 'stressed';
      urgency = 'high';
    }

    // Uptime affects mood
    if (state.uptime?.seconds && state.uptime.seconds > 86400) {
      // Been up for more than a day
      mood = 'alert';
    }

    // Generate message
    let message = '';
    if (mood === 'idle') {
      message = 'All systems nominal.';
    } else if (mood === 'working') {
      message = `Working hard (load: ${state.load?.toFixed(1)})`;
    } else if (mood === 'stressed') {
      const issues: string[] = [];
      if (state.temperature && state.temperature > 70) issues.push(`CPU: ${state.temperature}°C`);
      if (state.load && state.load > 3) issues.push(`Load: ${state.load.toFixed(1)}`);
      if (state.memory?.percent && state.memory.percent > 85) issues.push(`Memory: ${state.memory.percent}%`);
      message = `Feeling stressed: ${issues.join(', ')}`;
    }

    return { mood, message, urgency };
  }

  /**
   * Check if healthy
   */
  async isHealthy(): Promise<{ healthy: boolean; issues: string[] }> {
    const state = await this.feel();
    const issues: string[] = [];

    if (state.temperature !== null && state.temperature > 80) {
      issues.push(`CPU temperature high: ${state.temperature}°C`);
    }

    if (state.memory?.percent && state.memory.percent > 90) {
      issues.push(`Memory usage high: ${state.memory.percent}%`);
    }

    if (state.load !== null && state.load > 4) {
      issues.push(`System load high: ${state.load.toFixed(1)}`);
    }

    return {
      healthy: issues.length === 0,
      issues,
    };
  }
}

// Re-export types
export type { Sensor, SensorReading } from './sensors';
export type { PlatformInfo, PlatformCapabilities } from './platform';