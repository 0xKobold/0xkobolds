/**
 * Tmux Terminal - Electron Main Process
 *
 * Creates a desktop terminal app that:
 * 1. Connects to the 0xKobold gateway
 * 2. Manages tmux sessions
 * 3. Displays sessions with tabs
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { TmuxNode } from './tmux-node.js';
import {
  listSessions,
  createSession,
  killSession,
  sessionExists,
  hasTmux,
} from './tmux-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let tmuxNode: TmuxNode | null = null;

/**
 * Create the main window
 */
function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: '🐉 0xKobold Terminal',
    backgroundColor: '#1a1a2e',
    show: false,
    webPreferences: {
      preload: resolve(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the renderer
  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(resolve(__dirname, 'renderer', 'index.html'));
  }

  // Show when ready
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // Handle external links
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

/**
 * Initialize the app
 */
async function initialize(): Promise<void> {
  // Check for tmux
  const tmuxAvailable = await hasTmux();
  if (!tmuxAvailable) {
    console.error('tmux is not installed. Please install tmux first.');
    app.quit();
    return;
  }

  // Create window
  mainWindow = createWindow();

  // Connect to gateway
  const gatewayUrl = process.env.GATEWAY_URL || 'ws://localhost:7777';
  console.log(`[Main] Connecting to gateway at ${gatewayUrl}`);

  tmuxNode = new TmuxNode({
    name: 'tmux-terminal',
    gatewayUrl,
  });

  // Set up event handlers
  tmuxNode.onEvent((event, data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tmux:event', { event, data });
    }
  });

  try {
    await tmuxNode.connect();
    console.log('[Main] Connected to gateway');

    // Send initial session list
    const sessions = await listSessions();
    mainWindow?.webContents.send('tmux:sessions', sessions);
  } catch (error) {
    console.error('[Main] Failed to connect to gateway:', error);
    mainWindow?.webContents.send('tmux:error', {
      message: `Failed to connect to gateway: ${gatewayUrl}`,
    });
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

/**
 * Get available sessions
 */
ipcMain.handle('tmux:list', async () => {
  try {
    const sessions = await listSessions();
    return { success: true, sessions };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
});

/**
 * Create a new session
 */
ipcMain.handle('tmux:create', async (_, name: string, command?: string) => {
  try {
    const session = await createSession(name, command);
    mainWindow?.webContents.send('tmux:session-created', session);
    return { success: true, session };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
});

/**
 * Kill a session
 */
ipcMain.handle('tmux:kill', async (_, name: string) => {
  try {
    await killSession(name);
    mainWindow?.webContents.send('tmux:session-killed', name);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
});

/**
 * Attach to session (returns command for renderer)
 */
ipcMain.handle('tmux:attach-command', async (_, name: string) => {
  return { command: `tmux attach -t ${name}` };
});

/**
 * Check connection status
 */
ipcMain.handle('tmux:connected', () => {
  return tmuxNode?.isReady() ?? false;
});

/**
 * Reconnect to gateway
 */
ipcMain.handle('tmux:reconnect', async () => {
  if (tmuxNode) {
    try {
      await tmuxNode.disconnect();
      await tmuxNode.connect();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }
  return { success: false, error: 'Not initialized' };
});

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(initialize).catch(error => {
  console.error('[Main] Initialization failed:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    mainWindow = createWindow();
  }
});

app.on('before-quit', async () => {
  if (tmuxNode) {
    await tmuxNode.disconnect();
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', error => {
  console.error('[Main] Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Main] Unhandled rejection at:', promise, 'reason:', reason);
});