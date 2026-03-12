/**
 * ERC-8004 Integration Extension
 *
 * Implements real ERC-8004 protocol for agent identity and reputation.
 * Contract addresses deployed on Base (Coinbase L2).
 *
 * Contracts:
 * - IdentityRegistry: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 (Base Mainnet)
 * - ReputationRegistry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63 (Base Mainnet)
 * - IdentityRegistry: 0x8004A818BFB912233c491871b3d84c89A494BD9e (Base Sepolia)
 * - ReputationRegistry: 0x8004B663056A597Dffe9eCcC1965A193B7388713 (Base Sepolia)
 *
 * Features:
 * - Agent identity registration
 * - Capability attestation
 * - Reputation scoring
 * - Discovery and search
 * - Cross-platform trust
 *
 * @see https://github.com/erc-8004/erc-8004-contracts
 * @see https://8004.org
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { join } from "path";
import { homedir } from "os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

// ============================================================================
// CONTRACT CONFIGURATION (Real Deployed Addresses)
// ============================================================================

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
  // Also deployed on Ethereum, Abstract, Arbitrum, Avalanche, BSC, Celo, Gnosis, etc.
};

// Minimal IdentityRegistry ABI (key functions)
const IDENTITY_REGISTRY_ABI = [
  "function register(address agent, bytes32 metadataHash, bytes calldata publicKey) external",
  "function getIdentity(address agent) external view returns (bytes32 metadataHash, bytes memory publicKey, uint256 registrationTime, bool active)",
  "function isRegistered(address agent) external view returns (bool)",
  "function updateMetadata(bytes32 newMetadataHash) external",
  "function deactivate() external",
  "function reactivate(bytes32 metadataHash, bytes calldata publicKey) external",
  "event IdentityRegistered(address indexed agent, bytes32 metadataHash, uint256 registrationTime)",
  "event IdentityUpdated(address indexed agent, bytes32 newMetadataHash)",
  "event IdentityDeactivated(address indexed agent)",
];

// Minimal ReputationRegistry ABI
const REPUTATION_REGISTRY_ABI = [
  "function submitAttestation(address subject, uint256 score, bytes32 metadataHash) external",
  "function getReputation(address agent) external view returns (uint256 totalScore, uint256 attestationCount, uint256 lastUpdateTime)",
  "function getAttestation(address subject, address attester) external view returns (uint256 score, bytes32 metadataHash, uint256 timestamp)",
  "function hasAttested(address attester, address subject) external view returns (bool)",
  "event AttestationSubmitted(address indexed attester, address indexed subject, uint256 score, uint256 timestamp)",
];

// ============================================================================
// STORAGE
// ============================================================================

const ERC8004_DIR = join(homedir(), ".0xkobold", "erc8004");
const AGENT_CONFIG = join(ERC8004_DIR, "agent.json");
const REPUTATION_DB = join(ERC8004_DIR, "reputation.json");

interface AgentIdentity {
  address: string;
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

function ensureDir() {
  if (!existsSync(ERC8004_DIR)) mkdirSync(ERC8004_DIR, { recursive: true });
}

function loadAgentConfig(): AgentIdentity | null {
  ensureDir();
  if (!existsSync(AGENT_CONFIG)) return null;
  try {
    return JSON.parse(readFileSync(AGENT_CONFIG, "utf-8"));
  } catch {
    return null;
  }
}

function saveAgentConfig(cfg: AgentIdentity) {
  ensureDir();
  writeFileSync(AGENT_CONFIG, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

function loadReputationData(): ReputationData {
  ensureDir();
  if (!existsSync(REPUTATION_DB)) return { localScore: 0, attestations: [] };
  try {
    return JSON.parse(readFileSync(REPUTATION_DB, "utf-8"));
  } catch {
    return { localScore: 0, attestations: [] };
  }
}

function saveReputationData(data: ReputationData) {
  ensureDir();
  writeFileSync(REPUTATION_DB, JSON.stringify(data, null, 2), { mode: 0o600 });
}

// ============================================================================
// IDENTITY MANAGEMENT
// ============================================================================

/**
 * Generate metadata hash from agent info
 * In production: Upload to IPFS/Arweave, use resulting hash
 */
function generateMetadataHash(metadata: object): string {
  // Simple hash for demo - in production use keccak256(JSON.stringify(metadata))
  const str = JSON.stringify(metadata);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return "0x" + Math.abs(hash).toString(16).padStart(64, "0");
}

