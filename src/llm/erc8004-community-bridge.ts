/**
 * ERC-8004 Community Bridge - Privacy-Preserving Edition
 * 
 * Integrates ERC-8004 identity and reputation with community analytics
 * while PRESERVING NOSTR PRIVACY.
 * 
 * Design Principles:
 * 1. Nostr pubkey stays ANONYMOUS - never published with address
 * 2. Contributors optionally claim trust tier in Nostr event tags
 * 3. Trust verification is server-side only
 * 4. Fraudulent claims are detected and flagged
 * 
 * Privacy vs Trust Balance:
 * - Public: Nostr pubkey, claimed trust tier
 * - Private: Ethereum address, actual ERC-8004 reputation
 * - Verification: Server-side, when fetching events
 */

import { homedir } from 'os';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';

// ============================================================================
// Types
// ============================================================================

/** Trust levels matching ERC-8004 tiers */
export type TrustLevel = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';

/** Public trust claim (what goes in Nostr event) */
export interface TrustClaim {
  level: TrustLevel;
  verified: boolean;
  timestamp: number;
}

/** Internal tracking (never published) */
export interface ContributorTrust {
  nostrPubkey: string;
  /** Local-only: Ethereum address (never published) */
  ethAddress?: string;
  /** Actual ERC-8004 reputation score (0-100) */
  erc8004Score: number;
  /** Claimed trust level from Nostr event */
  claimedLevel: TrustLevel;
  /** Whether the claim was verified against on-chain data */
  verified: boolean;
  /** Community weight based on verified trust */
  weight: number;
  /** Submission history for community scoring */
  submissions: {
    timestamp: number;
    valid: boolean;
    modelCount: number;
  }[];
}

/** Result of verifying a trust claim */
export interface ClaimVerification {
  valid: boolean;
  reason?: string;
  actualLevel: TrustLevel;
  claimedLevel: TrustLevel;
  penalty: number; // 0-1, higher = more suspicious
}

// ============================================================================
// Constants
// ============================================================================

const TRUST_DB_PATH = join(homedir(), '.0xkobold', 'community-trust.json');

const TRUST_THRESHOLDS = {
  BRONZE_MIN: 1,
  SILVER_MIN: 40,
  GOLD_MIN: 70,
  PLATINUM_MIN: 90,
  // Maximum weight per contributor
  MAX_WEIGHT: 0.35,
  // Maximum penalty for claim mismatch
  MAX_CLAIM_PENALTY: 0.5,
};

// ============================================================================
// ERC-8004 Contract Configuration
// ============================================================================

const ERC8004_CONTRACTS = {
  sepolia: {
    ReputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
    rpc: "https://sepolia.base.org",
  },
  base: {
    ReputationRegistry: "0x8004BAa17C55a88189AE136b182e5fdA19dE9b63",
    rpc: "https://mainnet.base.org",
  },
};

// ============================================================================
// Trust Level Utilities
// ============================================================================

export function scoreToLevel(score: number): TrustLevel {
  if (score >= TRUST_THRESHOLDS.PLATINUM_MIN) return 'platinum';
  if (score >= TRUST_THRESHOLDS.GOLD_MIN) return 'gold';
  if (score >= TRUST_THRESHOLDS.SILVER_MIN) return 'silver';
  if (score >= TRUST_THRESHOLDS.BRONZE_MIN) return 'bronze';
  return 'none';
}

export function levelToScore(level: TrustLevel): number {
  switch (level) {
    case 'platinum': return 90;
    case 'gold': return 70;
    case 'silver': return 40;
    case 'bronze': return 20;
    case 'none': return 0;
  }
}

export function levelWeight(level: TrustLevel): number {
  switch (level) {
    case 'platinum': return 0.35;
    case 'gold': return 0.25;
    case 'silver': return 0.15;
    case 'bronze': return 0.08;
    case 'none': return 0.03;
  }
}

// ============================================================================
// ERC-8004 Bridge
// ============================================================================

class ERC8004Bridge {
  /** Internal trust database (nostrPubkey -> ContributorTrust) */
  private trustDb: Map<string, ContributorTrust>;
  private rpcUrl: string;
  private chain: 'base' | 'sepolia';

