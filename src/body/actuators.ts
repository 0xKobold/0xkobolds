/**
 * Agent Body - Actuators
 * 
 * "What can I do?" - Outputs and expressions.
 * Discord, web chat, voice, LEDs, etc.
 */

import { promisify } from 'node:util';
import { exec } from 'node:child_process';

const execAsync = promisify(exec);

export interface ActuatorMessage {
  content: string;
  mood?: 'idle' | 'thinking' | 'working' | 'stressed' | 'happy' | 'sleepy' | 'alert';
  urgency?: 'low' | 'normal' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
}

export interface Actuator {
  name: string;
  type: 'visual' | 'audio' | 'network' | 'physical';
  available: boolean;
  send(message: ActuatorMessage): Promise<void>;
}

/**
 * Discord Actuator
 * Uses existing delivery system
 */
export class DiscordActuator implements Actuator {
  name = 'discord';
  type = 'network' as const;
  available = false;
  private deliverySystem: any = null;

  async initialize(deliverySystem: any): Promise<void> {
    this.deliverySystem = deliverySystem;
    this.available = !!deliverySystem;
  }

  async send(message: ActuatorMessage): Promise<void> {
    if (!this.available || !this.deliverySystem) {
      throw new Error('Discord actuator not available');
    }

    await this.deliverySystem.queueDelivery(message.content, undefined, {
      priority: message.urgency || 'normal',
    });
  }
}

/**
 * Web Chat Actuator
 * Broadcasts to Mission Control via gateway
 */
export class WebChatActuator implements Actuator {
  name = 'web_chat';
  type = 'network' as const;
  available = false;
  private gateway: any = null;

  async initialize(gateway: any): Promise<void> {
    this.gateway = gateway;
    this.available = !!gateway;
  }

  async send(message: ActuatorMessage): Promise<void> {
    if (!this.available || !this.gateway) {
      throw new Error('Web chat actuator not available');
    }

    this.gateway.broadcast({
      type: 'body-message',
      data: {
        content: message.content,
        mood: message.mood,
        urgency: message.urgency,
        timestamp: Date.now(),
      },
    });
  }
}

/**
 * Voice Actuator (TTS)
 * Uses system TTS if available
 */
export class VoiceActuator implements Actuator {
  name = 'voice';
  type = 'audio' as const;
  available = false;

  async initialize(): Promise<void> {
    // Check for TTS capability
    try {
      if (process.platform === 'darwin') {
        await execAsync('which say');
        this.available = true;
      } else if (process.platform === 'linux') {
        await execAsync('which espeak || which festival');
        this.available = true;
      }
    } catch {
      this.available = false;
    }
  }

  async send(message: ActuatorMessage): Promise<void> {
    if (!this.available) {
      throw new Error('Voice actuator not available');
    }

    const text = message.content.slice(0, 200); // Limit length
    const escapedText = text.replace(/"/g, '\\"');

    try {
      if (process.platform === 'darwin') {
        await execAsync(`say "${escapedText}"`);
      } else if (process.platform === 'linux') {
        await execAsync(`espeak "${escapedText}" 2>/dev/null || echo "${escapedText}" | festival --tts`);
      }
    } catch (error) {
      console.error('[VoiceActuator] TTS failed:', error);
    }
  }
}

/**
 * LED Actuator (for Pi with LEDs)
 * Controls WS2812 or similar
 */
export class LEDActuator implements Actuator {
  name = 'led';
  type = 'physical' as const;
  available = false;
  private ledPath: string | null = null;

  async initialize(): Promise<void> {
    // Check for LED support
    try {
      // Check for sysfs LED
      const { stdout } = await execAsync('ls /sys/class/leds/ 2>/dev/null');
      if (stdout.trim()) {
        this.ledPath = `/sys/class/leds/${stdout.trim().split('\n')[0]}`;
        this.available = true;
      }
    } catch {
      // No LED support
    }
  }

  async send(message: ActuatorMessage): Promise<void> {
    if (!this.available || !this.ledPath) {
      throw new Error('LED actuator not available');
    }

    // Map mood to LED color/pattern
    const brightness: Record<string, number> = {
      'idle': 0,
      'thinking': 50,
      'working': 100,
      'stressed': 255,
      'happy': 150,
      'sleepy': 30,
      'alert': 200,
    };

    const brightness_value = brightness[message.mood || 'idle'] ?? 0;

    try {
      await execAsync(`echo ${brightness_value} > ${this.ledPath}/brightness`);
    } catch (error) {
      console.error('[LEDActuator] LED control failed:', error);
    }
  }
}

/**
 * Actuator Registry
 * Manages all available actuators
 */
export class ActuatorRegistry {
  private actuators: Map<string, Actuator> = new Map();

  /**
   * Register an actuator
   */
  register(actuator: Actuator): void {
    this.actuators.set(actuator.name, actuator);
  }

  /**
   * Check if actuator is available
   */
  isAvailable(name: string): boolean {
    const actuator = this.actuators.get(name);
    return actuator?.available ?? false;
  }

  /**
   * Get all actuators
   */
  getAll(): { name: string; type: string; available: boolean }[] {
    return Array.from(this.actuators.entries()).map(([name, actuator]) => ({
      name,
      type: actuator.type,
      available: actuator.available,
    }));
  }

  /**
   * Send message through specific actuator
   */
  async send(name: string, message: ActuatorMessage): Promise<void> {
    const actuator = this.actuators.get(name);
    if (!actuator) {
      throw new Error(`Actuator '${name}' not found`);
    }
    if (!actuator.available) {
      throw new Error(`Actuator '${name}' not available`);
    }
    
    try {
      return actuator.send(message);
    } catch (error) {
      // Log but don't crash - delivery might not be ready
      console.warn(`[ActuatorRegistry] ${name} send failed:`, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Send message through all available actuators
   */
  async broadcast(message: ActuatorMessage): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.actuators.values())
        .filter(a => a.available)
        .map(a => a.send(message))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        console.error('[ActuatorRegistry] Send failed:', result.reason);
      }
    }
  }

  /**
   * Send message through best available actuator based on urgency
   */
  async smartSend(message: ActuatorMessage): Promise<void> {
    const urgency = message.urgency || 'normal';

    // Critical: Use everything available
    if (urgency === 'critical') {
      return this.broadcast(message);
    }

    // High: Discord + web chat
    if (urgency === 'high') {
      const actuators = ['discord', 'web_chat'].filter(n => this.isAvailable(n));
      await Promise.all(actuators.map(n => this.send(n, message)));
      return;
    }

    // Normal/Low: Just web chat (don't spam Discord)
    if (this.isAvailable('web_chat')) {
      return this.send('web_chat', message);
    }

    // Fallback: Discord
    if (this.isAvailable('discord')) {
      return this.send('discord', message);
    }
  }
}