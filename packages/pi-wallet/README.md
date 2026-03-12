# Pi Wallet Extension

CDP Agentic Wallet + x402 payments for [pi-coding-agent](https://github.com/badlogic/pi-mono).

## Installation

```bash
# Via pi CLI
pi install npm:@0xkobold/pi-wallet

# Or in pi-config.ts
{
  extensions: [
    'npm:@0xkobold/pi-wallet'
  ]
}

# Or temporary (testing)
pi -e npm:@0xkobold/pi-wallet
```

## Features

- 🪙 **CDP Agentic Wallet** - Zero setup, email-based authentication
- 💳 **x402 Protocol** - Machine-to-machine payments
- ⛓️ **Base L2** - Mainnet (8453) and Sepolia (84532)
- 🔒 **Secure** - Config stored with 0600 permissions
- 📁 **Portable** - Works with or without .0xkobold directory
- ⚙️ **Configurable** - Environment variables for custom paths

## Quick Start

```bash
# Create wallet
/wallet-create --email me@example.com

# Check status  
/wallet-status

# Send ETH
/wallet-send --to 0x742d35... --amount 0.01

# Send USDC
/wallet-send --to 0x742d35... --amount 10 --token USDC

# Trade tokens
/wallet-trade 10 USDC ETH

# Pay via x402
/wallet-x402 --url https://api.service.com/pay --budget 0.001
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PI_WALLET_DIR` | Custom storage directory | `~/.pi/wallet` or `~/.0xkobold/wallets` |
| `PI_WALLET_CHAIN` | Default chain | `sepolia` |
| `PI_WALLET_MAX_AMOUNT` | Max transaction amount | `100` |

### Config File

Stored at `PI_WALLET_DIR/config.json`:

```json
{
  "activeProvider": "agentic",
  "agentic": {
    "email": "me@example.com",
    "authenticated": true,
    "address": "0x742d35..."
  },
  "settings": {
    "defaultChain": "sepolia",
    "maxTransactionAmount": "100",
    "requireConfirmation": true
  }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `/wallet create --email E` | Create CDP Agentic Wallet |
| `/wallet status` | Check status and balances |
| `/wallet send --to ADDR --amount N [--token T] [--chain C]` | Send crypto |
| `/wallet trade AMOUNT FROM TO` | Swap tokens |
| `/wallet x402 --url URL [--budget N]` | Pay via x402 |

## Chains

| Chain | Chain ID | Explorer |
|-------|----------|----------|
| Base | 8453 | https://basescan.org |
| Base Sepolia | 84532 | https://sepolia.basescan.org |

## Tools

### `wallet_send`
```typescript
{
  to: "0x742d35...",
  amount: "0.01",
  token?: "ETH" | "USDC",
  chain?: "base" | "sepolia"
}
```

### `wallet_x402_pay`
```typescript
{
  url: "https://api.example.com",
  maxBudget?: 0.01
}
```

## Prerequisites

```bash
# Install CDP Agentic Wallet
npm install -g @coinbase/awal

# Or use via npx (no install)
npx awal status
```

## Local Development

```bash
git clone https://github.com/0xKobold/pi-wallet
cd pi-wallet
npm install
npm run build
pi install ./
```

## Testing

```bash
npm test
```

## Security

- Config stored with `0o600` permissions (owner only)
- No private keys stored locally
- Atomic writes prevent corruption
- Optional transaction confirmations

## License

MIT © 0xKobold
