# Wallet Integration Research: Ethers.js v6 + CDP Agentic Wallet

**Date:** 2026-03-12  
**Purpose:** Enable 0xKobold to create and manage Ethereum wallets for ERC-8004/x402 protocols  
**Target Network:** Base (Coinbase's L2)  
**Docs Analyzed:**
- https://docs.ethers.org/v6/getting-started/
- https://docs.cdp.coinbase.com/agentic-wallet/welcome

---

## Executive Summary

For 0xKobold to participate in the **open agent economy** (ERC-8004 + x402), agents need wallets. We have **two complementary approaches**:

1. **Ethers.js v6** - Traditional wallet creation (self-custody)
2. **Coinbase CDP Agentic Wallet** - Purpose-built for AI agents

**Recommendation:** Support both—Ethers.js for power users, Agentic Wallet for quick setup.

---

## Approach 1: Ethers.js v6 (Self-Custody)

### Overview

**Ethers.js v6** is the standard Ethereum library for TypeScript/JavaScript.

**Key Features:**
- Create wallets programmatically
- Sign transactions
- Interact with contracts
- Query blockchain state
- Support for Base L2

### Core Concepts (from docs)

**1. Provider** - Read-only blockchain connection
```typescript
// Connect to Base (Coinbase L2)
const provider = new ethers.JsonRpcProvider(
  "https://mainnet.base.org"
);

// Or testnet
const baseSepolia = new ethers.JsonRpcProvider(
  "https://sepolia.base.org"
);
```

**2. Signer/Wallet** - Account with private key
```typescript
// Create random wallet
const wallet = ethers.Wallet.createRandom();
// → { address: "0x...", privateKey: "0x..." }

// Restore from private key
const wallet = new ethers.Wallet(privateKey, provider);

// Restore from mnemonic
const wallet = ethers.Wallet.fromPhrase(mnemonic);
```

**3. Contract Interaction**
```typescript
// ERC-8004 Registry (hypothetical)
const registry = new ethers.Contract(
  CONTRACT_ADDRESS,
  ERC8004_ABI,
  wallet  // Connected signer
);

// Register agent
await registry.registerAgent(
  agentId,
  metadataURI,
  publicKey,
  capabilities
);
```

**4. Transactions**
```typescript
// Send ETH/USDC
const tx = await wallet.sendTransaction({
  to: recipientAddress,
  value: ethers.parseEther("0.01")
});

// Wait for confirmation
const receipt = await tx.wait();
```

### Security Model

| Aspect | Implementation |
|--------|----------------|
| **Private Key Storage** | Encrypted in ~/.0xkobold/wallets/ |
| **Encryption** | User password + scrypt/kdf |
| **Backup** | Exportable mnemonic |
| **Scope** | Per-agent or global |

### Base L2 Configuration

```typescript
// Base mainnet
const BASE_MAINNET = {
  name: "base",
  chainId: 8453,
  rpc: "https://mainnet.base.org",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18
  }
};

// Base Sepolia (testnet)
const BASE_SEPOLIA = {
  name: "base-sepolia",
  chainId: 84532,
  rpc: "https://sepolia.base.org",
  faucet: "https://www.coinbase.com/faucets"
};

const provider = new ethers.JsonRpcProvider(BASE_SEPOLIA.rpc);
```

---

## Approach 2: Coinbase CDP Agentic Wallet

### Overview

**Purpose-built for AI agents** by Coinbase. This is exactly what we need.

**Key Features:**
- Email-based authentication (no private key management)
- Self-custody (keys in Coinbase infrastructure)
- Built-in spending limits
- Gasless transactions on Base
- x402 protocol native integration
- Skills-based architecture

### How It Works

**1. Authentication Flow (OTP-based)**

```bash
# Login sends OTP to email
npx awal auth login agent@mycompany.com
# → Flow ID: abc123...

# Verify with code from email
npx awal auth verify abc123 123456
# → Authenticated!
```

**2. Wallet Commands**

```bash
# Check status
npx awal status

# Get address
npx awal address
# → 0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E

# Check USDC balance
npx awal balance --chain base

# Send USDC
npx awal send 1.5 vitalik.eth --chain base

# Trade tokens (gasless on Base)
npx awal trade 10 usdc eth

# x402 paid API
npx awal x402 pay https://api.example.com/data
```

**3. Skills Integration**

Coinbase provides pre-built skills for agents:

```bash
# Install skills
npx skills add coinbase/agentic-wallet-skills
```

**Available Skills:**
- `authenticate` - Login via OTP
- `fund` - Get USDC from faucet (testnet)
- `send` - Send payments
- `trade` - Token swaps
- `search-for-service` - Find paid APIs
- `pay-for-service` - x402 payments
- `monetize-service` - Offer paid APIs

**4. Policy Engine**

Set spending limits and guardrails:

```typescript
// Configuration
{
  "maxTransactionAmount": "100 USDC",
  "maxDailySpend": "500 USDC",
  "allowedRecipients": ["trusted-contracts"],
  "requireApprovalAbove": "50 USDC"
}
```

### Security Model

| Feature | Implementation |
|---------|----------------|
| **Key Storage** | Coinbase infrastructure (not exposed) |
| **Authentication** | Email OTP (2FA available) |
| **Spending Limits** | Enforced before every transaction |
| **KYT Screening** | Block high-risk interactions |
| **OFAC Compliance** | Auto-block sanctioned addresses |
| **Gasless** | Coinbase pays gas on Base |

---

## Comparison: Ethers.js vs Agentic Wallet

| Feature | Ethers.js v6 | CDP Agentic Wallet |
|---------|--------------|-------------------|
| **Setup** | Manual (create wallet, fund) | 2 minutes (email OTP) |
| **Key Management** | Self-managed (your responsibility) | Coinbase manages |
| **Security** | Your encryption | Enterprise-grade |
| **Gas** | You pay | Gasless on Base |
| **x402** | Manual integration | Native support |
| **ERC-8004** | Full smart contract access | Via tools |
| **Spending Limits** | Manual implementation | Built-in |
| **Compliance** | Your responsibility | OFAC screening |
| **Flexibility** | Maximum | Opinionated |
| **Best For** | Power users, custom needs | Quick start, safety |

**Verdict:**
- **Default:** Agentic Wallet (speed, safety, x402 native)
- **Advanced:** Ethers.js (full control, custom contracts)

---

## Integration Architecture

### Proposed Extension: `wallet-extension.ts`

```
src/extensions/core/wallet-extension.ts
├── providers/
│   ├── ethers-provider.ts       # Ethers.js wrapper
│   └── agentic-provider.ts      # CDP Agentic wrapper
├── commands/
│   ├── /wallet_create           # Create new wallet
│   ├── /wallet_balance          # Check balance
│   ├── /wallet_send             # Send payment
│   ├── /wallet_trade            # Swap tokens
│   └── /wallet_auth             # Authenticate agentic
├── skills/
│   ├── wallet-skill.ts          # Agent wallet operations
│   ├── x402-skill.ts            # x402 protocol
│   └── erc8004-skill.ts         # ERC-8004 identity
└── security/
    ├── encryption.ts            # Key encryption
    └── policy-engine.ts         # Spending limits
```

### CLI Commands

```bash
# Create wallet
/wallet create --provider agentic --email agent@company.com
/wallet create --provider ethers --network base

# Authenticate (agentic)
/wallet auth --code 123456

# Balance
/wallet balance --token USDC

# Send payment
/wallet send 10 USDC to 0x... --memo "API payment"

# Trade
/wallet trade 5 USDC → ETH

# x402 paid API
/wallet x402 pay https://api.service.com/data

# ERC-8004
/wallet erc8004 register "specialist"
/wallet erc8004 attest --worker 0x... --rating 95
```

### Tool Integration

```typescript
// Tools registered with 0xKobold
{
  name: "wallet_send_payment",
  parameters: {
    amount: string,
    token: "USDC" | "ETH",
    recipient: string,
    memo?: string
  }
}

{
  name: "wallet_x402_pay",
  parameters: {
    url: string,
    maxAmount?: string
  }
}

{
  name: "wallet_erc8004_register",
  parameters: {
    agentType: string,
    capabilities: string[]
  }
}

{
  name: "wallet_erc8004_attest",
  parameters: {
    workerId: string,
    rating: number,
    taskId: string
  }
}
```

---

## User Flow: First-Time Wallet Setup

### Path A: Agentic Wallet (Recommended for most users)

```
1. User: "/wallet create"
   ↳ System: "Choose provider: [agentic] [ethers]"
   
2. User selects "agentic"
   ↳ System: "Enter email for wallet:"
   
3. User enters email
   ↳ System sends OTP to email
   ↳ "Check your email for 6-digit code"
   
4. User enters code
   ↳ System: "✓ Wallet created! Address: 0x..."
   
5. User: "/wallet fund"
   ↳ System: Get testnet USDC from faucet
   
6. User: "/wallet x402 pay https://api.example.com"
   ↳ Agent makes payment via x402
```

### Path B: Ethers.js Wallet (Power users)

```
1. User: "/wallet create --provider ethers"
   ↳ System: "Creating wallet on Base..."
   
2. System generates wallet
   ↳ Shows mnemonic (sensitive!)
   ↳ "Write down this backup phrase:"
   
3. User confirms backup
   ↳ System: "✓ Wallet created! Address: 0x..."
   
4. User funds via exchange/DEX
   
5. User has full control
   ↳ Can interact with any smart contract
   ↳ Manual private key management
```

---

## Security Considerations

### For Agentic Wallet
- ✅ Keys never leave Coinbase infrastructure
- ✅ Built-in spending limits
- ✅ Email OTP = 2FA
- ✅ OFAC compliance automatic
- ⚠️ Depends on Coinbase service availability
- ⚠️ Email compromise risk

### For Ethers.js Wallet
- ✅ Full self-custody
- ✅ Works offline
- ✅ No third-party dependency
- ⚠️ Key management responsibility on user
- ⚠️ No built-in limits (implement ourselves)
- ⚠️ User must fund gas

### Hybrid Approach (Recommended)

```typescript
// Default: Agentic Wallet for operations
// Backup: Ethers.js for recovery/emergency

const config = {
  primary: "agentic",      // Day-to-day use
  backup: "ethers",          // Emergency access
  limits: {
    maxTransaction: "100 USDC",
    requireBackupAbove: "500 USDC"
  }
};
```

---

## Implementation Roadmap

### Phase 1: Agentic Wallet Integration (Week 1-2)
- [ ] Install `awal` CLI wrapper
- [ ] OTP authentication flow
- [ ] `/wallet create --provider agentic`
- [ ] `/wallet balance` and `/wallet send`
- [ ] x402 payment tool

### Phase 2: Ethers.js Basic (Week 3-4)
- [ ] Wallet creation
- [ ] Encrypted key storage
- [ ] Balance checking
- [ ] Transaction sending
- [ ] Export/backup mnemonic

### Phase 3: ERC-8004 Integration (Week 5-6)
- [ ] Agent registration
- [ ] Capability publishing
- [ ] Reputation attestation
- [ ] Cross-platform discovery

### Phase 4: Advanced Features (Week 7-8)
- [ ] Policy engine (spending limits)
- [ ] Trading (token swaps)
- [ ] Multi-wallet support
- [ ] Hardware wallet integration

---

## Dependencies

```json
{
  "dependencies": {
    "ethers": "^6.0.0",
    "@coinbase/cdp-agentic-wallet": "latest"
  }
}
```

**Installation:**
```bash
bun install ethers @coinbase/agentic-wallet-skills
npm install -g @coinbase/awal  # CLI tool
```

---

## References

### Ethers.js v6
- Docs: https://docs.ethers.org/v6/
- GitHub: https://github.com/ethers-io/ethers.js
- Base L2: https://docs.base.org/

### Coinbase CDP Agentic Wallet
- Docs: https://docs.cdp.coinbase.com/agentic-wallet
- Quickstart: https://docs.cdp.coinbase.com/agentic-wallet/quickstart
- x402: https://x402.org
- CDP Portal: https://portal.cdp.coinbase.com

### ERC-8004
- Research: [[ERC-8004-Protocol-Research]]
- Integration Plan: [[ERC-8004-Integration-Plan]]

---

**Tags:** #wallet #ethereum #base #coinbase #ethersjs #cdp #agentic-wallet #x402 #erc-8004 #integration

**Status:** Research Complete → Design Phase

**Next Steps:**
1. Create wallet-extension.ts
2. Implement Agentic Wallet provider first
3. Add CLI commands
4. Integration test on Base Sepolia
