/**
 * Quick start script to see the new koclaw-style gateway in action
 */
import { startGateway, createSessionStore } from "./index";
import { addAuthProfile } from "../agent";

console.log("🐉 Starting Koclaw-style Gateway Demo...\n");

// Start gateway
const gateway = startGateway({ port: 7777, host: "localhost" });

// Add a demo auth profile
addAuthProfile("ollama", "local", "", "http://localhost:11434");
console.log("✓ Auth profile added: ollama/local");

// Create a session
const sessionStore = createSessionStore();
const sessionId = `demo-${Date.now()}`;
sessionStore.set(sessionId, {
  sessionId,
  sessionKey: sessionId,
  agentId: "coordinator",
  updatedAt: Date.now(),
  createdAt: Date.now(),
});
console.log("✓ Session created:", sessionId);

console.log("\n🚀 Gateway ready!");
console.log("\nConnect with:");
console.log(`  wscat -c ws://localhost:7777/ws`);
console.log("\nOr in another terminal:");
console.log(`  curl http://localhost:7777/protocol`);
console.log(`  curl http://localhost:7777/health`);
console.log("\nPress Ctrl+C to stop\n");

// Keep running
setInterval(() => {
  console.log(`[${new Date().toLocaleTimeString()}] Connections: ${gateway.getConnectionCount()}`);
}, 10000);
