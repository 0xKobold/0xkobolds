/**
 * Real Gateway Server Tests - v0.2.0
 * 
 * Tests for the Bun-native WebSocket + HTTP gateway.
 * Uses process-specific port to avoid conflicts.
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";

// Use unique port based on process ID to avoid conflicts when running in parallel
const testPort = 30000 + (process.pid % 10000);

describe("Real Gateway Server - v0.2.0", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let gateway: any;

  beforeAll(async () => {
    const { default: RealGatewayServer } = await import("../../../src/gateway/server.js");
    gateway = new RealGatewayServer({ port: testPort, host: "localhost", cors: true });
    await gateway.start();
    await new Promise(r => setTimeout(r, 100));
  }, 10000);

  afterAll(() => {
    gateway?.stop();
  });

  test("should start server", () => {
    expect(gateway.isRunning()).toBe(true);
  });

  test.skipIf(process.env.CI)("should respond to health check", async () => {
    const response = await fetch(`http://localhost:${testPort}/health`);
    expect(response.status).toBe(200);
    
    const data = await response.json() as { status: string; connections: number };
    expect(data.status).toBe("healthy");
  });

  test.skipIf(process.env.CI)("should respond to status endpoint", async () => {
    const response = await fetch(`http://localhost:${testPort}/status`);
    expect(response.status).toBe(200);
    
    const data = await response.json() as { running: boolean };
    expect(data.running).toBe(true);
  }, 5000);

  test("should accept WebSocket connections", async () => {
    const ws = new WebSocket(`ws://localhost:${testPort}/ws?type=web`);
    
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("WebSocket failed"));
      setTimeout(() => reject(new Error("Timeout")), 5000);
    });

    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  test("should handle message ping/pong", async () => {
    const ws = new WebSocket(`ws://localhost:${testPort}/ws?type=web`);
    
    await new Promise<void>((resolve) => {
      ws.onopen = () => resolve();
    });

    // Consume welcome
    await new Promise<void>((resolve) => {
      ws.onmessage = () => resolve();
    });

    const pingMessage = {
      type: "ping",
      id: "test-ping",
      payload: { test: true },
      timestamp: Date.now(),
    };

    const response = await new Promise<unknown>((resolve) => {
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          if (data.type === "pong") resolve(data);
        } catch { /* ignore */ }
      };
      ws.send(JSON.stringify(pingMessage));
    });

    const data = response as { type: string; id: string };
    expect(data.type).toBe("pong");
    expect(data.id).toBe("test-ping");
    ws.close();
  });

  test.skipIf(process.env.CI)("should handle send endpoint", async () => {
    if (!gateway.isRunning()) return;
    
    const response = await fetch(`http://localhost:${testPort}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Hello", type: "chat" }),
    });

    expect(response.status).toBe(200);
    const data = await response.json() as { sent: number };
    expect(typeof data.sent).toBe("number");
  });

  test.skipIf(process.env.CI)("should return 404 for unknown routes", async () => {
    const response = await fetch(`http://localhost:${testPort}/unknown`);
    expect(response.status).toBe(404);
  });

  test("should track connections", () => {
    expect(typeof gateway.getConnectionCount()).toBe("number");
    expect(Array.isArray(gateway.getConnections())).toBe(true);
  });
});
