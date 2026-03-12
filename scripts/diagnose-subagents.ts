#!/usr/bin/env bun
/**
 * Subagent Diagnostic Script
 * 
 * Tests spawning mechanisms and identifies failures
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

console.log("=== SUBAGENT DIAGNOSTIC v1.0 ===\n");

// Check critical paths
const paths = {
  cwd: process.cwd(),
  cli: "src/cli/index.ts",
  index: "src/index.ts",
  packageJson: "package.json",
  bun: Bun.which("bun"),
};

console.log("Path Checks:");
for (const [name, value] of Object.entries(paths)) {
  const exists = existsSync(value);
  console.log(`  ${name}: ${exists ? "✅" : "❌"} ${value}`);
}

// Test basic spawn
console.log("\n=== Testing Basic Spawn ===");
console.log("Spawning 'bun --version'...");

const child = spawn("bun", ["--version"], {
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
let error = "";

child.stdout?.on("data", (data: Buffer) => {
  output += data.toString();
});

child.stderr?.on("data", (data: Buffer) => {
  error += data.toString();
});

child.on("exit", (code) => {
  console.log(`  Exit code: ${code}`);
  console.log(`  Output: ${output.trim()}`);
  if (error) console.log(`  Error: ${error.trim()}`);
  console.log(`  Result: ${code === 0 ? "✅ Spawn works" : "❌ Spawn failed"}`);
});

child.on("error", (err) => {
  console.error(`  Spawn error: ${err.message}`);
  console.log(`  Result: ❌ Spawn error`);
});

// Test Bun.spawn (preferred in Bun projects)
console.log("\n=== Testing Bun.spawn ===");
try {
  const proc = Bun.spawn({
    cmd: ["bun", "--version"],
    stdout: "pipe",
    stderr: "pipe",
  });
  
  const text = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  
  console.log(`  Exit code: ${exitCode}`);
  console.log(`  Output: ${text.trim()}`);
  console.log(`  Result: ${exitCode === 0 ? "✅ Bun.spawn works" : "❌ Bun.spawn failed"}`);
} catch (err) {
  console.error(`  Bun.spawn error: ${err}`);
  console.log(`  Result: ❌ Bun.spawn error`);
}

// Check agent directories
console.log("\n=== Agent Directory Checks ===");
import { homedir } from "os";
const agentDir = join(homedir(), ".0xkobold", "agents");
console.log(`  Agent dir exists: ${existsSync(agentDir) ? "✅" : "❌"} ${agentDir}`);

// Check environment variables
console.log("\n=== Environment Variables ===");
const envVars = [
  "BUN_INSTALL",
  "PATH",
  "HOME",
];
for (const name of envVars) {
  const value = process.env[name];
  console.log(`  ${name}: ${value ? "set" : "unset"} ${value ? `(len: ${value.length})` : ""}`);
}

console.log("\n=== DIAGNOSTIC COMPLETE ===");
