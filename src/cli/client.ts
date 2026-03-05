import { Socket, createConnection } from "node:net";
import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, readFileSync } from "node:fs";

interface KoboldRequest {
  type: string;
  [key: string]: any;
}

interface KoboldResponse {
  success: boolean;
  error?: string;
  [key: string]: any;
}

export class KoboldClient {
  private socket: Socket | null = null;
  private socketPath: string;
  private port: number;
  private host: string;
  private useUnixSocket: boolean;

  constructor() {
    this.socketPath = join(homedir(), ".0xkobold", "daemon.sock");
    this.port = 3456;
    this.host = "localhost";
    this.useUnixSocket = true;

    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      const configPath = join(homedir(), ".0xkobold", "config.json");
      if (existsSync(configPath)) {
        const config = JSON.parse(readFileSync(configPath, "utf-8"));
        if (config.daemon?.port) this.port = config.daemon.port;
        if (config.daemon?.host) this.host = config.daemon.host;
      }
    } catch {
    }
  }

  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.socket) {
        resolve(true);
        return;
      }

      this.socket = new Socket();
      
      const onConnect = () => {
        resolve(true);
      };

      const onError = (err: Error) => {
        this.socket = null;
        resolve(false);
      };

      const onClose = () => {
        this.socket = null;
      };

      this.socket.once("connect", onConnect);
      this.socket.once("error", onError);
      this.socket.on("close", onClose);

      if (this.useUnixSocket && existsSync(this.socketPath)) {
        this.socket.connect(this.socketPath);
      } else {
        this.socket.connect(this.port, this.host);
      }

      setTimeout(() => {
        if (!this.socket?.writable) {
          this.socket?.destroy();
          this.socket = null;
          resolve(false);
        }
      }, 5000);
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
  }

  async send(request: KoboldRequest): Promise<KoboldResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.writable) {
        reject(new Error("Not connected to daemon"));
        return;
      }

      let buffer = "";

      const onData = (data: Buffer) => {
        buffer += data.toString();
        
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              cleanup();
              resolve(response);
              return;
            } catch (err) {
              cleanup();
              reject(new Error(`Invalid response: ${line}`));
              return;
            }
          }
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const onClose = () => {
        cleanup();
        reject(new Error("Connection closed"));
      };

      const cleanup = () => {
        this.socket?.off("data", onData);
        this.socket?.off("error", onError);
        this.socket?.off("close", onClose);
      };

      this.socket.on("data", onData);
      this.socket.once("error", onError);
      this.socket.once("close", onClose);

      const message = JSON.stringify(request) + "\n";
      this.socket.write(message, (err) => {
        if (err) {
          cleanup();
          reject(err);
        }
      });

      setTimeout(() => {
        cleanup();
        reject(new Error("Request timeout"));
      }, 60000);
    });
  }

  async sendStream(
    request: KoboldRequest,
    onChunk: (chunk: string) => void
  ): Promise<KoboldResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.writable) {
        reject(new Error("Not connected to daemon"));
        return;
      }

      let buffer = "";
      let response: KoboldResponse | null = null;

      const onData = (data: Buffer) => {
        buffer += data.toString();
        
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              
              if (parsed.stream) {
                onChunk(parsed.content);
              } else {
                response = parsed;
                cleanup();
                resolve(response);
                return;
              }
            } catch {
              onChunk(line);
            }
          }
        }
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      const onClose = () => {
        cleanup();
        if (response) {
          resolve(response);
        } else {
          reject(new Error("Connection closed unexpectedly"));
        }
      };

      const cleanup = () => {
        this.socket?.off("data", onData);
        this.socket?.off("error", onError);
        this.socket?.off("close", onClose);
      };

      this.socket.on("data", onData);
      this.socket.once("error", onError);
      this.socket.once("close", onClose);

      const message = JSON.stringify({ ...request, stream: true }) + "\n";
      this.socket.write(message, (err) => {
        if (err) {
          cleanup();
          reject(err);
        }
      });

      setTimeout(() => {
        cleanup();
        reject(new Error("Request timeout"));
      }, 60000);
    });
  }

  async ping(): Promise<boolean> {
    try {
      const response = await this.send({ type: "ping" });
      return response.success;
    } catch {
      return false;
    }
  }

  async health(): Promise<{ status: string; uptime: number; version: string } | null> {
    try {
      const response = await this.send({ type: "health" });
      return response.success ? response.data : null;
    } catch {
      return null;
    }
  }
}

export const createClient = (): KoboldClient => {
  return new KoboldClient();
};
