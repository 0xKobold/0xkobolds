# Wallet Integration Approach: npx vs Dependency

**Date:** 2026-03-12  
**Decision:** Use `npx` as primary, with graceful fallback  
**Rationale:** Zero-setup UX alignment with 0xKobold philosophy

---

## The Question

> Should we install `@coinbase/awal` as a project dependency or use `npx awal` in the CLI?

---

## Option Analysis

### Option 1: `npm install -g @coinbase/awal` (Global Install)

```bash
# User runs once
npm install -g @coinbase/awal

# Then in 0xKobold
exec("awal status")
```

**Pros:**
- ✅ Fast execution (no npx overhead)
- ✅ Works offline after install
- ✅ Predictable version

**Cons:**
- ❌ Extra setup step for users
- ❌ Global state pollution
- ❌ Permission issues on some systems
- ❌ Version conflicts possible
- ❌ Not aligned with "just works" philosophy

**Verdict:** ❌ Rejected - adds friction

---

### Option 2: `npx awal` (No Install)

```bash
# In 0xKobold extension
exec("npx awal status")
exec("npx awal auth login user@example.com")
```

**Pros:**
- ✅ Zero setup required
- ✅ Always latest version
- ✅ No global state
- ✅ Official documented way by Coinbase
- ✅ Cached after first run
- ✅ Matches 0xKobold's "bun install && go" philosophy

**Cons:**
- ⚠️ Network required for first run
- ⚠️ Slight delay on first execution (~2-5s)
- ⚠️ Version not pinned (could change)

**Verdict:** ✅ **Recommended - Primary approach**

---

### Option 3: `bun add @coinbase/awal` (Bundled Dependency)

```json
// package.json
{
  "dependencies": {
    "@coinbase/awal": "^1.0.0"
  }
}
```

```typescript
// In extension
import { AgenticWallet } from "@coinbase/awal";
const wallet = new AgenticWallet();
```

**Pros:**
- ✅ Controlled version
- ✅ Always available offline
- ✅ TypeScript types included
- ✅ Fast execution
- ✅ Programmatic API (not just CLI)

**Cons:**
- ❌ Package size increases
- ❌ Dependency management overhead
- ❌ Updates require 0xKobold update
- ❌ May conflict with global awal if user has it

**Verdict:** ✅ **Secondary - fallback if SDK available**

---

## Recommended Hybrid Approach

```typescript
// src/extensions/core/wallet-extension.ts

import { execSync } from "child_process";

class AgenticWalletProvider {
  private async execAwal(args: string[]): Promise<string> {
    try {
      // Primary: npx (zero setup)
      return execSync(`npx awal ${args.join(" ")}`, {
        encoding: "utf-8",
        timeout: 30000
      });
    } catch (error) {
      // Fallback: Check if globally installed
      try {
        return execSync(`awal ${args.join(" ")}`, {
          encoding: "utf-8",
          timeout: 10000
        });
      } catch {
        // Last resort: Prompt user to install
        throw new Error(
          "Agentic Wallet CLI not available.\n" +
          "Install with: npm install -g @coinbase/awal\n" +
          "Or ensure npx is available."
        );
      }
    }
  }

  async status(): Promise<WalletStatus> {
    const output = await this.execAwal(["status", "--json"]);
    return JSON.parse(output);
  }

  async authLogin(email: string): Promise<AuthFlow> {
    const output = await this.execAwal(["auth", "login", email, "--json"]);
    return JSON.parse(output);
  }

  async authVerify(flowId: string, otp: string): Promise<void> {
    await this.execAwal(["auth", "verify", flowId, otp]);
  }

  async balance(chain: string = "base"): Promise<Balance> {
    const output = await this.execAwal(["balance", "--chain", chain, "--json"]);
    return JSON.parse(output);
  }

  async send(amount: string, recipient: string, chain?: string): Promise<TxReceipt> {
    const args = ["send", amount, recipient];
    if (chain) args.push("--chain", chain);
    args.push("--json");
    
    const output = await this.execAwal(args);
    return JSON.parse(output);
  }

  async x402Pay(url: string): Promise<X402Result> {
    const output = await this.execAwal(["x402", "pay", url, "--json"]);
    return JSON.parse(output);
  }
}
```

