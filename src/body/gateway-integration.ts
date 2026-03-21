/**
 * Agent Body - Gateway Integration
 * 
 * Wires the Agent Body into the existing gateway system.
 * Broadcasts body state and enables proactive messaging.
 * 
 * Phase 2 of the Agent Body implementation.
 */

import { getAgentBody, type AgentBodySystem, type AgentBodyState } from './init';
import type { RealGatewayServer } from '../gateway/gateway-server';
import type { DeliverySystem } from '../gateway/delivery';

let bodySystem: AgentBodySystem | null = null;
let stateBroadcastInterval: Timer | null = null;

export interface BodyGatewayConfig {
  /** Broadcast body state interval (ms) */
  stateBroadcastInterval?: number;
  
  /** Enable proactive morning briefing */
  enableMorningBriefing?: boolean;
  
  /** Enable health alerts */
  enableHealthAlerts?: boolean;
  
  /** Temperature threshold for alerts (°C) */
  temperatureAlertThreshold?: number;
  
  /** Load threshold for alerts */
  loadAlertThreshold?: number;
}

const DEFAULT_CONFIG: BodyGatewayConfig = {
  stateBroadcastInterval: 30000, // 30 seconds
  enableMorningBriefing: true,
  enableHealthAlerts: true,
  temperatureAlertThreshold: 75,
  loadAlertThreshold: 5,
};

/**
 * Initialize Agent Body and connect to Gateway
 * 
 * Call this during gateway startup:
 * ```typescript
 * // In gateway-server.ts or startup
 * import { initializeBodyGateway } from './body/gateway-integration';
 * 
 * await initializeBodyGateway(gateway, delivery, config);
 * ```
 */
export async function initializeBodyGateway(
  gateway: RealGatewayServer,
  delivery: DeliverySystem,
  config: BodyGatewayConfig = {}
): Promise<AgentBodySystem> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  console.log('[BodyGateway] Initializing...');
  
  // Get body system
  bodySystem = getAgentBody({
    enableReflection: true,
    enableProactive: true,
    reflectionTime: '06:00',
    healthCheckInterval: cfg.stateBroadcastInterval,
    temperatureAlertThreshold: cfg.temperatureAlertThreshold,
    loadAlertThreshold: cfg.loadAlertThreshold,
  });

  // Initialize
  await bodySystem.initialize();

  // Connect delivery system for proactive messages
  bodySystem.setProactiveCallback(async (message) => {
    console.log('[BodyGateway] Proactive message:', message.content.slice(0, 50));
    await delivery.queueDelivery(message.content, undefined, {
      priority: (message.urgency || 'normal') as 'low' | 'normal' | 'high',
      sourceSessionId: 'agent-body',
      sourceSessionKey: 'body',
    });
  });

  // Start background jobs
  bodySystem.start();

  // Start state broadcasting
  stateBroadcastInterval = setInterval(async () => {
    try {
      const state = await bodySystem.getState();
      gateway.broadcast({
        type: 'body-state',
        data: state,
      });
    } catch (error) {
      console.error('[BodyGateway] Error broadcasting state:', error);
    }
  }, cfg.stateBroadcastInterval);

  console.log('[BodyGateway] Initialized successfully');
  console.log('[BodyGateway] Platform:', bodySystem.getPlatform()?.type);
  console.log('[BodyGateway] Sensors:', bodySystem.getAvailableSensors());
  
  return bodySystem;
}

/**
 * Stop body gateway integration
 */
export function stopBodyGateway(): void {
  if (stateBroadcastInterval) {
    clearInterval(stateBroadcastInterval);
    stateBroadcastInterval = null;
  }
  
  if (bodySystem) {
    bodySystem.stop();
    bodySystem = null;
  }

  console.log('[BodyGateway] Stopped');
}

/**
 * Get current body system
 */
export function getBodySystem(): AgentBodySystem | null {
  return bodySystem;
}

/**
 * Manual health check (triggered from CLI or API)
 */
export async function checkBodyHealth(): Promise<{
  healthy: boolean;
  issues: string[];
  state: AgentBodyState | null;
}> {
  if (!bodySystem) {
    return {
      healthy: false,
      issues: ['Body system not initialized'],
      state: null,
    };
  }

  const [health, state] = await Promise.all([
    bodySystem.checkHealth(),
    bodySystem.getState(),
  ]);

  return {
    healthy: health.healthy,
    issues: health.issues,
    state,
  };
}

/**
 * Trigger proactive morning briefing
 */
export async function triggerMorningBriefing(): Promise<void> {
  if (!bodySystem) {
    throw new Error('Body system not initialized');
  }

  // Import reflection job
  const { ReflectionJob } = await import('./reflection');
  
  // This will be handled by the reflection job
  // For now, just get state and send
  const state = await bodySystem.getState();
  
  const message = await generateBriefingMessage(state);
  
  if (bodySystem) {
    await bodySystem.sendProactiveMessage({
      content: message,
      mood: state.healthy ? 'happy' : 'alert',
      urgency: state.healthy ? 'low' : 'normal',
    });
  }
}

/**
 * Generate briefing message from state
 */
function generateBriefingMessage(state: AgentBodyState): string {
  const parts: string[] = [];

  // Greeting
  const hour = new Date().getHours();
  if (hour < 12) {
    parts.push('☀️ Good morning!');
  } else if (hour < 18) {
    parts.push('🌤️ Good afternoon!');
  } else {
    parts.push('🌙 Good evening!');
  }

  // System health
  if (state.healthy) {
    parts.push('All systems operational.');
  } else {
    parts.push(`⚠️ Issues: ${state.issues.join(', ')}`);
  }

  // Temperature
  if (state.body?.temperature !== null) {
    const tempEmoji = state.body.temperature > 70 ? '🌡️' : '❄️';
    parts.push(`${tempEmoji} CPU: ${state.body.temperature}°C`);
  }

  // Network
  if (state.environment?.network.tailscale.length) {
    const online = state.environment.network.tailscale.filter(p => p.online).length;
    parts.push(`📡 ${online} peers online`);
  }

  // Services
  if (state.environment?.services.length) {
    const running = state.environment.services.filter(s => s.running).length;
    parts.push(`⚙️ ${running} services running`);
  }

  return parts.join(' ');
}