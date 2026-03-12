/**
 * Wallet Extension for 0xKobold
 * CDP Agentic Wallet + x402 protocol
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { $ } from "bun";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

const WALLET_DIR = join(homedir(), ".0xkobold", "wallets");
const WALLET_CONFIG = join(WALLET_DIR, "config.json");

interface WalletConfig {
  activeProvider: "agentic" | null;
  agentic?: { email: string; authenticated: boolean; address?: string };
  settings: { defaultChain: string };
}

function ensureDir() {
  if (!existsSync(WALLET_DIR)) mkdirSync(WALLET_DIR, { recursive: true });
}

function loadConfig(): WalletConfig {
  ensureDir();
  if (!existsSync(WALLET_CONFIG)) {
    const cfg: WalletConfig = { activeProvider: null, settings: { defaultChain: "base" } };
    saveConfig(cfg);
    return cfg;
  }
  try {
    return JSON.parse(readFileSync(WALLET_CONFIG, "utf-8"));
  } catch {
    return { activeProvider: null, settings: { defaultChain: "base" } };
  }
}

function saveConfig(c: WalletConfig) {
  ensureDir();
  writeFileSync(WALLET_CONFIG, JSON.stringify(c, null, 2), { mode: 0o600 });
}

class AgenticProvider {
  private async exec(args: string[]): Promise<unknown> {
    try {
      const cmd = "awal " + args.join(" ");
      return JSON.parse(await $`npx ${cmd}`.text());
    } catch {
      return JSON.parse(await $`awal ${args}`.text());
    }
  }

  async status() {
    const r = await this.exec(["status", "--json"]) as any;
    return { auth: r?.authenticated, addr: r?.address };
  }

  async login(email: string) {
    const r = await this.exec(["auth", "login", email, "--json"]) as any;
    return { flowId: r?.flowId, msg: r?.message || `Check ${email}` };
  }

  async balance(chain = "base") {
    const r = await this.exec(["balance", "--chain", chain, "--json"]) as any;
    return { eth: r?.eth, usdc: r?.usdc };
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

export default function walletExtension(pi: ExtensionAPI) {
  pi.registerCommand("wallet-create", {
    description: "Create wallet via email",
    handler: async (args: string, ctx: any) => {
      const email = args.match(/--email\s+(\S+)/)?.[1];
      if (!email) {
        ctx.ui?.notify?.("Usage: /wallet-create --email me@example.com", "warning");
        return;
      }
      try {
        const { msg } = await provider.login(email);
        const cfg = loadConfig();
        cfg.activeProvider = "agentic";
        cfg.agentic = { email, authenticated: false };
        saveConfig(cfg);
        ctx.ui?.notify?.(`🔐 Setup started! ${msg}\nComplete with OTP`, "success");
      } catch (e: any) {
        ctx.ui?.notify?.(`Failed: ${e.message}`, "error");
      }
    },
  });

  pi.registerCommand("wallet-status", {
    description: "Check wallet",
    handler: async (_args: string, ctx: any) => {
      const cfg = loadConfig();
      if (!cfg.activeProvider) {
        ctx.ui?.notify?.("Wallet not configured. Run: /wallet-create --email me@example.com", "info");
        return;
      }
      try {
        const s = await provider.status();
        const addr = await provider.address();
        const bal = await provider.balance(cfg.settings.defaultChain);
        const msg = [
          `💳 Authenticated: ${s.auth ? "Yes" : "No"}`,
          addr ? `Address: ${addr.slice(0, 6)}...${addr.slice(-4)}` : "",
          bal.usdc ? `USDC: ${bal.usdc}` : "",
          bal.eth ? `ETH: ${bal.eth}` : "",
        ].filter(Boolean).join("\n");
        ctx.ui?.notify?.(msg, "info");
      } catch (e: any) {
        ctx.ui?.notify?.(`Error: ${e.message}\nInstall: npm install -g @coinbase/awal`, "error");
      }
    },
  });

  pi.registerCommand("wallet-send", {
    description: "Send USDC",
    handler: async (args: string, ctx: any) => {
      const [amt, to] = args.trim().split(/\s+/);
      if (!amt || !to) {
        ctx.ui?.notify?.("Usage: /wallet-send <amount> <recipient>", "warning");
        return;
      }
      try {
        const r = await provider.send(amt, to);
        ctx.ui?.notify?.(`💸 Sent! Tx: ${r.tx?.slice(0, 10) || r.status}`, "success");
      } catch (e: any) {
        ctx.ui?.notify?.(`Failed: ${e.message}`, "error");
      }
    },
  });

  pi.registerCommand("wallet-trade", {
    description: "Trade tokens",
    handler: async (args: string, ctx: any) => {
      const [amt, from, to] = args.trim().split(/\s+/);
      if (!amt || !from || !to) {
        ctx.ui?.notify?.("Usage: /wallet-trade <amount> <from> <to>", "warning");
        return;
      }
      try {
        const r = await provider.trade(amt, from, to);
        ctx.ui?.notify?.(`🔄 ${amt} ${from}→${to}. Tx: ${r.tx?.slice(0, 10)}`, "success");
      } catch (e: any) {
        ctx.ui?.notify?.(`Failed: ${e.message}`, "error");
      }
    },
  });

  pi.registerCommand("wallet-x402", {
    description: "x402 payment",
    handler: async (args: string, ctx: any) => {
      const [cmd, url] = args.trim().split(/\s+/);
      if (cmd !== "pay" || !url) {
        ctx.ui?.notify?.("Usage: /wallet-x402 pay https://api.example.com", "warning");
        return;
      }
      try {
        const r = await provider.x402(url);
        ctx.ui?.notify?.(r.ok ? `✓ Paid! Data: ${r.data?.slice(0, 200) || "OK"}` : "Failed", r.ok ? "success" : "error");
      } catch (e: any) {
        ctx.ui?.notify?.(`Error: ${e.message}`, "error");
      }
    },
  });

  pi.registerCommand("wallet", {
    description: "Wallet management",
    handler: async (args: string, ctx: any) => {
      const [sub, ...rest] = args.trim().split(/\s+/);
      const restStr = rest.join(" ");
      switch (sub) {
        case "create":
          ctx.ui?.notify?.("Use: /wallet-create --email me@example.com", "info");
          break;
        case "status":
          ctx.ui?.notify?.("Use: /wallet-status", "info");
          break;
        case "send":
          ctx.ui?.notify?.("Use: /wallet-send <amount> <to>", "info");
          break;
        case "trade":
          ctx.ui?.notify?.("Use: /wallet-trade <amt> <from> <to>", "info");
          break;
        case "x402":
          ctx.ui?.notify?.("Use: /wallet-x402 pay <url>", "info");
          break;
        default:
          ctx.ui?.notify?.([
            "💳 Wallet Commands",
            "/wallet-create --email me@example.com",
            "/wallet-status",
            "/wallet-send 10 vitalik.eth",
            "/wallet-trade 5 usdc eth",
            "/wallet-x402 pay https://api.service.com",
            "",
            "Skills: npx skills add coinbase/agentic-wallet-skills",
          ].join("\n"), "info");
      }
    },
  });

  pi.registerTool({
    // @ts-ignore
    name: "wallet_send",
    label: "/wallet_send",
    description: "Send USDC payment",
    // @ts-ignore
    parameters: Type.Object({ amount: Type.String(), recipient: Type.String(), chain: Type.Optional(Type.String()) }),
    // @ts-ignore
    async execute(_id: string, args: any, _s: any, _u: any, _c: any) {
      try {
        const r = await provider.send(args.amount, args.recipient, args.chain || "base");
        return { content: [{ type: "text", text: `Sent! Tx: ${r.tx}` }], details: r };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Failed: ${e.message}` }], details: { error: e.message } };
      }
    },
  });

  pi.registerTool({
    // @ts-ignore
    name: "wallet_x402_pay",
    label: "/wallet_x402_pay",
    description: "x402 payment",
    // @ts-ignore
    parameters: Type.Object({ url: Type.String() }),
    // @ts-ignore
    async execute(_id: string, args: any, _s: any, _u: any, _c: any) {
      try {
        const r = await provider.x402(args.url);
        return { content: [{ type: "text", text: r.ok ? `Paid! ${r.data?.slice(0, 200)}` : "Failed" }], details: r };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], details: { error: e.message } };
      }
    },
  });

  console.log("[Wallet] Loaded: CDP + x402");
}