---

## User Experience Flow

### First-Time User (Path A - Happy Path)

```
User: "/wallet create --provider agentic --email me@company.com"

System:
Need to install @coinbase/awal... (this may take a moment)
✓ Agentic Wallet CLI installed

Check your email for 6-digit code...

User: "123456"

System:
✓ Authenticated as me@company.com
✓ Wallet created: 0x742d...
✓ Funded with testnet USDC

Ready to use!
```

### Subsequent Uses

```
User: "/wallet send 1 vitalik.eth"

System:
✓ Sent 1 USDC to vitalik.eth
  Tx: 0xabc...
  Balance: 49 USDC
```

**Note:** No delay - cached from first run

---

## Implementation Strategy

### Phase 1: npx-based MVP

```typescript
// Minimal implementation
export class WalletExtension {
  async createWallet(email: string): Promise<Wallet> {
    // Use npx
    const result = await $`npx awal auth login ${email} --json`;
    const { flowId } = JSON.parse(result);
    
    return {
      status: "pending_otp",
      flowId,
      email
    };
  }
}
```

### Phase 2: Add Bundled SDK (if/when available)

```typescript
// Check if SDK available
let wallet: AgenticWallet;

try {
  // Try bundled SDK first
  const { AgenticWallet } = await import("@coinbase/awal");
  wallet = new AgenticWallet();
} catch {
  // Fall back to CLI
  wallet = new AgenticWalletCLI();
}
```

---

## Technical Considerations

### Caching

```bash
# First run (slow - downloads)
npx awal status  # ~5 seconds

# Subsequent runs (fast - cached)
npx awal status  # ~500ms

# Cache location
ls ~/.npm/_npx/  # Cached packages
```

### Network Handling

```typescript
async function execWithRetry(command: string, retries = 3): Promise<string> {
  for (let i = 0; i < retries; i++) {
    try {
      return await exec(command);
    } catch (error) {
      if (error.message.includes("ENOTFOUND") && i < retries - 1) {
        await delay(1000);
        continue;
      }
      throw error;
    }
  }
  throw new Error("Network unavailable");
}
```

### Version Pinning (Optional)

```typescript
// If we need specific version
exec(`npx @coinbase/awal@1.2.3 status`);
```

**Recommendation:** Don't pin initially, add config option if needed.

---

## Security Considerations

### npx Considerations

| Risk | Mitigation |
|------|------------|
| Supply chain | Verify package name `@coinbase/awal` |
| MITM | npm uses HTTPS, certificate pinning |
| Cache poisoning | npm cache integrity checks |
| Version drift | Acceptable for non-critical ops |

### Secure Execution

```typescript
// Sanitize inputs
function sanitizeEmail(email: string): string {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid email");
  }
  return email.replace(/[^a-zA-Z0-9@.-]/g, "");
}

// Use execFile instead of exec for safety
import { execFile } from "child_process";
await execFile("npx", ["awal", "auth", "login", sanitizedEmail]);
```

---

## Decision Matrix

| Criteria | npx | Global | Bundled |
|----------|-----|--------|---------|
| Setup friction | ⭐⭐⭐ | ⭐ | ⭐⭐ |
| First-run speed | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Subsequent speed | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Version control | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Offline support | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Maintenance | ⭐⭐⭐ | ⭐⭐ | ⭐ |
| User preference | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ |

**Winner:** npx ⭐⭐⭐ (5/7 criteria)

---

## Final Recommendation

**Primary:** `npx awal`  
**Fallback:** Global install if npx fails  
**Future:** Add bundled SDK if/when programmatic API available

**Rationale:**
1. Aligns with 0xKobold's "zero config" philosophy
2. Matches Coinbase's official documentation
3. No global state pollution
4. Cached after first use
5. Users can upgrade independently

**Code Pattern:**

```typescript
// Try npx first (recommended)
const result = await exec(`npx awal ${command}`);

// Fallback to global if available
const result = await exec(`awal ${command}`);

// Error with helpful message if neither works
throw new SetupError("Install: npm install -g @coinbase/awal");
```

---

**Status:** ✅ Decision made - implement with npx

**Next:** Build wallet-extension.ts with npx pattern
