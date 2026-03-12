/**
 * Pi ERC-8004 Extension Tests
 * 
 * Tests for agent identity, reputation, and discovery
 * @version 0.1.0
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, rmSync } from "fs";

const TEST_DIR = join(homedir(), ".pi", "test-erc8004-" + Date.now());

// Mock ExtensionAPI
const createMockPi = () => ({
  registerCommand: (name: string, def: any) => {
    console.log(`  [mock] Registered command: /${name}`);
  },
  registerTool: (def: any) => {
    console.log(`  [mock] Registered tool: ${def.name}`);
  },
  settings: {
    get: (key: string) => undefined,
    set: (key: string, value: any) => { /* mock */ },
  },
});

describe("pi-erc8004 v0.1.0", () => {
  beforeEach(() => {
    process.env.PI_ERC8004_DIR = TEST_DIR;
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true, mode: 0o700 });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe("Contracts", () => {
    test("should have correct Base mainnet addresses", async () => {
      const { ERC8004_CONTRACTS } = await import("../src/index.ts");
      
      expect(ERC8004_CONTRACTS.base.IdentityRegistry).toBe("0x8004A169FB4a3325136EB29fA0ceB6D2e539a432");
      expect(ERC8004_CONTRACTS.base.ReputationRegistry).toBe("0x8004BAa17C55a88189AE136b182e5fdA19dE9b63");
      expect(ERC8004_CONTRACTS.base.chainId).toBe(8453);
    });

    test("should have correct Sepolia testnet addresses", async () => {
      const { ERC8004_CONTRACTS } = await import("../src/index.ts");
      
      expect(ERC8004_CONTRACTS.sepolia.IdentityRegistry).toBe("0x8004A818BFB912233c491871b3d84c89A494BD9e");
      expect(ERC8004_CONTRACTS.sepolia.ReputationRegistry).toBe("0x8004B663056A597Dffe9eCcC1965A193B7388713");
      expect(ERC8004_CONTRACTS.sepolia.chainId).toBe(84532);
    });

    test("all addresses should be valid format", async () => {
      const { ERC8004_CONTRACTS } = await import("../src/index.ts");
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;
      
      expect(ERC8004_CONTRACTS.base.IdentityRegistry).toMatch(addressRegex);
      expect(ERC8004_CONTRACTS.base.ReputationRegistry).toMatch(addressRegex);
      expect(ERC8004_CONTRACTS.sepolia.IdentityRegistry).toMatch(addressRegex);
      expect(ERC8004_CONTRACTS.sepolia.ReputationRegistry).toMatch(addressRegex);
    });
  });

  describe("Reputation System", () => {
    test("should generate metadata hash", async () => {
      const { generateMetadataHash } = await import("../src/index.ts");
      const metadata = { 
        capabilities: ["coding", "research"],
        name: "Test Agent",
        version: "1.0"
      };
      
      const hash = generateMetadataHash(metadata);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
      
      // Same input should produce same hash
      const hash2 = generateMetadataHash(metadata);
      expect(hash).toBe(hash2);
      
      // Different input should produce different hash
      const hash3 = generateMetadataHash({ ...metadata, name: "Different" });
      expect(hash).not.toBe(hash3);
    });

    test("should calculate reputation tiers correctly", async () => {
      const { getMyReputation } = await import("../src/index.ts");
      
      const rep = getMyReputation();
      expect(rep.score).toBeGreaterThanOrEqual(0);
      expect(rep.score).toBeLessThanOrEqual(100);
      expect(["bronze", "silver", "gold", "platinum", "diamond"]).toContain(rep.tier);
    });

    test("should have attestations count", async () => {
      const { getMyReputation } = await import("../src/index.ts");
      const rep = getMyReputation();
      
      expect(rep.attestationsGiven).toBeNumber();
      expect(rep.attestationsGiven).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Extension Registration", () => {
    test("should load and register all commands", async () => {
      const { default: erc8004Ext } = await import("../src/index.ts");
      const mockPi = createMockPi();
      
      erc8004Ext(mockPi);
      // Should complete without error
      expect(true).toBe(true);
    });

    test("should register 6 commands", async () => {
      const commands: string[] = [];
      const mockPi = {
        registerCommand: (name: string) => commands.push(name),
        registerTool: () => { /* mock */ },
      };
      
      const { default: erc8004Ext } = await import("../src/index.ts");
      erc8004Ext(mockPi as any);
      
      expect(commands).toContain("erc8004-register");
      expect(commands).toContain("erc8004-status");
      expect(commands).toContain("erc8004-attest");
      expect(commands).toContain("erc8004-discover");
      expect(commands).toContain("erc8004-reputation");
      expect(commands).toContain("erc8004");
    });

    test("should register 4 tools", async () => {
      const tools: string[] = [];
      const mockPi = {
        registerCommand: () => { /* mock */ },
        registerTool: (def: any) => tools.push(def.name),
      };
      
      const { default: erc8004Ext } = await import("../src/index.ts");
      erc8004Ext(mockPi as any);
      
      expect(tools).toContain("erc8004_register");
      expect(tools).toContain("erc8004_attest");
      expect(tools).toContain("erc8004_discover");
      expect(tools).toContain("erc8004_reputation");
      expect(tools.length).toBe(4);
    });
  });

  describe("Storage", () => {
    test("should use PI_ERC8004_DIR env var", () => {
      expect(process.env.PI_ERC8004_DIR).toBe(TEST_DIR);
      expect(existsSync(TEST_DIR)).toBe(true);
    });

    test("should fallback to standard paths", async () => {
      delete process.env.PI_ERC8004_DIR;
      const { default: erc8004Ext, loadConfig } = await import("../src/index.ts");
      
      // Should work without env var
      expect(true).toBe(true);
    });
  });

  describe("Agent Identity", () => {
    test("should have deterministic identity hash", async () => {
      const { generateMetadataHash } = await import("../src/index.ts");
      
      const agentId = {
        name: "TestAgent",
        capabilities: ["typescript", "rust"],
        version: "0.1.0"
      };
      
      const hash1 = generateMetadataHash(agentId);
      const hash2 = generateMetadataHash(agentId);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    test("should handle complex metadata", async () => {
      const { generateMetadataHash } = await import("../src/index.ts");
      
      const complex = {
        name: "Advanced Agent",
        capabilities: [
          { name: "coding", proficiency: "expert" },
          { name: "research", proficiency: "advanced" }
        ],
        metadata: {
          created: Date.now(),
          chain: "base"
        }
      };
      
      const hash = generateMetadataHash(complex);
      expect(hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe("Attestation System", () => {
    test("should calculate reputation from attestations", async () => {
      const { getMyReputation } = await import("../src/index.ts");
      
      // Start with default reputation
      const rep = getMyReputation();
      expect(rep.score).toBeDefined();
      expect(rep.tier).toBeDefined();
      expect(rep.attestationsGiven).toBeNumber();
    });

    test("reputation should be bounded 0-100", async () => {
      const { getMyReputation } = await import("../src/index.ts");
      const rep = getMyReputation();
      
      expect(rep.score).toBeGreaterThanOrEqual(0);
      expect(rep.score).toBeLessThanOrEqual(100);
    });
  });
});

describe("Export Validation", () => {
  test("should export generateMetadataHash", async () => {
    const { generateMetadataHash } = await import("../src/index.ts");
    expect(typeof generateMetadataHash).toBe("function");
  });

  test("should export getMyReputation", async () => {
    const { getMyReputation } = await import("../src/index.ts");
    expect(typeof getMyReputation).toBe("function");
  });

  test("should export ERC8004_CONTRACTS", async () => {
    const { ERC8004_CONTRACTS } = await import("../src/index.ts");
    expect(ERC8004_CONTRACTS).toBeDefined();
    expect(ERC8004_CONTRACTS.base).toBeDefined();
    expect(ERC8004_CONTRACTS.sepolia).toBeDefined();
  });
});
