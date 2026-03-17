// Kobold Desktop Familiar - Main Renderer
// Handles movement, animation, and context awareness

const { ipcRenderer } = require('electron');

// Dragon state
let currentState = 'idle';
let currentTask = null;
let isDragging = false;
let mouseX = 0, mouseY = 0;
let windowX = 0, windowY = 0;

// Movement system
let targetX = null;
let targetY = null;
let isWalking = false;
let walkSpeed = 2;

// Screen bounds
let screenWidth = 1920;
let screenHeight = 1080;

// Initialize the dragon
function init() {
  // Get screen dimensions
  const { width, height } = require('electron').screen.getPrimaryDisplay().workAreaSize;
  screenWidth = width;
  screenHeight = height;
  
  // Start at bottom-right corner
  const container = document.getElementById('dragon-container');
  
  // Set up dragging
  container.addEventListener('mousedown', startDrag);
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', endDrag);
  
  // Start animation loop
  requestAnimationFrame(animate);
  
  // Start movement loop (random walking)
  setInterval(randomWalk, 15000);
  
  // Listen for agent state updates
  ipcRenderer.on('agent-state', (event, state) => {
    updateAgentState(state);
  });
  
  // Get initial state
  ipcRenderer.invoke('get-agent-state').then(state => {
    updateAgentState(state);
  });
}

// Animation loop
let frameIndex = 0;
let lastFrameTime = 0;
const FRAME_DURATION = 200; // ms per frame

function animate(timestamp) {
  if (timestamp - lastFrameTime > FRAME_DURATION) {
    frameIndex = (frameIndex + 1) % 4;
    lastFrameTime = timestamp;
  }
  
  // Move towards target if walking
  if (isWalking && targetX !== null && targetY !== null) {
    moveTowardsTarget();
  }
  
  // Render current frame
  renderDragon(frameIndex, currentState);
  
  requestAnimationFrame(animate);
}

// Update dragon based on agent state
function updateAgentState(state) {
  const previousState = currentState;
  currentState = state.status;
  currentTask = state.task;
  
  // Update status indicator
  const indicator = document.getElementById('status-indicator');
  indicator.className = `status-indicator ${currentState}`;
  
  // Show thought bubble for thinking/working
  const thoughtBubble = document.getElementById('thought-bubble');
  
  if (currentState === 'thinking' && currentTask) {
    thoughtBubble.textContent = currentTask.slice(0, 50) + (currentTask.length > 50 ? '...' : '');
    thoughtBubble.classList.add('visible');
  } else if (currentState === 'working') {
    thoughtBubble.textContent = 'Working...';
    thoughtBubble.classList.add('visible');
  } else if (currentState === 'sleeping') {
    thoughtBubble.textContent = 'Zzz...';
    thoughtBubble.classList.add('visible');
  } else {
    thoughtBubble.classList.remove('visible');
  }
  
  // Set walking animation if state changed to working and we're moving
  if (currentState === 'working' && previousState !== 'working') {
    // Dragon is busy, stay in place
    isWalking = false;
  }
}

// Render dragon sprite
function renderDragon(frame: number, state: string) {
  const canvas = document.getElementById('sprite-canvas') as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // Draw based on state
  switch(state) {
    case 'idle':
      drawIdleDragon(ctx, frame);
      break;
    case 'working':
      drawWorkingDragon(ctx, frame);
      break;
    case 'thinking':
      drawThinkingDragon(ctx, frame);
      break;
    case 'sleeping':
      drawSleepingDragon(ctx);
      break;
  }
}

