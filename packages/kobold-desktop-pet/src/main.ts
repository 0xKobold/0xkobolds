/**
 * Kobold Desktop Familiar - Electron Main Process
 *
 * A 3D animated desktop familiar using VRM avatars with Mixamo animations.
 * Connects to 0xKobold gateway as a "node" - making it an embodied interface
 * for the agent. The familiar is a "body" for the AI to inhabit.
 */

import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { FamiliarNode, type FamiliarState } from './gateway/familiar-node';

// Configuration
const CONFIG = {
  width: 200,
  height: 200,
  gatewayUrl: process.env.GATEWAY_URL || 'ws://localhost:7777',
  agentApiUrl: 'http://localhost:3456/api/agent-state'
};

// State
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let stayOnTop = true;
let familiarNode: FamiliarNode | null = null;
let pollingInterval: NodeJS.Timeout | null = null;

// Agent state from 0xKobold
interface AgentState {
  status: 'idle' | 'working' | 'thinking' | 'sleeping' | 'walking' | 'cheering';
  task: string | null;
  lastActivity: number;
}

let agentState: AgentState = {
  status: 'idle',
  task: null,
  lastActivity: Date.now()
};

/**
 * Create the floating pet window
 */
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: CONFIG.width,
    height: CONFIG.height,
    x: width - CONFIG.width - 50,
    y: height - CONFIG.height - 50,
    frame: false,
    transparent: true,
    alwaysOnTop: stayOnTop,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enablePreferredSizeMode: true
    },
  });

  // Load the renderer
  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

  // Set up IPC handlers for pet events from renderer
  mainWindow.webContents.on('did-finish-load', () => {
    // Send initial state to renderer
    mainWindow?.webContents.send('agent-state', agentState);
  });

  // Link the window to the familiar node
  if (familiarNode) {
    familiarNode.setWindow(mainWindow);
  }

  // Prevent closing, minimize to tray instead
  mainWindow.on('close', (e) => {
    if (tray) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create system tray icon
  createTray();
}

/**
 * Create system tray icon
 */
function createTray() {
  // Create a simple 16x16 kobold face icon
  const iconSize = 16;
  const icon = nativeImage.createFromBuffer(
    Buffer.from(`<svg width="${iconSize}" height="${iconSize}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="8" cy="8" r="7" fill="#10b981" stroke="#059669" stroke-width="1"/>
      <circle cx="5" cy="6" r="1.5" fill="#1a1a2e"/>
      <circle cx="11" cy="6" r="1.5" fill="#1a1a2e"/>
      <path d="M 4 10 Q 8 13 12 10" stroke="#1a1a2e" stroke-width="1" fill="none"/>
    </svg>`),
    { width: iconSize, height: iconSize }
  );

  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  // Initial menu (will be updated when gateway connects)
  const contextMenu = Menu.buildFromTemplate([
    { label: '○ Connecting...', enabled: false },
    { type: 'separator' },
    { label: 'Show Pet', click: () => mainWindow?.show() },
    { label: 'Hide Pet', click: () => mainWindow?.hide() },
    { type: 'separator' },
    { label: 'Stay on Top', type: 'checkbox' as const, checked: stayOnTop, click: toggleStayOnTop },
    { type: 'separator' },
    { label: 'Reset Position', click: resetPosition },
    { type: 'separator' },
    { label: 'Quit', click: () => {
      familiarNode?.disconnect();
      tray?.destroy();
      app.quit();
    }}
  ]);

  tray.setToolTip('Kobold Familiar');
  tray.setContextMenu(contextMenu);

  // Click to show window
  tray.on('click', () => {
    mainWindow?.show();
  });
}

/**
 * Toggle stay-on-top window state
 */
function toggleStayOnTop() {
  stayOnTop = !stayOnTop;
  mainWindow?.setAlwaysOnTop(stayOnTop);

  // Update tray menu
  if (tray) {
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Show Pet', click: () => mainWindow?.show() },
      { label: 'Hide Pet', click: () => mainWindow?.hide() },
      { type: 'separator' },
      { label: 'Stay on Top', type: 'checkbox', checked: stayOnTop, click: toggleStayOnTop },
      { type: 'separator' },
      { label: 'Reset Position', click: resetPosition },
      { type: 'separator' },
      { label: 'Quit', click: () => {
        tray?.destroy();
        app.quit();
      }}
    ]);
    tray.setContextMenu(contextMenu);
  }
}

/**
 * Reset window to default position (bottom-right)
 */
function resetPosition() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  mainWindow?.setPosition(width - CONFIG.width - 50, height - CONFIG.height - 50);
}

/**
 * Connect to 0xKobold gateway as a node
 * This makes the familiar a "body" for the AI agent
 */
