/**
 * Wallet CLI Commands
 * 
 * Commands for managing wallets with pi-wallet extension.
 */

import { Command } from "commander";
import { join } from "path";
import { homedir } from "os";
import { existsSync, readFileSync } from "fs";

// Get wallet config location
function getWalletConfig() {
  const dirs = [
    join(homedir(), ".0xkobold", "wallets", "config.json"),
    join(homedir(), ".pi", "wallet", "config.json"),
  ];
  for (const dir of dirs) {
    if (existsSync(dir)) {
      return JSON.parse(readFileSync(dir, "utf-8"));
    }
  }
  return null;
}

export function createWalletCommand(): Command {
  const wallet = new Command("wallet")
    .description("Manage Ethereum wallets")
    .showHelpAfterError();

  // wallet status
  wallet
    .command("status")
    .description("Show current wallet status")
    .action(() => {
      const cfg = getWalletConfig();
      
      console.log("\n=== Wallet Status ===\n");
      
      if (!cfg) {
        console.log("No wallet configured.");
        console.log("  Run 'wallet import --help' to import a wallet");
        console.log("  Run 'pi wallet-create --help' for creating new wallets");
        return;
      }
      
      console.log(`Active Provider: ${cfg.activeProvider || "none"}`);
      console.log(`Default Chain: ${cfg.settings?.defaultChain || "sepolia"}`);
      
      if (cfg.readonlyWallet) {
        console.log(`\nRead-only Wallet:`);
        console.log(`  Address: ${cfg.readonlyWallet.address}`);
        if (cfg.readonlyWallet.label) {
          console.log(`  Label: ${cfg.readonlyWallet.label}`);
        }
        console.log(`  Note: Cannot sign transactions (read-only)`);
      }
      
      if (cfg.ethers) {
        console.log(`\nSelf-Custody Wallet (Ethers.js):`);
        console.log(`  Address: ${cfg.ethers.address}`);
        console.log(`  Encrypted: Yes`);
        console.log(`  Note: Run 'pi wallet-unlock' to enable signing`);
      }
      
      if (cfg.agentic) {
        console.log(`\nCDP Agentic Wallet:`);
        console.log(`  Email: ${cfg.agentic.email}`);
        console.log(`  Authenticated: ${cfg.agentic.authenticated ? "Yes" : "No"}`);
        if (cfg.agentic.address) {
          console.log(`  Address: ${cfg.agentic.address}`);
        }
      }
      
      if (cfg.hardware) {
        console.log(`\nHardware Wallet:`);
        console.log(`  Provider: ${cfg.hardware.provider}`);
        console.log(`  Address: ${cfg.hardware.address}`);
        console.log(`  Connected: ${cfg.hardware.connected ? "Yes" : "No"}`);
      }
      
      console.log("");
    });

  // wallet import
  wallet
    .command("import")
    .description("Import an external wallet")
    .option("--type <type>", "Wallet type: ethers, readonly", "ethers")
    .option("--key <key>", "Private key (0x...)")
    .option("--mnemonic <phrase>", "Recovery phrase (quoted)")
    .option("--address <address>", "Address for read-only mode (0x...)")
    .option("--label <label>", "Label for this wallet")
    .action(async (opts) => {
      const cfg = getWalletConfig() || {
        activeProvider: null,
        settings: {
          defaultChain: "sepolia",
          maxTransactionAmount: "100",
          requireConfirmation: true,
          autoLockMinutes: 30,
        },
        lastUpdated: Date.now(),
      };
      
      if (opts.type === "readonly") {
        if (!opts.address) {
          console.log("Error: --address required for read-only import");
          console.log("Usage: wallet import --type readonly --address 0x...");
          return;
        }
        
        if (!opts.address.match(/^0x[a-fA-F0-9]{40}$/)) {
          console.log("Error: Invalid Ethereum address");
          return;
        }
        
        cfg.activeProvider = "readonly";
        cfg.readonlyWallet = {
          address: opts.address.toLowerCase(),
          label: opts.label || "Imported Wallet",
          createdAt: Date.now(),
        };
        
        console.log(`\n✓ Read-only wallet imported:`);
        console.log(`  Address: ${opts.address}`);
        console.log(`  Label: ${opts.label || "Imported Wallet"}`);
        console.log(`\nNote: Read-only wallets can view balances but cannot sign transactions.`);
        console.log(`      For signing, import with --key or --mnemonic using --type ethers.`);
        
      } else if (opts.type === "ethers") {
        if (!opts.key && !opts.mnemonic) {
          console.log("Error: --key or --mnemonic required for ethers import");
          console.log("\nUsage:");
          console.log("  # From private key:");
          console.log("  wallet import --type ethers --key 0x...");
          console.log("\n  # From recovery phrase:");
          console.log("  wallet import --type ethers --mnemonic 'word1 word2 ...'");
          console.log("\nNote: The pi-wallet extension will encrypt and store your private key.");
          return;
        }
        
        // Validate key/mnemonic format
        if (opts.key && !opts.key.match(/^0x[a-fA-F0-9]{64}$/)) {
          console.log("Error: Invalid private key format");
          console.log("Expected: 0x followed by 64 hex characters");
          return;
        }
        
        if (opts.mnemonic) {
          const words = opts.mnemonic.trim().split(/\s+/);
          if (words.length !== 12 && words.length !== 24) {
            console.log("Error: Mnemonic should be 12 or 24 words");
            return;
          }
        }
        
        console.log("\n⚠️  Private key/mnemonic detected.");
        console.log("\nFor secure import, use the pi-coding-agent with the pi-wallet extension:");
        console.log("\n1. Start the agent:");
        console.log("   bun run start");
        console.log("\n2. Import your wallet:");
        console.log(`   /wallet-import --type ethers --key ${opts.key ? opts.key.slice(0, 10) + '...' : '<your-key>'}`);
        console.log("\n   Or with mnemonic:");
        console.log(`   /wallet-import --type ethers --mnemonic "${opts.mnemonic?.split(' ')[0]} ${opts.mnemonic?.split(' ')[1]} ..."`);
        console.log("\nThis ensures your key is encrypted properly using AES-256-GCM.");
      } else {
        console.log(`Unknown wallet type: ${opts.type}`);
        console.log("Supported types: ethers, readonly");
      }
    });

  // wallet address
  wallet
    .command("address")
    .description("Show the active wallet address")
    .action(() => {
      const cfg = getWalletConfig();
      
      if (!cfg?.activeProvider) {
        console.log("No wallet configured");
        return;
      }
      
      let address = "";
      
      if (cfg.readonlyWallet) {
        address = cfg.readonlyWallet.address;
      } else if (cfg.ethers) {
        address = cfg.ethers.address;
      } else if (cfg.agentic?.address) {
        address = cfg.agentic.address;
      } else if (cfg.hardware?.address) {
        address = cfg.hardware.address;
      }
      
      if (address) {
        console.log(address);
      } else {
        console.log("No address found for active wallet");
        if (cfg.activeProvider === "agentic") {
          console.log("CDP Agentic wallet not authenticated. Run /wallet-auth in the agent.");
        }
      }
    });

  // wallet chains
  wallet
    .command("chains")
    .description("List supported chains")
    .action(() => {
      console.log("\n=== Supported Chains ===\n");
      console.log("base      - Base Mainnet (chainId: 8453)");
      console.log("sepolia   - Base Sepolia Testnet (chainId: 84532)");
      console.log("\nDefault: sepolia");
      console.log("");
    });

  // wallet help-import
  wallet
    .command("help-import")
    .description("Show detailed import instructions")
    .action(() => {
      console.log(`
=== Wallet Import Guide ===

PRIVACY NOTE: Your private keys never leave your machine.
They are encrypted with AES-256-GCM using a randomly generated password.

--- Import from MetaMask ---
1. Open MetaMask → Settings → Security & Privacy
2. Click "Export Private Key"
3. Copy the key (starts with 0x...)
4. Import using pi-coding-agent:
   /wallet-import --type ethers --key 0x...

--- Import from Ledger/Trezor ---
1. Connect your hardware wallet
2. In the agent:
   /wallet-import --type hardware
3. Approve the connection on your device

--- Import Read-Only (watch only) ---
For simply tracking an address:
   /wallet-import --type readonly --address 0x...

--- Generate New Wallet ---
   /wallet-create --type ethers

SECURITY: Write down your recovery phrase and store it offline!
`);
    });

  return wallet;
}