// Draw idle dragon with breathing animation
function drawIdleDragon(ctx: CanvasRenderingContext2D, frame: number) {
  // Breathing offset
  const breathe = Math.sin(frame * 0.5) * 2;
  
  // Body (green)
  ctx.fillStyle = '#10b981';
  ctx.fillRect(60, 40 + breathe, 80, 60);
  
  // Head (slightly darker)
  ctx.fillStyle = '#059669';
  ctx.fillRect(80, 20 + breathe, 40, 30);
  
  // Eyes (yellow with black pupils)
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(90, 25 + breathe, 6, 6);
  ctx.fillRect(104, 25 + breathe, 6, 6);
  
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(92, 27 + breathe, 3, 3);
  ctx.fillRect(106, 27 + breathe, 3, 3);
  
  // Horns
  ctx.fillStyle = '#6b7280';
  ctx.fillRect(85, 15 + breathe, 4, 10);
  ctx.fillRect(111, 15 + breathe, 4, 10);
  
  // Wings (dark green)
  ctx.fillStyle = '#065f46';
  ctx.fillRect(40, 50 + breathe, 25, 40);
  ctx.fillRect(135, 50 + breathe, 25, 40);
  
  // Tail
  ctx.fillStyle = '#10b981';
  ctx.fillRect(140, 80 + breathe, 40, 15);
  ctx.fillRect(175, 75 + breathe, 10, 10);
  
  // Legs
  ctx.fillStyle = '#059669';
  ctx.fillRect(70, 100 + breathe, 15, 30);
  ctx.fillRect(115, 100 + breathe, 15, 30);
  
  // Feet
  ctx.fillStyle = '#10b981';
  ctx.fillRect(65, 125 + breathe, 25, 10);
  ctx.fillRect(110, 125 + breathe, 25, 10);
}

// Draw working dragon (typing/code animation)
function drawWorkingDragon(ctx: CanvasRenderingContext2D, frame: number) {
  // Base body same as idle
  drawIdleDragon(ctx, frame);
  
  // Add typing animation (hands move)
  const typeOffset = frame % 2 === 0 ? 0 : 2;
  ctx.fillStyle = '#059669';
  ctx.fillRect(55, 70 + typeOffset, 12, 8);
  ctx.fillRect(133, 70 + typeOffset, 12, 8);
  
  // Show code on screen (optional)
  ctx.fillStyle = '#34d399';
  ctx.fillRect(75, 65, 50, 3);
}

