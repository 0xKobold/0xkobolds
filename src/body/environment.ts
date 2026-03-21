/**
 * Agent Body - Environment Scanner
 * 
 * Detects who and what is around - network peers, services, users.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type { PlatformInfo } from './platform';

const execAsync = promisify(exec);

export interface NetworkPeer {
  name: string;
  ip: string;
  online: boolean;
  lastSeen?: string;
  type?: 'device' | 'service' | 'agent';
}

export interface ServiceStatus {
  name: string;
  running: boolean;
  port?: number;
  pid?: number;
}

export interface Environment {
  // Network presence
  network: {
    tailscale: NetworkPeer[];
    local: NetworkPeer[];
    gateway: NetworkPeer[];
  };

  // Services running
  services: ServiceStatus[];

  // Temporal context
  temporal: {
    timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    dayOfWeek: number;
    isWorkday: boolean;
    isQuietHours: boolean;
  };

  // When scanned
  timestamp: number;
}

/**
 * Environment Scanner
 * 
 * Detects presence of devices, users, and services.
 */
export class EnvironmentScanner {
  private platform: PlatformInfo | null = null;

  setPlatform(platform: PlatformInfo): void {
    this.platform = platform;
  }

  /**
   * Full environment scan
   */
  async scan(): Promise<Environment> {
    const timestamp = Date.now();

    const [tailscale, local, gateway, services] = await Promise.all([
      this.scanTailscale(),
      this.scanLocalNetwork(),
      this.scanGatewayConnections(),
      this.scanServices(),
    ]);

    const temporal = this.getTemporalContext();

    return {
      network: {
        tailscale,
        local,
        gateway,
      },
      services,
      temporal,
      timestamp,
    };
  }

  /**
   * Scan Tailscale peers
   */
  async scanTailscale(): Promise<NetworkPeer[]> {
    try {
      const { stdout } = await execAsync('tailscale status --json 2>/dev/null');
      const status = JSON.parse(stdout);
      
      if (!status.Peer) return [];

      return Object.values(status.Peer).map((peer: any) => ({
        name: peer.HostName || peer.DNSName?.split('.')[0] || 'unknown',
        ip: peer.TailscaleIPs?.[0] || '',
        online: peer.Online || false,
        lastSeen: peer.LastSeen,
        type: 'device' as const,
      }));
    } catch {
      // Tailscale not installed or not running
      return [];
    }
  }

  /**
   * Scan local network (simplified)
   */
  async scanLocalNetwork(): Promise<NetworkPeer[]> {
    try {
      // Get local network info
      const { stdout } = await execAsync('ip route 2>/dev/null || route -n 2>/dev/null || echo ""');
      
      // This is a simple check - real network scanning would need nmap or similar
      // For now, just return the gateway
      const gatewayMatch = stdout.match(/default via ([\d.]+)/);
      if (gatewayMatch) {
        return [{
          name: 'gateway',
          ip: gatewayMatch[1],
          online: true,
          type: 'device',
        }];
      }
    } catch {}
    
    return [];
  }

  /**
   * Scan gateway connections (0xKobold specific)
   */
  async scanGatewayConnections(): Promise<NetworkPeer[]> {
    try {
      // Check if gateway is running
      const response = await fetch('http://localhost:7777/status', {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) return [];

      const status = (await response.json()) as { connections?: Array<{ name?: string; type?: string; ip?: string; connected?: boolean }> };
      
      return (status.connections || []).map((conn) => ({
        name: conn.name || conn.type || 'unknown',
        ip: conn.ip || '',
        online: conn.connected || false,
        type: 'agent' as const,
      }));
    } catch {
      // Gateway not running
      return [];
    }
  }

  /**
   * Scan services status
   */
  async scanServices(): Promise<ServiceStatus[]> {
    const services: ServiceStatus[] = [];

    // Check gateway
    try {
      await execAsync('pgrep -f "gateway" || pgrep -f "0xkobold"');
      services.push({ name: 'gateway', running: true, port: 7777 });
    } catch {
      services.push({ name: 'gateway', running: false, port: 7777 });
    }

    // Check Mission Control
    try {
      await execAsync('pgrep -f "next" || pgrep -f "mission-control"');
      services.push({ name: 'mission-control', running: true, port: 5173 });
    } catch {
      services.push({ name: 'mission-control', running: false, port: 5173 });
    }

    // Check Discord bot (if configured)
    try {
      await execAsync('pgrep -f "discord"');
      services.push({ name: 'discord-bot', running: true });
    } catch {
      // Not running or not configured
    }

    return services;
  }

  /**
   * Get temporal context
   */
  private getTemporalContext(): Environment['temporal'] {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // Time of day
    let timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
    if (hour >= 6 && hour < 12) {
      timeOfDay = 'morning';
    } else if (hour >= 12 && hour < 18) {
      timeOfDay = 'afternoon';
    } else if (hour >= 18 && hour < 22) {
      timeOfDay = 'evening';
    } else {
      timeOfDay = 'night';
    }

    // Is workday? (Mon-Fri)
    const isWorkday = dayOfWeek >= 1 && dayOfWeek <= 5;

    // Is quiet hours? (22:00 - 07:00)
    const isQuietHours = hour >= 22 || hour < 7;

    return {
      timeOfDay,
      dayOfWeek,
      isWorkday,
      isQuietHours,
    };
  }

  /**
   * Quick check: who is around?
   */
  async whoIsAround(): Promise<{
    peers: NetworkPeer[];
    userDetected: boolean;
    userDevice?: string;
  }> {
    const tailscale = await this.scanTailscale();
    
    // Heuristic: if there are online Tailscale peers, user might be around
    // In future, could check for mobile device presence, etc.
    const onlinePeers = tailscale.filter(p => p.online);
    
    return {
      peers: onlinePeers,
      userDetected: onlinePeers.length > 0,
      userDevice: onlinePeers[0]?.name,
    };
  }

  /**
   * Quick check: is it quiet time?
   */
  isQuietHours(): boolean {
    const hour = new Date().getHours();
    return hour >= 22 || hour < 7;
  }

  /**
   * Check if specific service is running
   */
  async isServiceRunning(serviceName: string): Promise<boolean> {
    try {
      await execAsync(`pgrep -f "${serviceName}"`);
      return true;
    } catch {
      return false;
    }
  }
}