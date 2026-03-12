# Pi Wallet Extension - Multi-Type Support

## Overview

The wallet extension now supports **4 wallet types** for maximum flexibility:

| Type | Use Case | Private Keys | Send TX? |
|------|----------|--------------|----------|
| **agentic** | Create new CDP wallet | 🔐 CDP holds keys | ✅ Yes |
| **readonly** | Import existing address | 🔒 None stored | ❌ No |
| **ethers** | Self-custody (Phase 2) | 🔐 Encrypted locally | ⏳ Phase 2 |
| **hardware** | MetaMask/Ledger (Phase 2) | 🔐 On device | ⏳ Phase 2 |

---

## Quick Start

### Option 1: Environment Variables (Easiest)

```bash
# Add to ~/.bashrc or ~/.zshrc
export PI_WALLET_ADDRESS="0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E"
export PI_WALLET_TYPE="readonly"
export PI_WALLET_CHAIN="base"
```

Then in pi:
```
/wallet-status
# Shows your existing wallet info
```

### Option 2: Import Command

```bash
# Import read-only (monitoring only)
/wallet-import --address 0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E --type readonly --label "My Wallet"

# Check status
/wallet-status
# Output:
# 💰 Wallet Status
# Type: readonly
# Label: My Wallet
# Address: 0x742d...6C7E
# Mode: Read-only monitoring
# 💡 Check balance: https://basescan.org/address/0x742d...
```

### Option 3: Create New (CDP Agentic)

```
/wallet-create --email me@example.com
# Creates brand new wallet via CDP
```

---

## Wallet Types Explained

### 🔒 Read-Only (Recommended for Existing Wallets)

**Best for:** Users who already have a wallet (MetaMask, Ledger, etc.)

**How it works:**
- Store just the address (no private keys)
- Extension shows balance links to explorer
- Cannot send transactions (by design)
- Use your regular wallet app to send

**Security:** ✅ Maximum - no keys stored anywhere

```bash
/wallet-import --address 0x... --type readonly
# or
export PI_WALLET_ADDRESS=0x...
```

### 🪙 CDP Agentic (Recommended for New Users)

**Best for:** Users who want zero setup

**How it works:**
- Coinbase holds the keys (custodial)
- Email-based auth
- Extension can send via `npx awal`
- x402 payments work automatically

**Security:** 🔐 Coinbase custody

```
/wallet-create --email me@example.com
```

### 🔐 Ethers.js (Phase 2)

**Best for:** Power users who want self-custody

**How it works:**
- Store encrypted private key locally
- Use ethers.js v6 for transactions
- Full control of keys
- Coming in Phase 2

**Security:** 🔐 Encrypted local storage

```
/wallet-import --address 0x... --type ethers
# Will prompt for encrypted key import
```

### 💳 Hardware Wallet (Phase 2)

**Best for:** Maximum security with existing hardware

**How it works:**
- Connect to MetaMask/Ledger/Trezor
- Extension prompts user to confirm
- Keys never leave device
- Coming in Phase 2

**Security:** 🔐 Keys stay on hardware device

```
/wallet-import --address 0x... --type hardware --provider metamask
```

---

## Commands

| Command | Description |
|---------|-------------|
| `/wallet-create --email E` | Create new CDP wallet |
| `/wallet-import --address A --type T` | Import existing wallet |
| `/wallet-status` | Show wallet info |
| `/wallet-send --to A --amount N` | Send crypto (agentic only) |

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `PI_WALLET_ADDRESS` | Existing wallet address | `0x742d35...` |
| `PI_WALLET_TYPE` | Wallet type | `readonly`, `agentic` |
| `PI_WALLET_CHAIN` | Default chain | `base`, `sepolia` |
| `PI_WALLET_DIR` | Custom storage | `/path/to/wallets` |

---

## Security Comparison

| Feature | Read-Only | CDP | Ethers.js | Hardware |
|---------|-----------|-----|-----------|----------|
| Keys Stored | ❌ None | 🔐 Coinbase | 🔐 Encrypted local | 🔐 Device only |
| Can Send | ❌ No | ✅ Yes | ⏳ Phase 2 | ⏳ Phase 2 |
| x402 Payments | ❌ No | ✅ Yes | ⏳ Phase 2 | ⏳ Phase 2 |
| Setup Time | ⚡ Instant | ⚡ 1 min | ⏳ Phase 2 | ⏳ Phase 2 |
| Best For | Monitoring | Quick start | Power users | Security |

---

## Recommended Setup

### For Users With Existing Wallet (MetaMask, Ledger, etc.)

```bash
# Add to shell config
export PI_WALLET_ADDRESS="your-address-here"
export PI_WALLET_TYPE="readonly"
```

Benefits:
- ✅ No key storage
- ✅ See wallet in pi
- ✅ Link to explorer for balances
- ✅ Use regular wallet for transactions

### For New Users

```
/wallet-create --email me@example.com
```

Benefits:
- ✅ Zero setup
- ✅ Send/receive in pi
- ✅ x402 payments work
- ⚠️ Coinbase holds keys

---

## Phase 2 Roadmap

- [ ] Ethers.js provider with encrypted key storage
- [ ] Hardware wallet connector (MetaMask, Ledger)
- [ ] WalletConnect integration
- [ ] Multi-wallet switching
- [ ] Transaction history
- [ ] ERC-20 token support beyond ETH/USDC
