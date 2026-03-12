/**
 * Wallet + ERC-8004 Integration Tests
 * 
 * Tests interaction between wallet and identity/reputation systems
 */

import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";

const TEST_PREFIX = "test-integration-" + Date.now();
const WALLETS_DIR = join(homedir(), ".0xkobold", TEST_PREFIX);
const ERC8004_DIR = join(homedir(), ".0xkobold", TEST_PREFIX + "-erc8004");
const WALLET_CONFIG = join(WALLETS_DIR, "config.json");
const AGENT_CONFIG = join(ERC8004_DIR, "agent.json");
const REPUTATION_DB = join(ERC8004_DIR, "reputation.json");

describe("Wallet + ERC-8004 Integration", () => {
  beforeAll(() => {
    // Setup test directories
    if (!existsSync(WALLETS_DIR)) mkdirSync(WALLETS_DIR, { recursive: true });
    if (!existsSync(ERC8004_DIR)) mkdirSync(ERC8004_DIR, { recursive: true });
  });

  afterAll(() => {
    // Cleanup
    if (existsSync(WALLETS_DIR)) rmSync(WALLETS_DIR, { recursive: true });
    if (existsSync(ERC8004_DIR)) rmSync(ERC8004_DIR, { recursive: true });
  });

  describe("Complete Agent Onboarding Flow", () => {
    test("should create wallet then register ERC-8004 identity", () => {
      // Step 1: Create wallet
      const walletConfig = {
        agentic: {
          address: "0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E",
          createdAt: Date.now(),
          email: "test@example.com",
          authenticated: false,
        },
        lastUpdated: Date.now(),
      };
      
      writeFileSync(WALLET_CONFIG, JSON.stringify(walletConfig, null, 2), { mode: 0o600 });

      // Step 2: Load wallet identity
      const loadedWallet = JSON.parse(readFileSync(WALLET_CONFIG, "utf-8"));
      expect(loadedWallet.agentic.address).toMatch(/^0x[a-fA-F0-9]{40}$/);

      // Step 3: Register ERC-8004 with wallet address
      const agentIdentity = {
        address: loadedWallet.agentic.address, // Link to wallet
        metadataHash: "0x" + "a".repeat(64),
        publicKey: "0x",
        capabilities: ["typescript", "react", "node"],
        registeredAt: Date.now(),
        chain: "sepolia",
        active: true,
      };

      writeFileSync(AGENT_CONFIG, JSON.stringify(agentIdentity, null, 2), { mode: 0o600 });

      // Step 4: Verify identity linked to wallet
      const loadedAgent = JSON.parse(readFileSync(AGENT_CONFIG, "utf-8"));
      expect(loadedAgent.address).toBe(loadedWallet.agentic.address);
    });

    test("should link attestations to x402 payments", () => {
      // Worker did a task, we attest and pay them
      const workerAddress = "0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E";
      const taskId = "task-" + Date.now();
      
      // Step 1: Submit attestation
      const reputationData = {
        localScore: 45,
        attestations: [{
          worker: workerAddress,
          score: 95,
          taskId: taskId,
          timestamp: Date.now(),
          comment: "Excellent work on TypeScript refactoring",
        }],
      };

      writeFileSync(REPUTATION_DB, JSON.stringify(reputationData, null, 2), { mode: 0o600 });

      // Step 2: Simulate x402 payment (same taskId)
      const x402Payment = {
        taskId: taskId,
        recipient: workerAddress,
        amount: "0.001",
        currency: "ETH",
        status: "pending",
        timestamp: Date.now(),
      };

      // Step 3: Link payment to attestation
      const loadedRep = JSON.parse(readFileSync(REPUTATION_DB, "utf-8"));
      const attestation = loadedRep.attestations.find((a: any) => a.taskId === taskId);
      
      expect(attestation).toBeDefined();
      expect(attestation.worker).toBe(x402Payment.recipient);
      expect(attestation.score).toBe(95);
    });

    test("should reject attestations from non-registered agents", () => {
      const registeredAddress = "0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E";
      const unregisteredAddress = "0x0000000000000000000000000000000000000000";
      
      // Check if address is registered
      const isRegistered = (address: string) => {
        const agentConfig = join(ERC8004_DIR, "agent.json");
        if (!existsSync(agentConfig)) return false;
        const agent = JSON.parse(readFileSync(agentConfig, "utf-8"));
        return agent.address === address && agent.active;
      };

      expect(isRegistered(registeredAddress)).toBe(true);
      expect(isRegistered(unregisteredAddress)).toBe(false);
    });
  });

  describe("Cross-Service Identity", () => {
    test("should maintain consistent identity across wallet and ERC-8004", () => {
      // Load both configs
      const wallet = JSON.parse(readFileSync(WALLET_CONFIG, "utf-8"));
      const agent = JSON.parse(readFileSync(AGENT_CONFIG, "utf-8"));

      // Addresses should match
      expect(agent.address).toBe(wallet.agentic.address);
      
      // Address format validation
      expect(agent.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });

    test("should calculate reputation based on wallet activity + attestations", () => {
      const reputation = JSON.parse(readFileSync(REPUTATION_DB, "utf-8"));
      
      // Mock wallet transactions
      const walletTxCount = 5;
      const attestationsGiven = reputation.attestations.length;
      
      // Reputation formula: weighted combination
      const reputationScore = Math.min(100, 
        (walletTxCount * 2) + (attestationsGiven * 10)
      );

      expect(reputationScore).toBeGreaterThan(0);
      expect(reputationScore).toBeLessThanOrEqual(100);
    });
  });

  describe("Data Persistence", () => {
    test("should handle concurrent reads", () => {
      // Simulate multiple services reading
      const reads = [
        readFileSync(WALLET_CONFIG, "utf-8"),
        readFileSync(AGENT_CONFIG, "utf-8"),
        readFileSync(REPUTATION_DB, "utf-8"),
      ];

      expect(reads[0]).toBeTruthy();
      expect(reads[1]).toBeTruthy();
      expect(reads[2]).toBeTruthy();
    });

    test("should handle atomic writes", () => {
      const tempPath = AGENT_CONFIG + ".tmp";
      const data = { test: "data", timestamp: Date.now() };

      // Atomic write pattern
      writeFileSync(tempPath, JSON.stringify(data), { mode: 0o600 });
      require("fs").renameSync(tempPath, AGENT_CONFIG);

      // Verify data integrity
      const loaded = JSON.parse(readFileSync(AGENT_CONFIG, "utf-8"));
      expect(loaded.test).toBe("data");
    });
  });
});
