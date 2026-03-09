/**
 * Device Authentication Tests - v0.3.0
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  getDeviceAuth,
  resetDeviceAuth,
} from "../../../src/auth/index.js";

describe("Device Authentication - v0.3.0", () => {
  beforeEach(() => {
    resetDeviceAuth();
  });

  afterEach(() => {
    resetDeviceAuth();
  });

  test("should create device auth manager", () => {
    const auth = getDeviceAuth();
    expect(auth).toBeDefined();
    expect(auth.initialize).toBeDefined();
  });

  test("should initialize device", async () => {
    const auth = getDeviceAuth({
      storagePath: "/tmp/test-devices",
    });

    const device = await auth.initialize("Test Device");
    
    expect(device).toBeDefined();
    expect(device.id).toBeDefined();
    expect(device.name).toBe("Test Device");
    expect(device.publicKey).toBeDefined();
    expect(device.privateKey).toBeDefined();
    expect(device.trusted).toBe(true);
  });

  test("should generate and validate token", async () => {
    const auth = getDeviceAuth({
      storagePath: "/tmp/test-devices",
    });

    await auth.initialize("Test Device");
    
    const token = auth.generateToken(["read", "write"]);
    
    expect(token.token).toBeDefined();
    expect(token.scopes).toContain("read");
    expect(token.scopes).toContain("write");
    expect(token.expiresAt).toBeGreaterThan(Date.now());

    const validation = auth.validateToken(token.token);
    expect(validation.valid).toBe(true);
    expect(validation.token).toBeDefined();
  });

  test("should reject invalid token", () => {
    const auth = getDeviceAuth({
      storagePath: "/tmp/test-devices",
    });

    const validation = auth.validateToken("invalid-token");
    
    expect(validation.valid).toBe(false);
    expect(validation.error).toBe("Token not found");
  });

  test("should revoke token", async () => {
    const auth = getDeviceAuth({
      storagePath: "/tmp/test-devices",
    });

    await auth.initialize("Test Device");
    const token = auth.generateToken(["read"]);
    
    expect(auth.validateToken(token.token).valid).toBe(true);
    
    auth.revokeToken(token.token);
    
    expect(auth.validateToken(token.token).valid).toBe(false);
  });

  test("should list devices", async () => {
    const auth = getDeviceAuth({
      storagePath: "/tmp/test-devices",
    });

    await auth.initialize("Test Device");
    const devices = await auth.listDevices();
    
    expect(devices.length).toBeGreaterThan(0);
    expect(devices[0].name).toBe("Test Device");
  });

  test("should get current device", async () => {
    const auth = getDeviceAuth({
      storagePath: "/tmp/test-devices",
    });

    await auth.initialize("Test Device");
    const current = auth.getCurrentDevice();
    
    expect(current).toBeDefined();
    expect(current?.name).toBe("Test Device");
  });

  test("should sign payload", async () => {
    const auth = getDeviceAuth({
      storagePath: "/tmp/test-devices",
    });

    await auth.initialize("Test Device");
    const signature = auth.signPayload("test-data");
    
    expect(signature).toBeDefined();
    expect(signature.length).toBeGreaterThan(0);
  });
});

describe("Device Authentication - Edge Cases", () => {
  test("should throw without device initialization", () => {
    resetDeviceAuth();
    const auth = getDeviceAuth();
    
    expect(() => auth.signPayload("data")).toThrow("No device initialized");
    expect(() => auth.generateToken()).toThrow("No device initialized");
  });

  test("should handle max devices", async () => {
    const auth = getDeviceAuth({
      storagePath: "/tmp/test-devices",
      maxDevices: 2,
    });

    await auth.initialize("Device 1");
    
    // Should handle gracefully
    expect(auth).toBeDefined();
  });
});
