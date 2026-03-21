/**
 * Agent Body Sensors - "What Can I Feel?"
 * 
 * Provides internal and external sensing capabilities.
 * Each sensor gracefully degrades if not available.
 */

import { readFile } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { platform } from 'node:os';

const execAsync = promisify(exec);

export interface SensorReading {
  value: number | string | Record<string, unknown> | null;
  unit?: string;
  timestamp: number;
  source: string;
  error?: string;
}

export interface Sensor {
  name: string;
  category: 'internal' | 'external' | 'network';
  available: boolean;
  read(): Promise<SensorReading>;
}

/**
 * CPU Temperature Sensor
 * Works on: Raspberry Pi, some Linux systems
 */
class CPUTempSensor implements Sensor {
  name = 'cpu_temp';
  category = 'internal' as const;
  available = false;

  constructor() {
    this.checkAvailability();
  }

  private async checkAvailability(): Promise<void> {
    try {
      // Pi: /sys/class/thermal/thermal_zone0/temp
      // Linux: /sys/class/hwmon/hwmon*/temp1_input
      if (process.platform === 'linux') {
        await readFile('/sys/class/thermal/thermal_zone0/temp');
        this.available = true;
      } else if (process.platform === 'darwin') {
        // Mac: use osx-cpu-temp or system profiler
        const { stdout } = await execAsync('sysctl -n hw.TCSBR 2>/dev/null || echo ""');
        this.available = stdout.trim().length > 0;
      }
    } catch {
      this.available = false;
    }
  }