// Draw thinking dragon
function drawThinkingDragon(ctx: CanvasRenderingContext2D, frame: number) {
  drawIdleDragon(ctx, frame);
  
  // Thought bubble
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  ctx.arc(30, 10, 15, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillRect(50, 5, 80, 30);
  ctx.beginPath();
  ctx.arc(50, 20, 15, 0, Math.PI * 2);
  ctx.arc(130, 20, 15, 0, Math.PI * 2);
  ctx.fill();
  
  // Question marks
  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 14px Arial';
  ctx.fillText('???', 80, 25);
}

// Draw sleeping dragon
function drawSleepingDragon(ctx: CanvasRenderingContext2D) {
  // Curled up position
  ctx.fillStyle = '#10b981';
  
  // Body curled
  ctx.fillRect(50, 60, 100, 40);
  ctx.fillRect(60, 50, 80, 60);
  
  // Head
  ctx.fillStyle = '#059669';
  ctx.fillRect(45, 70, 30, 25);
  
  // Closed eyes
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(50, 78, 8, 2);
  ctx.fillRect(62, 78, 8, 2);
  
  // Z's floating
  ctx.fillStyle = '#8b5cf6';
  ctx.font = 'bold 16px Arial';
  ctx.fillText('Z', 30 + Math.random() * 20, 40);
  ctx.font = 'bold 12px Arial';
  ctx.fillText('z', 50 + Math.random() * 30, 25);
  ctx.font = 'bold 9px Arial';
  ctx.fillText('z', 70 + Math.random() * 30, 15);
  
  // Tail curled
  ctx.fillStyle = '#10b981';
  ctx.fillRect(150, 70, 20, 30);
}

// Random walking movement
function randomWalk() {
  if (currentState !== 'idle' || isDragging) return;
  
  // 30% chance to start walking
  if (Math.random() < 0.3) {
    // Random target on screen
    targetX = Math.random() * (screenWidth - 200);
    targetY = Math.random() * (screenHeight - 200);
    isWalking = true;
    currentState = 'walking';
    
    // Walk for 3-8 seconds then stop
    setTimeout(() => {
      isWalking = false;
      currentState = 'idle';
    }, 3000 + Math.random() * 5000);
  }
}

// Move towards target
function moveTowardsTarget() {
  if (targetX === null || targetY === null) return;
  
  const dx = targetX - windowX;
  const dy = targetY - windowY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  if (distance < walkSpeed) {
    // Reached target
    windowX = targetX;
    windowY = targetY;
    targetX = null;
    targetY = null;
    isWalking = false;
  } else {
    // Move towards target
    windowX += (dx / distance) * walkSpeed;
    windowY += (dy / distance) * walkSpeed;
  }
  
  // Update window position
  ipcRenderer.send('set-position', Math.round(windowX), Math.round(windowY));
}

// Drag and drop
function startDrag(e: MouseEvent) {
  isDragging = true;
  mouseX = e.screenX;
  mouseY = e.screenY;
}

function onDrag(e: MouseEvent) {
  if (!isDragging) return;
  
  const dx = e.screenX - mouseX;
  const dy = e.screenY - mouseY;
  
  windowX += dx;
  windowY += dy;
  
  mouseX = e.screenX;
  mouseY = e.screenY;
  
  ipcRenderer.send('set-position', Math.round(windowX), Math.round(windowY));
}

function endDrag() {
  isDragging = false;
  
  // If was walking before drag, continue walking
  if (currentState === 'walking') {
    // Dragon is now at new position, pick new random target
    setTimeout(randomWalk, 2000);
  }
}

// Show message in thought bubble
function showMessage(message: string, duration: number = 5000) {
  const bubble = document.getElementById('thought-bubble');
  bubble.textContent = message;
  bubble.classList.add('visible');
  
  setTimeout(() => {
    bubble.classList.remove('visible');
  }, duration);
}

// Context-aware messages based on what's on screen
function showContextualMessage(context: string) {
  const messages = {
    'coding': [
      "Writing code? I can help debug!",
      "Nice function! But have you considered... testing it?",
      "Dragon energy activated! 🔥",
    ],
    'browsing': [
      "What website is this? Can I come?",
      "I see you're researching... interesting!",
    ],
    'idle': [
      "Hmm, nothing happening...",
      "*paces around*",
      "Is it nap time yet?",
      "I sense... inactivity.",
    ],
  };
  
  const msgs = messages[context] || messages['idle'];
  const msg = msgs[Math.floor(Math.random() * msgs.length)];
  showMessage(msg);
}

// ============================================================
// Gateway Node Event Handlers
// These handle commands from the agent via the FamiliarNode
// ============================================================

// Handle familiar-message from agent
ipcRenderer.on('familiar-message', (event, data) => {
  const { text, duration = 3000 } = data;
  showMessage(text, duration);
});

// Handle play-animation from agent
ipcRenderer.on('play-animation', (event, data) => {
  const { name, loop = false } = data;
  // For now, map animation names to states
  // In future, this could load actual VRM animations
  const animationMap = {
    'Idle': 'idle',
    'Walk': 'walking',
    'Wave': 'cheering',
    'Thinking': 'thinking',
    'Working': 'working',
    'Sleep': 'sleeping',
  };
  
  if (animationMap[name]) {
    currentState = animationMap[name];
    updateStatusIndicator();
  }
});

// Handle familiar-speak from agent (chat with avatar)
ipcRenderer.on('familiar-speak', (event, data) => {
  const { text, emotion = 'neutral' } = data;
  
  // Show message with emotion
  showEmotionalMessage(text, emotion);
});

// Handle agent-state from agent (state updates)
ipcRenderer.on('agent-state', (event, state) => {
  updateAgentState(state);
});

// Show message with emotional expression
function showEmotionalMessage(text, emotion) {
  // Map emotions to visual states
  const emotionStates = {
    'happy': 'idle', // Could add happy animation
    'thinking': 'thinking',
    'excited': 'cheering',
    'worried': 'working', // Could add worried animation
    'neutral': 'idle',
  };
  
  // Set emotional state temporarily
  const previousState = currentState;
  currentState = emotionStates[emotion] || 'idle';
  updateStatusIndicator();
  
  // Show message
  showMessage(text, 5000);
  
  // Return to previous state after message
  setTimeout(() => {
    currentState = previousState;
    updateStatusIndicator();
  }, 5000);
}

// Update status indicator based on current state
function updateStatusIndicator() {
  const indicator = document.getElementById('status-indicator');
  if (indicator) {
    indicator.className = `status-indicator ${currentState}`;
  }
}

// Send click event to main process (for gateway to notify agent)
function notifyClick(x, y) {
  ipcRenderer.send('familiar-event', {
    type: 'click',
    data: { x, y, state: currentState }
  });
}

// Send state change event to main process
function notifyStateChange(newState) {
  ipcRenderer.send('familiar-state', {
    status: newState,
    task: currentTask,
    position: { x: windowX, y: windowY },
    visible: true
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);