  constructor(chain: 'base' | 'sepolia' = 'sepolia') {
    this.chain = chain;
    this.rpcUrl = ERC8004_CONTRACTS[chain].rpc;
    this.trustDb = this.loadTrustDb();
  }

  // ============================================================================
  // Storage
  // ============================================================================

  private loadTrustDb(): Map<string, ContributorTrust> {
    const db = new Map<string, ContributorTrust>();
    
    if (existsSync(TRUST_DB_PATH)) {
      try {
        const data = JSON.parse(readFileSync(TRUST_DB_PATH, 'utf-8'));
        for (const [pubkey, trust] of Object.entries(data)) {
          db.set(pubkey, trust as ContributorTrust);
        }
      } catch (e) {
        console.error('[ERC8004-Bridge] Failed to load trust DB:', e);
      }
    }
    
    return db;
  }

  private saveTrustDb(): void {
    const data: Record<string, ContributorTrust> = {};
    for (const [pubkey, trust] of this.trustDb) {
      data[pubkey] = trust;
    }
    writeFileSync(TRUST_DB_PATH, JSON.stringify(data, null, 2));
  }

  // ============================================================================
  // Privacy-Preserving Trust Claim Generation
  // ============================================================================

  /**
   * Generate trust claim tags for a Nostr event
   * 
   * This is what gets PUBLISHED to Nostr:
   * - Trust level (e.g., "gold")
   * - Verification flag
   * - NONCE for replay protection
   * 
   * What is NOT published:
   * - Ethereum address
   * - Actual ERC-8004 score
   * - Proof of ownership
   */
  generateTrustTags(): string[][] {
    const myTrust = this.getMyTrust();
    const level = scoreToLevel(myTrust?.erc8004Score || 0);
    const verified = (myTrust?.erc8004Score || 0) > 0;
    const nonce = this.generateNonce();
    
    return [
      ['trust', level],
      ['verified', verified ? '1' : '0'],
      ['nonce', nonce],
    ];
  }

  /**
   * Get my current trust status (local only)
   */
  getMyTrust(): ContributorTrust | null {
    // Try to find my identity by checking local pi-erc8004
    const identity = this.getLocalIdentity();
    
    if (!identity) {
      return null;
    }

    // Check if we have trust data for this address
    const ethAddress = identity.address?.toLowerCase();
    if (!ethAddress) return null;

    // Search by eth address in trust db
    for (const trust of this.trustDb.values()) {
      if (trust.ethAddress?.toLowerCase() === ethAddress) {
        return trust;
      }
    }

    // Create new trust record
    const newTrust: ContributorTrust = {
      nostrPubkey: '', // Will be set when linked
      ethAddress,
      erc8004Score: 0,
      claimedLevel: 'none',
      verified: false,
      weight: 0.03,
      submissions: [],
    };

    // Try to fetch actual score
    this.syncErc8004Score(ethAddress).then(score => {
      if (score > 0) {
        newTrust.erc8004Score = score;
        newTrust.verified = true;
        newTrust.weight = levelWeight(scoreToLevel(score));
      }
    });

    return newTrust;
  }

  // ============================================================================
  // Claim Verification (Server-Side)
  // ============================================================================

