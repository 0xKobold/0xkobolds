/**
 * Docker Sandbox Example - v0.3.0
 * 
 * Run untrusted code safely in containers.
 */

import { getDockerRunner } from "../src/sandbox/index.js";

async function main() {
  console.log("🐳 Docker Sandbox Demo\n");

  const runner = getDockerRunner({
    image: "node:20-slim",
    memoryLimit: "256m",
    cpuLimit: "0.5",
    network: "none",  // Isolated
    timeout: 10000,
  });

  // Check Docker availability
  const available = await runner.isAvailable();
  if (!available) {
    console.error("❌ Docker not available. Install Docker to run this demo.");
    console.log("   Mac: brew install --cask docker");
    console.log("   Linux: sudo apt-get install docker.io");
    return;
  }

  console.log("✅ Docker available\n");

  // Example 1: Safe code execution
  console.log("1️⃣  Running safe JavaScript code...");
  const result1 = await runner.run({
    command: "node",
    args: ["-e", "console.log('Hello from sandbox!'); console.log('Memory:', process.memoryUsage().heapUsed / 1024 / 1024, 'MB');"],
  });

  console.log("Result:", result1.success ? "✅" : "❌");
    console.log("Output:", result1.stdout);
  if (result1.stderr) console.log("Errors:", result1.stderr);
  console.log("Duration:", result1.duration, "ms\n");

  // Example 2: Resource-limited execution
  console.log("2️⃣  Testing memory limits (will be killed)...");
  const result2 = await runner.run({
    command: "node",
    args: ["-e", "const arr = []; while(true) arr.push(new Array(1000000));"],
    timeout: 2000, // Will timeout
  });

  console.log("Killed:", result2.killed ? "✅" : "❌");
  console.log("Success:", result2.success ? "Yes" : "No (expected)");
  console.log("\n");

  // Example 3: Network isolation
  console.log("3️⃣  Testing network isolation...");
  const result3 = await runner.run({
    command: "curl",
    args: ["https://example.com"],
  });

  console.log("Network access:", result3.success ? "✅" : "❌ (isolated as expected)");
  console.log("\n");

  // Example 4: Safe file processing
  console.log("4️⃣  Processing files safely...");
  const result4 = await runner.run({
    command: "node",
    args: ["-e", "const fs = require('fs'); fs.writeFileSync('/workspace/output.txt', 'Safe write!'); console.log('File written');"],
  });

  console.log("Result:", result4.success ? "✅" : "❌");
  console.log("\n🎉 Demo complete!");
}

main().catch(console.error);
