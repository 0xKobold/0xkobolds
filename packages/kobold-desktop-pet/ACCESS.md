# 🐉 Kobold Desktop Pet - Setup Guide

## Quick Start on Raspberry Pi

```bash
cd /home/moikapy/code/0xkobolds/packages/kobold-desktop-pet
bun install
bun run dev
```

## Access from Your Local PC

### Option 1: X11 Forwarding (Run on Pi, Display on PC) ⭐ Recommended

This runs the app on Raspberry Pi but displays on your local PC:

```bash
# On your LOCAL PC:
ssh -X moikapy@<pi-ip-address>

# Example:
ssh -X moikapy@192.168.1.100
# or if using Tailscale:
ssh -X moikapy@100.65.167.97

# Once connected, run:
cd /home/moikapy/code/0xkobolds/packages/kobold-desktop-pet
bun run dev
```

**Requirements on local PC:**
- X11 server running (Linux/Mac default, Windows needs Xming/VcXsrv)
- XQuartz on macOS: `brew install --cask xquartz`

### Option 2: Copy to Local PC (Best Performance)

```bash
# Copy entire package to your PC:
scp -r moikapy@<pi-ip-address>:/home/moikapy/code/0xkobolds/packages/kobold-desktop-pet ./kobold-pet

# On your PC:
cd kobold-pet
bun install
bun run dev
```

### Option 3: Web Preview (No Electron)

You already have a web preview you can access remotely:

```bash
# On Pi, start a server:
cd /home/moikapy/code/0xkobolds/packages/kobold-desktop-pet
bunx serve -p 8080

# On your PC, open browser:
# http://<pi-ip-address>:8080/preview.html
```

### Option 4: Tailscale (If You're Remote)

```bash
# If you have Tailscale set up:
ssh -X moikapy@100.65.167.97

# Then run:
cd /home/moikapy/code/0xkobolds/packages/kobold-desktop-pet
bun run dev
```

## For the 3D Avatar (VRM) Desktop Pet

To use a real 3D animated avatar instead of pixel sprites:

### Step 1: Get a VRM Avatar

```bash
# Browse: https://opensourceavatars.com
# Download a VRM file (e.g., dragon, kobold, or any character)

# Or use CLI:
curl -O https://opensourceavatars.com/avatars/<avatar-id>.vrm
```

### Step 2: Get Mixamo Animations

1. Go to https://mixamo.com
2. Sign in with Adobe account (free)
3. Select animations:
   - **Standing Idle** - For "idle" state
   - **Walking In Place** - For "walking" state
   - **Computer Work/Typing** - For "working" state
   - **Thinking** - For "thinking" state
   - **Lying Down/Sleeping** - For "sleeping" state

4. Download as FBX (in-place: ON)

### Step 3: Run Conversion

```javascript
// In Node.js or browser
import { loadVRM, loadMixamoFBX, retargetMixamoAnimation, DesktopPetAnimator } from './lib/vrm-retargeter.js';

// Load avatar
const vrm = await loadVRM('assets/avatar.vrm');

// Load and retarget each animation
const idleFBX = await loadMixamoFBX('assets/animations/idle.fbx');
const idleClip = retargetMixamoAnimation(idleFBX, vrm);

const workingFBX = await loadMixamoFBX('assets/animations/working.fbx');
const workingClip = retargetMixamoAnimation(workingFBX, vrm);

// Create animator
const animator = new DesktopPetAnimator(vrm);
animator.addAnimation('idle', idleClip);
animator.addAnimation('working', workingClip);

// Set state
await animator.setState('idle');
```

## File Structure

```
kobold-desktop-pet/
├── assets/
│   ├── avatars/
│   │   └── kobold-dragon.vrm      # Your VRM avatar
│   └── animations/
│       ├── idle.fbx               # Mixamo animations
│       ├── working.fbx
│       ├── thinking.fbx
│       └── sleeping.fbx
├── src/
│   ├── main.ts                    # Electron main
│   ├── renderer/
│   │   ├── index.html
│   │   ├── renderer.ts            # Three.js rendering
│   │   └── dragon-sprites.js      # (2D fallback)
│   └── lib/
│       └── vrm-retargeter.ts      # Animation conversion
├── preview.html                   # Web preview
├── ACCESS.md                      # This file
└── package.json
```

## Dependencies

```bash
# Core
bun add three @pixiv/three-vrm

# Electron
bun add electron electron-vite

# Animation retargeting
bun add vrm-mixamo-retarget
```

## Troubleshooting

### X11 Forwarding Not Working

```bash
# On Pi, check SSH config:
grep X11Forwarding /etc/ssh/sshd_config
# Should show: X11Forwarding yes

# If not, enable it:
sudo sed -i 's/#X11Forwarding yes/X11Forwarding yes/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

### Display Errors

```bash
# Set DISPLAY if needed:
export DISPLAY=:0

# For XQuartz on Mac:
# Open XQuartz preferences > Security > Allow connections from network clients
```

### VRM Not Loading

```bash
# Check file exists:
ls -la assets/avatars/

# Verify VRM file:
file assets/avatars/*.vrm
# Should show: glTF 2.0 binary glTF
```

---

**Next Steps:**
1. Download a VRM avatar from https://opensourceavatars.com
2. Get animations from https://mixamo.com
3. Run the retargeting script
4. Enjoy your animated desktop pet!