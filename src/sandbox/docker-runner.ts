/**
 * Docker Sandbox Runner - v0.3.0
 *
 * Containerized execution for security isolation.
 * Docker sandboxing for tools and agent execution.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { existsSync } from "node:fs";

export interface DockerConfig {
  image: string;
  memoryLimit: string;    // e.g., "512m"
  cpuLimit: string;       // e.g., "1.0"
  timeout: number;          // milliseconds
  volumes: Array<{ host: string; container: string; readonly?: boolean }>;
  network: "none" | "host" | "bridge";
  user: string;
  workingDir: string;
}

export interface DockerRunOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  stdin?: string;
  timeout?: number;
}

export interface DockerRunResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
  killed?: boolean;
}

const DEFAULT_CONFIG: DockerConfig = {
  image: "node:20-slim",
  memoryLimit: "512m",
  cpuLimit: "1.0",
  timeout: 30000,
  volumes: [],
  network: "none",
  user: "node",
  workingDir: "/workspace",
};

class DockerRunner {
  private config: DockerConfig;
  private available: boolean | null = null;

  constructor(config: Partial<DockerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if Docker is available
   */
  async isAvailable(): Promise<boolean> {
    if (this.available !== null) return this.available;

    try {
      const result = await this.execCommand("docker", ["version"]);
      this.available = result.success;
      return this.available;
    } catch {
      this.available = false;
      return false;
    }
  }

  /**
   * Run command in Docker container
   */
  async run(options: DockerRunOptions): Promise<DockerRunResult> {
    if (!(await this.isAvailable())) {
      return {
        success: false,
        stdout: "",
        stderr: "Docker not available. Install Docker or check permissions.",
        exitCode: -1,
        duration: 0,
      };
    }

    const startTime = Date.now();
    const timeout = options.timeout || this.config.timeout;

    // Build docker run arguments
    const args: string[] = [
      "run",
      "--rm",
      "--memory", this.config.memoryLimit,
      "--cpus", this.config.cpuLimit,
      "--network", this.config.network,
      "--user", this.config.user,
      "--workdir", this.config.workingDir,
      "-i", // Interactive for stdin
    ];

    // Add timeout
    if (timeout > 0) {
      args.push("--stop-timeout", String(Math.floor(timeout / 1000)));
    }

    // Add volumes
    for (const vol of this.config.volumes) {
      const ro = vol.readonly ? ":ro" : "";
      args.push("-v", `${vol.host}:${vol.container}${ro}`);
    }

    // Add environment variables
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    // Add image
    args.push(this.config.image);

    // Add command
    args.push(options.command);
    if (options.args) {
      args.push(...options.args);
    }

    return new Promise((resolve) => {
      const child = spawn("docker", args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      let killed = false;

      // Collect stdout
      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      // Collect stderr
      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      // Send stdin if provided
      if (options.stdin) {
        child.stdin?.write(options.stdin);
        child.stdin?.end();
      }

      // Timeout handling
      const timeoutId = setTimeout(() => {
        killed = true;
        child.kill("SIGKILL");
      }, timeout);

      // Process completion
      child.on("exit", (code) => {
        clearTimeout(timeoutId);
        const duration = Date.now() - startTime;

        resolve({
          success: code === 0 && !killed,
          stdout,
          stderr,
          exitCode: code ?? -1,
          duration,
          killed,
        });
      });

      child.on("error", (err) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          stdout,
          stderr: err.message,
          exitCode: -1,
          duration: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * Create workspace volume
   */
  async createWorkspace(workspacePath: string): Promise<string> {
    const containerPath = `/workspace-${Date.now()}`;
    this.config.volumes.push({
      host: workspacePath,
      container: containerPath,
      readonly: false,
    });
    return containerPath;
  }

  /**
   * Pull image if not present
   */
  async pullImage(): Promise<boolean> {
    try {
      const result = await this.execCommand("docker", [
        "pull",
        this.config.image,
      ]);
      return result.success;
    } catch {
      return false;
    }
  }

  /**
   * Get container logs
   */
  async getLogs(containerId: string): Promise<string> {
    const result = await this.execCommand("docker", ["logs", containerId]);
    return result.success ? result.stdout : "";
  }

  /**
   * List running containers
   */
  async listContainers(): Promise<string[]> {
    const result = await this.execCommand("docker", [
      "ps",
      "--format",
      "{{.ID}}",
    ]);
    return result.success ? result.stdout.trim().split("\n").filter(Boolean) : [];
  }

  /**
   * Stop container
   */
  async stopContainer(containerId: string): Promise<boolean> {
    const result = await this.execCommand("docker", ["stop", containerId]);
    return result.success;
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
let runner: DockerRunner | null = null;

export function getDockerRunner(config?: Partial<DockerConfig>): DockerRunner {
  if (!runner) {
    runner = new DockerRunner(config);
  }
  return runner;
}

export function resetDockerRunner(): void {
  runner = null;
}

export { DockerRunner, DEFAULT_CONFIG };
export default DockerRunner;
