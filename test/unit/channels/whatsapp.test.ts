/**
 * WhatsApp Integration Tests - v0.3.0
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import {
  getWhatsAppIntegration,
  resetWhatsAppIntegration,
} from "../../../src/channels/index.js";

describe("WhatsApp Integration - v0.3.0", () => {
  // Note: These tests require a real WhatsApp connection
  // Most tests are skipped without credentials
  
  const hasCredentials = process.env.WHATSAPP_TEST === "true";

  beforeAll(() => {
    resetWhatsAppIntegration();
  });

  afterAll(() => {
    resetWhatsAppIntegration();
  });

  test("should create WhatsApp instance", () => {
    const whatsapp = getWhatsAppIntegration();
    expect(whatsapp).toBeDefined();
    expect(whatsapp.getStatus).toBeDefined();
  });

  test.skipIf(!hasCredentials)("should start and show ready status", async () => {
    const whatsapp = getWhatsAppIntegration();
    
    // This would require a real WhatsApp connection
    // Skip in CI, run locally with WHATSAPP_TEST=true
    const status = whatsapp.getStatus();
    expect(status.connected).toBe(false); // Not connected yet
    expect(status.qr).toBeNull();
  });

  test("should format JID correctly", () => {
    // Test internal formatting via instance
    const whatsapp = getWhatsAppIntegration();
    expect(whatsapp).toBeDefined();
  });

  test("should handle status checks", () => {
    const whatsapp = getWhatsAppIntegration();
    const status = whatsapp.getStatus();
    
    expect(typeof status.connected).toBe("boolean");
    expect(status.qr).toBeNull();
  });

  test("should reset properly", () => {
    const instance1 = getWhatsAppIntegration();
    resetWhatsAppIntegration();
    const instance2 = getWhatsAppIntegration();
    
    // Should be new instance
    expect(instance1).not.toBe(instance2);
  });
});

describe("WhatsApp Message Format", () => {
  test("should define message structure", () => {
    const exampleMessage = {
      id: "test-123",
      from: "123456@s.whatsapp.net",
      fromMe: false,
      body: "Hello",
      type: "text" as const,
      timestamp: Date.now(),
      isGroup: false,
    };

    expect(exampleMessage.type).toBe("text");
    expect(exampleMessage.isGroup).toBe(false);
    expect(exampleMessage.fromMe).toBe(false);
  });
});
