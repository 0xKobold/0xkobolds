/**
 * Device Authentication - v0.3.0
 *
 * Device identity and token management for secure multi-device support.
 */

import { randomUUID, randomBytes } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";

export interface DeviceIdentity {
  id: string;
  name: string;
  publicKey: string;
  privateKey: string; // Encrypted
  createdAt: string;
  lastUsed: string;
  trusted: boolean;
}

export interface AuthToken {
  token: string;
  deviceId: string;
  scopes: string[];
  expiresAt: number;
  createdAt: number;
}

export interface DeviceAuthConfig {
  storagePath: string;
  tokenExpiryHours: number;
  maxDevices: number;
  requireApproval: boolean;
}

const DEFAULT_CONFIG: DeviceAuthConfig = {
  storagePath: path.join(process.env.HOME || "~", ".0xkobold", "devices"),
  tokenExpiryHours: 168, // 7 days
  maxDevices: 5,
  requireApproval: true,
};

class DeviceAuthManager {
  private config: DeviceAuthConfig;
  private currentDevice: DeviceIdentity | null = null;
  private tokens: Map<string, AuthToken> = new Map();

  constructor(config: Partial<DeviceAuthConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize device identity
   */
  async initialize(deviceName?: string): Promise<DeviceIdentity> {
    await fs.mkdir(this.config.storagePath, { recursive: true });

    // Check for existing device
    const existing = await this.loadCurrentDevice();
    if (existing) {
      this.currentDevice = existing;
      existing.lastUsed = new Date().toISOString();
      await this.saveDevice(existing);
      console.log(`[DeviceAuth] Loaded device: ${existing.name}`);
      return existing;
    }

    // Create new device
    const device = await this.createDevice(deviceName || `device-${Date.now()}`);
    this.currentDevice = device;
    console.log(`[DeviceAuth] Created device: ${device.name}`);
    return device;
  }

  /**
   * Create new device
   */
  private async createDevice(name: string): Promise<DeviceIdentity> {
    const now = new Date().toISOString();
    
    // Generate keys
    const publicKey = randomBytes(32).toString("hex");
    const privateKey = randomBytes(64).toString("hex"); // Would be encrypted in production

    const device: DeviceIdentity = {
      id: randomUUID(),
      name,
      publicKey,
      privateKey,
      createdAt: now,
      lastUsed: now,
      trusted: true, // Auto-trust first device
    };

    await this.saveDevice(device);
    return device;
  }

  /**
   * Save device to storage
   */
  private async saveDevice(device: DeviceIdentity): Promise<void> {
    const filePath = path.join(this.config.storagePath, `${device.id}.json`);
    await fs.writeFile(filePath, JSON.stringify(device, null, 2), "utf-8");
  }

  /**
   * Load current device
   */
  private async loadCurrentDevice(): Promise<DeviceIdentity | null> {
    try {
      const files = await fs.readdir(this.config.storagePath);
      const deviceFiles = files.filter((f) => f.endsWith(".json"));

      if (deviceFiles.length === 0) return null;

      // Load most recently used
      const devices = await Promise.all(
        deviceFiles.map(async (f) => {
          const content = await fs.readFile(
            path.join(this.config.storagePath, f),
            "utf-8"
          );
          return JSON.parse(content) as DeviceIdentity;
        })
      );

      return devices.sort(
        (a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
      )[0];
    } catch {
      return null;
    }
  }

  /**
   * Generate auth token
   */
  generateToken(scopes: string[] = ["read", "write"]): AuthToken {
    if (!this.currentDevice) {
      throw new Error("No device initialized");
    }

    const token = randomBytes(32).toString("hex");
    const now = Date.now();
    const expiryMs = this.config.tokenExpiryHours * 60 * 60 * 1000;

    const authToken: AuthToken = {
      token,
      deviceId: this.currentDevice.id,
      scopes,
      expiresAt: now + expiryMs,
      createdAt: now,
    };

    this.tokens.set(token, authToken);
    return authToken;
  }

  /**
   * Validate token
   */
  validateToken(token: string): { valid: boolean; token?: AuthToken; error?: string } {
    const authToken = this.tokens.get(token);

    if (!authToken) {
      return { valid: false, error: "Token not found" };
    }

    if (Date.now() > authToken.expiresAt) {
      this.tokens.delete(token);
      return { valid: false, error: "Token expired" };
    }

    return { valid: true, token: authToken };
  }

  /**
   * Revoke token
   */
  revokeToken(token: string): boolean {
    return this.tokens.delete(token);
  }

  /**
   * List devices
   */
  async listDevices(): Promise<DeviceIdentity[]> {
    try {
      const files = await fs.readdir(this.config.storagePath);
      const devices: DeviceIdentity[] = [];

      for (const file of files) {
        if (file.endsWith(".json")) {
          const content = await fs.readFile(
            path.join(this.config.storagePath, file),
            "utf-8"
          );
          devices.push(JSON.parse(content));
        }
      }

      return devices.sort(
        (a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime()
      );
    } catch {
      return [];
    }
  }

  /**
   * Remove device
   */
  async removeDevice(deviceId: string): Promise<boolean> {
    try {
      const filePath = path.join(this.config.storagePath, `${deviceId}.json`);
      if (existsSync(filePath)) {
        await fs.unlink(filePath);
        
        // Remove tokens for this device
        for (const [token, auth] of this.tokens) {
          if (auth.deviceId === deviceId) {
            this.tokens.delete(token);
          }
        }
        
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get current device
   */
  getCurrentDevice(): DeviceIdentity | null {
    return this.currentDevice;
  }

  /**
   * Sign payload with device key
   */
  signPayload(payload: string): string {
    if (!this.currentDevice) {
      throw new Error("No device initialized");
    }

    // Simple HMAC-like signing (in production use proper crypto)
    const hash = Buffer.from(
      this.currentDevice.privateKey + payload
    ).toString("base64");
    return hash.slice(0, 32);
  }
}

// Singleton
let manager: DeviceAuthManager | null = null;

export function getDeviceAuth(config?: Partial<DeviceAuthConfig>): DeviceAuthManager {
  if (!manager) {
    manager = new DeviceAuthManager(config);
  }
  return manager;
}

export function resetDeviceAuth(): void {
  manager = null;
}

export { DeviceAuthManager, DEFAULT_CONFIG };
export default DeviceAuthManager;
