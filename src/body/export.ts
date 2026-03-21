/**
 * Agent Body - Module Entry
 * 
 * Embodiment capabilities for 0xKobold.
 * 
 * This module provides:
 * - Internal sensing (CPU, memory, disk, network)
 * - Environment scanning (Tailscale peers, services)
 * - Actuation (Discord, web chat, voice)
 * - Reflection and proactive messaging
 * 
 * Platform-agnostic: Works on Raspberry Pi, desktop, laptop, server.
 */

export { AgentBody, type BodyState, type ExpressiveState } from './index';
export { SensorRegistry, type Sensor, type SensorReading } from './sensors';
export { detectPlatform, getPlatform, hasCapability, type PlatformInfo, type PlatformCapabilities } from './platform';
export { EnvironmentScanner, type Environment, type NetworkPeer, type ServiceStatus } from './environment';
export { ActuatorRegistry, type Actuator, type ActuatorMessage, DiscordActuator, WebChatActuator } from './actuators';
export { ReflectionJob, type ReflectionConfig, type ReflectionResult } from './reflection';
export { 
  AgentBodySystem, 
  type AgentBodyConfig,
  type AgentBodyState,
  getAgentBody, 
  resetAgentBody 
} from './init';