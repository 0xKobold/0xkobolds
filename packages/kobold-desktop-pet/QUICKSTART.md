# Quick Start Guide - Kobold Familiar

## On Your Main PC (with display)

### Option 1: Copy from Pi

```bash
# Copy the package to your main PC
scp -r moikapy@<pi-ip>:/home/moikapy/code/0xkobolds/packages/kobold-desktop-pet ~/kobold-familiar

# On your main PC
cd ~/kobold-familiar
bun install
bun run dev
```

### Option 2: X11 Forwarding

If you have an X server (XQuartz on Mac, VcXsrv on Windows, or native X11 on Linux):

```bash
# On your main PC
ssh -X moikapy@<pi-ip>

# On the Pi (with X forwarding)
cd /home/moikapy/code/0xkobolds/packages/kobold-desktop-pet
bun run dev
```

### Option 3: Run Locally

If you've cloned the repo on your main PC:

```bash
# If gateway is on the Pi
export GATEWAY_URL=ws://<pi-ip>:7777

cd packages/kobold-desktop-pet
bun install
bun run dev
```

## Configuration

The familiar connects to the 0xKobold gateway. By default it tries `ws://localhost:7777`.

To connect to a remote gateway:
```bash
export GATEWAY_URL=ws://100.65.167.97:7777  # Your Pi's IP
bun run dev
```

## What You'll See

1. **Transparent window** - The familiar appears in the bottom-right corner
2. **Status indicator** - Colored dot showing agent state:
   - Gray = Idle
   - Green (pulsing) = Working
   - Yellow (pulsing) = Thinking
   - Purple = Sleeping
3. **Thought bubbles** - Shows current task or message
4. **Right-click menu** - Manual animation control

## Interacting

The familiar is controlled by the agent through the gateway:

```javascript
// Agent commands (from gateway)
familiar.animate({ state: 'thinking', task: 'Processing request...' })
familiar.speak({ text: 'Hello! How can I help?', emotion: 'happy' })
familiar.message({ text: 'Task complete!', duration: 3000 })
familiar.show() / familiar.hide()
familiar.position({ x: 100, y: 100 })
```

## Troubleshooting

### No window appears
- Check Electron logs in terminal
- Ensure display is available (`echo $DISPLAY`)
- Try `export ELECTRON_ENABLE_LOGGING=1`

### Familiar doesn't connect
- Verify gateway is running: `curl http://localhost:7777/health`
- Check firewall allows port 7777
- Check GATEWAY_URL environment variable

### 3D model not loading
- Fallback pixel dragon should appear
- Check browser console for Three.js errors
- VRM files should be in `assets/avatars/`

## Next Steps

Once running:
1. Start a conversation with 0xKobold
2. Watch the familiar reflect your agent's state
3. Click on the familiar to send events to the agent
4. The agent can speak through the familiar with messages