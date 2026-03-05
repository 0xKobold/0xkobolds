/**
 * Update command for 0xKobold CLI
 *
 * Provides: 0xkobold update [check|install|framework]
 */

import { Command } from "commander";
import { KoboldClient } from "../client.js";

// Check for updates
const checkCommand = new Command("check")
  .description("Check for 0xKobold and framework updates")
  .action(async () => {
    console.log("🔍 Checking for updates...\n");

    // Check 0xKobold version
    const packageJson = await Bun.file('package.json').json();
    const currentVersion = packageJson.version;

    try {
      const fetchProc = Bun.spawn(['git', 'fetch', '--tags'], {
        cwd: process.cwd(),
        stdout: 'pipe',
        stderr: 'pipe',
      });
      await fetchProc.exited;

      const tagProc = Bun.spawn(['git', 'describe', '--tags', '--abbrev=0'], {
        cwd: process.cwd(),
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const exitCode = await tagProc.exited;
      if (exitCode !== 0) {
        // No tags found - check for commits instead
        const logProc = Bun.spawn(['git', 'log', '--oneline', '-1'], {
          cwd: process.cwd(),
          stdout: 'pipe',
          stderr: 'pipe',
        });
        const latestCommit = (await new Response(logProc.stdout).text()).trim();
        if (latestCommit) {
          console.log(`🐉 0xKobold: ${currentVersion}`);
          console.log(`   Latest commit: ${latestCommit.slice(0, 40)}`);
          console.log("   Run: git pull && bun install to update\n");
        } else {
          console.log(`✅ 0xKobold: ${currentVersion}\n`);
        }
        return;
      }

      const latestTag = (await new Response(tagProc.stdout).text()).trim();

      if (latestTag !== `v${currentVersion}` && latestTag !== currentVersion) {
        console.log(`🐉 0xKobold: ${currentVersion} → ${latestTag}`);
        console.log("   Run: git pull && bun install\n");
      } else {
        console.log(`✅ 0xKobold: ${currentVersion} (up to date)\n`);
      }
    } catch {
      console.log("⚠️  Could not check 0xKobold version\n");
    }

    // Check framework version
    const frameworkVersion = packageJson.dependencies['@mariozechner/pi-coding-agent'];
    console.log(`📦 Framework: ${frameworkVersion}`);

    try {
      const response = await fetch('https://registry.npmjs.org/@mariozechner/pi-coding-agent/latest');
      const data = await response.json() as { version: string };
      const latestFramework = data.version;

      if (latestFramework !== frameworkVersion.replace(/^[\^~]/, '')) {
        console.log(`   Latest: ${latestFramework}`);
        console.log("   Run: bun update @mariozechner/pi-coding-agent\n");
      } else {
        console.log("   ✅ Up to date\n");
      }
    } catch {
      console.log("   ⚠️  Could not check framework version\n");
    }
  });

// Install updates
const installCommand = new Command("install")
  .description("Install 0xKobold update from git")
  .action(async () => {
    console.log("🐉 Updating 0xKobold...\n");

    try {
      // Stash changes
      console.log("📦 Stashing local changes...");
      await Bun.spawn(['git', 'stash'], { cwd: process.cwd() }).exited;

      // Pull
      console.log("📥 Pulling latest changes...");
      const pullProc = Bun.spawn(['git', 'pull', 'origin', 'main'], {
        cwd: process.cwd(),
        stdout: 'pipe',
      });

      for await (const line of pullProc.stdout) {
        process.stdout.write(line);
      }

      // Install
      console.log("\n📦 Installing dependencies...");
      const installProc = Bun.spawn(['bun', 'install'], {
        cwd: process.cwd(),
        stdout: 'pipe',
      });

      for await (const line of installProc.stdout) {
        process.stdout.write(line);
      }

      console.log("\n✅ Update complete!");
      console.log("🚀 Restart 0xKobold to apply changes.\n");
    } catch (err) {
      console.error("❌ Update failed:", err);
      process.exit(1);
    }
  });

// Update framework only
const frameworkCommand = new Command("framework")
  .description("Update pi-coding-agent framework")
  .action(async () => {
    console.log("📦 Updating framework...\n");

    const proc = Bun.spawn(['bun', 'update', '@mariozechner/pi-coding-agent'], {
      cwd: process.cwd(),
      stdout: 'pipe',
    });

    for await (const line of proc.stdout) {
      process.stdout.write(line);
    }

    console.log("\n✅ Framework updated!");
    console.log("🚀 Restart 0xKobold to apply changes.\n");
  });

// Main update command
export const updateCommand = new Command("update")
  .description("Manage 0xKobold updates")
  .addCommand(checkCommand)
  .addCommand(installCommand)
  .addCommand(frameworkCommand);
