/**
 * Self-Update Extension for 0xKobold
 *
 * Manages updates for 0xKobold itself from git repository
 * Workflow:
 * 1. Check git remote for new tags/commits
 * 2. Compare with current HEAD
 * 3. Offer to pull and restart
 */

import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SELF_UPDATE_FILE = join(homedir(), '.0xkobold', '.self-update-pending');

interface SelfUpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  changelog?: string;
}

async function checkForSelfUpdate(): Promise<SelfUpdateInfo> {
  try {
    // Get current version from package.json
    const packageJson = await Bun.file('package.json').json();
    const currentVersion = packageJson.version;

    // Fetch latest tags from git
    const fetchProc = Bun.spawn(['git', 'fetch', '--tags'], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    await fetchProc.exited;

    // Get latest tag
    const tagProc = Bun.spawn(['git', 'describe', '--tags', '--abbrev=0'], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const exitCode = await tagProc.exited;
    if (exitCode !== 0) {
      // No tags found - check git log for commits instead
      const logProc = Bun.spawn(['git', 'log', '--oneline', 'HEAD..origin/main'], {
        cwd: process.cwd(),
        stdout: 'pipe',
        stderr: 'pipe',
      });

      const commitsBehind = (await new Response(logProc.stdout).text()).trim();
      const hasCommits = commitsBehind.length > 0;

      return {
        hasUpdate: hasCommits,
        currentVersion,
        latestVersion: hasCommits ? 'new-commits-available' : currentVersion,
      };
    }

    const latestTag = (await new Response(tagProc.stdout).text()).trim();

    // Compare versions (simple semver comparison)
    return {
      hasUpdate: latestTag !== `v${currentVersion}` && latestTag !== currentVersion,
      currentVersion,
      latestVersion: latestTag.replace(/^v/, ''),
    };
  } catch {
    return { hasUpdate: false, currentVersion: 'unknown', latestVersion: 'unknown' };
  }
}

async function performSelfUpdate(targetVersion: string): Promise<boolean> {
  try {
    // Stash any local changes
    await Bun.spawn(['git', 'stash'], { cwd: process.cwd() }).exited;

    // Pull latest
    const pullProc = Bun.spawn(['git', 'pull', 'origin', 'main'], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const exitCode = await pullProc.exited;

    if (exitCode !== 0) {
      return false;
    }

    // Reinstall dependencies
    const installProc = Bun.spawn(['bun', 'install'], {
      cwd: process.cwd(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const installExit = await installProc.exited;

    return installExit === 0;
  } catch {
    return false;
  }
}

async function restartApplication(): Promise<void> {
  console.log('[SelfUpdate] Restarting application...');
  await new Promise(r => setTimeout(r, 500));

  const proc = Bun.spawn(['bun', 'run', 'src/index.ts'], {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });

  proc.unref?.();
  process.exit(0);
}

export default function selfUpdateExtension(pi: ExtensionAPI) {
  const checkOnStartup = pi.getFlag('self-update-check') as boolean | undefined ?? true;

  // Register flags
  pi.registerFlag('self-update-check', {
    description: 'Check for 0xKobold updates on startup',
    type: 'boolean',
    default: true,
  });

  async function checkAndNotify(): Promise<void> {
    const { hasUpdate, currentVersion, latestVersion } = await checkForSelfUpdate();

    if (!hasUpdate) {
      console.log('[SelfUpdate] 0xKobold is up to date');
      return;
    }

    console.log(`[SelfUpdate] Update available: ${latestVersion} (current: ${currentVersion})`);

    // Store update info for commands to access
    // @ts-ignore
    pi.__selfUpdateInfo = { hasUpdate: true, currentVersion, latestVersion };
  }

  // Check on session start - only in main process
  if (checkOnStartup) {
    pi.on('session_start', async (_event, ctx) => {
      // Skip in subagent sessions
      const isSubagent = process.env.KOBOLD_SUBAGENT === 'true' || process.env.PI_SESSION_PARENT;
      if (isSubagent) {
        return;
      }
      // Skip if running with command flags (non-interactive)
      const args = process.argv.slice(2);
      if (args.includes('--command') || args.includes('-c')) {
        return;
      }

      // Delay to let UI initialize
      setTimeout(async () => {
        const { hasUpdate, latestVersion } = await checkForSelfUpdate();
        
        if (hasUpdate && ctx.ui?.notify) {
          ctx.ui.notify(
            `🐉 0xKobold update available: ${latestVersion}\nRun /self-update:install to update`,
            'info'
          );
        }
      }, 5000);
    });
  }

  // Register commands
  pi.registerCommand('self-update:check', {
    description: 'Check for 0xKobold updates',
    handler: async (_args, ctx) => {
      await checkAndNotify();
      // Check stored info
      // @ts-ignore
      const info = pi.__selfUpdateInfo;
      if (info?.hasUpdate) {
        ctx.ui.notify(`🐉 Update available: ${info.latestVersion}\nRun /self-update:install to update`, 'info');
      } else {
        ctx.ui.notify('✅ 0xKobold is up to date', 'info');
      }
    },
  });

  pi.registerCommand('self-update:install', {
    description: 'Install 0xKobold update and restart',
    handler: async (_args, ctx) => {
      const { hasUpdate, latestVersion } = await checkForSelfUpdate();

      if (!hasUpdate) {
        ctx.ui.notify('✅ No updates available', 'info');
        return;
      }

      ctx.ui.notify(`🔄 Updating to ${latestVersion}...`, 'info');

      const success = await performSelfUpdate(latestVersion);

      if (success) {
        ctx.ui.notify('✅ Update complete. Restarting...', 'info');
        await restartApplication();
      } else {
        ctx.ui.notify('❌ Update failed. Check console for errors.', 'error');
      }
    },
  });

  console.log('[SelfUpdate] Extension loaded');
}
