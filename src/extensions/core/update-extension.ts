/**
 * Auto-Update Extension for 0xKobold
 *
 * Checks for pi-coding-agent updates with safe "install on next launch" workflow
 *
 * Workflow:
 * 1. Check for updates on startup
 * 2. If update available, store pending update info
 * 3. On next launch, prompt user to install (if auto-install-next-launch is enabled)
 * 4. Install and auto-restart if user confirms
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PACKAGE_NAME = '@mariozechner/pi-coding-agent';
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // Check once per hour

// Persistent state file for pending updates
const KOBOLD_DIR = join(homedir(), '.0xkobold');
const PENDING_UPDATE_FILE = join(KOBOLD_DIR, '.pending-update');

interface UpdateInfo {
  hasUpdate: boolean;
  latestVersion: string;
  currentVersion: string;
}

interface PendingUpdate {
  version: string;
  previousVersion: string;
  detectedAt: string;
}

async function getCurrentVersion(): Promise<string> {
  try {
    // Read from package.json
    const packageJson = await Bun.file('package.json').json();
    const depVersion = packageJson.dependencies?.[PACKAGE_NAME] as string | undefined;
    const devDepVersion = packageJson.devDependencies?.[PACKAGE_NAME] as string | undefined;
    const version = depVersion || devDepVersion || '0.55.4';
    // Remove ^ or ~ prefix
    return version.replace(/^[\^~]/, '');
  } catch {
    return '0.55.4';
  }
}

async function checkForUpdates(): Promise<UpdateInfo> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json() as { version: string };
    const latestVersion = data.version;
    const currentVersion = await getCurrentVersion();

    // Compare versions (simple string comparison, could be improved with semver)
    return {
      hasUpdate: latestVersion !== currentVersion,
      latestVersion,
      currentVersion,
    };
  } catch (err) {
    console.log('[Update] Failed to check for updates:', err instanceof Error ? err.message : String(err));
    return { hasUpdate: false, latestVersion: '', currentVersion: '' };
  }
}

async function installUpdate(version: string): Promise<boolean> {
  console.log(`[Update] Installing ${PACKAGE_NAME}@${version}...`);

  try {
    // Try local install first
    const proc = Bun.spawn(['bun', 'install', `${PACKAGE_NAME}@${version}`], {
      stdout: 'pipe',
      stderr: 'pipe',
      cwd: process.cwd(),
    });

    const exitCode = await proc.exited;

    if (exitCode === 0) {
      console.log('[Update] Successfully installed update');
      return true;
    }

    // Read stderr for error details
    const stderr = await new Response(proc.stderr).text();
    console.error('[Update] Install failed:', stderr);
    return false;
  } catch (err) {
    console.error('[Update] Install error:', err instanceof Error ? err.message : String(err));
    return false;
  }
}

// Store pending update info
async function storePendingUpdate(version: string, previousVersion: string): Promise<void> {
  try {
    if (!existsSync(KOBOLD_DIR)) {
      mkdirSync(KOBOLD_DIR, { recursive: true });
    }
    const pending: PendingUpdate = {
      version,
      previousVersion,
      detectedAt: new Date().toISOString(),
    };
    await Bun.write(PENDING_UPDATE_FILE, JSON.stringify(pending, null, 2));
  } catch (err) {
    console.error('[Update] Failed to store pending update:', err);
  }
}

// Read pending update info
async function readPendingUpdate(): Promise<PendingUpdate | null> {
  try {
    if (!existsSync(PENDING_UPDATE_FILE)) {
      return null;
    }
    const content = await Bun.file(PENDING_UPDATE_FILE).text();
    return JSON.parse(content) as PendingUpdate;
  } catch {
    return null;
  }
}

// Clear pending update
async function clearPendingUpdate(): Promise<void> {
  try {
    if (existsSync(PENDING_UPDATE_FILE)) {
      await Bun.file(PENDING_UPDATE_FILE).delete();
    }
  } catch {
    // Ignore cleanup errors
  }
}

// Restart the application
async function restartApplication(): Promise<void> {
  console.log('[Update] Restarting application...');

  // Give a moment for logs to flush
  await new Promise(r => setTimeout(r, 500));

  // Spawn a new process and exit this one
  const proc = Bun.spawn(['bun', 'run', 'src/index.ts'], {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  // Unref so parent can exit
  proc.unref?.();

  // Exit current process
  process.exit(0);
}

export default function updateExtension(pi: ExtensionAPI) {
  // Use flags for configuration
  const checkOnStartup = pi.getFlag('update-check-on-startup') as boolean | undefined ?? true;
  const autoInstall = pi.getFlag('update-auto-install') as boolean | undefined ?? false;
  const autoInstallNextLaunch = pi.getFlag('update-auto-install-next-launch') as boolean | undefined ?? true;

  let lastCheckTime = 0;

  // Register flags for configuration
  pi.registerFlag('update-check-on-startup', {
    description: 'Check for updates on startup',
    type: 'boolean',
    default: true,
  });

  pi.registerFlag('update-auto-install', {
    description: 'Auto-install updates immediately when available (not recommended)',
    type: 'boolean',
    default: false,
  });

  pi.registerFlag('update-auto-install-next-launch', {
    description: 'Prompt to install updates on next launch (recommended)',
    type: 'boolean',
    default: true,
  });

  // Check for pending updates on startup FIRST (before checking for new updates)
  pi.on('session_start', async () => {
    const pending = await readPendingUpdate();

    if (pending) {
      // We have a pending update from last time
      const currentVersion = await getCurrentVersion();

      // Check if it's already installed (version matches)
      if (currentVersion === pending.version) {
        console.log(`[Update] Already updated to ${pending.version}`);
        await clearPendingUpdate();
      } else if (autoInstallNextLaunch) {
        // Prompt user to install on this launch
        pi.sendMessage({
          customType: 'update.pending',
          content: [{
            type: 'text',
            text: `📦 Update ready: ${pending.version} (current: ${currentVersion})\n\nRun /update:install to install and restart, or /update:skip to skip this update.`
          }],
          display: {
            type: 'text',
            text: `⏳ Update ready: ${pending.version} - /update:install to apply`
          },
          details: { pending, currentVersion },
        });
        console.log(`[Update] Pending update available: ${pending.version}. Run /update:install to apply.`);
      }
    }
  });

  async function performUpdateCheck(force: boolean = false): Promise<void> {
    const now = Date.now();
    if (!force && now - lastCheckTime < CHECK_INTERVAL_MS) {
      return; // Too soon since last check
    }
    lastCheckTime = now;

    const { hasUpdate, latestVersion, currentVersion } = await checkForUpdates();

    if (!hasUpdate) {
      console.log('[Update] Already on latest version');
      // Clear any stale pending updates
      await clearPendingUpdate();
      return;
    }

    console.log(`[Update] New version available: ${latestVersion} (current: ${currentVersion})`);

    if (autoInstall) {
      // Immediate install (not recommended - interrupts workflow)
      pi.sendMessage({
        customType: 'update.installing',
        content: [{ type: 'text', text: `Installing update to ${latestVersion}...` }],
        display: { type: 'text', text: `Installing update to ${latestVersion}...` },
        details: { latestVersion, currentVersion },
      });

      const success = await installUpdate(latestVersion);

      if (success) {
        pi.sendMessage({
          customType: 'update.installed',
          content: [{ type: 'text', text: `Updated to ${latestVersion}. Please restart to apply changes.` }],
          display: { type: 'text', text: `Updated to ${latestVersion}! Restart required.` },
          details: { version: latestVersion, requiresRestart: true },
        });
      } else {
        pi.sendMessage({
          customType: 'update.failed',
          content: [{ type: 'text', text: `Failed to install update ${latestVersion}. Check console for details.` }],
          display: { type: 'text', text: `Update failed. See logs.` },
          details: { latestVersion, currentVersion },
        });
      }
    } else {
      // Store for next launch (recommended approach)
      await storePendingUpdate(latestVersion, currentVersion);

      pi.sendMessage({
        customType: 'update.available',
        content: [{
          type: 'text',
          text: `Update available: ${latestVersion} (current: ${currentVersion})\n\nThe update will be applied on your next launch (or run /update:install now).`
        }],
        display: { type: 'text', text: `Update: ${latestVersion} → next launch` },
        details: { latestVersion, currentVersion, deferred: true },
      });
      console.log(`[Update] Update ${latestVersion} will be available on next launch`);
    }
  }

  // Check on session start (with a delay to not block startup)
  if (checkOnStartup) {
    pi.on('session_start', async () => {
      setTimeout(async () => {
        await performUpdateCheck(true);
      }, 5000); // Wait 5 seconds after startup
    });
  }

  // Register update:check command
  pi.registerCommand('update:check', {
    description: 'Check for pi-coding-agent updates',
    execute: async () => {
      await performUpdateCheck(true);
    },
  });

  // Register update:install command (install pending update and restart)
  pi.registerCommand('update:install', {
    description: 'Install pending update and restart',
    execute: async () => {
      const pending = await readPendingUpdate();

      if (!pending) {
        // Check for updates first
        const { hasUpdate, latestVersion } = await checkForUpdates();
        if (!hasUpdate) {
          pi.sendMessage({
            customType: 'update.none',
            content: [{ type: 'text', text: 'No updates available.' }],
            display: { type: 'text', text: 'No updates available' },
          });
          return;
        }

        // Install immediately
        pi.sendMessage({
          customType: 'update.installing',
          content: [{ type: 'text', text: `Installing ${latestVersion}...` }],
          display: { type: 'text', text: `Installing ${latestVersion}...` },
        });

        const success = await installUpdate(latestVersion);
        if (success) {
          await clearPendingUpdate();
          pi.sendMessage({
            customType: 'update.restarting',
            content: [{ type: 'text', text: 'Update installed. Restarting...' }],
            display: { type: 'text', text: 'Restarting...' },
          });
          await restartApplication();
        } else {
          pi.sendMessage({
            customType: 'update.failed',
            content: [{ type: 'text', text: 'Update failed. Check console.' }],
            display: { type: 'text', text: 'Update failed' },
          });
        }
        return;
      }

      // Install pending update
      pi.sendMessage({
        customType: 'update.installing',
        content: [{ type: 'text', text: `Installing ${pending.version}...` }],
        display: { type: 'text', text: `Installing ${pending.version}...` },
      });

      const success = await installUpdate(pending.version);
      if (success) {
        await clearPendingUpdate();
        pi.sendMessage({
          customType: 'update.restarting',
          content: [{ type: 'text', text: 'Update installed. Restarting...' }],
          display: { type: 'text', text: 'Restarting...' },
        });
        await restartApplication();
      } else {
        pi.sendMessage({
          customType: 'update.failed',
          content: [{ type: 'text', text: 'Update failed. Check console.' }],
          display: { type: 'text', text: 'Update failed' },
        });
      }
    },
  });

  // Register update:skip command (skip pending update)
  pi.registerCommand('update:skip', {
    description: 'Skip the pending update',
    execute: async () => {
      const pending = await readPendingUpdate();
      if (pending) {
        await clearPendingUpdate();
        pi.sendMessage({
          customType: 'update.skipped',
          content: [{ type: 'text', text: `Skipped update to ${pending.version}` }],
          display: { type: 'text', text: `Update skipped` },
        });
        console.log(`[Update] Skipped update to ${pending.version}`);
      } else {
        pi.sendMessage({
          customType: 'update.none',
          content: [{ type: 'text', text: 'No pending update to skip.' }],
          display: { type: 'text', text: 'No pending update' },
        });
      }
    },
  });

  console.log('[Update] Extension loaded (check: ' + (checkOnStartup ? 'on' : 'off') +
              ', immediate-install: ' + (autoInstall ? 'on' : 'off') +
              ', next-launch: ' + (autoInstallNextLaunch ? 'on' : 'off') + ')');
}
