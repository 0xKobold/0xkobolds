/**
 * Pi Wallet Extension
 * 
 * CDP Agentic Wallet + x402 payments for pi-coding-agent
 * Zero-setup agent economy with Base L2 support
 * 
 * Installation:
 *   pi install npm:@0xkobold/pi-wallet
 * 
 * Features:
 * - CDP Agentic Wallet (zero setup, email-based)
 * - x402 protocol for machine-to-machine payments
 * - Base L2 (mainnet + Sepolia) support
 * - Works with or without .0xkobold directory
 * - Configurable storage path
 * 
 * Environment Variables:
 *   PI_WALLET_DIR - Custom storage directory
 *   PI_WALLET_CHAIN - Default chain (base|sepolia)
 *   PI_WALLET_MAX_AMOUNT - Max transaction amount
 * 
 * Commands:
 *   /wallet-create --email me@example.com
 *   /wallet-status
 *   /wallet-send --to 0x... --amount 1.5 [--token USDC] [--chain base]
 *   /wallet-trade --amount 100 USDC ETH [--max-slippage 1.5]
 *   /wallet-x402 --url https://api.service.com/pay [--budget 0.01]
 * 
 * Tools:
 *   wallet_send - Send crypto payments
 *   wallet_x402_pay - Pay via 402 protocol
 * 
 * @see https://github.com/0xKobold/pi-wallet
 * @see https://docs.cdp.coinbase.com/agentic-wallet
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { $ } from "bun";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "fs";

// ============================================================================
// CONFIGURATION - Works with or without .0xkobold
// ============================================================================

function getWalletDir(): string {
  // Priority: env var > pi config > .0xkobold > default
  const envDir = process.env.PI_WALLET_DIR;
  if (envDir) return envDir;

  // Check if .0xkobold exists
  const koboldDir = join(homedir(), ".0xkobold");
  if (existsSync(koboldDir)) {
    return join(koboldDir, "wallets");
  }

  // Default: pi config dir
  return join(homedir(), ".pi", "wallet");
}

const WALLET_DIR = getWalletDir();
const WALLET_CONFIG = join(WALLET_DIR, "config.json");

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
    faucet: "https://www.coinbase.com/faucets",
  },
};

interface WalletConfig {
  activeProvider: "agentic" | null;
  agentic?: {
    email: string;
    authenticated: boolean;
    address?: string;
    createdAt?: number;
  };
  ethers?: {
    encryptedKey: string;
    address: string;
    createdAt: number;
  };
  settings: {
    defaultChain: keyof typeof BASE_CONFIG;
    maxTransactionAmount: string;
    requireConfirmation: boolean;
  };
  lastUpdated: number;
}

// ============================================================================
// STORAGE - Portable across platforms
// ============================================================================

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }
}

function loadConfig(): WalletConfig {
  ensureDir(WALLET_DIR);
  if (!existsSync(WALLET_CONFIG)) {
    const cfg: WalletConfig = {
      activeProvider: null,
      settings: {
        defaultChain: (process.env.PI_WALLET_CHAIN as any) || "sepolia",
        maxTransactionAmount: process.env.PI_WALLET_MAX_AMOUNT || "100",
        requireConfirmation: true,
      },
      lastUpdated: Date.now(),
    };
    saveConfig(cfg);
    return cfg;
  }
  try {
    return JSON.parse(readFileSync(WALLET_CONFIG, "utf-8"));
  } catch (e) {
    console.error("[pi-wallet] Failed to load config, using defaults:", e);
    return {
      activeProvider: null,
      settings: {
        defaultChain: "sepolia",
        maxTransactionAmount: "100",
        requireConfirmation: true,
      },
      lastUpdated: Date.now(),
    };
  }
}

function saveConfig(c: WalletConfig) {
  ensureDir(WALLET_DIR);
  c.lastUpdated = Date.now();
  
  // Atomic write with secure permissions
  const tmp = WALLET_CONFIG + ".tmp";
  writeFileSync(tmp, JSON.stringify(c, null, 2), { mode: 0o600 });
  
  // Rename is atomic on POSIX
  const fs = require("fs");
  fs.renameSync(tmp, WALLET_CONFIG);
}

// ============================================================================
// CDP AGENTIC PROVIDER (npx awal)
// ============================================================================

class AgenticProvider {
  private async exec(args: string[]): Promise<unknown> {
    try {
      const result = await Bun.$`npx awal ${args}`.text();
      return JSON.parse(result);
    } catch {
      try {
        const result = await Bun.$`awal ${args}`.text();
        return JSON.parse(result);
      } catch (e) {
        throw new Error("CDP Agentic Wallet not installed. Run: npm install -g @coinbase/awal");
      }
    }
  }

  async status() {
    const r = await this.exec(["status", "--json"]) as any;
    return { auth: r?.authenticated, addr: r?.address, network: r?.network };
  }

  async login(email: string) {
    const r = await this.exec(["auth", "login", email, "--json"]) as any;
    return { flowId: r?.flowId, msg: r?.message || `Check ${email} for code` };
  }

  async balance(chain = "base") {
    const r = await this.exec(["balance", "--chain", chain, "--json"]) as any;
    return { eth: r?.eth, usdc: r?.usdc, network: r?.network };
  }

  async address() {
    const r = await this.exec(["address", "--json"]) as any;
    return r?.address;
  }

  async send(amount: string, to: string, chain = "base") {
    const r = await this.exec(["send", amount, to, "--chain", chain, "--json"]) as any;
    return { tx: r?.txHash, status: r?.status || "pending" };
  }

  async trade(amount: string, from: string, to: string) {
    const r = await this.exec(["trade", amount, from, to, "--json"]) as any;
    return { tx: r?.txHash, status: r?.status || "pending" };
  }

  async x402(url: string) {
    const r = await this.exec(["x402", "pay", url, "--json"]) as any;
    return { ok: r?.success, data: r?.data, cost: r?.cost };
  }
}

const provider = new AgenticProvider();

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleCreate(args: string, ctx: any) {
  const email = args.match(/--email\s+(\S+)/)?.[1];
  if (!email || !email.includes("@")) {
    ctx.ui?.notify?.("Usage: /wallet-create --email me@example.com", "warning");
    return;
  }

  const cfg = loadConfig();
  cfg.activeProvider = "agentic";
  cfg.agentic = {
    email,
    authenticated: false,
    createdAt: Date.now(),
  };

  try {
    const login = await provider.login(email);
    saveConfig(cfg);

    ctx.ui?.notify?.([
      "🪙 CDP Agentic Wallet Created!",
      "",
      `Email: ${email}`,
      `Storage: ${WALLET_DIR}`,
      "",
      "📧 Check your email for verification code",
    ].join("\n"), "success");
  } catch (e: any) {
    ctx.ui?.notify?.(`Failed: ${e.message}`, "error");
  }
}

async function handleStatus(ctx: any) {
  const cfg = loadConfig();
  const active = cfg.activeProvider;

  if (!active) {
    ctx.ui?.notify?.([
      "💰 No wallet configured",
      "",
      `Storage: ${WALLET_DIR}`,
      "",
      "Create: /wallet-create --email me@example.com",
    ].join("\n"), "info");
    return;
  }

  try {
    const st = await provider.status();
    const bal = await provider.balance(cfg.settings.defaultChain);

    const addr = st.addr || cfg.agentic?.address;
    if (addr && cfg.agentic) {
      cfg.agentic.address = addr;
      saveConfig(cfg);
    }

    ctx.ui?.notify?.([
      "💰 Wallet Status",
      "",
      `Provider: ${active}`,
      `Storage: ${WALLET_DIR}`,
      `Auth: ${st.auth ? "✅" : "⏳"}`,
      `Address: ${addr ? addr.slice(0, 6) + "..." + addr.slice(-4) : "N/A"}`,
      `Network: ${cfg.settings.defaultChain}`,
      `Chain ID: ${BASE_CONFIG[cfg.settings.defaultChain].chainId}`,
      "",
      "Balances:",
      `  ETH: ${bal.eth || "0"}`,
      `  USDC: ${bal.usdc || "0"}`,
      "",
      "Send: /wallet-send --to 0x... --amount 0.01",
    ].join("\n"), "info");
  } catch (e: any) {
    ctx.ui?.notify?.(`Error: ${e.message}`, "error");
  }
}

async function handleSend(args: string, ctx: any) {
  const toMatch = args.match(/--to\s+(0x[a-fA-F0-9]+)/);
  const amtMatch = args.match(/--amount\s+([\d.]+)/);
  const tokenMatch = args.match(/--token\s+(\w+)/i);
  const chainMatch = args.match(/--chain\s+(\w+)/);

  if (!toMatch || !amtMatch) {
    ctx.ui?.notify?.("Usage: /wallet-send --to 0x... --amount 1.5 [--token USDC] [--chain base]", "warning");
    return;
  }

  const cfg = loadConfig();
  const chain = (chainMatch ? chainMatch[1] : cfg.settings.defaultChain) as keyof typeof BASE_CONFIG;

  const to = toMatch[1];
  const amount = amtMatch[1];
  const token = tokenMatch ? tokenMatch[1].toUpperCase() : "ETH";

  try {
    ctx.ui?.notify?.([
      "🔄 Sending Transaction",
      "",
      `To: ${to.slice(0, 6)}...${to.slice(-4)}`,
      `Amount: ${amount} ${token}`,
      `Network: ${BASE_CONFIG[chain].name}`,
    ].join("\n"), "info");

    const r = await provider.send(amount, to, chain);

    ctx.ui?.notify?.([
      "🎉 Transaction Sent!",
      "",
      `Status: ${r.status || "pending"}`,
      `Tx Hash: ${r.tx}`,
      `Explorer: ${BASE_CONFIG[chain].explorer}/tx/${r.tx}`,
    ].join("\n"), "success");
  } catch (e: any) {
    ctx.ui?.notify?.(`Failed: ${e.message}`, "error");
  }
}

async function handleTrade(args: string, ctx: any) {
  const parts = args.trim().split(/\s+/);
  const amount = parts[0];
  const from = parts[1]?.toUpperCase();
  const to = parts[2]?.toUpperCase();

  if (!amount || !from || !to) {
    ctx.ui?.notify?.("Usage: /wallet-trade AMOUNT FROM TO [--max-slippage 1.5]", "warning");
    return;
  }

  try {
    ctx.ui?.notify?.(`Trading ${amount} ${from} → ${to}...`, "info");
    const r = await provider.trade(amount, from, to);

    ctx.ui?.notify?.([
      "🔄 Trade Submitted",
      "",
      `Status: ${r.status || "pending"}`,
      `Tx: ${r.tx}`,
    ].join("\n"), "success");
  } catch (e: any) {
    ctx.ui?.notify?.(`Failed: ${e.message}`, "error");
  }
}

async function handleX402(args: string, ctx: any) {
  const urlMatch = args.match(/--url\s+(\S+)/);
  const budgetMatch = args.match(/--budget\s+([\d.]+)/);

  if (!urlMatch) {
    ctx.ui?.notify?.("Usage: /wallet-x402 --url https://api.service.com [--budget 0.01]", "warning");
    return;
  }

  const url = urlMatch[1];
  const budget = budgetMatch ? parseFloat(budgetMatch[1]) : 0.01;

  try {
    ctx.ui?.notify?.([
      "💳 x402 Payment",
      "",
      `URL: ${url}`,
      `Max Budget: ${budget} ETH`,
      "Sending...",
    ].join("\n"), "info");

    const r = await provider.x402(url);

    if (r.ok) {
      ctx.ui?.notify?.([
        "✅ Payment Successful",
        "",
        `Cost: ${r.cost || "unknown"}`,
        `Access granted to: ${url}`,
      ].join("\n"), "success");
    } else {
      ctx.ui?.notify?.([
        "❌ Payment Failed",
        "",
        `URL: ${url}`,
        `Error: ${r.data || "unknown"}`,
      ].join("\n"), "error");
    }
  } catch (e: any) {
    ctx.ui?.notify?.(`Failed: ${e.message}`, "error");
  }
}

// ============================================================================
// EXTENSION EXPORT
// ============================================================================

export default function walletExtension(pi: ExtensionAPI) {
  // Commands
  pi.registerCommand("wallet-create", {
    description: "Create CDP Agentic Wallet",
    handler: (args: string, ctx: any) => handleCreate(args, ctx),
  });

  pi.registerCommand("wallet-status", {
    description: "Check wallet status and balances",
    handler: (_args: string, ctx: any) => handleStatus(ctx),
  });

  pi.registerCommand("wallet-send", {
    description: "Send crypto payments",
    handler: (args: string, ctx: any) => handleSend(args, ctx),
  });

  pi.registerCommand("wallet-trade", {
    description: "Trade tokens via swap",
    handler: (args: string, ctx: any) => handleTrade(args, ctx),
  });

  pi.registerCommand("wallet-x402", {
    description: "Pay via x402 protocol",
    handler: (args: string, ctx: any) => handleX402(args, ctx),
  });

  // Unified command
  pi.registerCommand("wallet", {
    description: "Wallet management (CDP Agentic + x402)",
    handler: async (argsStr: string, ctx: any) => {
      const [sub, ...rest] = argsStr.trim().split(/\s+/);
      const restStr = rest.join(" ");
      switch (sub) {
        case "create": return handleCreate(restStr, ctx);
        case "status": return handleStatus(ctx);
        case "send": return handleSend(restStr, ctx);
        case "trade": return handleTrade(restStr, ctx);
        case "x402": return handleX402(restStr, ctx);
        default:
          ctx.ui?.notify?.([
            "💰 Wallet Commands",
            "",
            "/wallet create --email me@example.com",
            "/wallet status",
            "/wallet send --to 0x... --amount 0.01 [--token USDC]",
            "/wallet trade 10 USDC ETH",
            "/wallet x402 --url https://api.example.com/pay",
            "",
            `Storage: ${WALLET_DIR}`,
          ].join("\n"), "info");
      }
    },
  });

  // Tools
  pi.registerTool({
    name: "wallet_send" as any,
    label: "/wallet_send",
    description: "Send ETH/USDC to address",
    parameters: Type.Object({
      to: Type.String(),
      amount: Type.String(),
      token: Type.Optional(Type.String({ default: "ETH" })),
      chain: Type.Optional(Type.String({ default: "base" })),
    }) as any,
    // @ts-ignore
    async execute(_id: string, args: any, _s: any, onUpdate: any, _c: any) {
      onUpdate?.("Sending...");
      try {
        const tx = await provider.send(args.amount, args.to, args.chain || "base");
        return {
          content: [{ type: "text", text: `Sent ${args.amount} ${args.token} to ${args.to.slice(0,10)}...` }],
          details: tx,
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], details: { error: e.message } };
      }
    },
  });

  pi.registerTool({
    name: "wallet_x402_pay" as any,
    label: "/wallet_x402_pay",
    description: "Pay via x402 protocol",
    parameters: Type.Object({
      url: Type.String(),
      maxBudget: Type.Optional(Type.Number({ default: 0.01 })),
    }) as any,
    // @ts-ignore
    async execute(_id: string, args: any, _s: any, onUpdate: any, _c: any) {
      onUpdate?.("Paying via x402...");
      try {
        const r = await provider.x402(args.url);
        return {
          content: [{ type: "text", text: r.ok ? "Payment successful" : `Failed: ${r.data || "unknown"}` }],
          details: r,
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], details: { error: e.message } };
      }
    },
  });

  console.log("[pi-wallet] Loaded");
  console.log(`[pi-wallet] Storage: ${WALLET_DIR}`);
  console.log("[pi-wallet] Commands: /wallet [create|status|send|trade|x402]");
  console.log("[pi-wallet] Chains: base (8453), sepolia (84532)");
  console.log("[pi-wallet] Tools: wallet_send, wallet_x402_pay");
}

// Re-export for programmatic use
export { AgenticProvider, loadConfig, BASE_CONFIG };
