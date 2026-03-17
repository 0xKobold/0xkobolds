/**
 * Kobold Familiar - Three.js 3D Renderer
 * Renders CoolTurtle VRM with retargeted Mixamo animations
 */

const THREE = require('three');
const { GLTFLoader } = require('three/addons/loaders/GLTFLoader.js');
const { FBXLoader } = require('three/addons/loaders/FBXLoader.js');
const { VRMLoaderPlugin } = require('@pixiv/three-vrm');
const { retarget as retargetAnimation } = require('vrm-mixamo-retarget');
const { ipcRenderer } = require('electron');

// Global state
let scene, camera, renderer, mixer, clock;
let vrm = null;
let currentVRMAction = null;
let animations = new Map();
let currentState = 'idle';
let usePixelFallback = false;

// Animation mapping from agent states to FBX files
const STATE_ANIMATIONS = {
  'idle': 'Breathing Idle.fbx',
  'working': 'Waving.fbx',
  'thinking': 'Look Around.fbx',
  'sleeping': 'Sleeping Idle.fbx',
  'walking': 'Walking.fbx',
  'cheering': 'Cheering.fbx'
};

/**
 * Initialize Three.js scene and load VRM
 */
async function init() {
  console.log('[Renderer] Initializing Three.js scene...');
  
  const canvas = document.getElementById('3d-canvas');
  const container = document.getElementById('dragon-container');

  // Scene setup
  scene = new THREE.Scene();
  scene.background = null; // Transparent

  // Camera - orthographic for cleaner look
  const aspect = 200 / 200;
  const frustumSize = 2;
  camera = new THREE.OrthographicCamera(
    frustumSize * aspect / -2,
    frustumSize * aspect / 2,
    frustumSize / 2,
    frustumSize / -2,
    0.1,
    100
  );
  camera.position.set(0, 1.2, 2);
  camera.lookAt(0, 1, 0);

  // Renderer with transparency
  renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    alpha: true,
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(200, 200);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
  directionalLight.position.set(5, 10, 7);
  scene.add(directionalLight);

  // Clock for animations
  clock = new THREE.Clock();

  // Try to load VRM
  try {
    await loadVRM();
  } catch (error) {
    console.error('[Renderer] Failed to load VRM:', error);
    showPixelFallback(true);
  }

  // Start animation loop
  animate();

  // Setup IPC listeners
  setupIPC();

  // Setup movement
  initMovement();
}

/**
 * Load VRM model
 */
async function loadVRM() {
  console.log('[Renderer] Loading VRM model...');
  
  const gltfLoader = new GLTFLoader();
  gltfLoader.register((parser) => new VRMLoaderPlugin(parser));

  const modelPath = 'assets/avatars/coolturtle.vrm';
  console.log('[Renderer] Loading from:', modelPath);

  const gltf = await gltfLoader.loadAsync(modelPath);
  vrm = gltf.userData.vrm;

  if (!vrm) {
    throw new Error('VRM not found in GLTF');
  }

  // Scale the model (VRM is in meters, we need to fit in view)
  vrm.scene.scale.setScalar(1);
  vrm.scene.position.set(0, 0, 0);

  // Add to scene
  scene.add(vrm.scene);

  // Create animation mixer
  mixer = new THREE.AnimationMixer(vrm.scene);

  // Load animations
  await loadAnimations();

  // Play idle
  playAnimation('idle');

  console.log('[Renderer] VRM loaded successfully');
  showPixelFallback(false);
}

/**
 * Load and retarget Mixamo animations
 */
async function loadAnimations() {
  console.log('[Renderer] Loading animations...');
  
  const fbxLoader = new FBXLoader();

  for (const [state, filename] of Object.entries(STATE_ANIMATIONS)) {
    try {
      const fbx = await fbxLoader.loadAsync(`assets/animations/${filename}`);
      
      if (fbx.animations && fbx.animations.length > 0 && vrm) {
        // Use vrm-mixamo-retarget to properly retarget animation
        const clip = retargetAnimation(fbx, vrm);
        if (clip) {
          animations.set(state, clip);
          console.log(`[Renderer] Loaded animation: ${state}`);
        }
      }
    } catch (error) {
      console.warn(`[Renderer] Failed to load ${filename}:`, error.message);
    }
  }
}

/**
 * Play animation by state name
 */
