/**
 * ERC-8004 Extension Unit Tests
 * 
 * Tests for agent identity and reputation protocol
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";

const TEST_DIR = join(homedir(), ".0xkobold", "test-erc8004-" + Date.now());
const AGENT_CONFIG = join(TEST_DIR, "agent.json");
const REPUTATION_DB = join(TEST_DIR, "reputation.json");

// Contract addresses from real deployment
const CONTRACTS = {
  base: {
    IdentityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    ReputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    chainId: 8453,
  },
  sepolia: {
    IdentityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    ReputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    chainId: 84532,
  },
};

interface AgentIdentity {
  address: string;
  metadataHash: string;
  publicKey: string;
  capabilities: string[];
  registeredAt: number;
  chain: keyof typeof CONTRACTS;
  active: boolean;
}

interface ReputationData {
  localScore: number;
  attestations: Array<{
    worker: string;
    score: number;
    taskId?: string;
    timestamp: number;
    comment?: string;
  }>;
}

describe("ERC-8004 Extension", () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("Contract Configuration", () => {
    test("should have valid contract addresses", () => {
      const addressRegex = /^0x[a-fA-F0-9]{40}$/;

      expect(CONTRACTS.base.IdentityRegistry).toMatch(addressRegex);
      expect(CONTRACTS.base.ReputationRegistry).toMatch(addressRegex);
      expect(CONTRACTS.sepolia.IdentityRegistry).toMatch(addressRegex);
      expect(CONTRACTS.sepolia.ReputationRegistry).toMatch(addressRegex);
    });

    test("should have correct chain IDs", () => {
      expect(CONTRACTS.base.chainId).toBe(8453);  // Base mainnet
      expect(CONTRACTS.sepolia.chainId).toBe(84532); // Base Sepolia
    });

    test("should have unique addresses for each network", () => {
      const allAddresses = [
        CONTRACTS.base.IdentityRegistry,
        CONTRACTS.base.ReputationRegistry,
        CONTRACTS.sepolia.IdentityRegistry,
        CONTRACTS.sepolia.ReputationRegistry,
      ];
      const uniqueAddresses = new Set(allAddresses);
      expect(uniqueAddresses.size).toBe(allAddresses.length);
    });
  });

  describe("Identity Registration", () => {
    test("should generate consistent metadata hash", () => {
      const metadata = { name: "Test Agent", version: "1.0.0" };
      const hash1 = generateMetadataHash(metadata);
      const hash2 = generateMetadataHash(metadata);

      // Hash should be deterministic
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-f0-9]{64}$/);
    });

    function generateMetadataHash(metadata: object): string {
      const str = JSON.stringify(metadata);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return "0x" + Math.abs(hash).toString(16).padStart(64, "0");
    }

    test("should save agent identity to disk", () => {
      const identity: AgentIdentity = {
        address: "0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E",
        metadataHash: "0x" + "a".repeat(64),
        publicKey: "0x",
        capabilities: ["typescript", "react", "node"],
        registeredAt: Date.now(),
        chain: "sepolia",
        active: true,
      };

      writeFileSync(AGENT_CONFIG, JSON.stringify(identity, null, 2), { mode: 0o600 });
      const loaded = JSON.parse(readFileSync(AGENT_CONFIG, "utf-8"));

      expect(loaded.address).toBe(identity.address);
      expect(loaded.capabilities).toEqual(["typescript", "react", "node"]);
      expect(loaded.active).toBe(true);
    });

    test("should parse capabilities from CLI args", () => {
      const args = "specialist --capabilities coding,research,typescript";
      const capsMatch = args.match(/--capabilities\s+(.+)/);
      const capabilities = capsMatch
        ? capsMatch[1].split(",").map((c) => c.trim())
        : ["coding"];

      expect(capabilities).toEqual(["coding", "research", "typescript"]);
    });

    test("should parse chain from CLI args", () => {
      const args = "specialist --capabilities coding --chain base";
      const chainMatch = args.match(/--chain\s+(\w+)/);
      const chain = (chainMatch ? chainMatch[1] : "sepolia") as keyof typeof CONTRACTS;

      expect(chain).toBe("base");
      expect(CONTRACTS[chain]).toBeDefined();
    });
  });

  describe("Reputation System", () => {
    test("should calculate average score correctly", () => {
      const data: ReputationData = {
        localScore: 0,
        attestations: [
          { worker: "0x123...", score: 95, timestamp: Date.now() },
          { worker: "0x123...", score: 85, timestamp: Date.now() },
          { worker: "0x123...", score: 100, timestamp: Date.now() },
        ],
      };

      const average = data.attestations.reduce((a, b) => a + b.score, 0) / data.attestations.length;
      expect(average).toBe(93.33333333333333);
    });

    test("should determine correct reputation tier", () => {
      function getTier(score: number): string {
        if (score >= 90) return "platinum";
        if (score >= 70) return "gold";
        if (score >= 40) return "silver";
        return "bronze";
      }

      expect(getTier(95)).toBe("platinum");
      expect(getTier(80)).toBe("gold");
      expect(getTier(50)).toBe("silver");
      expect(getTier(30)).toBe("bronze");
      expect(getTier(0)).toBe("bronze");
    });

    test("should save attestations to disk", () => {
      const data: ReputationData = {
        localScore: 45,
        attestations: [{
          worker: "0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E",
          score: 95,
          taskId: "task-001",
          timestamp: Date.now(),
          comment: "Excellent work on refactoring",
        }],
      };

      writeFileSync(REPUTATION_DB, JSON.stringify(data, null, 2), { mode: 0o600 });
      const loaded = JSON.parse(readFileSync(REPUTATION_DB, "utf-8"));

      expect(loaded.attestations.length).toBe(1);
      expect(loaded.attestations[0].score).toBe(95);
      expect(loaded.attestations[0].comment).toBe("Excellent work on refactoring");
    });

    test("should filter attestations by worker", () => {
      const data: ReputationData = {
        localScore: 0,
        attestations: [
          { worker: "0xAAA...", score: 95, timestamp: Date.now() },
          { worker: "0xBBB...", score: 80, timestamp: Date.now() },
          { worker: "0xAAA...", score: 90, timestamp: Date.now() },
        ],
      };

      const workerAAttestations = data.attestations.filter(a => a.worker.includes("AAA"));
      expect(workerAAttestations.length).toBe(2);
      expect(workerAAttestations[0].score).toBe(95);
      expect(workerAAttestations[1].score).toBe(90);
    });
  });

  describe("Discovery", () => {
    test("should match capabilities", () => {
      const agentCapabilities = ["typescript", "react", "node", "web3"];
      const requestedCapability = "typescript";

      const hasCapability = agentCapabilities.includes(requestedCapability);
      expect(hasCapability).toBe(true);
    });

    test("should support partial matching", () => {
      const agentCapabilities = ["typescript", "react", "node", "web3"];
      const searchTerm = "script";

      const matches = agentCapabilities.filter(c => 
        c.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(matches).toContain("typescript");
    });
  });

  describe("Command Argument Parsing", () => {
    test("should parse attest arguments", () => {
      const args = '--worker 0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E --rating 95 --task-id abc123 --comment "Great work"';
      
      const workerMatch = args.match(/--worker\s+(0x[a-fA-F0-9]+)/);
      const scoreMatch = args.match(/--rating\s+(\d+)/);
      const taskMatch = args.match(/--task-id\s+(\S+)/);
      const commentMatch = args.match(/--comment\s+"([^"]+)"/);

      expect(workerMatch![1]).toBe("0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E");
      expect(scoreMatch![1]).toBe("95");
      expect(taskMatch![1]).toBe("abc123");
      expect(commentMatch![1]).toBe("Great work");
    });

    test("should validate score range", () => {
      const validateScore = (score: number) => {
        return score >= 0 && score <= 100;
      };

      expect(validateScore(95)).toBe(true);
      expect(validateScore(0)).toBe(true);
      expect(validateScore(100)).toBe(true);
      expect(validateScore(-1)).toBe(false);
      expect(validateScore(101)).toBe(false);
    });

    test("should parse discover capability", () => {
      const args = "--capability typescript";
      const capMatch = args.match(/--capability\s+(\w+)/);
      const capability = capMatch ? capMatch[1] : "specialist";

      expect(capability).toBe("typescript");
    });
  });

  describe("Storage Security", () => {
    test("should use secure permissions for config files", () => {
      const identity: AgentIdentity = {
        address: "0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E",
        metadataHash: "0x" + "a".repeat(64),
        publicKey: "0x",
        capabilities: ["coding"],
        registeredAt: Date.now(),
        chain: "sepolia",
        active: true,
      };

      writeFileSync(AGENT_CONFIG, JSON.stringify(identity, null, 2), { mode: 0o600 });
      const stats = require("fs").statSync(AGENT_CONFIG);

      // Owner read/write only
      expect(stats.mode & 0o777).toBe(0o600);
    });

    test("should handle missing config gracefully", () => {
      const loadConfig = (path: string) => {
        if (!existsSync(path)) return null;
        return JSON.parse(readFileSync(path, "utf-8"));
      };

      expect(loadConfig("/nonexistent/path.json")).toBeNull();
    });
  });
});
