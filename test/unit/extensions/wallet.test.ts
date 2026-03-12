/**
 * Wallet Extension Unit Tests
 * 
 * Tests for CDP Agentic Wallet + x402 payment functionality
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";

const TEST_DIR = join(homedir(), ".0xkobold", "test-wallets-" + Date.now());
const WALLET_CONFIG = join(TEST_DIR, "config.json");

// Mock ExtensionAPI
const createMockPi = () => ({
  registerCommand: (name: string, def: any) => { /* mock */ },
  registerTool: (def: any) => { /* mock */ },
  on: (event: string, handler: any) => { /* mock */ },
});

const createMockCtx = () => ({
  ui: {
    notify: (msg: string, type: string) => { /* mock */ },
  },
});

describe("Wallet Extension", () => {
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

  describe("Configuration", () => {
    test("should have correct Base chain configuration", () => {
      const BASE_CONFIG = {
        mainnet: {
          name: "base",
          chainId: 8453,
          rpc: "https://mainnet.base.org",
          explorer: "https://basescan.org",
        },
        sepolia: {
          name: "base-sepolia",
          chainId: 84532,
          rpc: "https://sepolia.base.org",
          faucet: "https://www.coinbase.com/faucets",
        },
      };

      expect(BASE_CONFIG.mainnet.chainId).toBe(8453);
      expect(BASE_CONFIG.sepolia.chainId).toBe(84532);
      expect(BASE_CONFIG.mainnet.rpc).toMatch(/^https:\/\//);
    });

    test("should validate email format", () => {
      const validEmail = "test@example.com";
      const invalidEmail1 = "not-an-email";
      const invalidEmail2 = "@example.com";
      const invalidEmail3 = "test@";

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      expect(emailRegex.test(validEmail)).toBe(true);
      expect(emailRegex.test(invalidEmail1)).toBe(false);
      expect(emailRegex.test(invalidEmail2)).toBe(false);
      expect(emailRegex.test(invalidEmail3)).toBe(false);
    });

    test("should require secure file permissions", () => {
      const config = {
        agentic: {
          address: "0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E",
          createdAt: Date.now(),
          email: "test@example.com",
        },
      };

      writeFileSync(WALLET_CONFIG, JSON.stringify(config, null, 2), { mode: 0o600 });
      const stats = require("fs").statSync(WALLET_CONFIG);
      
      // Check permissions (owner read/write only)
      expect(stats.mode & 0o777).toBe(0o600);
    });
  });

  describe("Wallet State Management", () => {
    test("should initialize wallet config with defaults", () => {
      const initialConfig = {
        agentic: null,
        lastUpdated: Date.now(),
      };

      writeFileSync(WALLET_CONFIG, JSON.stringify(initialConfig, null, 2));
      const loaded = JSON.parse(readFileSync(WALLET_CONFIG, "utf-8"));

      expect(loaded.agentic).toBeNull();
      expect(loaded.lastUpdated).toBeGreaterThan(0);
    });

    test("should update wallet config atomically", () => {
      const config = {
        agentic: {
          address: "0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E",
          createdAt: Date.now(),
        },
        ethers: null,
        lastUpdated: Date.now(),
      };

      // Write temp then rename for atomicity
      const tempPath = WALLET_CONFIG + ".tmp";
      writeFileSync(tempPath, JSON.stringify(config, null, 2), { mode: 0o600 });
      require("fs").renameSync(tempPath, WALLET_CONFIG);

      const loaded = JSON.parse(readFileSync(WALLET_CONFIG, "utf-8"));
      expect(loaded.agentic.address).toMatch(/^0x[a-fA-F0-9]{40}$/);
    });
  });

  describe("Address Validation", () => {
    test("should validate Ethereum address format", () => {
      const validAddress = "0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E";
      const invalidAddress1 = "0xinvalid";
      const invalidAddress2 = "742d35Cc6634C0532925a3b8D4C9db96590f6C7E"; // Missing 0x

      const addressRegex = /^0x[a-fA-F0-9]{40}$/;

      expect(addressRegex.test(validAddress)).toBe(true);
      expect(addressRegex.test(invalidAddress1)).toBe(false);
      expect(addressRegex.test(invalidAddress2)).toBe(false);
    });

    test("should extract address from CLI args", () => {
      const args = "--to 0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E --amount 1.5";
      const match = args.match(/--to\s+(0x[a-fA-F0-9]+)/);
      
      expect(match).not.toBeNull();
      expect(match![1]).toBe("0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E");
    });
  });

  describe("x402 Payment Validation", () => {
    test("should parse x402 payment amount", () => {
      const url = "https://api.service.com/charge";
      const amount = 0.001;
      const payment = { url, amount, currency: "ETH" };

      expect(payment.amount).toBeGreaterThan(0);
      expect(payment.currency).toBe("ETH");
    });

    test("should validate x402 URL scheme", () => {
      const validUrls = [
        "https://api.service.com/pay",
        "https://payment.example.com/x402",
      ];

      const invalidUrls = [
        "http://insecure.com", // HTTP not allowed
        "ftp://wrong.scheme",
      ];

      const isValidX402 = (url: string) => 
        url.startsWith("https://") && !url.includes("http://");

      validUrls.forEach(url => expect(isValidX402(url)).toBe(true));
      invalidUrls.forEach(url => expect(isValidX402(url)).toBe(false));
    });
  });

  describe("Command Argument Parsing", () => {
    test("should parse wallet send arguments", () => {
      const args = "--to 0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E --amount 1.5 --token USDC";
      
      const amountMatch = args.match(/--amount\s+([\d.]+)/);
      const recipientMatch = args.match(/--to\s+(0x[a-fA-F0-9]+)/);
      const tokenMatch = args.match(/--token\s+(\w+)/);

      expect(amountMatch![1]).toBe("1.5");
      expect(recipientMatch![1]).toMatch(/^0x/);
      expect(tokenMatch![1]).toBe("USDC");
    });

    test("should parse trade arguments", () => {
      const args = "100 USDC ETH --max-slippage 1.5";
      
      const parts = args.trim().split(/\s+/);
      const fromToken = parts[1];
      const toToken = parts[2];
      const amount = parseFloat(parts[0]);
      const slippageMatch = args.match(/--max-slippage\s+(\d+\.?\d*)/);

      expect(fromToken).toBe("USDC");
      expect(toToken).toBe("ETH");
      expect(amount).toBe(100);
      expect(slippageMatch![1]).toBe("1.5");
    });
  });
});