/**
 * Register agent identity
 * Phase 1: Local storage
 * Phase 2: On-chain registration (requires wallet + gas)
 */
async function registerIdentity(
  agentType: string,
  capabilities: string[],
  walletAddress: string,
  chain: keyof typeof ERC8004_CONTRACTS = "sepolia"
): Promise<AgentIdentity> {
  const metadata = {
    name: `0xKobold ${agentType}`,
    type: agentType,
    capabilities,
    version: "0.6.11",
    framework: "0xKobold",
    createdAt: new Date().toISOString(),
  };

  const metadataHash = generateMetadataHash(metadata);
  const publicKey = "0x"; // Would be derived from wallet

  const identity: AgentIdentity = {
    address: walletAddress,
    metadataHash,
    publicKey,
    capabilities,
    registeredAt: Date.now(),
    chain,
    active: true,
  };

  saveAgentConfig(identity);

  // TODO Phase 2: On-chain registration
  // const tx = await identityRegistry.register(walletAddress, metadataHash, publicKey);
  // await tx.wait();

  return identity;
}

/**
 * Get identity info
 */
function getIdentity(): AgentIdentity | null {
  return loadAgentConfig();
}

// ============================================================================
// REPUTATION MANAGEMENT
// ============================================================================

/**
 * Submit attestation for a worker
 * Phase 1: Local storage
 * Phase 2: On-chain attestation via ReputationRegistry
 */
async function submitAttestation(
  workerAddress: string,
  score: number, // 0-100
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

  // TODO Phase 2: On-chain attestation
  // const metadataHash = generateMetadataHash({ taskId, comment });
  // const tx = await reputationRegistry.submitAttestation(workerAddress, score, metadataHash);
  // await tx.wait();
}

/**
 * Get local reputation score for a worker
 */
