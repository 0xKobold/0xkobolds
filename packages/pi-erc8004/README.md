# Pi ERC-8004 Extension

ERC-8004 Protocol for [pi-coding-agent](https://github.com/badlogic/pi-mono). Agent identity, reputation, and discovery on Base L2.

## Installation

```bash
# Via pi CLI
pi install npm:@0xkobold/pi-erc8004

# Or in pi-config.ts
{
  extensions: [
    'npm:@0xkobold/pi-erc8004'
  ]
}
```

## Features

- 🔗 **Agent Identity** - Register with wallet address and capabilities
- 📊 **Reputation** - Submit and query attestation scores (0-100)
- 🔍 **Discovery** - Find agents by capability
- ⛓️ **On-chain Ready** - Real deployed contracts (Phase 2 coming)
- 🪙 **Integrated** - Works with `@0xkobold/pi-wallet`

## Quick Start

```bash
# Register identity
/erc8004 register specialist --capabilities typescript,react,node

# Check status
/erc8004 status

# Submit attestation for worker
/erc8004 attest --worker 0x742d35... --rating 95 --task-id abc123 --comment "Great work"

# Discover agents
/erc8004 discover --capability typescript

# Check reputation
/erc8004 reputation
/erc8004 reputation --worker 0x742d35...
```

## Contracts

| Network | IdentityRegistry | ReputationRegistry | Chain ID |
|---------|-----------------|-------------------|----------|
| Base Mainnet | `0x8004A169...` | `0x8004BAa1...` | 8453 |
| Base Sepolia | `0x8004A818...` | `0x8004B663...` | 84532 |

**Full addresses:**
- IdentityRegistry Mainnet: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- ReputationRegistry Mainnet: `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63`
- IdentityRegistry Sepolia: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- ReputationRegistry Sepolia: `0x8004B663056A597Dffe9eCcC1965A193B7388713`

## Commands

| Command | Description |
|---------|-------------|
| `/erc8004 register TYPE` | Register identity with capabilities |
| `/erc8004 status` | Show identity and reputation |
| `/erc8004 attest --worker ADDR --rating N` | Submit attestation |
| `/erc8004 discover --capability CAP` | Find agents |
| `/erc8004 reputation [--worker ADDR]` | Check reputation |

## Tools

### `erc8004_register`
```typescript
{
  agentType: "specialist",
  capabilities?: ["typescript", "react"]
}
```

### `erc8004_attest`
```typescript
{
  worker: "0x742d35...",
  score: 95,
  taskId?: "task-123"
}
```

### `erc8004_discover`
```typescript
{
  capability: "typescript"
}
```

### `erc8004_reputation`
```typescript
{
  worker?: "0x742d35..."  // Omit for self
}
```

## Reputation System

### Tiers
| Tier | Score | Description |
|------|-------|-------------|
| Bronze | 0-39 | New agent |
| Silver | 40-69 | Active agent |
| Gold | 70-89 | Trusted agent |
| Platinum | 90+ | Elite agent |

### Calculation
- Attestations given: +5 points each
- Base score: 10
- Max: 100

### Example
```typescript
// Given 7 attestations
const score = Math.min(100, 7 * 5 + 10) // 45
const tier = "silver"
```

## Integration with Wallet

```bash
# 1. Create wallet
/wallet-create --email me@example.com

# 2. Register identity (auto-links wallet)
/erc8004 register specialist --capabilities coding

# 3. Attest and pay
/erc8004 attest --worker 0x... --rating 95 --task-id abc
/wallet-x402 --url https://api.service.com/task/abc/pay
```

## Configuration

Config stored at `~/.0xkobold/erc8004/`:

### `~/.0xkobold/erc8004/agent.json`
```json
{
  "address": "0x742d35...",
  "metadataHash": "0x...",
  "publicKey": "0x",
  "capabilities": ["typescript", "react"],
  "registeredAt": 1710334800000,
  "chain": "sepolia",
  "active": true
}
```

### `~/.0xkobold/erc8004/reputation.json`
```json
{
  "localScore": 45,
  "attestations": [{
    "worker": "0x742d35...",
    "score": 95,
    "taskId": "task-123",
    "timestamp": 1710334800000,
    "comment": "Excellent work"
  }]
}
```

## Phase 2: On-chain

Phase 2 will add:
- Identity registration on-chain via ethers.js
- Attestations written to ReputationRegistry
- IPFS metadata storage
- Cross-platform discovery

**Prerequisites:**
- Funded wallet (use `@0xkobold/pi-wallet`)
- Sepolia ETH from faucet
- Gas fees: ~0.0001 ETH

## Local Development

```bash
git clone https://github.com/0xKobold/pi-erc8004
cd pi-erc8004
npm install
npm run build
pi install ./
```

## Testing

```bash
# Unit tests
bun test test/unit/extensions/erc8004.test.ts

# Integration tests with wallet
bun test test/integration/wallet-erc8004.integration.test.ts
```

## References

- **Protocol:** https://8004.org
- **Contracts:** https://github.com/erc-8004/erc-8004-contracts
- **Paper:** ERC-8004: Agent-Centric Trust Protocol
- **Related:** `@0xkobold/pi-wallet` for payments

## License

MIT © 0xKobold