  async read(): Promise<SensorReading> {
    const timestamp = Date.now();
    
    if (!this.available) {
      return { value: null, timestamp, source: this.name };
    }

    try {
      if (process.platform === 'linux') {
        // Try Pi thermal zone first
        try {
          const temp = await readFile('/sys/class/thermal/thermal_zone0/temp', 'utf-8');
          return {
            value: parseInt(temp.trim()) / 1000, // Convert millidegrees to degrees
            unit: '°C',
            timestamp,
            source: this.name,
          };
        } catch {}

        // Try hwmon
        try {
          const { stdout } = await execAsync('cat /sys/class/hwmon/hwmon*/temp1_input 2>/dev/null | head -1');
          return {
            value: parseInt(stdout.trim()) / 1000,
            unit: '°C',
            timestamp,
            source: this.name,
          };
        } catch {}
      }

      if (process.platform === 'darwin') {
        const { stdout } = await execAsync('sysctl -n hw.TCSBR 2>/dev/null || echo ""');
        if (stdout.trim()) {
          return {
            value: parseFloat(stdout.trim()),
            unit: '°C',
            timestamp,
            source: this.name,
          };
        }
      }

      return { value: null, timestamp, source: this.name };
    } catch (error) {
      return {
        value: null,
        timestamp,
        source: this.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * CPU Load Sensor
 * Works on: All platforms
 */
class CPULoadSensor implements Sensor {
  name = 'cpu_load';
  category = 'internal' as const;
  available = true; // Always available via os.loadavg()

  async read(): Promise<SensorReading> {
    const timestamp = Date.now();
    
    try {
      const loadavg = require('os').loadavg();
      return {
        value: loadavg[0], // 1-minute average
        unit: 'load',
        timestamp,
        source: this.name,
      };
    } catch (error) {
      return {
        value: null,
        timestamp,
        source: this.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Memory Usage Sensor
 * Works on: All platforms
 */
class MemorySensor implements Sensor {
  name = 'memory_used';
  category = 'internal' as const;
  available = true; // Always available

  async read(): Promise<SensorReading> {
    const timestamp = Date.now();
    
    try {
      const os = require('os');
      const total = os.totalmem();
      const free = os.freemem();
      const used = total - free;
      const percent = (used / total) * 100;

      return {
        value: {
          used: Math.round(used / 1024 / 1024), // MB
          total: Math.round(total / 1024 / 1024), // MB
          percent: Math.round(percent * 10) / 10, // 1 decimal
        } as Record<string, unknown>,
        unit: 'MB',
        timestamp,
        source: this.name,
      };
    } catch (error) {
      return {
        value: null,
        timestamp,
        source: this.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Disk Usage Sensor
 * Works on: All platforms
 */
class DiskSensor implements Sensor {
  name = 'disk_space';
  category = 'internal' as const;
  available = true;

  async read(): Promise<SensorReading> {
    const timestamp = Date.now();
    
    try {
      const { stdout } = await execAsync('df -h / 2>/dev/null | tail -1');
      const parts = stdout.trim().split(/\s+/);
      
      // Format: Filesystem Size Used Avail Use% Mounted
      return {
        value: {
          size: parts[1],
          used: parts[2],
          available: parts[3],
          percent: parseInt(parts[4]),
        } as Record<string, unknown>,
        unit: 'GB',
        timestamp,
        source: this.name,
      };
    } catch (error) {
      // Fallback: try to get basic info
      try {
        const { stdout } = await execAsync('df / 2>/dev/null | tail -1');
        const parts = stdout.trim().split(/\s+/);
        return {
          value: {
            size: Math.round(parseInt(parts[1]) / 1024 / 1024), // GB
            used: Math.round(parseInt(parts[2]) / 1024 / 1024),
            available: Math.round(parseInt(parts[3]) / 1024 / 1024),
            percent: parseInt(parts[4]?.replace('%', '') || '0'),
          } as Record<string, unknown>,
          unit: 'GB',
          timestamp,
          source: this.name,
        };
      } catch {
        return {
          value: null,
          timestamp,
          source: this.name,
          error: 'Cannot read disk info',
        };
      }
    }
  }
}

/**
 * Network Interface Sensor
 * Works on: All platforms
 */
class NetworkSensor implements Sensor {
  name = 'network';
  category = 'internal' as const;
  available = true;

  async read(): Promise<SensorReading> {
    const timestamp = Date.now();
    
    try {
      const os = require('os');
      const interfaces = os.networkInterfaces();
      const result: Record<string, { address: string; family: string }> = {};

      for (const [name, addrs] of Object.entries(interfaces)) {
        const ipv4 = (addrs as Array<{ family: string; address: string }>)?.find((a) => a.family === 'IPv4');
        if (ipv4 && !name.startsWith('lo')) {
          result[name] = {
            address: ipv4.address,
            family: ipv4.family,
          };
        }
      }

      return {
        value: result as Record<string, unknown>,
        timestamp,
        source: this.name,
      };
    } catch (error) {
      return {
        value: null,
        timestamp,
        source: this.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Uptime Sensor
 * Works on: All platforms
 */
class UptimeSensor implements Sensor {
  name = 'uptime';
  category = 'internal' as const;
  available = true;

  async read(): Promise<SensorReading> {
    const timestamp = Date.now();
    
    try {
      const os = require('os');
      const uptimeSeconds = os.uptime();
      const days = Math.floor(uptimeSeconds / 86400);
      const hours = Math.floor((uptimeSeconds % 86400) / 3600);
      const minutes = Math.floor((uptimeSeconds % 3600) / 60);

      return {
        value: {
          seconds: uptimeSeconds,
          formatted: days > 0 ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m`,
        } as Record<string, unknown>,
        unit: 's',
        timestamp,
        source: this.name,
      };
    } catch (error) {
      return {
        value: null,
        timestamp,
        source: this.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

/**
 * Sensor Registry
 * Manages all available sensors
 */
export class SensorRegistry {
  private sensors: Map<string, Sensor> = new Map();

  /**
   * Discover and register available sensors
   */
  async discover(): Promise<void> {
    // Internal sensors - always available (or gracefully degrade)
    this.register(new CPUTempSensor());
    this.register(new CPULoadSensor());
    this.register(new MemorySensor());
    this.register(new DiskSensor());
    this.register(new NetworkSensor());
    this.register(new UptimeSensor());

    // Wait for availability checks
    await Promise.all(
      Array.from(this.sensors.values()).map(async (sensor) => {
        if (sensor.available === false) {
          // Already determined unavailable via constructor
          return;
        }
        // Try to read to confirm availability
        try {
          const reading = await sensor.read();
          sensor.available = reading.value !== null;
        } catch {
          sensor.available = false;
        }
      })
    );
  }

  /**
   * Register a sensor
   */
  register(sensor: Sensor): void {
    this.sensors.set(sensor.name, sensor);
  }

  /**
   * Read from a specific sensor
   */
  async read(name: string): Promise<SensorReading | null> {
    const sensor = this.sensors.get(name);
    if (!sensor) {
      return {
        value: null,
        timestamp: Date.now(),
        source: name,
        error: 'Sensor not found',
      };
    }

    if (!sensor.available) {
      return {
        value: null,
        timestamp: Date.now(),
        source: name,
        error: 'Sensor unavailable',
      };
    }

    return sensor.read();
  }

  /**
   * Read all available sensors
   */
  async readAll(): Promise<Record<string, SensorReading>> {
    const results: Record<string, SensorReading> = {};

    for (const [name, sensor] of this.sensors) {
      if (sensor.available) {
        results[name] = await sensor.read();
      }
    }

    return results;
  }

  /**
   * Get list of available sensors
   */
  listAvailable(): string[] {
    return Array.from(this.sensors.entries())
      .filter(([_, sensor]) => sensor.available)
      .map(([name]) => name);
  }

  /**
   * Get all sensors (including unavailable)
   */
  listAll(): { name: string; category: string; available: boolean }[] {
    return Array.from(this.sensors.entries()).map(([name, sensor]) => ({
      name,
      category: sensor.category,
      available: sensor.available,
    }));
  }
}