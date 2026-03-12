/**
 * Package Verification Test
 * 
 * Verifies that @0xkobold/pi-wallet, @0xkobold/pi-erc8004, and @0xkobold/pi-ollama
 * can be loaded and initialized in the 0xKobold environment
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║     Testing Local Pi Packages in 0xKobold Project         ║");
console.log("╚════════════════════════════════════════════════════════════╝\n");

// Test 1: Verify package builds exist
console.log("📦 Test 1: Package Builds");
console.log("───────────────────────────────");

const packages = [
  { name: "@0xkobold/pi-wallet", path: "../packages/pi-wallet/dist/index.js" },
  { name: "@0xkobold/pi-erc8004", path: "../packages/pi-erc8004/dist/index.js" },
  { name: "@0xkobold/pi-ollama", path: "../packages/pi-ollama/dist/index.js" },
];

let allExist = true;
for (const pkg of packages) {
  const exists = existsSync(pkg.path);
  console.log(`${exists ? "✅" : "❌"} ${pkg.name}`);
  console.log(`   Path: ${pkg.path}`);
  if (exists) {
    const stats = readFileSync(pkg.path, "utf-8");
    console.log(`   Size: ${(stats.length / 1024).toFixed(1)} KB`);
  } else {
    allExist = false;
  }
  console.log();
}

// Test 2: Verify storage directories
console.log("📁 Test 2: Storage Directories");
console.log("───────────────────────────────");

const testDirs = [
  { name: "Wallet", env: "PI_WALLET_DIR", fallback: join(homedir(), ".pi", "wallet") },
  { name: "ERC-8004", env: "PI_ERC8004_DIR", fallback: join(homedir(), ".pi", "erc8004") },
];

for (const dir of testDirs) {
  const envPath = process.env[dir.env];
  const actualPath = envPath || dir.fallback;
  console.log(`${dir.name}:`);
  console.log(`  Env: ${envPath || "(not set)"}`);
  console.log(`  Will use: ${actualPath}`);
  console.log();
}

// Test 3: Package.json verification
console.log("📋 Test 3: Package Configurations");
console.log("───────────────────────────────");

for (const pkg of packages) {
  const pkgJsonPath = pkg.path.replace("/dist/index.js", "/package.json");
  if (existsSync(pkgJsonPath)) {
    const pkgJson = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    console.log(`${pkg.name}:`);
    console.log(`  Version: ${pkgJson.version}`);
    console.log(`  Keywords: ${pkgJson.keywords?.join(", ") || "none"}`);
    console.log(`  Pi extension: ${pkgJson.pi?.extensions ? "✅" : "❌"}`);
    if (pkgJson.pi?.extensions) {
      console.log(`  Entry: ${pkgJson.pi.extensions[0]}`);
    }
    console.log();
  }
}

// Test 4: Import test
console.log("🔧 Test 4: Module Imports");
console.log("───────────────────────────────");

try {
  const wallet = await import("../packages/pi-wallet/dist/index.js");
  console.log("✅ @0xkobold/pi-wallet imported");
  console.log(`   Default export: ${typeof wallet.default}`);
} catch (e: any) {
  console.log(`❌ wallet import failed: ${e.message.slice(0, 50)}...`);
}

try {
  const erc8004 = await import("../packages/pi-erc8004/dist/index.js");
  console.log("✅ @0xkobold/pi-erc8004 imported");
  console.log(`   Default export: ${typeof erc8004.default}`);
} catch (e: any) {
  console.log(`❌ erc8004 import failed: ${e.message.slice(0, 50)}...`);
}

try {
  const ollama = await import("../packages/pi-ollama/dist/index.js");
  console.log("✅ @0xkobold/pi-ollama imported");
  console.log(`   Default export: ${typeof ollama.default}`);
} catch (e: any) {
  console.log(`❌ ollama import failed: ${e.message.slice(0, 50)}...`);
}

console.log();

// Summary
console.log("══════════════════════════════════════════════════════════");
if (allExist) {
  console.log("✅ All packages ready for test!");
  console.log();
  console.log("Next steps:");
  console.log("  1. Test locally with:");
  console.log("     pi -e ../packages/pi-wallet");
}
else {
  console.log("❌ Some packages missing. Build failed?");
}
console.log("══════════════════════════════════════════════════════════");
