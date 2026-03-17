/**
 * Gateway Integration for Desktop Familiar
 *
 * Exports the NodeClient and FamiliarNode for connecting
 * the desktop familiar to the 0xKobold gateway.
 */

export { NodeClient, type CommandDefinition, type JSONSchema, type JSONSchemaProperty, type NodeConfig, type NodeEventHandler } from './node-client';
export { FamiliarNode, type FamiliarState, type FamiliarEvent, type FamiliarStateListener, type AgentMessageListener } from './familiar-node';