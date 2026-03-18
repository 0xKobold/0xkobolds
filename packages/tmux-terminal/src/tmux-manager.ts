/**
 * Tmux Manager
 * 
 * Manages local tmux sessions - create, list, send keys, capture output.
 * Uses tmux binary for all operations.
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TmuxSession {
  name: string;
  id: string;
  windows: number;
  created: Date;
  attached: boolean;
  path: string;
}

export interface TmuxWindow {
  name: string;
  index: number;
  session: string;
  panes: number;
}

export interface CaptureOptions {
  session: string;
  window?: number;
  pane?: number;
  lines?: number;
}

/**
 * Check if tmux is installed
 */
export async function hasTmux(): Promise<boolean> {
  try {
    await execAsync('which tmux');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get tmux version
 */
export async function getTmuxVersion(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('tmux -V');
    const match = stdout.match(/tmux (\d+\.\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * List all tmux sessions
 */
export async function listSessions(): Promise<TmuxSession[]> {
  try {
    const { stdout } = await execAsync('tmux list-sessions -F "#{session_name}:#{session_id}:#{session_windows}:#{session_created}:#{session_attached}:#{session_path}"');
    
    if (!stdout.trim()) {
      return [];
    }

    return stdout.trim().split('\n').map(line => {
      const [name, id, windows, created, attached, path] = line.split(':');
      return {
        name,
        id: id || name,
        windows: parseInt(windows, 10) || 1,
        created: new Date(parseInt(created, 10) * 1000),
        attached: attached === '1',
        path: path || process.cwd(),
      };
    });
  } catch (error) {
    // No sessions or tmux not running
    return [];
  }
}

/**
 * Check if a session exists
 */
export async function sessionExists(name: string): Promise<boolean> {
  try {
    await execAsync(`tmux has-session -t ${escapeName(name)} 2>/dev/null`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a new tmux session
 */
export async function createSession(name: string, command?: string): Promise<TmuxSession> {
  const safeName = escapeName(name);
  const cmd = command
    ? `tmux new-session -d -s ${safeName} -c "${process.cwd()}" -- ${command}`
    : `tmux new-session -d -s ${safeName} -c "${process.cwd()}"`;
  
  await execAsync(cmd);

  // Wait a bit for session to be ready
  await new Promise(resolve => setTimeout(resolve, 100));

  const exists = await sessionExists(name);
  if (!exists) {
    throw new Error(`Failed to create session "${name}"`);
  }

  const sessions = await listSessions();
  const session = sessions.find(s => s.name === name);
  
  if (!session) {
    throw new Error(`Session "${name}" created but not found in list`);
  }

  return session;
}

/**
 * Send keys to a tmux session
 */
export async function sendKeys(session: string, keys: string, options?: { enter?: boolean; literal?: boolean }): Promise<void> {
  const safeSession = escapeName(session);
  const enterFlag = options?.enter !== false ? ' Enter' : '';
  const literalFlag = options?.literal ? ' -l' : '';
  
  // Escape special characters for shell
  const escapedKeys = keys.replace(/'/g, "'\\''");
  
  await execAsync(`tmux send-keys${literalFlag} -t ${safeSession} '${escapedKeys}'${enterFlag}`);
}

/**
 * Send a command (keys + Enter)
 */
export async function sendCommand(session: string, command: string): Promise<void> {
  await sendKeys(session, command, { enter: true });
}

/**
 * Capture pane output
 */
export async function capturePane(options: CaptureOptions): Promise<string> {
  const { session, lines = 100 } = options;
  const safeSession = escapeName(session);
  
  try {
    // -p prints to stdout, -S specifies start line (- = beginning for history)
    const { stdout } = await execAsync(`tmux capture-pane -t ${safeSession} -p -S -${lines} -E -1`);
    return stdout;
  } catch (error) {
    return '';
  }
}

/**
 * Kill a tmux session
 */
export async function killSession(name: string): Promise<void> {
  const safeName = escapeName(name);
  
  try {
    await execAsync(`tmux kill-session -t ${safeName} 2>/dev/null`);
  } catch {
    // Session might not exist
  }
}

/**
 * Rename a session
 */
export async function renameSession(oldName: string, newName: string): Promise<void> {
  const safeOldName = escapeName(oldName);
  const safeNewName = escapeName(newName);
  
  await execAsync(`tmux rename-session -t ${safeOldName} ${safeNewName}`);
}

/**
 * Attach to session (returns command to run in terminal)
 */
export function getAttachCommand(session: string): string {
  return `tmux attach -t ${escapeName(session)}`;
}

/**
 * Create session if it doesn't exist
 */
export async function ensureSession(name: string, command?: string): Promise<TmuxSession> {
  const exists = await sessionExists(name);
  
  if (exists) {
    const sessions = await listSessions();
    const session = sessions.find(s => s.name === name);
    if (session) return session;
  }
  
  return createSession(name, command);
}

/**
 * Get list of windows in a session
 */
export async function listWindows(session: string): Promise<TmuxWindow[]> {
  try {
    const { stdout } = await execAsync(`tmux list-windows -t ${escapeName(session)} -F "#{window_index}:#{window_name}:#{window_panes}"`);
    
    if (!stdout.trim()) {
      return [];
    }

    return stdout.trim().split('\n').map(line => {
      const [index, name, panes] = line.split(':');
      return {
        name,
        index: parseInt(index, 10) || 0,
        session,
        panes: parseInt(panes, 10) || 1,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Select window in session
 */
export async function selectWindow(session: string, windowIndex: number): Promise<void> {
  await execAsync(`tmux select-window -t ${escapeName(session)}:${windowIndex}`);
}

/**
 * Helper: Escape session name for shell
 */
function escapeName(name: string): string {
  // Replace problematic characters
  return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Get current working directory of session
 */
export async function getSessionPath(session: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`tmux display-message -t ${escapeName(session)} -p "#{pane_current_path}"`);
    return stdout.trim() || process.cwd();
  } catch {
    return process.cwd();
  }
}

/**
 * Resize pane
 */
export async function resizePane(session: string, direction: 'up' | 'down' | 'left' | 'right', amount: number = 5): Promise<void> {
  const resizeFlags = {
    up: '-U',
    down: '-D',
    left: '-L',
    right: '-R',
  };
  
  await execAsync(`tmux resize-pane -t ${escapeName(session)} ${resizeFlags[direction]} ${amount}`);
}

export default {
  hasTmux,
  getTmuxVersion,
  listSessions,
  sessionExists,
  createSession,
  sendKeys,
  sendCommand,
  capturePane,
  killSession,
  renameSession,
  getAttachCommand,
  ensureSession,
  listWindows,
  selectWindow,
  getSessionPath,
  resizePane,
};