function getWorkerReputation(workerAddress: string): {
  averageScore: number;
  attestationCount: number;
  attestations: ReputationData["attestations"];
} {
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

/**
 * Calculate agent's own reputation
 */
function getMyReputation(): {
  score: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
  attestationsGiven: number;
} {
  const data = loadReputationData();
  const attestationsGiven = data.attestations.length;

  // Calculate score based on activity
  const score = Math.min(100, attestationsGiven * 5 + 10);
  const tier: "bronze" | "silver" | "gold" | "platinum" =
    score >= 90 ? "platinum" : score >= 70 ? "gold" : score >= 40 ? "silver" : "bronze";

  return { score, tier, attestationsGiven };
}

// ============================================================================
// DISCOVERY
// ============================================================================

/**
 * Search for agents by capability
 * Phase 1: Local search
 * Phase 2: On-chain discovery via events/EventIndexer
 */
async function discoverAgents(_capability: string): Promise<Array<{
  address: string;
  capabilities: string[];
  metadataHash: string;
  registeredAt: number;
}>> {
  // Phase 1: Return our own identity if registered
  const identity = loadAgentConfig();
  if (identity) {
    return [{
      address: identity.address,
      capabilities: identity.capabilities,
      metadataHash: identity.metadataHash,
      registeredAt: identity.registeredAt,
    }];
  }
  return [];

  // TODO Phase 2: Query on-chain events/indexer
  // const filter = identityRegistry.filters.IdentityRegistered();
  // const events = await identityRegistry.queryFilter(filter);
  // Filter by capabilities in metadata
}

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

async function handleERC8004Register(argsStr: string, ctx: any): Promise<void> {
  const typeMatch = argsStr.match(/^(\w+)/);
  const agentType = typeMatch ? typeMatch[1] : "specialist";
  const capsMatch = argsStr.match(/--capabilities\s+(.+)/);
  const capabilities = capsMatch
    ? capsMatch[1].split(",").map((c) => c.trim())
    : ["coding", "typescript"];
  const chainMatch = argsStr.match(/--chain\s+(\w+)/);
  const chain = (chainMatch ? chainMatch[1] : "sepolia") as keyof typeof ERC8004_CONTRACTS;

  // Get wallet address from config
  const walletDir = join(homedir(), ".0xkobold", "wallets");
  const walletConfig = join(walletDir, "config.json");
  let walletAddress = "0x" + "0".repeat(40); // Placeholder

  if (existsSync(walletConfig)) {
    try {
      const wallet = JSON.parse(readFileSync(walletConfig, "utf-8"));
      walletAddress = wallet.agentic?.address || walletAddress;
    } catch {}
  }

  try {
    const identity = await registerIdentity(agentType, capabilities, walletAddress, chain);
    ctx.ui?.notify?.([
      "🔗 ERC-8004 Identity Registered",
      "",
      `Type: ${agentType}`,
      `Capabilities: ${capabilities.join(", ")}`,
      `Chain: ${chain}`,
      `Address: ${identity.address.slice(0, 6)}...${identity.address.slice(-4)}`,
      `Metadata: ${identity.metadataHash.slice(0, 10)}...`,
      "",
      "⚠️  Phase 1: Local registration only",
      "Phase 2: On-chain coming (requires wallet funding)",
    ].join("\n"), "success");
  } catch (e: any) {
    ctx.ui?.notify?.(`Failed: ${e.message}`, "error");
  }
}

async function handleERC8004Status(ctx: any): Promise<void> {
  const identity = getIdentity();
  if (!identity) {
    ctx.ui?.notify?.([
      "🔗 ERC-8004: Not registered",
      "",
      "Register: /erc8004 register specialist",
      "           --capabilities coding,research",
      "           --chain sepolia",
    ].join("\n"), "info");
    return;
  }

  const rep = getMyReputation();

  ctx.ui?.notify?.([
    "🔗 ERC-8004 Identity",
    "",
    `Type: ${identity.capabilities[0] || "agent"}`,
    `Capabilities: ${identity.capabilities.join(", ")}`,
    `Address: ${identity.address.slice(0, 6)}...${identity.address.slice(-4)}`,
    `Chain: ${identity.chain}`,
    `Active: ${identity.active ? "Yes" : "No"}`,
    "",
    "📊 Reputation",
    `  Score: ${rep.score}/100`,
    `  Tier: ${rep.tier.toUpperCase()}`,
    `  Attestations Given: ${rep.attestationsGiven}`,
    "",
    "Contracts:",
    `  Identity: ${ERC8004_CONTRACTS[identity.chain].IdentityRegistry.slice(0, 10)}...`,
    `  Reputation: ${ERC8004_CONTRACTS[identity.chain].ReputationRegistry.slice(0, 10)}...`,
  ].join("\n"), "info");
}

async function handleERC8004Attest(argsStr: string, ctx: any): Promise<void> {
  const workerMatch = argsStr.match(/--worker\s+(0x[a-fA-F0-9]+)/);
  const scoreMatch = argsStr.match(/--rating\s+(\d+)/);
  const taskMatch = argsStr.match(/--task-id\s+(\S+)/);
  const commentMatch = argsStr.match(/--comment\s+"([^"]+)"/);

  if (!workerMatch || !scoreMatch) {
    ctx.ui?.notify?.(
      "Usage: /erc8004 attest --worker 0x... --rating 95 [--task-id abc] [--comment \"Great work\"]",
      "warning"
    );
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
      "",
      `Worker now has ${rep.attestationCount} attestations`,
      `Average score: ${rep.averageScore}/100`,
      "",
      "⚠️  Phase 1: Local storage only",
      "Phase 2: On-chain attestation coming",
    ].filter(Boolean).join("\n"), "success");
  } catch (e: any) {
    ctx.ui?.notify?.(`Failed: ${e.message}`, "error");
  }
}

