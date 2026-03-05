#!/usr/bin/env bun
/**
 * 0xKobold Launcher - Starts Gateway and TUI
 * 
 * Usage: bun start.ts
 *        bun start.ts --daemon-only  (start just the gateway)
 *        bun start.ts --tui-only      (start just the TUI)
 */

import { spawn } from "child_process";
import { join } from "path";

const PROJECT_DIR = "/Users/warrengates/Documents/code/meep/0xkobold";
const GATEWAY_PORT = 18789;

async function isPortInUse(port: number): Promise<boolean> {
  try {
    const proc = Bun.spawn(["lsof", "-ti", `:${port}`]);
    const output = await new Response(proc.stdout).text();
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

async function killProcessOnPort(port: number) {
  try {
    const proc = Bun.spawn(["lsof", "-ti", `:${port}`]);
    const output = await new Response(proc.stdout).text();
    const pids = output.trim().split("\n").filter(Boolean);
    
    for (const pid of pids) {
      console.log(`Killing process ${pid} on port ${port}`);
      try {
        process.kill(parseInt(pid), "SIGKILL");
      } catch {}
    }
    
    // Wait for port to clear
    await new Promise(r => setTimeout(r, 1000));
  } catch {}
}

async function startGateway(): Promise<number> {
  console.log("🚀 Starting Gateway...");
  
  // Check if port is in use
  if (await isPortInUse(GATEWAY_PORT)) {
    console.log(`Port ${GATEWAY_PORT} in use, clearing...`);
    await killProcessOnPort(GATEWAY_PORT);
  }
  
  // Start gateway
  const gateway = spawn("bun", ["gateway/index.ts"], {
    cwd: PROJECT_DIR,
    stdio: "inherit",
  });
  
  // Wait for it to be ready
  let attempts = 0;
  while (attempts < 10) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch(`http://localhost:${GATEWAY_PORT}/health`);
      if (res.ok) {
        console.log("✅ Gateway is running on port", GATEWAY_PORT);
        return gateway.pid!;
      }
    } catch {}
    attempts++;
  }
  
  throw new Error("Gateway failed to start");
}

async function startTUI() {
  console.log("🖥️  Starting TUI...");
  
  const tui = spawn("bun", ["tui/index.ts"], {
    cwd: PROJECT_DIR,
    stdio: "inherit",
  });
  
  return tui.pid!;
}

async function main() {
  const args = process.argv.slice(2);
  const daemonOnly = args.includes("--daemon-only");
  const tuiOnly = args.includes("--tui-only");
  
  if (tuiOnly) {
    // Just start TUI
    await startTUI();
    return;
  }
  
  if (daemonOnly) {
    // Just start gateway
    const gatewayPid = await startGateway();
    console.log(`\nGateway running (PID: ${gatewayPid})`);
    console.log("Press Ctrl+C to stop");
    
    // Keep alive
    process.stdin.resume();
    return;
  }
  
  // Start both
  console.log("🐲 Starting 0xKobold Multi-Agent System\n");
  
  try {
    const gatewayPid = await startGateway();
    console.log("");
    
    // Give gateway a moment to fully initialize
    await new Promise(r => setTimeout(r, 1000));
    
    await startTUI();
    
  } catch (err) {
    console.error("❌ Failed to start:", err);
    process.exit(1);
  }
}

main().catch(console.error);
