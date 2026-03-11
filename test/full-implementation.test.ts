import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import {
  createGateway,
  getSessionStore,
  createSessionStore,
} from "../src/gateway/index";
import {
  addAuthProfile,
  getApiKeyForProvider,
  markAuthProfileUsed,
  markAuthProfileFailure,
  clearAuthProfiles,
  runWithSimpleFallback,
  FailoverError,
  classifyFailoverReason,
} from "../src/agent/index";

describe("Full Implementation", () => {
  const gateway = createGateway({ port: 18888, host: "127.0.0.1" });

  afterAll(() => {
    gateway.stop();
    clearAuthProfiles();
  });

  describe("Phase 2: Session Persistence", () => {
    it("should persist sessions to SQLite", () => {
      const store = createSessionStore();

      store.set("test-session-1", {
        sessionId: "sess-1",
        sessionKey: "test-session-1",
        agentId: "coordinator",
        updatedAt: Date.now(),
        createdAt: Date.now(),
        modelOverride: "gpt-4",
      });

      const retrieved = store.get("test-session-1");
      expect(retrieved).toBeDefined();
      expect(retrieved?.sessionId).toBe("sess-1");
      expect(retrieved?.agentId).toBe("coordinator");
      expect(retrieved?.modelOverride).toBe("gpt-4");
    });

    it("should list sessions", () => {
      const store = createSessionStore();

      store.set("session-a", {
        sessionId: "a",
        sessionKey: "session-a",
        updatedAt: Date.now(),
        createdAt: Date.now(),
      });

      store.set("session-b", {
        sessionId: "b",
        sessionKey: "session-b",
        updatedAt: Date.now(),
        createdAt: Date.now(),
      });

      const list = store.list();
      expect(list).toContain("session-a");
      expect(list).toContain("session-b");
    });
  });

  describe("Phase 3: Model Fallback", () => {
    it("should retry with fallback model on failure", async () => {
      let attempts: { provider: string; model: string; attempt: number }[] = [];

      const result = await runWithSimpleFallback(
        { provider: "openai", model: "gpt-4" },
        [
          { provider: "anthropic", model: "claude-3-opus" },
          { provider: "ollama", model: "llama2" },
        ],
        async (provider: string, model: string) => {
          attempts.push({ provider, model, attempt: attempts.length });

          if (provider === "openai") {
            throw new Error("rate limit exceeded");
          }

          return `success from ${provider}/${model}`;
        },
      );

      expect(result.usedFallback).toBe(true);
      expect(attempts.length).toBe(2); // First failed, second succeeded
      expect(result.provider).toBe("anthropic");
      expect(result.model).toBe("claude-3-opus");
    });

    it("should classify errors correctly", () => {
      expect(classifyFailoverReason(new Error("rate limit")).code).toBe("RATE_LIMITED");
      expect(classifyFailoverReason(new Error("timeout")).code).toBe("TIMEOUT");
      expect(classifyFailoverReason(new Error("billing")).code).toBe("BILLING_ERROR");
      expect(classifyFailoverReason(new Error("random")).code).toBe("UNKNOWN");
    });
  });

  describe("Phase 4: Auth Profiles", () => {
    beforeAll(() => {
      clearAuthProfiles();
    });

    it("should create and retrieve auth profiles", () => {
      const profile = addAuthProfile("openai", "default", "sk-12345");

      expect(profile.provider).toBe("openai");
      expect(profile.name).toBe("default");
      expect(profile.apiKey).toBe("sk-12345");
      expect(profile.disabled).toBe(false);

      const retrieved = getApiKeyForProvider("openai");
      expect(retrieved?.apiKey).toBe("sk-12345");
    });

    it("should rotate auth profiles", () => {
      clearAuthProfiles();

      addAuthProfile("openai", "key1", "sk-1");
      addAuthProfile("openai", "key2", "sk-2");

      const first = getApiKeyForProvider("openai");
      expect(first?.apiKey).toMatch(/^sk-[12]$/); // Either key1 or key2

      // Mark as used - this doesn't rotate, just tracks
      markAuthProfileUsed(first!.profileId);

      // Get again - now rotated to next key
      const second = getApiKeyForProvider("openai");
      // Should be different from first (round-robin)
      expect(second?.apiKey).not.toBe(first?.apiKey);
    });

    it("should disable profiles after multiple failures", () => {
      clearAuthProfiles();

      const profile = addAuthProfile("openai", "failing", "sk-fail");

      // 5 failures should disable
      for (let i = 0; i < 5; i++) {
        const result = markAuthProfileFailure(profile.id, "test failure");
        if (i < 4) {
          expect(result.shouldDisable).toBe(false);
        } else {
          expect(result.shouldDisable).toBe(true);
        }
      }

      // Profile should now be disabled
      const auth = getApiKeyForProvider("openai");
      expect(auth).toBeUndefined();
    });
  });
});
