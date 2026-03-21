/**
 * Agent Body Module
 * 
 * Embodiment capabilities for 0xKobold.
 * Provides sensing (internal state), environment scanning,
 * and actuation (proactive messaging) for agent autonomy.
 * 
 * Usage:
 * ```typescript
 * import { getAgentBody } from './body';
 * 
 * const body = getAgentBody();
 * await body.initialize();
 * const state = await body.feel();
 * 
 * console.log(`CPU Temp: ${state.temperature}°C`);
 * console.log(`Load: ${state.load}`);
 * ```
 * 
 * Integration:
 * ```typescript
 * // In gateway initialization
 * const body = getAgentBody();
 * await body.initialize();
 * body.setGateway(gateway);
 * body.setDeliverySystem(delivery);
 * body.start();
 * 
 * // In heartbeat scheduler
 * const state = await body.feel();
 * gateway.broadcast({ type: 'body-state', data: state });
 * ```
 */

export { AgentBody } from './index';
export { SensorRegistry } from './sensors';
export { detectPlatform, getPlatform, hasCapability } from './platform';
export { EnvironmentScanner } from './environment';
export { ActuatorRegistry } from './actuators';
export { ReflectionJob } from './reflection';
export { AgentBodySystem, getAgentBody, resetAgentBody } from './init';

// Re-export types
export type { BodyState, ExpressiveState } from './index';
export type { Sensor, SensorReading } from './sensors';
export type { PlatformInfo, PlatformCapabilities } from './platform';
export type { Environment, NetworkPeer, ServiceStatus } from './environment';
export type { Actuator, ActuatorMessage } from './actuators';
export type { ReflectionConfig, ReflectionResult } from './reflection';
export type { AgentBodyConfig, AgentBodyState } from './init';