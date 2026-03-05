#!/usr/bin/env bun
/**
 * Agent Worker Process
 * 
 * This is spawned as a subprocess by agent-registry-extension.ts
 * Connects to gateway, authenticates, executes task, reports completion.
 */

const AGENT_ID = process.env.KOBOLD_AGENT_ID;
const AGENT_TYPE = process.env.KOBOLD_AGENT_TYPE;
const AGENT_TASK = process.env.KOBOLD_AGENT_TASK;
const SESSION_KEY = process.env.KOBOLD_SESSION_KEY;
const PARENT_ID = process.env.KOBOLD_PARENT_ID || "";
const WORKSPACE = process.env.KOBOLD_WORKSPACE;
const GATEWAY_PORT = parseInt(process.env.KOBOLD_GATEWAY_PORT || "18789");

if (!AGENT_ID || !SESSION_KEY) {
  console.error("[AgentWorker] Missing required environment variables");
  process.exit(1);
}

console.log(`[AgentWorker] ${AGENT_ID} starting...`);
console.log(`[AgentWorker] Type: ${AGENT_TYPE}`);
console.log(`[AgentWorker] Task: ${AGENT_TASK?.slice(0, 100)}...`);
console.log(`[AgentWorker] Workspace: ${WORKSPACE}`);

// Results tracking
let tokensInput = 0;
let tokensOutput = 0;
let result = "";
let exitCode = 0;

// Main execution
async function main(): Promise<void> {
  try {
    // Connect to gateway
    await connectToGateway();
    
    // Execute the task
    await executeTask();
    
    // Report completion
    await reportCompletion("success");
    
    console.log("[AgentWorker] Completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("[AgentWorker] Error:", error);
    await reportCompletion("error", String(error));
    process.exit(1);
  }
}

async function connectToGateway(): Promise<void> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${GATEWAY_PORT}`);
    
    ws.onopen = () => {
      console.log("[AgentWorker] Connected to gateway");
      
      // Send connect frame with authentication
      const connectFrame = {
        type: "connect" as const,
        id: `conn-${Date.now()}`,
        params: {
          role: "node" as const,
          client: AGENT_ID!,
          caps: ["subagent"],
          device: { id: AGENT_ID!, platform: "bun-subprocess" },
          sessionKey: SESSION_KEY!,
        },
      };
      
      ws.send(JSON.stringify(connectFrame));
      
      // Wait for response
      const onMessage = (data: MessageEvent) => {
        try {
          const frame = JSON.parse(data.data);
          if (frame.type === "res" && frame.ok) {
            console.log("[AgentWorker] Authenticated with gateway");
            ws.removeEventListener("message", onMessage);
            resolve();
          } else if (frame.type === "res" && !frame.ok) {
            reject(new Error(frame.error || "Authentication failed"));
          }
        } catch {}
      };
      
      ws.addEventListener("message", onMessage);
    };
    
    ws.onerror = (err) => {
      reject(new Error(`WebSocket error: ${err}`));
    };
    
    // Timeout after 10 seconds
    setTimeout(() => reject(new Error("Gateway connection timeout")), 10000);
  });
}

async function executeTask(): Promise<void> {
  const task = AGENT_TASK || "";
  
  // Simulate work - in real implementation, this would:
  // - Initialize the pi-coding-agent framework
  // - Execute the task using available tools
  // - Track token usage
  // - Generate output
  
  console.log("[AgentWorker] Executing task...");
  
  // Simulate processing time
  await delay(2000 + Math.random() * 3000);
  
  // Simulate token counting
  tokensInput = task.length * 2;
  tokensOutput = Math.floor(Math.random() * 500) + 100;
  
  // Generate result
  result = `Task completed by ${AGENT_ID}\\n` +
           `Type: ${AGENT_TYPE}\\n` +
           `Task: ${task.slice(0, 50)}...\\n` +
           `Output: ${tokensOutput} tokens generated`;
  
  console.log("[AgentWorker] Task complete");
  console.log(`[AgentWorker] Input tokens: ${tokensInput}`);
  console.log(`[AgentWorker] Output tokens: ${tokensOutput}`);
}

async function reportCompletion(status: "success" | "error", errorMessage?: string): Promise<void> {
  const ws = new WebSocket(`ws://127.0.0.1:${GATEWAY_PORT}`);
  
  return new Promise((resolve) => {
    ws.onopen = () => {
      const announceFrame = {
        type: "req" as const,
        id: `announce-${Date.now()}`,
        method: "agent.announce",
        params: {
          sessionKey: SESSION_KEY!,
          source: "subagent" as const,
          childSessionKey: SESSION_KEY!,
          taskLabel: AGENT_TASK?.slice(0, 50),
          status: status === "success" ? "success" : "error" as const,
          result: errorMessage || result,
          tokens: { input: tokensInput, output: tokensOutput },
          runtime: Date.now() - startTime,
          exitCode: status === "success" ? 0 : 1,
        },
      };
      
      ws.send(JSON.stringify(announceFrame));
      
      // Close after sending
      setTimeout(() => {
        ws.close();
        resolve();
      }, 500);
    };
    
    ws.onerror = () => {
      console.error("[AgentWorker] Failed to report completion");
      resolve();
    };
  });
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const startTime = Date.now();
main();
