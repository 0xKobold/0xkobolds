/**
 * Pi ERC-8004 Extension
 * 
 * ERC-8004 Protocol for pi-coding-agent
 * Agent identity, reputation, and discovery on Base L2
 * 
 * Installation:
 *   pi install npm:@0xkobold/pi-erc8004
 * 
 * Features:
 * - Agent identity registration (off-chain Phase 1, on-chain Phase 2)
 * - Capability attestation with reputation scoring
 * - Agent discovery by capability
 * - Cross-platform trust
 * - Works with or without .0xkobold directory
 * 
 * Environment Variables:
 *   PI_ERC8004_DIR - Custom storage directory
 *   PI_ERC8004_CHAIN - Default chain (base|sepolia)
 * 
 * Commands:
 *   /erc8004 register specialist --capabilities coding,research [--chain sepolia]
 *   /erc8004 status
 *   /erc8004 attest --worker 0x... --rating 95 [--task-id abc] [--comment "Great work"]
 *   /erc8004 discover --capability typescript
 *   /erc8004 reputation [--worker 0x...]
 * 
 * Tools:
 *   erc8004_register - Register agent identity
 *   erc8004_attest - Submit reputation attestation
 *   erc8004_discover - Discover agents by capability
 *   erc8004_reputation - Check reputation
 * 
 * Contracts:
 *   Base Mainnet: 0x8004A169... (Identity) / 0x8004BAa1... (Reputation)
 *   Base Sepolia: 0x8004A818... (Identity) / 0x8004B663... (Reputation)
 * 
 * @see https://github.com/erc-8004/erc-8004-contracts
 * @see https://8004.org
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "fs";

// ============================================================================
// CONFIGURATION - Works with or without .0xkobold
// ============================================================================

function getERC8004Dir(): string {
  // Priority: env var > pi config > .0xkobold > default
  const envDir = process.env.PI_ERC8004_DIR;
  if (envDir) return envDir;

  // Check if .0xkobold exists
  const koboldDir = join(homedir(), ".0xkobold");
  if (existsSync(koboldDir)) {
    return join(koboldDir, "erc8004");
  }

  // Default: pi config dir
  return join(homedir(), ".pi", "erc8004");
}

const ERC8004_DIR = getERC8004Dir();
const AGENT_CONFIG = join(ERC8004_DIR, "agent.json");
const REPUTATION_DB = join(ERC8004_DIR, "reputation.json");

const ERC8004_CONTRACTS = {
  base: {
    IdentityRegistry: "0x8004A169FB4a3325136EB29fA0ceB6D2e539a432",
    ReputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    chainId: 8453,
    rpc: "https://mainnet.base.org",
    explorer: "https://basescan.org",
  },
  sepolia: {
    IdentityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
    ReputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    chainId: 84532,
    rpc: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    faucet: "https://www.coinbase.com/faucets",
  },
};

const IDENTITY_REGISTRY_ABI = [
  "function register(address agent, bytes32 metadataHash, bytes calldata publicKey) external",
  "function getIdentity(address agent) external view returns (bytes32 metadataHash, bytes memory publicKey, uint256 registrationTime, bool active)",
  "function isRegistered(address agent) external view returns (bool)",
  "event IdentityRegistered(address indexed agent, bytes32 metadataHash, uint256 registrationTime)",
];

const REPUTATION_REGISTRY_ABI = [
  "function submitAttestation(address subject, uint256 score, bytes32 metadataHash) external",
  "function getReputation(address agent) external view returns (uint256 totalScore, uint256 attestationCount, uint256 lastUpdateTime)",
  "event AttestationSubmitted(address indexed attester, address indexed subject, uint256 score, uint256 timestamp)",
];

interface AgentIdentity {
  address: string;
  name: string;
  metadataHash: string;
  publicKey: string;
  capabilities: string[];
  registeredAt: number;
  chain: keyof typeof ERC8004_CONTRACTS;
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

// ============================================================================
// STORAGE - Portable across platforms
// ============================================================================

function ensureDir(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }
}

function loadAgentConfig(): AgentIdentity | null {
  ensureDir(ERC8004_DIR);
  if (!existsSync(AGENT_CONFIG)) return null;
  try {
    return JSON.parse(readFileSync(AGENT_CONFIG, "utf-8"));
  } catch (e) {
    console.error("[pi-erc8004] Failed to load agent config:", e);
    return null;
  }
}

function saveAgentConfig(cfg: AgentIdentity) {
  ensureDir(ERC8004_DIR);
  const tmp = AGENT_CONFIG + ".tmp";
  writeFileSync(tmp, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  renameSync(tmp, AGENT_CONFIG);
}

function loadReputationData(): ReputationData {
  ensureDir(ERC8004_DIR);
  if (!existsSync(REPUTATION_DB)) return { localScore: 0, attestations: [] };
  try {
    return JSON.parse(readFileSync(REPUTATION_DB, "utf-8"));
  } catch (e) {
    console.error("[pi-erc8004] Failed to load reputation data:", e);
    return { localScore: 0, attestations: [] };
  }
}

function saveReputationData(data: ReputationData) {
  ensureDir(ERC8004_DIR);
  const tmp = REPUTATION_DB + ".tmp";
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  renameSync(tmp, REPUTATION_DB);
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

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

async function registerIdentity(
  agentType: string,
  capabilities: string[],
  walletAddress: string,
  chain: keyof typeof ERC8004_CONTRACTS = "sepolia",
  name?: string
): Promise<AgentIdentity> {
  const metadata = {
    name: name || `${agentType.charAt(0).toUpperCase() + agentType.slice(1)} Agent`,
    type: agentType,
    capabilities,
    version: "1.0.0",
    framework: "pi",
    createdAt: new Date().toISOString(),
  };

  const metadataHash = generateMetadataHash(metadata);

  const identity: AgentIdentity = {
    address: walletAddress,
    name: metadata.name,
    metadataHash,
    publicKey: "0x",
    capabilities,
    registeredAt: Date.now(),
    chain,
    active: true,
  };

  saveAgentConfig(identity);
  return identity;
}

async function submitAttestation(
  workerAddress: string,
  score: number,
  taskId?: string,
  comment?: string
): Promise<void> {
  const data = loadReputationData();
  data.attestations.push({
    worker: workerAddress,
    score: Math.min(100, Math.max(0, score)),
    taskId,
    timestamp: Date.now(),
    comment,
  });
  saveReputationData(data);
}

function getWorkerReputation(workerAddress: string) {
  const data = loadReputationData();
  const workerAttestations = data.attestations.filter((a) => a.worker === workerAddress);
  const scores = workerAttestations.map((a) => a.score);
  const averageScore = scores.length > 0
    ? scores.reduce((a, b) => a + b, 0) / scores.length
    : 0;

  return {
    averageScore: Math.round(averageScore * 10) / 10,
    attestationCount: workerAttestations.length,
    attestations: workerAttestations,
  };
}

function getMyReputation() {
  const data = loadReputationData();
  const attestationsGiven = data.attestations.length;
  const score = Math.min(100, attestationsGiven * 5 + 10);
  const tier: "bronze" | "silver" | "gold" | "platinum" =
    score >= 90 ? "platinum" : score >= 70 ? "gold" : score >= 40 ? "silver" : "bronze";

  return { score, tier, attestationsGiven };
}

async function discoverAgents(capability: string): Promise<Array<any>> {
  const identity = loadAgentConfig();
  if (identity && identity.capabilities.includes(capability)) {
    return [{
      address: identity.address,
      capabilities: identity.capabilities,
      metadataHash: identity.metadataHash,
      registeredAt: identity.registeredAt,
    }];
  }
  return [];
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleRegister(argsStr: string, ctx: any) {
  const typeMatch = argsStr.match(/^(\w+)/);
  const agentType = typeMatch ? typeMatch[1] : "specialist";
  const nameMatch = argsStr.match(/--name\s+"([^"]+)"/);
  const name = nameMatch ? nameMatch[1] : undefined;
  const capsMatch = argsStr.match(/--capabilities\s+(.+)/);
  const capabilities = capsMatch
    ? capsMatch[1].split(",").map((c) => c.trim())
    : ["coding"];
  const chainMatch = argsStr.match(/--chain\s+(\w+)/);
  const chain = (chainMatch ? chainMatch[1] : process.env.PI_ERC8004_CHAIN || "sepolia") as keyof typeof ERC8004_CONTRACTS;

  // Try to get wallet address from various sources
  let walletAddress = "0x" + "0".repeat(40);
  
  // 1. Try pi-wallet config
  const walletDir = join(homedir(), ".0xkobold", "wallets");
  const piWalletDir = join(homedir(), ".pi", "wallet");
  
  for (const dir of [walletDir, piWalletDir]) {
    const walletConfig = join(dir, "config.json");
    if (existsSync(walletConfig)) {
      try {
        const wallet = JSON.parse(readFileSync(walletConfig, "utf-8"));
        if (wallet.agentic?.address) {
          walletAddress = wallet.agentic.address;
          break;
        }
      } catch {}
    }
  }

  try {
    const identity = await registerIdentity(agentType, capabilities, walletAddress, chain, name);
    ctx.ui?.notify?.([
      "🔗 ERC-8004 Identity Registered",
      "",
      `Name: ${name || `${agentType.charAt(0).toUpperCase() + agentType.slice(1)} Agent`}`,
      `Type: ${agentType}`,
      `Capabilities: ${capabilities.join(", ")}`,
      `Chain: ${chain}`,
      `Address: ${identity.address.slice(0, 6)}...${identity.address.slice(-4)}`,
      `Storage: ${ERC8004_DIR}`,
      "",
      "⚠️  Phase 1: Local storage only",
      "Phase 2: On-chain coming (requires wallet funding)",
    ].join("\n"), "success");
  } catch (e: any) {
    ctx.ui?.notify?.(`Failed: ${e.message}`, "error");
  }
}

async function handleStatus(ctx: any) {
  const identity = loadAgentConfig();
  if (!identity) {
    ctx.ui?.notify?.([
      "🔗 ERC-8004: Not registered",
      "",
      `Storage: ${ERC8004_DIR}`,
      "",
      "Register: /erc8004 register specialist",
      "           --capabilities coding,research",
    ].join("\n"), "info");
    return;
  }

  const rep = getMyReputation();

  ctx.ui?.notify?.([
    "🔗 ERC-8004 Identity",
    "",
    `Name: ${identity.name}`,
    `Type: ${identity.capabilities[0] || "agent"}`,
    `Capabilities: ${identity.capabilities.join(", ")}`,
    `Address: ${identity.address.slice(0, 6)}...${identity.address.slice(-4)}`,
    `Chain: ${identity.chain}`,
    `Active: ${identity.active ? "Yes" : "No"}`,
    `Storage: ${ERC8004_DIR}`,
    "",
    "📊 Reputation",
    `  Score: ${rep.score}/100`,
    `  Tier: ${rep.tier.toUpperCase()}`,
    `  Attestations Given: ${rep.attestationsGiven}`,
  ].join("\n"), "info");
}

async function handleAttest(argsStr: string, ctx: any) {
  const workerMatch = argsStr.match(/--worker\s+(0x[a-fA-F0-9]+)/);
  const scoreMatch = argsStr.match(/--rating\s+(\d+)/);
  const taskMatch = argsStr.match(/--task-id\s+(\S+)/);
  const commentMatch = argsStr.match(/--comment\s+"([^"]+)"/);

  if (!workerMatch || !scoreMatch) {
    ctx.ui?.notify?.("Usage: /erc8004 attest --worker 0x... --rating 95 [--task-id abc] [--comment \"...\"]", "warning");
    return;
  }

  const worker = workerMatch[1];
  const score = parseInt(scoreMatch[1], 10);
  const taskId = taskMatch ? taskMatch[1] : undefined;
  const comment = commentMatch ? commentMatch[1] : undefined;

  try {
    await submitAttestation(worker, score, taskId, comment);
    const rep = getWorkerReputation(worker);
    ctx.ui?.notify?.([
      "✅ Attestation Submitted",
      "",
      `Worker: ${worker.slice(0, 6)}...${worker.slice(-4)}`,
      `Score: ${score}/100`,
      taskId ? `Task: ${taskId}` : "",
      comment ? `Comment: ${comment}` : "",
      `Storage: ${ERC8004_DIR}`,
      "",
      `Worker now has ${rep.attestationCount} attestations`,
      `Average score: ${rep.averageScore}/100`,
    ].filter(Boolean).join("\n"), "success");
  } catch (e: any) {
    ctx.ui?.notify?.(`Failed: ${e.message}`, "error");
  }
}

async function handleDiscover(argsStr: string, ctx: any) {
  const capMatch = argsStr.match(/--capability\s+(\w+)/);
  const capability = capMatch ? capMatch[1] : "specialist";

  try {
    const agents = await discoverAgents(capability);
    if (agents.length === 0) {
      ctx.ui?.notify?.(`No agents found with capability: ${capability}`, "info");
      return;
    }

    const lines = [
      `🔍 Agents with "${capability}"`,
      "",
      ...agents.map((a) => [
        `Name: ${a.name}`,
        `Address: ${a.address.slice(0, 6)}...${a.address.slice(-4)}`,
        `  Capabilities: ${a.capabilities.join(", ")}`,
        `  Registered: ${new Date(a.registeredAt).toLocaleDateString()}`,
      ].join("\n")),
    ];
    ctx.ui?.notify?.(lines.join("\n"), "info");
  } catch (e: any) {
    ctx.ui?.notify?.(`Discovery failed: ${e.message}`, "error");
  }
}

async function handleReputation(argsStr: string, ctx: any) {
  const workerMatch = argsStr.match(/--worker\s+(0x[a-fA-F0-9]+)/);

  if (!workerMatch) {
    const rep = getMyReputation();
    ctx.ui?.notify?.([
      "📊 My Reputation",
      "",
      `Score: ${rep.score}/100`,
      `Tier: ${rep.tier.toUpperCase()}`,
      `Attestations Given: ${rep.attestationsGiven}`,
      `Storage: ${ERC8004_DIR}`,
    ].join("\n"), "info");
    return;
  }

  const worker = workerMatch[1];
  const rep = getWorkerReputation(worker);

  ctx.ui?.notify?.([
    `📊 Reputation: ${worker.slice(0, 6)}...${worker.slice(-4)}`,
    "",
    `Average Score: ${rep.averageScore}/100`,
    `Attestations: ${rep.attestationCount}`,
    "",
    rep.attestations.length > 0
      ? "Recent:\n" +
        rep.attestations
          .slice(-3)
          .map((a) => `  ${a.score}/100 - ${new Date(a.timestamp).toLocaleDateString()}${a.comment ? `: "${a.comment}"` : ""}`)
          .join("\n")
      : "No attestations yet",
  ].join("\n"), "info");
}

// ============================================================================
// EXTENSION EXPORT
// ============================================================================

export default function erc8004Extension(pi: ExtensionAPI) {
  // Commands
  pi.registerCommand("erc8004-register", {
    description: "Register ERC-8004 identity",
    handler: (args: string, ctx: any) => handleRegister(args, ctx),
  });

  pi.registerCommand("erc8004-status", {
    description: "Check ERC-8004 identity status",
    handler: (_args: string, ctx: any) => handleStatus(ctx),
  });

  pi.registerCommand("erc8004-attest", {
    description: "Submit attestation for worker",
    handler: (args: string, ctx: any) => handleAttest(args, ctx),
  });

  pi.registerCommand("erc8004-discover", {
    description: "Discover agents by capability",
    handler: (args: string, ctx: any) => handleDiscover(args, ctx),
  });

  pi.registerCommand("erc8004-reputation", {
    description: "Check reputation",
    handler: (args: string, ctx: any) => handleReputation(args, ctx),
  });

  // Unified command
  pi.registerCommand("erc8004", {
    description: "ERC-8004 agent identity",
    handler: async (argsStr: string, ctx: any) => {
      const [sub, ...rest] = argsStr.trim().split(/\s+/);
      const restStr = rest.join(" ");
      switch (sub) {
        case "register": return handleRegister(restStr, ctx);
        case "status": return handleStatus(ctx);
        case "attest": return handleAttest(restStr, ctx);
        case "discover": return handleDiscover(restStr, ctx);
        case "reputation": return handleReputation(restStr, ctx);
        default:
          ctx.ui?.notify?.([
            "🔗 ERC-8004 Commands",
            "",
            '/erc8004 register specialist --name "My Agent" --capabilities coding,research',
            "/erc8004 status",
            "/erc8004 attest --worker 0x... --rating 95 --task-id abc",
            "/erc8004 discover --capability typescript",
            "/erc8004 reputation [--worker 0x...]",
            "",
            `Storage: ${ERC8004_DIR}`,
          ].join("\n"), "info");
      }
    },
  });

  // Tools
  pi.registerTool({
    // @ts-ignore
    name: "erc8004_register" as any,
    // @ts-ignore
    label: "/erc8004_register",
    description: "Register agent on ERC-8004",
    // @ts-ignore
    parameters: Type.Object({
      agentType: Type.String(),
      name: Type.Optional(Type.String()),
      capabilities: Type.Optional(Type.Array(Type.String())),
    }) as any,
    // @ts-ignore
    async execute(_id: string, args: any, _s: any, _u: any, _c: any) {
      try {
        // Try to get wallet address from various sources
        let walletAddress = "0x" + "0".repeat(40);
        const walletDirs = [
          join(homedir(), ".0xkobold", "wallets"),
          join(homedir(), ".pi", "wallet"),
        ];
        
        for (const dir of walletDirs) {
          const walletConfig = join(dir, "config.json");
          if (existsSync(walletConfig)) {
            try {
              const wallet = JSON.parse(readFileSync(walletConfig, "utf-8"));
              if (wallet.agentic?.address) {
                walletAddress = wallet.agentic.address;
                break;
              }
            } catch {}
          }
        }
        
        const identity = await registerIdentity(
          args.agentType,
          args.capabilities || ["coding"],
          walletAddress,
          (process.env.PI_ERC8004_CHAIN as any) || "sepolia",
          args.name
        );
        return {
          content: [{ type: "text", text: `Registered ${args.name || args.agentType} at ${identity.address}` }],
          details: identity,
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], details: { error: e.message } };
      }
    },
  });

  pi.registerTool({
    // @ts-ignore
    name: "erc8004_attest" as any,
    // @ts-ignore
    label: "/erc8004_attest",
    description: "Submit reputation attestation",
    // @ts-ignore
    parameters: Type.Object({
      worker: Type.String(),
      score: Type.Number(),
      taskId: Type.Optional(Type.String()),
    }) as any,
    // @ts-ignore
    async execute(_id: string, args: any, _s: any, _u: any, _c: any) {
      try {
        await submitAttestation(args.worker, args.score, args.taskId);
        const rep = getWorkerReputation(args.worker);
        return {
          content: [{ type: "text", text: `Attested ${args.worker}: ${args.score}/100` }],
          details: { worker: args.worker, score: args.score, ...rep },
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], details: { error: e.message } };
      }
    },
  });

  pi.registerTool({
    // @ts-ignore
    name: "erc8004_discover" as any,
    // @ts-ignore
    label: "/erc8004_discover",
    description: "Discover agents",
    // @ts-ignore
    parameters: Type.Object({ capability: Type.String() }) as any,
    // @ts-ignore
    async execute(_id: string, args: any, _s: any, _u: any, _c: any) {
      try {
        const agents = await discoverAgents(args.capability);
        return {
          content: [{ type: "text", text: `Found ${agents.length} agents` }],
          details: { agents },
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], details: { error: e.message } };
      }
    },
  });

  pi.registerTool({
    // @ts-ignore
    name: "erc8004_reputation" as any,
    // @ts-ignore
    label: "/erc8004_reputation",
    description: "Check reputation",
    // @ts-ignore
    parameters: Type.Object({ worker: Type.Optional(Type.String()) }) as any,
    // @ts-ignore
    async execute(_id: string, args: any, _s: any, _u: any, _c: any) {
      try {
        if (args.worker) {
          const rep = getWorkerReputation(args.worker);
          return {
            content: [{ type: "text", text: `${args.worker}: ${rep.averageScore}/100 (${rep.attestationCount} attestations)` }],
            details: rep,
          };
        }
        const rep = getMyReputation();
        return {
          content: [{ type: "text", text: `My score: ${rep.score}/100 (${rep.tier})` }],
          details: rep,
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], details: { error: e.message } };
      }
    },
  });

  console.log("[pi-erc8004] Loaded with real contracts");
  console.log(`[pi-erc8004] Storage: ${ERC8004_DIR}`);
  console.log("[pi-erc8004] Commands: /erc8004 [register|status|attest|discover|reputation]");
  console.log("[pi-erc8004] Phase 1: Local storage | Phase 2: On-chain (requires funding)");
}

// Re-exports for programmatic use
export {
  ERC8004_CONTRACTS,
  IDENTITY_REGISTRY_ABI,
  REPUTATION_REGISTRY_ABI,
  generateMetadataHash,
  registerIdentity,
  submitAttestation,
  getWorkerReputation,
  getMyReputation,
  discoverAgents,
};
