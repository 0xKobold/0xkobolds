/**
 * Agent Body - Initialization
 * 
 * Wires everything together and integrates with existing systems.
 */

import { AgentBody, type BodyState, type ExpressiveState } from './index';
import { SensorRegistry } from './sensors';
import { EnvironmentScanner, type Environment } from './environment';
import { ActuatorRegistry, type ActuatorMessage } from './actuators';
import { ReflectionJob, type ReflectionConfig, type ReflectionResult } from './reflection';
import { getPlatform, type PlatformInfo } from './platform';

export interface AgentBodyConfig {
  /** Enable daily reflection */
  enableReflection?: boolean;
  
  /** Enable proactive messaging */
  enableProactive?: boolean;
  
  /** Reflection time (24h format) */
  reflectionTime?: string;
  
  /** Health check interval (ms) */
  healthCheckInterval?: number;
  
  /** Temperature alert threshold (°C) */
  temperatureAlertThreshold?: number;
  
  /** Load alert threshold */
  loadAlertThreshold?: number;
}

export interface AgentBodyState {
  /** Current body state */
  body: BodyState | null;
  
  /** Current environment */
  environment: Environment | null;
  
  /** Platform info */
  platform: PlatformInfo | null;
  
  /** Available sensors */
  sensors: string[];
  
  /** Available actuators */
  actuators: string[];
  
  /** Last reflection */
  lastReflection: ReflectionResult | null;
  
  /** Health status */
  healthy: boolean;
  
  /** Health issues */
  issues: string[];
  
  /** Initialization status */
  initialized: boolean;
}

/**
 * Agent Body System
 * 
 * Main entry point for body capabilities.
 * Integrates with existing gateway and delivery systems.
 */
export class AgentBodySystem {
  private body: AgentBody;
  private environment: EnvironmentScanner;
  private actuators: ActuatorRegistry;
  private reflection: ReflectionJob | null = null;
  private config: AgentBodyConfig;
  private initialized = false;

  // State
  private lastBodyState: BodyState | null = null;
  private lastEnvironment: Environment | null = null;

  // Callback for proactive messages (set by gateway)
  private onProactiveMessage?: (message: ActuatorMessage) => Promise<void>;

  constructor(config: AgentBodyConfig = {}) {
    this.config = {
      enableReflection: true,
      enableProactive: true,
      reflectionTime: '06:00',
      healthCheckInterval: 60000,
      temperatureAlertThreshold: 75,
      loadAlertThreshold: 5,
      ...config,
    };

    this.body = new AgentBody();
    this.environment = new EnvironmentScanner();
    this.actuators = new ActuatorRegistry();
  }

  /**
   * Initialize the body system
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log('[AgentBody] Initializing...');

    // Initialize body (discovers platform and sensors)
    await this.body.initialize();

    // Initialize environment scanner
    const platform = this.body.getPlatform();
    if (platform) {
      this.environment.setPlatform(platform);
    }

    // Initialize actuators
    await this.initializeActuators();

    // Initialize reflection job
    if (this.config.enableReflection) {
      this.reflection = new ReflectionJob(
        this.body,
        this.environment,
        this.actuators,
        {
          reflectionTime: this.config.reflectionTime || '06:00',
          morningBriefing: true,
          morningBriefingTime: '07:00',
          healthCheckInterval: this.config.healthCheckInterval || 60000,
          temperatureAlertThreshold: this.config.temperatureAlertThreshold || 75,
          loadAlertThreshold: this.config.loadAlertThreshold || 5,
        }
      );

      if (this.onProactiveMessage) {
        this.reflection.setProactiveCallback(this.onProactiveMessage);
      }
    }

    this.initialized = true;

    console.log('[AgentBody] Initialized successfully');
    console.log('[AgentBody] Platform:', this.body.getPlatform()?.type);
    console.log('[AgentBody] Sensors:', this.body.getAvailableSensors());
    console.log('[AgentBody] Actuators:', this.actuators.getAll().filter(a => a.available).map(a => a.name));
  }

  /**
   * Initialize actuators based on available capabilities
   */
  private async initializeActuators(): Promise<void> {
    const platform = this.body.getPlatform();

    // Web chat is always available (broadcasts via gateway)
    // Will be connected later when gateway is available

    // Voice is platform-dependent
    if (platform?.capabilities.speaker) {
      // Voice actuator would go here
      // const voice = new VoiceActuator();
      // await voice.initialize();
      // this.actuators.register(voice);
    }

    // LED is GPIO-dependent
    if (platform?.capabilities.gpio) {
      // LED actuator would go here
      // const led = new LEDActuator();
      // await led.initialize();
      // this.actuators.register(led);
    }
  }

