/**
 * 0xKobold - PI Framework Architecture
 *
 * Main entry point using @mariozechner/pi-coding-agent
 * - Agent-based architecture
 * - Extension system
 * - Graceful shutdown handling
 *
 * Extension Loading Strategy:
 * - When running from source (development): loads .ts files from src/
 * - When running from dist (production/global): loads .js files from dist/src/
 * - This allows `bun link` global installs to work correctly
 */

import {
  main as piMain,
} from '@mariozechner/pi-coding-agent';
import { fileURLToPath } from 'url';
import { resolve, dirname, join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { startGateway } from './gateway/index';
import { ensureAuthProfilesFromConfig } from './agent/index';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

// Detect if we're running from dist/ or src/
// If __dirname contains 'dist', we're running compiled code
const isRunningFromDist = __dirname.includes('dist');

// Find @0xkobold/pi-ollama from wherever it's installed
// This handles bun link global installs, npm installs, and local dev
function findOllamaExtension(): string {
  try {
    // Use import.meta.resolve to find the package from wherever it's installed
    const resolved = import.meta.resolve('@0xkobold/pi-ollama');
    // import.meta.resolve returns a file:// URL, convert to path
    const packagePath = fileURLToPath(resolved);
    // This gives us .../pi-ollama/dist/index.js or similar
    // We want the dist/index.js
    if (packagePath.includes('dist/index.js') || packagePath.includes('dist/index.ts')) {
      return packagePath;
    }
    // Fallback: construct path from package root
    return resolve(packagePath, 'dist/index.js');
  } catch {
    // Fallback: use packageRoot-based resolution
    // For bun link global install, node_modules is sibling to package, not inside dist
    if (isRunningFromDist) {
      // Go up from dist/src to find node_modules at package root level
      // __dirname is .../node_modules/0xkobold/dist/src
      // We need .../node_modules/@0xkobold/pi-ollama/dist/index.js
      const globalModulesRoot = resolve(__dirname, '../../../..');
      return resolve(globalModulesRoot, '@0xkobold/pi-ollama/dist/index.js');
    }
    return resolve(packageRoot, 'node_modules/@0xkobold/pi-ollama/dist/index.js');
  }
}
// For dist: __dirname is .../dist/src, packageRoot is .../dist
// So we just need src/extensions/core from packageRoot
const extensionDir = isRunningFromDist 
  ? join(packageRoot, 'src/extensions/core')  // Production: .js files (packageRoot is already dist/)
  : join(packageRoot, 'src/extensions/core');  // Development: .ts files
const extensionExt = isRunningFromDist ? '.js' : '.ts';

// Use 0xKobold directory for pi-coding-agent data (sessions, settings, auth)
// This keeps everything in ~/.0xkobold instead of ~/.pi
process.env.PI_CODING_AGENT_DIR = process.env.PI_CODING_AGENT_DIR || resolve(homedir(), '.0xkobold');

// Change working directory to global workspace when NOT in local mode
// This ensures file operations are sandboxed to ~/.0xkobold unless --local is used
const globalWorkspace = resolve(homedir(), '.0xkobold');
// Check process.argv directly since we're at module level (before main() runs)
const isLocalMode = process.argv.slice(2).includes('--local');

if (!isLocalMode) {
  // Global mode: enforce working directory is ~/.0xkobold
  process.env.KOBOLD_LOCAL_MODE = 'false';
  if (existsSync(globalWorkspace)) {
    try {
      process.chdir(globalWorkspace);
      process.env.KOBOLD_WORKING_DIR = globalWorkspace;
      console.log(`[Workspace] Global mode - cwd set to: ${globalWorkspace}`);
    } catch (err) {
      console.warn(`[Workspace] Could not change to global workspace: ${err}`);
    }
  } else {
    console.warn(`[Workspace] Global workspace does not exist: ${globalWorkspace}`);
    console.log(`[Workspace] Run '0xkobold init' to create it`);
  }
} else {
  // Local mode: cwd stays as-is (wherever --local was invoked from)
  process.env.KOBOLD_LOCAL_MODE = 'true';
  process.env.KOBOLD_WORKING_DIR = process.cwd();
  console.log(`[Workspace] Local mode - cwd: ${process.cwd()}`);
}

// Disable pi-coding-agent's built-in update notifications
// (we manage our own updates via self-update-extension)
process.env.PI_SKIP_VERSION_CHECK = process.env.PI_SKIP_VERSION_CHECK || '1';

// Helper to resolve extension paths
function ext(name: string): string {
  // Handle subdirectory paths like 'context-pruning/extension'
  if (name.includes('/')) {
    return resolve(extensionDir, name) + extensionExt;
  }
  return resolve(extensionDir, name + extensionExt);
}

// Verify extensions exist (for debugging)
function verifyExtensions(): string[] {
  const ollamaExtensionPath = findOllamaExtension();
  
  // Debug: log where we found pi-ollama
  if (!existsSync(ollamaExtensionPath)) {
    console.error(`⚠️  pi-ollama extension not found at: ${ollamaExtensionPath}`);
    console.error(`   __dirname: ${__dirname}`);
    console.error(`   packageRoot: ${packageRoot}`);
    console.error(`   isRunningFromDist: ${isRunningFromDist}`);
  }

  const extensions: string[] = [
    // Infrastructure
    // '--extension', ext('ollama-extension'),

    // Ollama Provider Extension (npm package)
    '--extension', ollamaExtensionPath,
    // 🧠 Adaptive Model Router (must load after pi-ollama)
    '--extension', ext('routed-ollama-extension'),

    // Core Features
    // Agent Orchestration (Unified - v0.2.0)
    // Replaces: agent-registry, subagent-extension, agent-lifecycle, agent-workspace
    '--extension', ext('agent-orchestrator-extension'),
    '--extension', ext('persona-loader-extension'),
    
    // Legacy Extensions (DEPRECATED - will be removed in v0.3.0)
    // Kept for backwards compatibility, use agent_orchestrate instead
    // '--extension', ext('agent-registry-extension'),
    // '--extension', ext('subagent-extension'),
    // '--extension', ext('agent-lifecycle-extension'),
    // '--extension', ext('agent-workspace-extension'),
    // '--extension', ext('autonomous-subagent-extension'),
    
    // Core Features
    '--extension', ext('persona-loader-extension'),
    '--extension', ext('context-aware-extension'),
    '--extension', ext('onboarding-extension'),
    '--extension', ext('session-name-extension'),
    '--extension', ext('env-loader-extension'),
    '--extension', ext('heartbeat-extension'),
    '--extension', ext('discord-channel-extension'),
    '--extension', ext('task-manager-extension'),
    // Context management (OpenClaw-style)
    '--extension', ext('context-pruning/extension'),
    '--extension', ext('compaction-safeguard'),
    '--extension', ext('auto-compact-on-error-extension'),
    
    // Multi-Channel
    '--extension', ext('multi-channel-extension'),
    '--extension', ext('discord-extension'),
    
    // Safety extensions (pi-mono)
    '--extension', ext('protected-paths'),
    '--extension', ext('confirm-destructive'),
    '--extension', ext('dirty-repo-guard'),
    '--extension', ext('git-checkpoint'),

    // Draconic Extensions (v0.2.0+)
    '--extension', ext('draconic-hoard-extension'),
    '--extension', ext('draconic-lair-extension'),
    '--extension', ext('draconic-safety-extension'),
    // '--extension', ext('tui-integration-extension'),  // DISABLED: Using pi-subagents native tree

    // Integrations
    '--extension', ext('mcp-extension'),
    '--extension', ext('gateway-extension'),
    '--extension', ext('gateway-status-extension'),
    // Agent workspace provides advanced_web_fetch tool
    '--extension', ext('agent-workspace-extension'),
    // Deprecated: Use agent-orchestrator-extension instead
    // '--extension', ext('agent-lifecycle-extension'),
    // '--extension', ext('autonomous-subagent-extension'),
    // '--extension', ext('agent-registry-extension'),
    '--extension', ext('websearch-enhanced-extension'),
    '--extension', ext('memory-extension'),
    '--extension', ext('perennial-memory-extension'),
    '--extension', ext('diagnostics-extension'),
    '--extension', ext('memory-synthesis-extension'),
    '--extension', ext('workspace-footer-extension'),
    // Deprecated: Use agent-orchestrator-extension instead
    // '--extension', ext('subagent-extension'),
    // Note: pi-coding-agent updates disabled - user manages dependencies manually
    // '--extension', ext('update-extension'),
    // Self-update for 0xKobold only (shows in dev mode)
    '--extension', ext('self-update-extension'),
  ];

  // Check that extensions exist
  const testExt = ext('fileops-extension');
  if (!existsSync(testExt)) {
    console.error(`⚠️  Warning: Extensions not found at ${extensionDir}`);
    console.error(`   Expected: ${testExt}`);
    console.error(`   Running from: ${isRunningFromDist ? 'dist (production)' : 'src (development)'}`);
    console.error(`   Package root: ${packageRoot}`);
  } else {
    // Count valid extensions
    let validCount = 0;
    for (let i = 1; i < extensions.length; i += 2) {
      if (existsSync(extensions[i])) validCount++;
    }
    console.log(`   Loaded ${validCount} extensions from ${isRunningFromDist ? 'dist' : 'src'}`);
  }

  return extensions;
}

async function main(): Promise<void> {
  // Check if we should run in CLI mode (with args) or programmatic mode
  const args = process.argv.slice(2);
  // TUI mode: no args, or 'tui' command, or '--local' flag
  const isTuiMode = args.length === 0 || args.includes('tui') || args.includes('--local');

  // Check for --local flag to enable per-project mode
  const localMode = args.includes('--local');
  if (localMode) {
    // KOBOLD_LOCAL_MODE and KOBOLD_WORKING_DIR already set at module level
    console.log('🐉 0xKobold starting in LOCAL mode...');
    console.log(`   Project: ${process.cwd()}`);
    console.log(`   Extensions: ${isRunningFromDist ? 'production' : 'development'}`);
  } else {
    // Env vars already set at module level
    console.log('🐉 0xKobold starting with PI Framework...');
    if (isRunningFromDist) {
      console.log('   Mode: Production (from dist)');
    } else {
      console.log('   Mode: Development (from source)');
    }
  }

  // If not in TUI mode, pass through to pi-coding-agent CLI
  if (!isTuiMode) {
    return piMain(args);
  }

  // TUI Mode: Load with all extensions
  const extensions = verifyExtensions();

  // Start Gateway Server (auto-start by default for TUI, skip if disabled)
  const gatewayPort = parseInt(process.env.KOBOLD_GATEWAY_PORT || '7777', 10);
  const gatewayDisabled = process.env.KOBOLD_GATEWAY === '0' || process.env.KOBOLD_GATEWAY === 'false';
  
  if (!gatewayDisabled) {
    try {
      const { isGatewayRunning } = await import('./gateway/gateway-server');
      const isRunning = await isGatewayRunning(gatewayPort);
      
      if (isRunning) {
        console.log(`🌐 Gateway detected on port ${gatewayPort} (connected as client)`);
      } else {
        const { startGateway } = await import('./gateway/index');
        startGateway({ port: gatewayPort, host: '0.0.0.0' });
        console.log(`🌐 Gateway started on port ${gatewayPort}`);
      }

      // Initialize Agent Body System
      try {
        const { initializeBodyGateway } = await import('./body/gateway-integration');
        const { getDeliverySystem } = await import('./gateway/delivery');
        const { getGateway } = await import('./gateway/gateway-server');
        
        const gateway = getGateway();
        const delivery = getDeliverySystem();
        
        if (gateway && delivery) {
          await initializeBodyGateway(gateway, delivery);
          console.log('🫀 Agent Body initialized');
        }
      } catch (err: any) {
        console.warn('⚠️  Agent Body error:', err?.message || err);
      }

      // Load auth profiles from config
      ensureAuthProfilesFromConfig();
    } catch (err: any) {
      console.warn('⚠️  Gateway error:', err?.message || err);
      console.log('💡 Disable gateway with KOBOLD_GATEWAY=0 if needed');
    }
  } else {
    console.log('💡 Gateway disabled (KOBOLD_GATEWAY=0)');
  }

  // Initialize Session Resume System (auto-save on shutdown)
  try {
    const { getSessionResumeSystem } = await import('./memory/session-resume');
    getSessionResumeSystem();
    console.log('💾 Session resume system ready (auto-save on Ctrl+C)');
  } catch (err) {
    console.warn('⚠️  Session resume not available:', err);
  }

  // Suggest previous sessions on startup
  try {
    const { suggestOnStartup } = await import('../skills/session-resume-skill');
    await suggestOnStartup();
  } catch (err) {
    // Silent fail - not critical
  }

  // Initialize Adaptive Model Router (deferred until after Ollama extension loads)
  // We'll initialize it lazily on first use via the extension
  console.log('💡 Model router will initialize after Ollama extension loads');

  // Build argv for pi-coding-agent: [node, script, ...extensions]
  // We must modify process.argv because pi-coding-agent reads it directly
  const originalArgv = process.argv;
  process.argv = [originalArgv[0], originalArgv[1], ...extensions];

  console.log(''); // newline before pi-coding-agent starts

  try {
    return await piMain(extensions);
  } finally {
    // Restore original argv
    process.argv = originalArgv;
  }
}

// Run if this is the main module
if (import.meta.main) {
  main();
}

export { main };