  /**
   * Verify a trust claim from a Nostr event
   * 
   * This is called when PROCESSING events from other contributors.
   * The verification is done SERVER-SIDE - only we see the result.
   */
  async verifyClaim(
    nostrPubkey: string,
    claimedLevel: TrustLevel,
    isVerified: boolean
  ): Promise<ClaimVerification> {
    // Get or create trust record
    let trust = this.trustDb.get(nostrPubkey);
    
    if (!trust) {
      trust = {
        nostrPubkey,
        erc8004Score: 0,
        claimedLevel,
        verified: false,
        weight: levelWeight(claimedLevel),
        submissions: [],
      };
      this.trustDb.set(nostrPubkey, trust);
    }

    // If they claimed verified but we haven't verified yet, try now
    if (isVerified && !trust.verified && trust.ethAddress) {
      const score = await this.syncErc8004Score(trust.ethAddress);
      if (score > 0) {
        trust.erc8004Score = score;
        trust.verified = true;
      }
    }

    // Determine actual level from ERC-8004
    const actualLevel = scoreToLevel(trust.erc8004Score);

    // Check if claim is valid
    let valid = true;
    let reason: string | undefined;
    let penalty = 0;

    // Claim mismatch penalty
    if (actualLevel !== claimedLevel) {
      // Claiming higher than actual = fraud
      const claimedScore = levelToScore(claimedLevel);
      const actualScore = trust.erc8004Score;
      
      if (claimedScore > actualScore + 20) {
        // Major fraud: claiming platinum but barely registered
        valid = false;
        reason = `Fraudulent claim: ${claimedLevel} but score is ${actualScore}`;
        penalty = TRUST_THRESHOLDS.MAX_CLAIM_PENALTY;
      } else {
        // Minor mismatch
        reason = `Claim mismatch: claimed ${claimedLevel}, actual ${actualLevel}`;
        penalty = (claimedScore - actualScore) / 100;
      }
    }

    // Recalculate weight based on verification
    if (valid && trust.verified) {
      trust.weight = levelWeight(actualLevel);
    } else if (valid) {
      // Unverified but reasonable claim
      trust.weight = levelWeight(claimedLevel) * 0.5;
    } else {
      // Fraudulent claim - minimal weight
      trust.weight = 0.01;
    }

    // Record the verification
    trust.claimedLevel = claimedLevel;
    trust.verified = valid && trust.verified;
    this.saveTrustDb();

    return {
      valid,
      reason,
      actualLevel,
      claimedLevel,
      penalty,
    };
  }

  /**
   * Get trust info for a contributor (local cache)
   */
  getTrustInfo(nostrPubkey: string): ContributorTrust | null {
    return this.trustDb.get(nostrPubkey) || null;
  }

  /**
   * Check if contributor meets minimum trust requirement
   */
  meetsTrustRequirement(nostrPubkey: string, minLevel: TrustLevel): boolean {
    const trust = this.trustDb.get(nostrPubkey);
    
    if (!trust) return false;
    
    const trustLevel = scoreToLevel(trust.erc8004Score);
    const levels: TrustLevel[] = ['none', 'bronze', 'silver', 'gold', 'platinum'];
    const trustIndex = levels.indexOf(trustLevel);
    const minIndex = levels.indexOf(minLevel);
    
    return trustIndex >= minIndex;
  }

  /**
   * Record a submission for a contributor
   */
  recordSubmission(nostrPubkey: string, valid: boolean, modelCount: number): void {
    let trust = this.trustDb.get(nostrPubkey);
    
    if (!trust) {
      trust = {
        nostrPubkey,
        erc8004Score: 0,
        claimedLevel: 'none',
        verified: false,
        weight: 0.03,
        submissions: [],
      };
      this.trustDb.set(nostrPubkey, trust);
    }

    trust.submissions.push({
      timestamp: Date.now(),
      valid,
      modelCount,
    });

    // Keep only last 100 submissions
    if (trust.submissions.length > 100) {
      trust.submissions = trust.submissions.slice(-100);
    }

    // Update weight based on community reputation
    const recentValid = trust.submissions
      .filter(s => Date.now() - s.timestamp < 7 * 24 * 60 * 60 * 1000)
      .filter(s => s.valid).length;
    
    const recentTotal = trust.submissions
      .filter(s => Date.now() - s.timestamp < 7 * 24 * 60 * 60 * 1000).length;

    if (recentTotal > 0) {
      const ratio = recentValid / recentTotal;
      trust.weight = trust.weight * 0.7 + ratio * levelWeight(scoreToLevel(trust.erc8004Score)) * 0.3;
    }

    this.trustDb.set(nostrPubkey, trust);
    this.saveTrustDb();
  }

  /**
   * Get trust weight for a contributor
   */
  getTrustWeight(nostrPubkey: string): number {
    const trust = this.trustDb.get(nostrPubkey);
    return trust?.weight || 0.03;
  }

