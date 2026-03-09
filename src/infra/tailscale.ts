/**
 * Tailscale Integration - v0.3.0
 *
 * Zero-config VPN for secure remote gateway access.
 * No port forwarding required, works through NAT/firewalls.
 */

import { spawn } from "node:child_process";
import { EventEmitter } from "events";

export interface TailscaleConfig {
  enabled: boolean;
  autoStart: boolean;
  advertiseExitNode?: boolean;
}

export interface TailscaleDevice {
  id: string;
  name: string;
  address: string;
  online: boolean;
  user: string;
  os: string;
}

class TailscaleIntegration extends EventEmitter {
  private config: TailscaleConfig;
  private connected = false;

  constructor(config: Partial<TailscaleConfig> = {}) {
    super();
    this.config = {
      enabled: false,
      autoStart: true,
      advertiseExitNode: false,
      ...config,
    };
  }

  /**
   * Check if Tailscale is installed
   */
  async isInstalled(): Promise<boolean> {
    try {
      const result = await this.execCommand("tailscale", ["version"]);
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * Check if Tailscale is running
   */
  async isRunning(): Promise<boolean> {
    try {
      const result = await this.execCommand("tailscale", ["status", "--json"]);
      if (!result.success) return false;
      const status = JSON.parse(result.stdout);
      return status?.Self?.Online || false;
    } catch {
      return false;
    }
  }

  /**
   * Get Tailscale status
   */
  async getStatus(): Promise<{
    installed: boolean;
    running: boolean;
    connected: boolean;
    myIP?: string;
  }> {
    const installed = await this.isInstalled();
    const running = installed ? await this.isRunning() : false;

    if (running) {
      try {
        const result = await this.execCommand("tailscale", ["status", "--json"]);
        const status = JSON.parse(result.stdout);
        return {
          installed,
          running,
          connected: status?.Self?.Online || false,
          myIP: status?.Self?.TailscaleIPs?.[0],
        };
      } catch {
        return { installed, running, connected: false };
      }
    }

    return { installed, running, connected: false };
  }

  /**
   * Start Tailscale daemon
   */
  async start(): Promise<boolean> {
    const status = await this.getStatus();
    
    if (!status.installed) {
      console.log("⚠️  Tailscale not installed");
      console.log("   Install: https://tailscale.com/download");
      return false;
    }

    if (status.running) {
      console.log("✅ Tailscale already running");
      this.emit("ready", { ip: status.myIP });
      return true;
    }

    console.log("🚀 Starting Tailscale...");

    let result;
    if (process.platform === "darwin") {
      result = await this.execCommand("sudo", ["tailscaled", "--daemon"]);
    } else if (process.platform === "linux") {
      result = await this.execCommand("sudo", ["systemctl", "start", "tailscaled"]);
    } else {
      console.log("⚠️  Windows not yet supported for auto-start");
      return false;
    }

    if (result.success) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const newStatus = await this.getStatus();
      
      if (newStatus.running) {
        console.log(`✅ Tailscale ready: ${newStatus.myIP}`);
        this.emit("ready", { ip: newStatus.myIP });
        return true;
      }
    }

    return false;
  }

  /**
   * Get my Tailscale IP
   */
  async getMyIP(): Promise<string | undefined> {
    const result = await this.execCommand("tailscale", ["ip", "-4"]);
    if (result.success) {
      return result.stdout.trim();
    }
    return undefined;
  }

  /**
   * Generate gateway URL for this device
   */
  async getGatewayURL(port: number = 7777): Promise<string | undefined> {
    const ip = await this.getMyIP();
    if (!ip) return undefined;
    return `wss://${ip}:${port}`;
  }

  /**
   * Execute command helper
   */
  private execCommand(cmd: string, args: string[]): Promise<{ success: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("exit", (code) => {
        resolve({ success: code === 0, stdout, stderr });
      });

      child.on("error", () => {
        resolve({ success: false, stdout, stderr });
      });
    });
  }
}

// Singleton
let instance: TailscaleIntegration | null = null;

export function getTailscaleIntegration(config?: Partial<TailscaleConfig>): TailscaleIntegration {
  if (!instance) {
    instance = new TailscaleIntegration(config);
  }
  return instance;
}

export { TailscaleIntegration };
export default TailscaleIntegration;