async function handleERC8004Discover(argsStr: string, ctx: any): Promise<void> {
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

async function handleERC8004Reputation(argsStr: string, ctx: any): Promise<void> {
  const workerMatch = argsStr.match(/--worker\s+(0x[a-fA-F0-9]+)/);

  if (!workerMatch) {
    // Show my reputation
    const rep = getMyReputation();
    ctx.ui?.notify?.([
      "📊 My Reputation",
      "",
      `Score: ${rep.score}/100`,
      `Tier: ${rep.tier.toUpperCase()}`,
      `Attestations Given: ${rep.attestationsGiven}`,
      "",
      "Check worker: /erc8004 reputation --worker 0x...",
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
          .map(
            (a) =>
              `  ${a.score}/100 - ${new Date(a.timestamp).toLocaleDateString()}${
                a.comment ? `: "${a.comment}"` : ""
              }`
          )
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
    handler: async (args: string, ctx: any) => handleERC8004Register(args, ctx),
  });

  pi.registerCommand("erc8004-status", {
    description: "Check ERC-8004 identity status",
    handler: async (_args: string, ctx: any) => handleERC8004Status(ctx),
  });

  pi.registerCommand("erc8004-attest", {
    description: "Submit attestation for worker",
    handler: async (args: string, ctx: any) => handleERC8004Attest(args, ctx),
  });

  pi.registerCommand("erc8004-discover", {
    description: "Discover agents by capability",
    handler: async (args: string, ctx: any) => handleERC8004Discover(args, ctx),
  });

  pi.registerCommand("erc8004-reputation", {
    description: "Check reputation",
    handler: async (args: string, ctx: any) => handleERC8004Reputation(args, ctx),
  });

  // Unified command
  pi.registerCommand("erc8004", {
    description: "ERC-8004 agent identity",
    handler: async (argsStr: string, ctx: any) => {
      const [sub, ...rest] = argsStr.trim().split(/\s+/);
      const restStr = rest.join(" ");
      switch (sub) {
        case "register":
          return handleERC8004Register(restStr, ctx);
        case "status":
          return handleERC8004Status(ctx);
        case "attest":
          return handleERC8004Attest(restStr, ctx);
        case "discover":
          return handleERC8004Discover(restStr, ctx);
        case "reputation":
          return handleERC8004Reputation(restStr, ctx);
        default:
          ctx.ui?.notify?.(
            [
              "🔗 ERC-8004 Commands",
              "",
              "/erc8004 register specialist --capabilities coding,research",
              "/erc8004 status",
              "/erc8004 attest --worker 0x... --rating 95 --task-id abc",
              "/erc8004 discover --capability typescript",
              "/erc8004 reputation [--worker 0x...]",
            ].join("\n"),
            "info"
          );
      }
    },
  });

  // Tools
  pi.registerTool({
    // @ts-ignore
    name: "erc8004_register",
    // @ts-ignore
    label: "/erc8004_register",
    description: "Register agent on ERC-8004",
    // @ts-ignore
    parameters: Type.Object({
      agentType: Type.String(),
      capabilities: Type.Optional(Type.Array(Type.String())),
    }),
    // @ts-ignore
    async execute(_id: string, args: any, _s: any, _u: any, _c: any) {
      try {
        const walletDir = join(homedir(), ".0xkobold", "wallets");
        const walletConfig = join(walletDir, "config.json");
        let walletAddress = "0x" + "0".repeat(40);
        if (existsSync(walletConfig)) {
          const wallet = JSON.parse(readFileSync(walletConfig, "utf-8"));
          walletAddress = wallet.agentic?.address || walletAddress;
        }
        const identity = await registerIdentity(
          args.agentType,
          args.capabilities || ["coding"],
          walletAddress,
          "sepolia"
        );
        return {
          content: [{ type: "text", text: `Registered ${args.agentType} at ${identity.address}` }],
          details: identity,
        };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], details: { error: e.message } };
      }
    },
  });

  pi.registerTool({
    // @ts-ignore
    name: "erc8004_attest",
    // @ts-ignore
    label: "/erc8004_attest",
    description: "Submit reputation attestation",
    // @ts-ignore
    parameters: Type.Object({
      worker: Type.String(),
      score: Type.Number(),
      taskId: Type.Optional(Type.String()),
    }),
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
    name: "erc8004_discover",
    // @ts-ignore
    label: "/erc8004_discover",
    description: "Discover agents",
    // @ts-ignore
    parameters: Type.Object({ capability: Type.String() }),
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
    name: "erc8004_reputation",
    // @ts-ignore
    label: "/erc8004_reputation",
    description: "Check reputation",
    // @ts-ignore
    parameters: Type.Object({ worker: Type.Optional(Type.String()) }),
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

  console.log("[ERC-8004] Loaded with real contracts");
  console.log("[ERC-8004] Base Mainnet:");
  console.log(`[ERC-8004]   Identity: ${ERC8004_CONTRACTS.base.IdentityRegistry.slice(0, 15)}...`);
  console.log("[ERC-8004] Commands: /erc8004 [register|status|attest|discover|reputation]");
  console.log("[ERC-8004] Phase 1: Local storage | Phase 2: On-chain (requires funding)");
}