function playAnimation(state) {
  if (!vrm || !mixer) {
    console.warn('[Renderer] VRM not loaded yet');
    return;
  }

  currentState = state;
  const clip = animations.get(state);

  if (!clip) {
    console.warn(`[Renderer] No animation for state: ${state}`);
    return;
  }

  // Fade out current animation
  if (currentVRMAction) {
    currentVRMAction.fadeOut(0.3);
  }

  // Create and play new action
  currentVRMAction = mixer.clipAction(clip);
  currentVRMAction.reset();
  currentVRMAction.fadeIn(0.3);
  currentVRMAction.play();

  // Update status indicator
  updateStatusIndicator(state);
}

/**
 * Update status indicator color
 */
function updateStatusIndicator(state) {
  const indicator = document.getElementById('status-indicator');
  if (indicator) {
    indicator.className = `status-indicator ${state}`;
  }
}

/**
 * Animation loop
 */
function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();

  // Update VRM
  if (vrm) {
    vrm.update(delta);
  }

  // Update animation mixer
  if (mixer) {
    mixer.update(delta);
  }

  // Render
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

/**
 * Setup IPC listeners
 */
function setupIPC() {
  // Agent state updates
  ipcRenderer.on('agent-state', (event, state) => {
    if (state.status && STATE_ANIMATIONS[state.status]) {
      playAnimation(state.status);
    }

    // Show thought bubble for task
    const bubble = document.getElementById('thought-bubble');
    if (state.task) {
      bubble.textContent = state.task.slice(0, 50) + (state.task.length > 50 ? '...' : '');
      bubble.classList.add('visible');
    } else {
      bubble.classList.remove('visible');
    }
  });

  // Play animation command
  ipcRenderer.on('play-animation', (event, data) => {
    const { name, loop } = data;
    // Map animation names to states
    const nameToState = {
      'Idle': 'idle',
      'Walk': 'walking',
      'Wave': 'cheering',
      'Thinking': 'thinking',
      'Working': 'working',
      'Sleep': 'sleeping'
    };
    const state = nameToState[name] || 'idle';
    playAnimation(state);
  });

  // Familiar message
  ipcRenderer.on('familiar-message', (event, data) => {
    const { text, duration = 3000 } = data;
    const bubble = document.getElementById('thought-bubble');
    bubble.textContent = text;
    bubble.classList.add('visible');
    setTimeout(() => bubble.classList.remove('visible'), duration);
  });

  // Familiar speak (with emotion)
  ipcRenderer.on('familiar-speak', (event, data) => {
    const { text, emotion = 'neutral' } = data;
    const bubble = document.getElementById('thought-bubble');
    
    // Map emotions to states
    const emotionToState = {
      'happy': 'idle',
      'thinking': 'thinking',
      'excited': 'cheering',
      'worried': 'working',
      'neutral': 'idle'
    };
    
    const state = emotionToState[emotion] || 'idle';
    playAnimation(state);
    
    bubble.textContent = text;
    bubble.classList.add('visible');
    setTimeout(() => {
      bubble.classList.remove('visible');
      playAnimation('idle');
    }, 5000);
  });
}

/**
 * Initialize movement handling
 */
function initMovement() {
  let isDragging = false;
  let startX, startY;
  let windowX = 0, windowY = 0;
  const { screen } = require('electron');

  const container = document.getElementById('dragon-container');

  container.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // Left click
      isDragging = true;
      startX = e.screenX;
      startY = e.screenY;
      container.style.cursor = 'grabbing';
      
      // Notify click
      notifyClick(e.offsetX, e.offsetY);
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const dx = e.screenX - startX;
    const dy = e.screenY - startY;
    
    windowX += dx;
    windowY += dy;
    
    ipcRenderer.send('set-position', windowX, windowY);
    
    startX = e.screenX;
    startY = e.screenY;
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    container.style.cursor = 'grab';
  });
}

/**
 * Notify gateway of click
 */
function notifyClick(x, y) {
  ipcRenderer.send('familiar-event', {
    type: 'click',
    data: { x, y, state: currentState }
  });
}

/**
 * Show/hide pixel fallback
 */
function showPixelFallback(show) {
  usePixelFallback = show;
  const canvas3d = document.getElementById('3d-canvas');
  const canvasPixel = document.getElementById('sprite-canvas');
  
  if (show) {
    canvas3d.style.display = 'none';
    canvasPixel.style.display = 'block';
    console.log('[Renderer] Using pixel fallback');
    // Initialize pixel renderer
    if (typeof initPixelRenderer === 'function') {
      initPixelRenderer();
    }
  } else {
    canvas3d.style.display = 'block';
    canvasPixel.style.display = 'none';
  }
}

// Expose for context menu
window.setAnimation = playAnimation;

// Initialize on load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

module.exports = { init, playAnimation, showPixelFallback };