  /**
   * Get all contributors with their trust levels (for stats)
   */
  getTrustStats(): { total: number; byLevel: Record<TrustLevel, number>; avgWeight: number } {
    const byLevel: Record<TrustLevel, number> = {
      none: 0,
      bronze: 0,
      silver: 0,
      gold: 0,
      platinum: 0,
    };

    let totalWeight = 0;

    for (const trust of this.trustDb.values()) {
      const level = scoreToLevel(trust.erc8004Score);
      byLevel[level]++;
      totalWeight += trust.weight;
    }

    return {
      total: this.trustDb.size,
      byLevel,
      avgWeight: this.trustDb.size > 0 ? totalWeight / this.trustDb.size : 0,
    };
  }

  // ============================================================================
  // ERC-8004 On-Chain Queries
  // ============================================================================

  /**
   * Sync ERC-8004 score from on-chain contract
   */
  private async syncErc8004Score(ethAddress: string): Promise<number> {
    try {
      const score = await this.queryOnChainReputation(ethAddress);
      return score;
    } catch (e) {
      console.error('[ERC8004-Bridge] Failed to sync score:', e);
      return 0;
    }
  }

  /**
   * Query reputation from Base Sepolia ERC-8004 ReputationRegistry
   */
  private async queryOnChainReputation(ethAddress: string): Promise<number> {
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [{
            to: ERC8004_CONTRACTS[this.chain].ReputationRegistry,
            data: '0x8b5c1d77' + // getReputation selector
                  ethAddress.slice(2).toLowerCase().padStart(64, '0'),
          }, 'latest'],
          id: 1,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        return 0;
      }

      const json = await response.json() as { result?: string };
      if (!json.result || json.result === '0x') {
        return 0;
      }

      // Decode: bytes32 totalScore, uint256 attestationCount
      const data = json.result.slice(2);
      const totalScore = parseInt(data.slice(0, 64), 16);
      const attestationCount = parseInt(data.slice(64, 128), 16);

      return attestationCount > 0 ? Math.round(totalScore / attestationCount) : 0;
    } catch {
      return 0;
    }
  }

  // ============================================================================
  // Local Storage Queries
  // ============================================================================

  /**
   * Get local pi-erc8004 identity
   */
  private getLocalIdentity(): { address?: string; capabilities?: string[] } | null {
    try {
      const erc8004Dir = join(homedir(), '.0xkobold', 'erc8004');
      const agentConfig = join(erc8004Dir, 'agent.json');
      
      if (!existsSync(agentConfig)) {
        return null;
      }
      
      return JSON.parse(readFileSync(agentConfig, 'utf-8'));
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private generateNonce(): string {
    return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  }

  /**
   * Link Nostr pubkey to Ethereum address (local only)
   * 
   * This is stored LOCALLY and never published.
   * Used to associate your Nostr contributions with your ERC-8004 identity.
   */
  async linkIdentity(nostrPubkey: string, ethAddress: string, signature: string): Promise<boolean> {
    // Validate inputs
    if (!nostrPubkey.match(/^[a-f0-9]{64}$/i)) {
      console.error('[ERC8004-Bridge] Invalid Nostr pubkey');
      return false;
    }

    if (!ethAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
      console.error('[ERC8004-Bridge] Invalid Ethereum address');
      return false;
    }

    // Create or update trust record
    let trust = this.trustDb.get(nostrPubkey) || {
      nostrPubkey,
      ethAddress: ethAddress.toLowerCase(),
      erc8004Score: 0,
      claimedLevel: 'none',
      verified: false,
      weight: 0.03,
      submissions: [],
    };

    trust.ethAddress = ethAddress.toLowerCase();

    // Sync ERC-8004 score
    const score = await this.syncErc8004Score(ethAddress);
    trust.erc8004Score = score;
    trust.verified = score > 0;
    trust.weight = levelWeight(scoreToLevel(score));

    this.trustDb.set(nostrPubkey, trust);
    this.saveTrustDb();

    console.log(`[ERC8004-Bridge] Linked ${nostrPubkey.slice(0, 8)}... → ${ethAddress.slice(0, 6)}... (score: ${score})`);

    return true;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let bridge: ERC8004Bridge | null = null;

export function getERC8004Bridge(chain: 'base' | 'sepolia' = 'sepolia'): ERC8004Bridge {
  if (!bridge) {
    bridge = new ERC8004Bridge(chain);
  }
  return bridge;
}

export { ERC8004Bridge };
