/**
 * Pi Wallet Extension
 * 
 * Universal wallet support for pi-coding-agent:
 * - CDP Agentic Wallet (email-based, zero-setup)
 * - Existing wallets (read-only, ethers.js, hardware)
 * - x402 protocol for machine-to-machine payments
 * 
 * Installation:
 *   pi install npm:@0xkobold/pi-wallet
 * 
 * Commands:
 *   /wallet-create --email me@example.com           [NEW - CDP]
 *   /wallet-import --address 0x... --type readonly [EXISTING - just monitor]
 *   /wallet-import --address 0x... --type ethers    [EXISTING - self-custody]
 *   /wallet-import --address 0x... --type hardware  [EXISTING - MetaMask/Ledger]
 * 
 * Environment Variables:
 *   PI_WALLET_ADDRESS=0x...    [Use existing wallet]
 *   PI_WALLET_TYPE=readonly    [agentic|ethers|hardware|readonly]
 *   PI_WALLET_CHAIN=base       [base|sepolia]
 * 
 * @see https://github.com/0xKobold/pi-wallet
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

// ============================================================================
// CONFIGURATION
// ============================================================================

function getWalletDir(): string {
  const envDir = process.env.PI_WALLET_DIR;
  if (envDir) return envDir;
  const koboldDir = join(homedir(), ".0xkobold");
  if (existsSync(koboldDir)) return join(koboldDir, "wallets");
  return join(homedir(), ".pi", "wallet");
}

const WALLET_DIR = getWalletDir();
const WALLET_CONFIG = join(WALLET_DIR, "config.json");

const BASE_CONFIG = {
  mainnet: { name: "base", chainId: 8453, rpc: "https://mainnet.base.org", explorer: "https://basescan.org" },
  sepolia: { name: "base-sepolia", chainId: 84532, rpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org" },
};

type WalletType = "agentic" | "ethers" | "hardware" | "readonly";

interface WalletConfig {
  activeProvider: WalletType | null;
  agentic?: {
    email: string;
    authenticated: boolean;
    address?: string;
    createdAt: number;
  };
  ethers?: {
    address: string;
    encryptedKey?: string;
    createdAt: number;
  };
  hardware?: {
    address: string;
    provider: "metamask" | "ledger" | "trezor" | "walletconnect";
    connected: boolean;
    createdAt: number;
  };
  readonlyWallet?: {
    address: string;
    label?: string;
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
// STORAGE
// ============================================================================

function ensureDir() { 
  if (!existsSync(WALLET_DIR)) mkdirSync(WALLET_DIR, { recursive: true, mode: 0o700 }); 
}

function loadConfig(): WalletConfig {
  // Check for env var wallet first (for quick setup)
  const envAddress = process.env.PI_WALLET_ADDRESS;
  const envType = (process.env.PI_WALLET_TYPE || "readonly") as WalletType;
  
  if (envAddress && envAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    console.log("[pi-wallet] Using environment wallet:", envAddress.slice(0, 10) + "...");
    return {
      activeProvider: envType,
      readonlyWallet: {
        address: envAddress,
        label: "Environment Wallet",
        createdAt: Date.now(),
      },
      settings: {
        defaultChain: (process.env.PI_WALLET_CHAIN as keyof typeof BASE_CONFIG) || "sepolia",
        maxTransactionAmount: process.env.PI_WALLET_MAX_AMOUNT || "100",
        requireConfirmation: true,
      },
      lastUpdated: Date.now(),
    };
  }

  ensureDir();
  if (!existsSync(WALLET_CONFIG)) {
    const cfg: WalletConfig = {
      activeProvider: null,
      settings: {
        defaultChain: "sepolia",
        maxTransactionAmount: "100",
        requireConfirmation: true,
      },
      lastUpdated: Date.now(),
    };
    saveConfig(cfg);
    return cfg;
  }
  try {
    return JSON.parse(readFileSync(WALLET_CONFIG, "utf-8"));
  } catch {
    return { 
      activeProvider: null, 
      settings: { defaultChain: "sepolia", maxTransactionAmount: "100", requireConfirmation: true }, 
      lastUpdated: Date.now() 
    };
  }
}

function saveConfig(c: WalletConfig) {
  ensureDir();
  c.lastUpdated = Date.now();
  const tmp = WALLET_CONFIG + ".tmp";
  writeFileSync(tmp, JSON.stringify(c, null, 2), { mode: 0o600 });
  require("fs").renameSync(tmp, WALLET_CONFIG);
}

// ============================================================================
// PROVIDERS
// ============================================================================

class AgenticProvider {
  private async exec(args: string[]): Promise<unknown> {
    try {
      const { $ } = await import("bun");
      const result = await $`npx awal ${args}`.text();
      return JSON.parse(result);
    } catch {
      const { $ } = await import("bun");
      const result = await $`awal ${args}`.text();
      return JSON.parse(result);
    }
  }

  async status() {
    const r = await this.exec(["status", "--json"]) as any;
    return { auth: r?.authenticated, addr: r?.address, network: r?.network };
  }

  async login(email: string) {
    const r = await this.exec(["auth", "login", email, "--json"]) as any;
    return { flowId: r?.flowId, msg: r?.message || `Check ${email}` };
  }

  async balance(chain = "base") {
    const r = await this.exec(["balance", "--chain", chain, "--json"]) as any;
    return { eth: r?.eth, usdc: r?.usdc };
  }

  async send(amount: string, to: string, chain = "base") {
    const r = await this.exec(["send", amount, to, "--chain", chain, "--json"]) as any;
    return { tx: r?.txHash, status: r?.status };
  }
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

const provider = new AgenticProvider();

async function handleCreate(args: string, ctx: any) {
  const email = args.match(/--email\s+(\S+)/)?.[1];
  if (!email?.includes("@")) {
    ctx.ui?.notify?.("Usage: /wallet-create --email me@example.com", "warning");
    return;
  }

  const cfg = loadConfig();
  cfg.activeProvider = "agentic";
  cfg.agentic = { email, authenticated: false, createdAt: Date.now() };

  try {
    await provider.login(email);
    saveConfig(cfg);
    ctx.ui?.notify?.([
      "🪙 CDP Agentic Wallet Created!",
      `Email: ${email}`,
      "📧 Check email for verification code",
    ].join("\n"), "success");
  } catch (e: any) {
    ctx.ui?.notify?.(`Failed: ${e.message}`, "error");
  }
}

async function handleImport(args: string, ctx: any) {
  const addrMatch = args.match(/--address\s+(0x[a-fA-F0-9]{40})/);
  const typeMatch = args.match(/--type\s+(ethers|hardware|readonly)/);
  const labelMatch = args.match(/--label\s+"([^"]+)"/);

  if (!addrMatch) {
    ctx.ui?.notify?.([
      "📥 Import Existing Wallet",
      "",
      "Usage:",
      "  /wallet-import --address 0x... --type readonly [--label \"My Wallet\"]",
      "",
      "Types:",
      "  • readonly  - Monitor only, no keys stored",
      "  • ethers    - Self-custody (Phase 2: encrypted keys)",
      "  • hardware  - MetaMask/Ledger (Phase 2: connect)",
      "",
      "Quick setup:",
      "  export PI_WALLET_ADDRESS=0x...",
      "  export PI_WALLET_TYPE=readonly",
    ].join("\n"), "info");
    return;
  }

  const address = addrMatch[1];
  const type = (typeMatch?.[1] || "readonly") as WalletType;
  const label = labelMatch?.[1];

  const cfg = loadConfig();
  cfg.activeProvider = type;

  switch (type) {
    case "readonly":
      cfg.readonlyWallet = { address, label, createdAt: Date.now() };
      break;
    case "ethers":
      cfg.ethers = { address, createdAt: Date.now() };
      break;
    case "hardware":
      cfg.hardware = { address, provider: "metamask", connected: false, createdAt: Date.now() };
      break;
  }

  saveConfig(cfg);
  ctx.ui?.notify?.([
    `📥 Wallet Imported (${type})`,
    `Address: ${address.slice(0, 6)}...${address.slice(-4)}`,
    label ? `Label: ${label}` : "",
    type === "readonly" ? "\n⚠️ Read-only: Cannot send transactions" : "",
  ].filter(Boolean).join("\n"), "success");
}

async function handleStatus(ctx: any) {
  const cfg = loadConfig();
  const type = cfg.activeProvider;

  if (!type) {
    ctx.ui?.notify?.([
      "💰 No wallet configured",
      "",
      "Create new:",
      "  /wallet-create --email me@example.com",
      "",
      "Import existing:",
      "  /wallet-import --address 0x... --type readonly",
      "",
      "Or use environment:",
      "  export PI_WALLET_ADDRESS=0x...",
      "  export PI_WALLET_TYPE=readonly",
    ].join("\n"), "info");
    return;
  }

  const lines = [
    "💰 Wallet Status",
    "",
    `Type: ${type}`,
    `Chain: ${cfg.settings.defaultChain} (${BASE_CONFIG[cfg.settings.defaultChain].chainId})`,
  ];

  // Show address based on type
  let address: string | undefined;
  switch (type) {
    case "agentic":
      address = cfg.agentic?.address;
      lines.push(`Email: ${cfg.agentic?.email || "N/A"}`);
      break;
    case "ethers":
      address = cfg.ethers?.address;
      lines.push("Mode: Self-custody (encrypted key storage)");
      break;
    case "hardware":
      address = cfg.hardware?.address;
      lines.push(`Provider: ${cfg.hardware?.provider || "N/A"}`);
      lines.push("Mode: Hardware wallet connection");
      break;
    case "readonly":
      address = cfg.readonlyWallet?.address;
      lines.push(`Label: ${cfg.readonlyWallet?.label || "N/A"}`);
      lines.push("Mode: Read-only monitoring");
      break;
  }

  if (address) {
    lines.push(`Address: ${address.slice(0, 6)}...${address.slice(-4)}`);
  }

  // Try to get balance if agentic
  if (type === "agentic") {
    try {
      const bal = await provider.balance(cfg.settings.defaultChain);
      lines.push("", "Balances:", `  ETH: ${bal.eth || "0"}`, `  USDC: ${bal.usdc || "0"}`);
    } catch {
      lines.push("", "Balances: Unable to fetch");
    }
  } else if (address) {
    lines.push("", `💡 Check balance: ${BASE_CONFIG[cfg.settings.defaultChain].explorer}/address/${address}`);
  }

  lines.push("", type === "readonly" ? "⚠️ Read-only: Cannot send" : "Send: /wallet-send --to 0x... --amount 0.01");

  ctx.ui?.notify?.(lines.filter(Boolean).join("\n"), "info");
}

async function handleSend(args: string, ctx: any) {
  const cfg = loadConfig();
  const type = cfg.activeProvider;

  if (!type) {
    ctx.ui?.notify?.("No wallet configured. Use /wallet-create or /wallet-import", "warning");
    return;
  }

  if (type === "readonly") {
    ctx.ui?.notify?.([
      "❌ Cannot send from read-only wallet",
      "",
      "To send transactions, use one of these wallet types:",
      "  • agentic  - Create: /wallet-create --email me@example.com",
      "  • ethers   - Import: /wallet-import --address 0x... --type ethers",
      "  • hardware - Import: /wallet-import --address 0x... --type hardware",
      "",
      "Or use an external wallet app to send from this address.",
    ].join("\n"), "error");
    return;
  }

  if (type !== "agentic") {
    ctx.ui?.notify?.([
      `⏳ ${type} wallet sending not yet implemented`,
      "",
      "Currently supported:",
      "  • agentic (CDP) - fully implemented",
      "",
      "Coming in Phase 2:",
      "  • ethers (self-custody with ethers.js)",
      "  • hardware (MetaMask/Ledger integration)",
    ].join("\n"), "warning");
    return;
  }

  const toMatch = args.match(/--to\s+(0x[a-fA-F0-9]{40})/);
  const amtMatch = args.match(/--amount\s+([\d.]+)/);

  if (!toMatch || !amtMatch) {
    ctx.ui?.notify?.("Usage: /wallet-send --to 0x... --amount 1.5", "warning");
    return;
  }

  const to = toMatch[1];
  const amount = amtMatch[1];

  try {
    ctx.ui?.notify?.(`Sending ${amount} ETH to ${to.slice(0, 6)}...`, "info");
    const result = await provider.send(amount, to, cfg.settings.defaultChain);
    ctx.ui?.notify?.([
      "🎉 Transaction Sent!",
      `Tx: ${result.tx}`,
      `Status: ${result.status}`,
    ].join("\n"), "success");
  } catch (e: any) {
    ctx.ui?.notify?.(`Failed: ${e.message}`, "error");
  }
}

// ============================================================================
// EXTENSION EXPORT
// ============================================================================

export default function walletExtension(pi: ExtensionAPI) {
  pi.registerCommand("wallet-create", {
    description: "Create new CDP Agentic Wallet",
    handler: (args: string, ctx: any) => handleCreate(args, ctx),
  });

  pi.registerCommand("wallet-import", {
    description: "Import existing wallet (readonly/ethers/hardware)",
    handler: (args: string, ctx: any) => handleImport(args, ctx),
  });

  pi.registerCommand("wallet-status", {
    description: "Check wallet status",
    handler: (_args: string, ctx: any) => handleStatus(ctx),
  });

  pi.registerCommand("wallet-send", {
    description: "Send crypto (agentic only for now)",
    handler: (args: string, ctx: any) => handleSend(args, ctx),
  });

  pi.registerCommand("wallet", {
    description: "Wallet management (multi-type)",
    handler: async (argsStr: string, ctx: any) => {
      const [sub, ...rest] = argsStr.trim().split(/\s+/);
      const restStr = rest.join(" ");
      switch (sub) {
        case "create": return handleCreate(restStr, ctx);
        case "import": return handleImport(restStr, ctx);
        case "status": return handleStatus(ctx);
        case "send": return handleSend(restStr, ctx);
        default:
          ctx.ui?.notify?.([
            "💰 Wallet Commands",
            "",
            "Create CDP Wallet:",
            "  /wallet create --email me@example.com",
            "",
            "Import Existing:",
            "  /wallet import --address 0x... --type readonly",
            "",
            "Quick Setup (Environment):",
            "  export PI_WALLET_ADDRESS=0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E",
            "  export PI_WALLET_TYPE=readonly",
            "",
            "Send:",
            "  /wallet send --to 0x... --amount 0.01",
          ].join("\n"), "info");
      }
    },
  });

  // Tools
  pi.registerTool({
    // @ts-ignore
    name: "wallet_send",
    // @ts-ignore  
    label: "/wallet_send",
    description: "Send ETH (agentic wallets only)",
    // @ts-ignore
    parameters: Type.Object({
      to: Type.String(),
      amount: Type.String(),
      token: Type.Optional(Type.String({ default: "ETH" })),
    }),
    // @ts-ignore
    async execute(_id: string, args: any, _s: any, onUpdate: any, _c: any) {
      const cfg = loadConfig();
      if (cfg.activeProvider === "readonly") {
        return { content: [{ type: "text", text: "Read-only wallet cannot send" }], details: { error: "Read-only" } };
      }
      if (cfg.activeProvider !== "agentic") {
        return { content: [{ type: "text", text: `${cfg.activeProvider} sending not yet implemented` }], details: { error: "Not implemented" } };
      }
      onUpdate?.("Sending...");
      try {
        const result = await provider.send(args.amount, args.to);
        return { content: [{ type: "text", text: `Sent ${args.amount} to ${args.to.slice(0,8)}...` }], details: result };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], details: { error: e.message } };
      }
    },
  });

  pi.registerTool({
    // @ts-ignore
    name: "wallet_get_address",
    // @ts-ignore
    label: "/wallet_get_address",
    description: "Get current wallet address",
    // @ts-ignore
    parameters: Type.Object({}),
    // @ts-ignore
    async execute() {
      const cfg = loadConfig();
      const address = cfg.agentic?.address || cfg.ethers?.address || cfg.hardware?.address || cfg.readonlyWallet?.address;
      return { content: [{ type: "text", text: address || "No wallet" }], details: { address, type: cfg.activeProvider } };
    },
  });

  console.log("[pi-wallet] Multi-type wallet extension loaded");
  console.log("[pi-wallet] Types: agentic | ethers | hardware | readonly");
  console.log("[pi-wallet] Quick import: export PI_WALLET_ADDRESS=0x...");
}

// Re-exports
export { loadConfig, WalletConfig, WalletType, BASE_CONFIG };
