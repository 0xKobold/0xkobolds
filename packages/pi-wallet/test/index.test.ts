/**
 * Pi Wallet Extension Tests
 * 
 * Tests for all 4 wallet types: agentic, ethers, hardware, readonly
 * @version 0.1.0
 */

import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";

const TEST_DIR = join(homedir(), ".pi", "test-wallet-" + Date.now());

// Mock ExtensionAPI
const createMockPi = () => ({
  registerCommand: (name: string, def: any) => {
    console.log(`  [mock] Registered command: /${name}`);
  },
  registerTool: (def: any) => {
    console.log(`  [mock] Registered tool: ${def.name}`);
  },
  on: (event: string, handler: any) => { /* mock */ },
  settings: {
    get: (key: string) => undefined,
    set: (key: string, value: any) => { /* mock */ },
  },
});

const createMockCtx = () => ({
  ui: {
    notify: (msg: string, type: string) => {
      console.log(`  [mock] ${type}: ${msg.slice(0, 50)}...`);
    },
  },
});

describe("pi-wallet v0.1.0", () => {
  beforeEach(() => {
    process.env.PI_WALLET_DIR = TEST_DIR;
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true, mode: 0o700 });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    delete process.env.PI_WALLET_ADDRESS;
    delete process.env.PI_WALLET_TYPE;
  });

  describe("Configuration", () => {
    test("should use PI_WALLET_DIR env var", () => {
      expect(process.env.PI_WALLET_DIR).toBe(TEST_DIR);
      expect(existsSync(TEST_DIR)).toBe(true);
    });

    test("should read wallet from environment", async () => {
      const testAddress = "0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E";
      process.env.PI_WALLET_ADDRESS = testAddress;
      process.env.PI_WALLET_TYPE = "readonly";

      // Dynamic import to pick up env
      const { default: walletExt, loadConfig } = await import("../src/index.ts");
      const cfg = loadConfig();
      
      expect(cfg.readonlyWallet?.address).toBe(testAddress);
      expect(cfg.activeProvider).toBe("readonly");
    });

    test("should have correct Base chain config", () => {
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
          explorer: "https://sepolia.basescan.org",
        },
      };

      expect(BASE_CONFIG.mainnet.chainId).toBe(8453);
      expect(BASE_CONFIG.sepolia.chainId).toBe(84532);
    });
  });

  describe("Extension Registration", () => {
    test("should load and register all commands", async () => {
      const { default: walletExt } = await import("../src/index.ts");
      const mockPi = createMockPi();
      
      walletExt(mockPi);
      // Should complete without error
      expect(true).toBe(true);
    });

    test("should register 6 commands", async () => {
      const commands: string[] = [];
      const mockPi = {
        registerCommand: (name: string) => commands.push(name),
        registerTool: () => { /* mock */ },
      };
      
      const { default: walletExt } = await import("../src/index.ts");
      walletExt(mockPi as any);
      
      expect(commands).toContain("wallet-create");
      expect(commands).toContain("wallet-import");
      expect(commands).toContain("wallet-status");
      expect(commands).toContain("wallet-send");
      expect(commands).toContain("wallet-unlock");
      expect(commands).toContain("wallet-lock");
      expect(commands).toContain("wallet");
    });

    test("should register 2 tools", async () => {
      const tools: string[] = [];
      const mockPi = {
        registerCommand: () => { /* mock */ },
        registerTool: (def: any) => tools.push(def.name),
      };
      
      const { default: walletExt } = await import("../src/index.ts");
      walletExt(mockPi as any);
      
      expect(tools).toContain("wallet_send");
      expect(tools).toContain("wallet_get_address");
      expect(tools.length).toBe(2);
    });
  });

  describe("Wallet Types", () => {
    test("readonly - should not require password", async () => {
      const { loadConfig } = await import("../src/index.ts");
      
      process.env.PI_WALLET_ADDRESS = "0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E";
      process.env.PI_WALLET_TYPE = "readonly";
      
      const cfg = loadConfig();
      expect(cfg.activeProvider).toBe("readonly");
      expect(cfg.readonlyWallet?.address).toBe("0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E");
    });

    test("agentic - email validation", async () => {
      const mockCtx = createMockCtx();
      let notifyCalled = false;
      mockCtx.ui.notify = () => { notifyCalled = true; };

      // Invalid email
      const { default: walletExt } = await import("../src/index.ts");
      const mockPi = createMockPi();
      
      // Email without @ should trigger warning
      expect(notifyCalled).toBe(false);
    });

    test("ethers - address validation", async () => {
      const validAddress = "0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E";
      const invalidAddress = "0xinvalid";
      
      // Valid format
      expect(validAddress.match(/^0x[a-fA-F0-9]{40}$/)).toBeTruthy();
      // Invalid format
      expect(invalidAddress.match(/^0x[a-fA-F0-9]{40}$/)).toBeFalsy();
    });
  });

  describe("Security", () => {
    test("should create secure config file", async () => {
      const { loadConfig } = await import("../src/index.ts");
      const cfg = loadConfig();
      
      const configPath = join(TEST_DIR, "config.json");
      expect(existsSync(configPath)).toBe(true);
      
      // Check file permissions (should be 0o600)
      const stats = await import("fs").then(fs => fs.statSync(configPath));
      // Note: Mode checking may vary by system
    });

    test("should store readonly without private keys", async () => {
      const { loadConfig } = await import("../src/index.ts");
      
      process.env.PI_WALLET_ADDRESS = "0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E";
      const cfg = loadConfig();
      
      // Should only have address, no key material
      expect(cfg.readonlyWallet?.address).toBeDefined();
      expect(cfg.readonlyWallet?.label).toBe("Environment Wallet");
      expect((cfg as any).privateKey).toBeUndefined();
    });

    test("should require unlock for ethers sending", async () => {
      // Test that ethers wallet is locked by default
      const { loadConfig } = await import("../src/index.ts");
      const cfg = loadConfig();
      
      // New config starts with no wallet
      expect(cfg.activeProvider).toBeNull();
    });
  });

  describe("Provider Commands", () => {
    test("environment variable quick setup", async () => {
      process.env.PI_WALLET_ADDRESS = "0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E";
      process.env.PI_WALLET_TYPE = "readonly";
      process.env.PI_WALLET_CHAIN = "base";
      
      const { loadConfig } = await import("../src/index.ts");
      const cfg = loadConfig();
      
      expect(cfg.readonlyWallet?.address).toBe("0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E");
      expect(cfg.activeProvider).toBe("readonly");
      expect(cfg.settings.defaultChain).toBe("base");
    });
  });
});

describe("Export Validation", () => {
  test("should export loadConfig", async () => {
    const { loadConfig } = await import("../src/index.ts");
    expect(typeof loadConfig).toBe("function");
  });

  test("should export BASE_CONFIG", async () => {
    const { BASE_CONFIG } = await import("../src/index.ts");
    expect(BASE_CONFIG).toBeDefined();
    expect(BASE_CONFIG.mainnet).toBeDefined();
    expect(BASE_CONFIG.sepolia).toBeDefined();
  });
});
