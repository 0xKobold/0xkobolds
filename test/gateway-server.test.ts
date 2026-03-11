import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  createGateway,
  PROTOCOL_VERSION,
  ErrorCodes,
} from "../src/gateway/index";
import { GatewayChatClient } from "../src/tui/gateway-chat-client";

describe("Gateway Server", () => {
  let gateways: ReturnType<typeof createGateway>[] = [];
  let clients: GatewayChatClient[] = [];

  const getPort = () => 18000 + Math.floor(Math.random() * 1000);

  afterEach(async () => {
    // Clean up all clients first
    for (const client of clients) {
      client.disconnect();
    }
    clients = [];

    // Stop all gateways
    for (const gw of gateways) {
      gw.stop();
    }
    gateways = [];

    await new Promise((r) => setTimeout(r, 50));
  });

  it("should start and expose health endpoint", async () => {
    const port = getPort();
    const gateway = createGateway({ port, host: "127.0.0.1" });
    gateways.push(gateway);
    await gateway.start();

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { ok: boolean };
    expect(data.ok).toBe(true);
  });

  it("should expose protocol info", async () => {
    const port = getPort();
    const gateway = createGateway({ port, host: "127.0.0.1" });
    gateways.push(gateway);
    await gateway.start();

    const response = await fetch(`http://127.0.0.1:${port}/protocol`);
    expect(response.status).toBe(200);
    const data = (await response.json()) as { version: string; methods: string[] };
    expect(data.version).toBe(PROTOCOL_VERSION);
    expect(data.methods).toContain("agent.run");
    expect(data.methods).toContain("agent.status");
    expect(data.methods).toContain("agent.wait");
  });

  it("should accept WebSocket connections", async () => {
    const port = getPort();
    const gateway = createGateway({ port, host: "127.0.0.1" });
    gateways.push(gateway);
    await gateway.start();

    const client = new GatewayChatClient({
      url: `ws://127.0.0.1:${port}`,
    });
    clients.push(client);

    await new Promise<void>((resolve, reject) => {
      client.on("ready", (info) => {
        expect(info.sessionId).toBeDefined();
        expect(info.capabilities).toContain("agent.run");
        resolve();
      });
      client.on("error", reject);

      client.connect().catch(reject);
    });
  });

  it("should reject invalid requests", async () => {
    const port = getPort();
    const gateway = createGateway({ port, host: "127.0.0.1" });
    gateways.push(gateway);
    await gateway.start();

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send("not json");
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data as string) as { error: { code: string } };
        expect(data.error.code).toBe(String(ErrorCodes.PARSE_ERROR));
        resolve();
        ws.close();
      };
    });
  });

  it("should return method not found for unknown methods", async () => {
    const port = getPort();
    const gateway = createGateway({ port, host: "127.0.0.1" });
    gateways.push(gateway);
    await gateway.start();

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            id: "test-1",
            method: "unknown.method",
            params: {},
          }),
        );
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data as string) as { error: { code: string } };
        expect(data.error.code).toBe(String(ErrorCodes.METHOD_NOT_FOUND));
        resolve();
        ws.close();
      };
    });
  });

  it("should track connection count", async () => {
    const port = getPort();
    const gateway = createGateway({ port, host: "127.0.0.1" });
    gateways.push(gateway);
    await gateway.start();

    const client = new GatewayChatClient({
      url: `ws://127.0.0.1:${port}`,
    });
    clients.push(client);

    await new Promise<void>((resolve, reject) => {
      client.on("ready", resolve);
      client.on("error", reject);
      client.connect().catch(reject);
    });

    expect(gateway.getConnectionCount()).toBe(1);
    client.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    expect(gateway.getConnectionCount()).toBe(0);
  });

  it("should reject agent.run with invalid params", async () => {
    const port = getPort();
    const gateway = createGateway({ port, host: "127.0.0.1" });
    gateways.push(gateway);
    await gateway.start();

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

    await new Promise<void>((resolve) => {
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            id: "test-run",
            method: "agent.run",
            params: {}, // Missing message
          }),
        );
      };

      ws.onmessage = (event: { data: string }) => {
        const data = JSON.parse(event.data) as { error?: { code: string } };
        expect(data.error?.code).toBe(String(ErrorCodes.INVALID_PARAMS));
        resolve();
        ws.close();
      };
    });
  });
});
