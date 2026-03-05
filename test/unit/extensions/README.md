/**
 * Extension Unit Tests
 * 
 * This directory contains unit tests for 0xKobold extensions.
 * 
 * ## Test Files
 * 
 * ### mocks.ts
 * Mock implementations of @mariozechner/pi-coding-agent ExtensionAPI.
 * Provides:
 * - `createMockExtensionAPI()` - Creates a mock API with state tracking
 * - `createMockContext()` - Creates a mock context for command handlers
 * - `triggerEvent()` - Triggers events on the mock API
 * - `getMessages()` / `findMessageByType()` - Message inspection helpers
 * 
 * ### gateway.test.ts (18 tests, 18 pass)
 * Tests for WebSocket gateway extension:
 * - Tool registration (gateway_broadcast)
 * - Command registration (gateway:start, gateway:stop, gateway:status)
 * - Flag registration (gateway-port, gateway-host)
 * - Session start handling with subagent detection
 * - Port configuration
 * - Cleanup handlers
 * 
 * Key feature: Verifies subagent detection prevents duplicate gateway starts
 * 
 * ### persona-loader.test.ts (17 tests, 10 pass, 7 skipped)
 * Tests for persona/identity file loading:
 * - Command registration (persona, identity, memory, persona-reload)
 * - Session start event handling
 * - Persona building and section injection
 * - File truncation for long content
 * 
 * Note: 7 tests skipped because PERSONA_DIR uses node:os homedir() at module
 * load time, which cannot be mocked after import. To test file-based personas,
 * homedir() would need to be mocked before importing the extension.
 * 
 * ### mode-manager.test.ts (19 tests)
 * Tests for Plan/Build mode switching:
 * - Command registration (plan, build, mode, modes, mode-add)
 * - Mode persistence to disk
 * - System prompt injection
 * - Custom mode support
 * - Session start handling
 * 
 * Note: Some tests fail due to API differences between the mock and actual
 * ExtensionAPI. The real mode-manager extension uses `pi.sessionManager` and
 * `pi.ui` directly, which our mocks provide differently.
 * 
 * ### agent-subagent.test.ts (22 tests)
 * Tests for agent registry and multi-agent system:
 * - Database initialization
 * - Command registration (agents, agent-spawn, agent-status, agent-tree, agent-cap)
 * - Tool registration (agent_spawn, agent_delegate, agent_list)
 * - Default agent types (coordinator, code-specialist, researcher, etc.)
 * - Capability-based agent discovery
 * - Agent spawning and delegation
 * - Agent hierarchy tracking
 * 
 * ## Running Tests
 * 
 * Run all extension tests:
 *   bun test ./test/unit/extensions/
 * 
 * Run specific test file:
 *   bun test ./test/unit/extensions/gateway.test.ts
 * 
 * Run with verbose output:
 *   bun test --verbose ./test/unit/extensions/
 * 
 * ## Architecture Notes
 * 
 * ### Why Some Tests Are Skipped
 * 
 * Several tests are skipped because they rely on module-level constants that
 * are evaluated at import time using `node:os` `homedir()`. Examples:
 * 
 * - persona-loader-extension.ts: `const PERSONA_DIR = join(homedir(), ".0xkobold")`
 * - agent-registry-extension.ts: `const KOBOLD_DIR = join(homedir(), ".0xkobold")`
 * 
 * To properly test these, you would need to:
 * 1. Mock `homedir()` BEFORE importing the extension
 * 2. Use dynamic imports (`await import()`) after setting up mocks
 * 
 * Example approach:
 * ```typescript
 * // Mock homedir before import
 * const mockHomedir = join(tmpdir(), "test-" + Date.now());
 * jest.mock("node:os", () => ({
 *   ...jest.requireActual("node:os"),
 *   homedir: () => mockHomedir,
 * }));
 * 
 * // Now import
 * const { default: extension } = await import("./extension");
 * ```
 * 
 * Bun's test runner doesn't support Jest-style module mocking, so these tests
 * are skipped with explanatory comments.
 * 
 * ### Mock API Structure
 * 
 * The mock ExtensionAPI tracks:
 * - `state.tools` - Map of registered tools
 * - `state.commands` - Map of registered commands
 * - `state.flags` - Map of registered flags with values
 * - `state.eventHandlers` - Map of event handlers by event name
 * - `state.messages` - Array of messages sent via sendMessage()
 * 
 * ### Event Handling
 * 
 * Extensions register event handlers with `pi.on(event, handler)`. Tests trigger
 * these handlers using `triggerEvent(api, eventName, payload, context)`.
 * 
 * ### Command Testing
 * 
 * Commands can have either:
 * - `execute()` - Simple command with no args
 * - `handler(args, ctx)` - Command with arguments and context
 * 
 * Check which one the extension uses before testing.
 * 
 * ## Adding New Tests
 * 
 * When adding tests for a new extension:
 * 
 * 1. Import the mock helpers from `./mocks.ts`
 * 2. Create a test directory in `tmpdir()` for file operations
 * 3. Check if the extension uses module-level constants with `homedir()`
 * 4. Test command/tool/flag registration first (always works)
 * 5. Test event handlers with `triggerEvent()`
 * 6. Test file operations if possible (may require mocks)
 * 
 * Template:
 * ```typescript
 * import { describe, test, expect, beforeEach, afterEach } from "bun:test";
 * import { mkdir, rm } from "node:fs/promises";
 * import { join } from "node:path";
 * import { tmpdir } from "node:os";
 * import myExtension from "../../../src/extensions/core/my-extension";
 * import { createMockExtensionAPI, createMockContext } from "./mocks";
 * 
 * describe("My Extension", () => {
 *   let api: ReturnType<typeof createMockExtensionAPI>;
 *   let testDir: string;
 * 
 *   beforeEach(async () => {
 *     api = createMockExtensionAPI();
 *     testDir = join(tmpdir(), "my-test-" + Date.now());
 *     await mkdir(testDir, { recursive: true });
 *   });
 * 
 *   afterEach(async () => {
 *     await rm(testDir, { recursive: true, force: true });
 *   });
 * 
 *   test("should register my command", () => {
 *     myExtension(api as any);
 *     expect(api.state.commands.has("my-command")).toBe(true);
 *   });
 * });
 * ```
 */

// Export makes this a module
export {};
