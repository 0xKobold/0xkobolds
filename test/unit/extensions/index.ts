/**
 * Extension Unit Tests Index
 * 
 * Run all extension tests with:
 *   bun test test/unit/extensions
 * 
 * Individual test files:
 * - mocks.ts - Mock implementations for ExtensionAPI
 * - persona-loader.test.ts - Persona/identity file loading
 * - fileops.test.ts - File operations and shell tools
 * - gateway.test.ts - WebSocket gateway management
 * - mode-manager.test.ts - Plan/Build mode switching
 * - agent-subagent.test.ts - Agent registry and spawning
 */

// This file serves as documentation and entry point
export { createMockExtensionAPI, createMockContext, triggerEvent, getMessages, findMessageByType } from "./mocks";