  /**
   * Set proactive message callback (connects to delivery system)
   */
  setProactiveCallback(callback: (message: ActuatorMessage) => Promise<void>): void {
    this.onProactiveMessage = callback;
    if (this.reflection) {
      this.reflection.setProactiveCallback(callback);
    }
  }

  /**
   * Set gateway for web chat actuator
   */
  setGateway(gateway: any): void {
    // The gateway will be used to broadcast body-state messages
    // and receive proactive messages
    console.log('[AgentBody] Gateway connected');
  }

  /**
   * Set delivery system for Discord actuator
   */
  setDeliverySystem(delivery: any): void {
    // The delivery system will be used for proactive Discord messages
    console.log('[AgentBody] Delivery system connected');
  }

  /**
   * Start background jobs
   */
  start(): void {
    if (!this.initialized) {
      console.warn('[AgentBody] Cannot start - not initialized');
      return;
    }

    if (this.reflection) {
      this.reflection.start();
    }

    console.log('[AgentBody] Background jobs started');
  }

  /**
   * Stop background jobs
   */
  stop(): void {
    if (this.reflection) {
      this.reflection.stop();
    }

    console.log('[AgentBody] Background jobs stopped');
  }

  /**
   * Feel - get current body state
   */
  async feel(): Promise<BodyState> {
    this.lastBodyState = await this.body.feel();
    return this.lastBodyState;
  }

  /**
   * Scan environment
   */
  async scanEnvironment(): Promise<Environment> {
    this.lastEnvironment = await this.environment.scan();
    return this.lastEnvironment;
  }

  /**
   * Get overall state
   */
  async getState(): Promise<AgentBodyState> {
    const [body, environment, health] = await Promise.all([
      this.body.feel(),
      this.environment.scan(),
      this.body.isHealthy(),
    ]);

    return {
      body,
      environment,
      platform: this.body.getPlatform(),
      sensors: this.body.getAvailableSensors(),
      actuators: this.actuators.getAll().filter(a => a.available).map(a => a.name),
      lastReflection: this.reflection?.getLastReflection() || null,
      healthy: health.healthy,
      issues: health.issues,
      initialized: this.initialized,
    };
  }

  /**
   * Interpret current state as mood
   */
  async interpretState(): Promise<ExpressiveState> {
    return this.body.interpretState();
  }

  /**
   * Check health
   */
  async checkHealth(): Promise<{ healthy: boolean; issues: string[] }> {
    return this.body.isHealthy();
  }

  /**
   * Send proactive message
   */
  async sendProactiveMessage(message: ActuatorMessage): Promise<void> {
    if (!this.onProactiveMessage) {
      console.warn('[AgentBody] No proactive callback set');
      return;
    }

    await this.onProactiveMessage(message);
  }

  /**
   * Get available sensors
   */
  getAvailableSensors(): string[] {
    return this.body.getAvailableSensors();
  }

  /**
   * Get available actuators
   */
  getAvailableActuators(): string[] {
    return this.actuators.getAll().filter(a => a.available).map(a => a.name);
  }

  /**
   * Get platform info
   */
  getPlatform(): PlatformInfo | null {
    return this.body.getPlatform();
  }
}

// Singleton instance
let agentBodyInstance: AgentBodySystem | null = null;

/**
 * Get or create singleton instance
 */
export function getAgentBody(config?: AgentBodyConfig): AgentBodySystem {
  if (!agentBodyInstance) {
    agentBodyInstance = new AgentBodySystem(config);
  }
  return agentBodyInstance;
}

/**
 * Reset singleton (for testing)
 */
export function resetAgentBody(): void {
  if (agentBodyInstance) {
    agentBodyInstance.stop();
    agentBodyInstance = null;
  }
}