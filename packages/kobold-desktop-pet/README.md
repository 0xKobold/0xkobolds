# 🐢 Kobold Familiar

> **An embodied interface for your AI agent** — A body for 0xKobold to inhabit.

A 3D animated desktop familiar that connects to 0xKobold as a **node**, making it a body for the AI agent. The agent can animate the familiar, show messages, and receive interactions (clicks, drags).

## Features

- **Embodied Agent Interface** — The agent can animate, speak through, and control the familiar
- **Bidirectional Communication** — Click on the familiar to interact with the agent
- **3D Turtle Avatar** — CoolTurtle VRM model with Mixamo animations
- **Real-time Status** — Shows agent state (idle, working, thinking, sleeping, cheering)
- **Desktop Familiar Mode** — Floating transparent window that stays on top
- **System Tray** — Quick access menu for show/hide/quit
- **Draggable** — Move your familiar anywhere on screen
- **Chat with Avatar** — Agent can display messages and emotions through the familiar
- **Gateway Node** — Connects to 0xKobold gateway for real-time communication

## Chat with Your Familiar

The agent can communicate through the familiar:

```typescript
// Agent speaks through the familiar
await agent.run({
  method: 'node.invoke',
  params: {
    nodeId: 'desktop-familiar',
    command: 'familiar.speak',
    args: { 
      text: "I'm thinking about your request...",
      emotion: 'thinking' 
    }
  }
});

// Agent shows a message bubble
await agent.run({
  method: 'node.invoke',
  params: {
    nodeId: 'desktop-familiar',
    command: 'familiar.message',
    args: { text: 'Task completed!', duration: 3000 }
  }
});
```

### Available Commands

| Command | Description | Params |
|---------|-------------|--------|
| `familiar.show` | Show familiar window | - |
| `familiar.hide` | Hide familiar window | - |
| `familiar.animate` | Set animation state | `{ state, task?, message? }` |
| `familiar.state` | Get current familiar state | - |
| `familiar.position` | Move familiar to position | `{ x, y }` |
| `familiar.message` | Display message bubble | `{ text, duration? }` |
| `familiar.animation` | Play specific animation | `{ name, loop? }` |
| `familiar.speak` | Speak with emotion | `{ text, emotion? }` |

### Events from Familiar to Agent

The familiar can send events to the agent:

```typescript
// Familiar was clicked
{ event: 'familiar.clicked', data: { x: 150, y: 200, state: 'idle' } }

// Familiar was dragged
{ event: 'familiar.dragged', data: { from: { x: 100, y: 100 }, to: { x: 200, y: 200 } } }

// Familiar state changed
{ event: 'familiar.stateChanged', data: { status: 'sleeping', task: null } }
```

## Installation

```bash
cd packages/kobold-desktop-pet

# Install dependencies
bun install

# Development mode
bun run dev

# Build for production
bun run build

# Package as executable
bun run package
```

## Quick Start (Web Preview)

For testing the 3D model without running Electron:

```bash
# Start a local web server
bun run web

# Open in browser
# http://localhost:8080/vrm-preview.html
```

## Running on Raspberry Pi

The desktop familiar runs on the Raspberry Pi where 0xKobold is installed:

```bash
# On the Pi
cd /home/moikapy/code/0xkobolds/packages/kobold-desktop-pet
bun run dev
``

### Headless Pi Access from Desktop PC

If your Pi runs headless and you want to see the familiar on your desktop PC:

#### Option 1: X11 Forwarding (Recommended)

```bash
# On your desktop PC (with X11 server like XQuartz/VcXsrv)
ssh -X moikapy@<pi-ip-address>

# Then run on Pi
cd packages/kobold-desktop-pet
bun run dev
```

#### Option 2: Copy to Desktop PC

```bash
# Copy the package to your desktop
scp -r moikapy@<pi-ip-address>:/home/moikapy/code/0xkobolds/packages/kobold-desktop-pet ~/kobold-pet

# On your desktop
cd ~/kobold-pet
bun install
bun run dev
```

## Avatar Information

**Name:** CoolTurtle (Avatar 182)  
**Source:** [OpenSourceAvatars](https://opensourceavatars.com/en/gallery?avatar=coolturtle)  
**License:** CC0 (Public Domain)

### Files

| File | Description | Size |
|------|-------------|------|
| `coolturtle.vrm` | Standard VRM avatar | 1.5MB |
| `coolturtle-voxel.vrm` | Voxel style variant | 2.7MB |
| `coolturtle-standard.fbx` | FBX for Mixamo retargeting | 528KB |
| `coolturtle-voxel.fbx` | Voxel FBX | 405KB |

### Animations

Located in `assets/animations/`:

| Animation | File | Usage |
|-----------|------|-------|
| Idle | `Breathing Idle.fbx` | Default state |
| Thinking | `Look Around.fbx` | When agent is processing |
| Working | `Waving.fbx` | When agent is executing |
| Sleeping | `Sleeping Idle.fbx` | When agent is idle long |
| Walking | `Walking.fbx` | Random movement |
| Cheering | `Cheering.fbx` | Task completed |

## Architecture

```
kobold-desktop-pet/
├── assets/
│   ├── avatars/
│   │   ├── coolturtle.vrm          # VRM model (CC0)
│   │   ├── coolturtle-voxel.vrm    # Voxel variant
│   │   ├── coolturtle-standard.fbx # FBX for Mixamo
│   │   └── coolturtle-voxel.fbx    # Voxel FBX
│   └── animations/
│       ├── Breathing Idle.fbx      # Idle animation
│       ├── Look Around.fbx         # Thinking
│       ├── Waving.fbx              # Working
│       ├── Sleeping Idle.fbx       # Sleeping
│       ├── Walking.fbx             # Walking
│       └── Cheering.fbx            # Celebration
├── src/
│   ├── main.ts                     # Electron main process
│   ├── lib/
│   │   └── vrm-retargeter.ts       # Mixamo → VRM retargeting
│   └── renderer/
│       ├── index.html              # Electron renderer
│       ├── turtle-renderer.js      # Three.js 3D renderer
│       ├── renderer.js             # Pixel art fallback
│       └── dragon-sprites.js       # Pixel sprite data
├── vrm-preview.html                # Web-based VRM viewer
├── preview.html                    # Pixel sprite preview
└── package.json
```

## Technical Details

### Main Process (main.ts)

- Creates transparent, frameless Electron window
- Polls 0xKobold API for agent state
- Manages system tray icon
- Handles IPC for movement, position, and control

### Renderer Process

- **Primary:** `turtle-renderer.js` - Three.js with FBXLoader
- **Fallback:** `renderer.js` + `dragon-sprites.js` - Canvas 2D pixel art

### Agent State Integration

Polls `http://localhost:3456/api/agent-state` for:

