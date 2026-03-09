/**
 * Tailscale Integration Tests - v0.3.0
 */

import { describe, test, expect } from "bun:test";
import { getTailscaleIntegration } from "../../../src/infra/index.js";

describe("Tailscale Integration - v0.3.0", () => {
  test("should create Tailscale instance", () => {
    const ts = getTailscaleIntegration();
    expect(ts).toBeDefined();
    expect(typeof ts.isInstalled).toBe("function");
  });

  test("should check installed status", async () => {
    const ts = getTailscaleIntegration();
    const installed = await ts.isInstalled();
    expect(typeof installed).toBe("boolean");
  });

  test("should return status object", async () => {
    const ts = getTailscaleIntegration();
    const status = await ts.getStatus();
    
    expect(status).toHaveProperty("installed");
    expect(status).toHaveProperty("running");
    expect(status).toHaveProperty("connected");
    expect(typeof status.installed).toBe("boolean");
  });

  test("should generate gateway URL when connected", async () => {
    // Skip if Tailscale not installed
    const ts = getTailscaleIntegration();
    const status = await ts.getStatus();
    
    if (!status.installed) {
      console.log("Skipping - Tailscale not installed");
      return;
    }
    
    const url = await ts.getGatewayURL(7777);
    
    // Will be undefined if not connected
    if (url) {
      expect(url.startsWith("wss://")).toBe(true);
      expect(url.includes(":" + 7777)).toBe(true);
    }
  });
});