async function connectToGateway() {
  if (familiarNode) {
    console.log('[Main] Already connected to gateway');
    return;
  }

  familiarNode = new FamiliarNode(CONFIG.gatewayUrl);

  // Link the window if already created
  if (mainWindow) {
    familiarNode.setWindow(mainWindow);
  }

  // When agent sets state, forward to renderer
  familiarNode.onAgentMessage((message) => {
    agentState = {
      status: message.status as AgentState['status'],
      task: message.task || null,
      lastActivity: Date.now()
    };
    mainWindow?.webContents.send('agent-state', agentState);
  });

  // When familiar state changes (for debugging)
  familiarNode.onStateChange((state) => {
    console.log('[Main] Familiar state:', state);
  });

  try {
    await familiarNode.connect();
    console.log('[Main] Connected to gateway as node:', familiarNode.getNodeId());

    // Stop HTTP polling since we're using gateway
    stopPolling();

    // Update tray to show connected
    updateTrayMenu(true);
  } catch (error) {
    console.error('[Main] Failed to connect to gateway:', error);
    // Update tray to show disconnected
    updateTrayMenu(false);
    // Fallback to HTTP polling if gateway unavailable
    startPolling();
  }
}

/**
 * Start HTTP polling as fallback
 */
function startPolling() {
  // Clear any existing polling interval
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
  
  console.log('[Main] Starting HTTP polling for agent state');
  pollAgentState();
  pollingInterval = setInterval(pollAgentState, 2000);
}

/**
 * Stop HTTP polling
 */
function stopPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

/**
 * Poll 0xKobold for agent state (fallback)
 */
async function pollAgentState() {
  if (familiarNode?.isConnected()) {
    // Using gateway, skip HTTP polling
    return;
  }

  try {
    const response = await fetch(CONFIG.agentApiUrl);
    if (response.ok) {
      const data = await response.json();
      agentState = {
        status: data.status || 'idle',
        task: data.task || null,
        lastActivity: Date.now()
      };
      mainWindow?.webContents.send('agent-state', agentState);
    } else {
      // No response, default to idle
      agentState = { status: 'idle', task: null, lastActivity: Date.now() };
      mainWindow?.webContents.send('agent-state', agentState);
    }
  } catch (error) {
    // Connection failed, assume idle
    agentState = { status: 'idle', task: null, lastActivity: Date.now() };
    mainWindow?.webContents.send('agent-state', agentState);
  }
}

/**
 * Update tray menu to reflect connection status
 */
function updateTrayMenu(connected: boolean) {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    { label: connected ? '● Connected' : '○ Disconnected', enabled: false },
    { type: 'separator' },
    { label: 'Show Pet', click: () => mainWindow?.show() },
    { label: 'Hide Pet', click: () => mainWindow?.hide() },
    { type: 'separator' },
    { label: 'Stay on Top', type: 'checkbox' as const, checked: stayOnTop, click: toggleStayOnTop },
    { type: 'separator' },
    { label: 'Reset Position', click: resetPosition },
    { label: 'Reconnect to Gateway', click: connectToGateway, enabled: !connected },
    { type: 'separator' },
    { label: 'Quit', click: () => {
      familiarNode?.disconnect();
      tray?.destroy();
      app.quit();
    }}
  ]);

  tray.setContextMenu(contextMenu);
}

/**
 * Setup IPC handlers
 */
function setupIPC() {
  // Get current agent state
  ipcMain.handle('get-agent-state', () => agentState);

  // Drag movement
  ipcMain.on('drag-move', (event, dx: number, dy: number) => {
    if (!mainWindow) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + dx, y + dy);
  });

  // Position setting
  ipcMain.on('set-position', (event, x: number, y: number) => {
    mainWindow?.setPosition(Math.round(x), Math.round(y));
  });

  // Show/hide window
  ipcMain.on('show-window', () => mainWindow?.show());
  ipcMain.on('hide-window', () => mainWindow?.hide());

  // Reset position
  ipcMain.on('reset-position', resetPosition);

  // Toggle stay on top
  ipcMain.on('toggle-stay-on-top', toggleStayOnTop);

  // Quit application
  ipcMain.on('quit', () => {
    familiarNode?.disconnect();
    tray?.destroy();
    app.quit();
  });

  // Familiar events from renderer - forward to gateway
  ipcMain.on('familiar-event', (_event, data: { type: string; data: unknown }) => {
    if (familiarNode && familiarNode.isConnected()) {
      familiarNode.getClient().sendEvent(`familiar.${data.type}`, data.data);
    }
  });

  // Familiar state updates from renderer
  ipcMain.on('familiar-state', (_event, data: FamiliarState) => {
    // Could sync state back to gateway if needed
    console.log('[Main] Familiar state update:', data);
  });
}

/**
 * Application entry point
 */
app.whenReady().then(() => {
  createWindow();
  setupIPC();

  // Connect to gateway (makes pet a "body" for the agent)
  connectToGateway();
});

//macOS specific
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle certificate errors (for development)
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // Prevent certificate error for local development
  if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// Clean up on quit
app.on('will-quit', () => {
  stopPolling();
  familiarNode?.disconnect();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});