/**
 * Tailscale CLI Command - v0.3.0
 *
 * Manage Tailscale VPN connection for secure remote access.
 */

import { Command } from "commander";
import { getTailscaleIntegration } from "../../infra/index.js";

export function createTailscaleCommand(): Command {
  const cmd = new Command("tailscale")
    .description("Manage Tailscale VPN connection");

  // Status
  cmd
    .command("status")
    .description("Check Tailscale status")
    .action(async () => {
      const ts = getTailscaleIntegration();
      const status = await ts.getStatus();

      console.log("🔍 Tailscale Status\n");
      
      if (!status.installed) {
        console.log("❌ Tailscale not installed");
        console.log("   Install: https://tailscale.com/download");
        console.log("   macOS:   brew install tailscale");
        console.log("   Linux:   curl -fsSL https://tailscale.com/install.sh | sh");
        return;
      }

      console.log(`✅ Tailscale installed`);
      console.log(`   Running: ${status.running ? "✅" : "❌"}`);
      console.log(`   Connected: ${status.connected ? "✅" : "❌"}`);
      
      if (status.myIP) {
        console.log(`   IP: ${status.myIP}`);
        
        // Show gateway URL
        const url = await ts.getGatewayURL();
        if (url) {
          console.log(`\n🌐 Gateway URL: ${url}`);
          console.log(`   Use: 0xkobold tui --local --remote ${url}`);
        }
      }
    });

  // Start
  cmd
    .command("start")
    .description("Start Tailscale daemon")
    .action(async () => {
      const ts = getTailscaleIntegration();
      
      ts.on("ready", ({ ip }) => {
        console.log(`✅ Tailscale ready! IP: ${ip}`);
      });

      const success = await ts.start();
      
      if (!success) {
        console.log("\n⚠️  Manual start required:");
        console.log("   sudo tailscale up");
        console.log("\n   Or use Tailscale GUI app");
      }
    });

  // Stop
  cmd
    .command("stop")
    .description("Stop Tailscale")
    .action(async () => {
      console.log("🛑 Stopping Tailscale...");
      console.log("   Run: sudo tailscale down");
    });

  // Get URL
  cmd
    .command("url")
    .description("Get Tailscale gateway URL")
    .option("-p, --port <port>", "Gateway port", "7777")
    .action(async (options) => {
      const ts = getTailscaleIntegration();
      const url = await ts.getGatewayURL(parseInt(options.port));
      
      if (url) {
        console.log(url);
      } else {
        console.error("❌ Tailscale not running or not installed");
        process.exit(1);
      }
    });

  return cmd;
}
