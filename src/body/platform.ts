/**
 * Agent Body - Platform Detection
 * 
 * Detects hardware platform and available capabilities.
 * Works on Raspberry Pi, desktop, laptop, server - anywhere.
 */

import { readFile } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface PlatformCapabilities {
  gpio: boolean;       // Can control hardware (Pi)
  camera: boolean;     // Has camera
  microphone: boolean; // Has microphone
  speaker: boolean;    // Has audio output
  display: boolean;    // Has attached display
  battery: boolean;    // Is portable device
  touchscreen: boolean; // Is touch device
  pimoroni: boolean;   // Has Pimoroni sensors
}

export interface PlatformInfo {
  type: 'raspberry-pi' | 'desktop' | 'laptop' | 'server' | 'unknown';
  model?: string;
  hostname: string;
  os: string;
  arch: string;
  capabilities: PlatformCapabilities;
  recommended: {
    avatar: 'desktop-pet' | 'web-only' | 'voice' | 'text';
    sensors: string[];
    actuators: string[];
  };
}

/**
 * Detect the platform this agent is running on
 */
export async function detectPlatform(): Promise<PlatformInfo> {
  const info: PlatformInfo = {
    type: 'unknown',
    hostname: require('os').hostname(),
    os: process.platform,
    arch: process.arch,
    capabilities: {
      gpio: false,
      camera: false,
      microphone: false,
      speaker: false,
      display: false,
      battery: false,
      touchscreen: false,
      pimoroni: false,
    },
    recommended: {
      avatar: 'web-only',
      sensors: ['cpu_temp', 'cpu_load', 'memory_used', 'disk_space', 'network'],
      actuators: ['discord', 'web_chat'],
    },
  };

  // Detect Raspberry Pi
  try {
    const deviceTree = await readFile('/proc/device-tree/model', 'utf-8');
    if (deviceTree.includes('Raspberry Pi')) {
      info.type = 'raspberry-pi';
      info.model = deviceTree.trim();
      info.capabilities.gpio = true;
      info.recommended.avatar = 'desktop-pet';
      info.recommended.sensors.push('cpu_temp'); // Pi has built-in temp
      
      // Check for Pimoroni Enviro
      try {
        await execAsync('ls /dev/i2c-* 2>/dev/null');
        info.capabilities.pimoroni = true;
        info.recommended.sensors.push('ambient_temp', 'humidity', 'pressure');
      } catch {}
    }
  } catch {
    // Not a Pi, check other platforms
  }

  // Detect Mac
  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execAsync('system_profiler SPHardwareDataType 2>/dev/null | grep "Model"');
      info.model = stdout.trim().split(':')[1]?.trim() || 'Mac';
      info.type = info.model.toLowerCase().includes('macbook') ? 'laptop' : 'desktop';
    } catch {
      info.type = 'desktop';
    }
    info.capabilities.camera = await hasCamera();
    info.capabilities.microphone = await hasMicrophone();
    info.capabilities.speaker = true; // Macs always have speakers
    info.capabilities.battery = await hasBattery();
    info.recommended.avatar = 'web-only';
  }

  // Detect Linux desktop
  if (process.platform === 'linux' && info.type === 'unknown') {
    // Check for display
    info.capabilities.display = !!(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
    
    // Check if laptop or desktop
    try {
      const { stdout } = await execAsync('cat /sys/class/dmi/id/chassis_type 2>/dev/null');
      const chassisType = stdout.trim();
      if (['8', '9', '10', '14'].includes(chassisType)) {
        info.type = 'laptop';
        info.capabilities.battery = await hasBattery();
      } else {
        info.type = 'desktop';
      }
    } catch {
      info.type = 'desktop';
    }
  }

  // Detect audio capability (platform-agnostic)
  try {
    if (process.platform === 'linux') {
      await execAsync('speaker-test -t wav -c 2 -l 1 2>/dev/null || true');
      info.capabilities.speaker = true;
      info.recommended.actuators.push('voice');
    }
  } catch {}

  // Detect camera (platform-agnostic)
  info.capabilities.camera = await hasCamera();

  // Detect microphone (platform-agnostic)  
  info.capabilities.microphone = await hasMicrophone();

  // Detect if it's a server (headless)
  if (info.type === 'unknown') {
    info.type = 'server';
    info.recommended.avatar = 'text';
  }

  return info;
}

/**
 * Check if battery exists (laptops)
 */
async function hasBattery(): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      const { stdout } = await execAsync('pmset -g batt 2>/dev/null');
      return stdout.includes('Battery');
    } else if (process.platform === 'linux') {
      const { stdout } = await execAsync('ls /sys/class/power_supply/*/type 2>/dev/null');
      if (stdout.trim()) {
        const types = await Promise.all(
          stdout.trim().split('\n').map(async (f: string) => {
            const content = await readFile(f, 'utf-8');
            return content.trim();
          })
        );
        return types.includes('Battery');
      }
    }
  } catch {}
  return false;
}

/**
 * Check if camera exists
 */
async function hasCamera(): Promise<boolean> {
  try {
    if (process.platform === 'linux') {
      const { stdout } = await execAsync('ls /dev/video* 2>/dev/null');
      return stdout.trim().length > 0;
    }
    if (process.platform === 'darwin') {
      const { stdout } = await execAsync('ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | grep -i "video" || true');
      return stdout.trim().length > 0;
    }
  } catch {}
  return false;
}

/**
 * Check if microphone exists
 */
async function hasMicrophone(): Promise<boolean> {
  try {
    if (process.platform === 'linux') {
      const { stdout } = await execAsync('arecord -l 2>/dev/null | grep -i "card" || true');
      return stdout.trim().length > 0;
    }
    if (process.platform === 'darwin') {
      const { stdout } = await execAsync('ffmpeg -f avfoundation -list_devices true -i "" 2>&1 | grep -i "audio" || true');
      return stdout.trim().length > 0;
    }
  } catch {}
  return false;
}

/**
 * Get cached platform info
 */
let cachedPlatform: PlatformInfo | null = null;

export async function getPlatform(): Promise<PlatformInfo> {
  if (!cachedPlatform) {
    cachedPlatform = await detectPlatform();
  }
  return cachedPlatform;
}

/**
 * Check if specific capability is available
 */
export async function hasCapability(capability: keyof PlatformCapabilities): Promise<boolean> {
  const platform = await getPlatform();
  return platform.capabilities[capability];
}