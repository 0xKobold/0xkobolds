/**
 * 0xKobold Terminal - Renderer
 * 
 * Main application logic for the terminal UI
 */

// State
let sessions = [];
let currentSession = null;
let connectionStatus = 'disconnected';

// DOM Elements
const connectionStatusEl = document.getElementById('connection-status');
const sessionTabsEl = document.getElementById('session-tabs');
const welcomeScreen = document.getElementById('welcome-screen');
const attachedSession = document.getElementById('attached-session');
const currentSessionNameEl = document.getElementById('current-session-name');
const currentSessionPathEl = document.getElementById('current-session-path');
const attachCommandEl = document.getElementById('attach-command');
const statusMessageEl = document.getElementById('status-message');
const sessionCountEl = document.getElementById('session-count');
const errorContainer = document.getElementById('error-container');
const errorMessageEl = document.getElementById('error-message');
const newSessionDialog = document.getElementById('new-session-dialog');
const newSessionForm = document.getElementById('new-session-form');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Check connection
  await checkConnection();

  // Load sessions
  await loadSessions();

  // Set up event listeners
  setupEventListeners();
});

// ============================================================================
// API Functions
// ============================================================================

async function checkConnection() {
  try {
    const connected = await window.tmuxAPI.isConnected();
    setConnectionStatus(connected ? 'connected' : 'disconnected');
  } catch (error) {
    setConnectionStatus('disconnected');
    showError('Failed to check connection: ' + error.message);
  }
}

async function loadSessions() {
  try {
    const result = await window.tmuxAPI.listSessions();
    if (result.success) {
      sessions = result.sessions || [];
      renderSessionTabs();
      updateSessionCount();
    } else {
      showError(result.error || 'Failed to load sessions');
    }
  } catch (error) {
    showError('Failed to load sessions: ' + error.message);
  }
}

async function createSession(name, command) {
  try {
    const result = await window.tmuxAPI.createSession(name, command);
    if (result.success) {
      sessions.push(result.session);
      renderSessionTabs();
      updateSessionCount();
      selectSession(result.session.name);
      hideDialog();
    } else {
      showError(result.error || 'Failed to create session');
    }
  } catch (error) {
    showError('Failed to create session: ' + error.message);
  }
}

async function killSession(name) {
  try {
    const result = await window.tmuxAPI.killSession(name);
    if (result.success) {
      sessions = sessions.filter(s => s.name !== name);
      renderSessionTabs();
      updateSessionCount();
      if (currentSession === name) {
        currentSession = null;
        showWelcomeScreen();
      }
    } else {
      showError(result.error || 'Failed to kill session');
    }
  } catch (error) {
    showError('Failed to kill session: ' + error.message);
  }
}

async function reconnect() {
  setConnectionStatus('connecting');
  try {
    const result = await window.tmuxAPI.reconnect();
    if (result.success) {
      setConnectionStatus('connected');
      await loadSessions();
    } else {
      setConnectionStatus('disconnected');
      showError(result.error || 'Failed to reconnect');
    }
  } catch (error) {
    setConnectionStatus('disconnected');
    showError('Failed to reconnect: ' + error.message);
  }
}

// ============================================================================
// UI Functions
// ============================================================================

function setConnectionStatus(status) {
  connectionStatus = status;
  connectionStatusEl.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  connectionStatusEl.className = 'status ' + status;
}

function renderSessionTabs() {
  sessionTabsEl.innerHTML = '';

  sessions.forEach(session => {
    const tab = document.createElement('button');
    tab.className = 'session-tab';
    if (session.name === currentSession) {
      tab.classList.add('active');
    }
    if (session.attached) {
      tab.classList.add('attached');
    }
    tab.textContent = session.name;
    tab.title = `Path: ${session.path}`;
    tab.addEventListener('click', () => selectSession(session.name));
    tab.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showSessionContextMenu(session.name, e);
    });
    sessionTabsEl.appendChild(tab);
  });
}

function selectSession(name) {
  currentSession = name;
  renderSessionTabs();

  // Get session info
  const session = sessions.find(s => s.name === name);
  if (session) {
    showAttachedSession(session);
  }
}

async function showAttachedSession(session) {
  welcomeScreen.classList.add('hidden');
  attachedSession.classList.remove('hidden');

  currentSessionNameEl.textContent = session.name;
  currentSessionPathEl.textContent = session.path;

  // Get attach command
  const result = await window.tmuxAPI.getAttachCommand(session.name);
  attachCommandEl.textContent = result.command;
}

function showWelcomeScreen() {
  welcomeScreen.classList.remove('hidden');
  attachedSession.classList.add('hidden');
}

function updateSessionCount() {
  const count = sessions.length;
  sessionCountEl.textContent = `${count} session${count !== 1 ? 's' : ''}`;
}

function showError(message) {
  errorMessageEl.textContent = message;
  errorContainer.classList.remove('hidden');
  setTimeout(() => {
    errorContainer.classList.add('hidden');
  }, 5000);
}

function hideError() {
  errorContainer.classList.add('hidden');
}

function showDialog() {
  newSessionDialog.showModal();
}

function hideDialog() {
  newSessionDialog.close();
  newSessionForm.reset();
}

function showSessionContextMenu(name, event) {
  // For now, just use a simple confirm dialog
  if (confirm(`Kill session "${name}"?`)) {
    killSession(name);
  }
}

function copyAttachCommand() {
  const command = attachCommandEl.textContent;
  navigator.clipboard.writeText(command).then(() => {
    statusMessageEl.textContent = 'Command copied to clipboard';
    setTimeout(() => {
      statusMessageEl.textContent = 'Ready';
    }, 2000);
  });
}

// ============================================================================
// Event Listeners
// ============================================================================

function setupEventListeners() {
  // Reconnect button
  document.getElementById('reconnect-btn').addEventListener('click', reconnect);

  // New session button
  document.getElementById('new-session-btn').addEventListener('click', showDialog);
  document.getElementById('quick-create-btn').addEventListener('click', showDialog);

  // Cancel new session
  document.getElementById('cancel-new-session').addEventListener('click', hideDialog);

  // New session form
  newSessionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('session-name').value.trim();
    const command = document.getElementById('session-command').value.trim() || undefined;
    if (name) {
      await createSession(name, command);
    }
  });

  // Dismiss error
  document.getElementById('dismiss-error').addEventListener('click', hideError);

  // Copy command button
  document.getElementById('copy-command-btn').addEventListener('click', copyAttachCommand);

  // IPC events from main process
  window.tmuxAPI.onSessionsUpdate((updated) => {
    sessions = updated;
    renderSessionTabs();
    updateSessionCount();
  });

  window.tmuxAPI.onSessionCreated((session) => {
    sessions.push(session);
    renderSessionTabs();
    updateSessionCount();
  });

  window.tmuxAPI.onSessionKilled((name) => {
    sessions = sessions.filter(s => s.name !== name);
    renderSessionTabs();
    updateSessionCount();
    if (currentSession === name) {
      currentSession = null;
      showWelcomeScreen();
    }
  });

  window.tmuxAPI.onError((error) => {
    showError(error.message);
  });

  window.tmuxAPI.onEvent((event) => {
    console.log('[Event]', event);
  });
}