```typescript
interface AgentState {
  status: 'idle' | 'working' | 'thinking' | 'sleeping';
  task: string | null;
  lastActivity: number;
}
```

### Animation System

```javascript
// Animation states mapped to FBX files
const STATE_ANIMATIONS = {
  'idle': 'Breathing Idle.fbx',
  'working': 'Waving.fbx',
  'thinking': 'Look Around.fbx',
  'sleeping': 'Sleeping Idle.fbx',
  'walking': 'Walking.fbx',
  'cheering': 'Cheering.fbx'
};

// Cross-fade between animations
function playAnimation(state) {
  const newAction = animations.get(state);
  newAction.reset();
  newAction.play();
  newAction.crossFadeFrom(currentAction, 0.3, true);
}
```

## Controls

### Mouse
- **Drag** - Move pet around screen
- **Right-click** - Open context menu
- **Scroll** - (Future) Scale pet size

### Context Menu
- Animation states: Idle, Working, Thinking, Sleeping, Walking, Cheering
- Reset Position - Return to bottom-right
- Stay on Top - Toggle always-on-top
- Quit - Close application

### System Tray
- Show/Hide Familiar
- Toggle Stay on Top
- Reset Position
- Quit

## Configuration

Default settings in `main.ts`:

```typescript
const CONFIG = {
  width: 200,              // Window width
  height: 200,             // Window height
  agentPollInterval: 2000, // Poll 0xKobold every 2s
  agentApiUrl: 'http://localhost:3456/api/agent-state'
};
```

## Troubleshooting

### 3D Model Not Loading

1. Verify files exist in `assets/avatars/`
2. Check console for 404 errors
3. Fallback to pixel mode automatically activates

### Window Doesn't Appear

1. Check if another Electron instance is running
2. Verify screen dimensions are detected correctly
3. Try resetting position via tray menu

### Animations Not Playing

1. Verify FBX files in `assets/animations/`
2. Check Three.js console logs
3. Ensure FBXLoader is working (try web preview first)

### High CPU Usage

- Animations run at 60fps by default
- Consider reducing animation quality
- Use pixel fallback on low-power devices

## Dependencies

| Package | Purpose |
|---------|---------|
| `electron` | Desktop application framework |
| `three` | 3D rendering (WebGL) |
| `@pixiv/three-vrm` | VRM avatar support |
| `vrm-mixamo-retarget` | Animation retargeting |
| `electron-builder` | Packaging executables |
| `electron-vite` | Build tooling |

## Gateway Node Integration

The desktop familiar can connect to 0xKobold as a **node**, exposing commands for bidirectional communication:

```typescript
// Agent invokes pet commands
await agent.run({
  method: 'node.invoke',
  params: {
    nodeId: 'desktop-pet',
    command: 'pet.animate',
    args: { state: 'working', task: 'Thinking...' }
  }
});

// Familiar sends events back
petNode.sendEvent('pet.clicked', { position: { x: 150, y: 200 } });
```

### Available Commands

| Command | Description | Params |
|---------|-------------|--------|
| `pet.show` | Show familiar window | - |
| `pet.hide` | Hide familiar window | - |
| `pet.animate` | Set animation state | `{ state: 'idle'\|'working'\|'thinking'\|'sleeping' }` |
| `pet.state` | Get current state | - |
| `pet.position` | Move pet | `{ x: number, y: number }` |

See [`docs/NODE-SYSTEM-DESIGN.md`](../../docs/NODE-SYSTEM-DESIGN.md) for full architecture.

## Future Enhancements

- [ ] Interactive responses (click to wave)
- [ ] Sound effects for state changes
- [ ] Multiple pet skins/themes
- [ ] Drag to edge auto-hide
- [ ] Custom animation import
- [ ] WebSocket real-time updates (no polling) - see node system
- [ ] Particle effects (fire breathing)
- [ ] Screen edge walking animation
- [ ] Voice output (TTS via gateway node)

## Development

```bash
# Run in development mode
bun run dev

# Build TypeScript
bun run build

# Package for distribution
bun run package

# Web preview mode
bun run web
```

## License

- **CoolTurtle Avatar:** CC0 (Public Domain) - Free to use
- **Mixamo Animations:** Free for commercial use with Adobe account
- **Code:** MIT License

## Credits

- Avatar 182 from [100Avatars Collection R2](https://opensourceavatars.com)
- Animations from [Mixamo](https://mixamo.com)
- VRM support by [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)

---

*Part of the 0xKobold AI Assistant Framework*