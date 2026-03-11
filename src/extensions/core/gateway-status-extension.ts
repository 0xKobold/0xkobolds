/**
 * Gateway Status Extension
 *
 * Shows gateway status (🟢/🔴) in the PI footer via ctx.ui.setStatus()
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const GATEWAY_CHECK_INTERVAL = 5000;

interface ExtensionState {
  gatewayUrl: string;
  running: boolean;
}

export default async function register(pi: ExtensionAPI) {
  console.log("[GatewayStatus] Extension registered");

  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    console.log("[GatewayStatus] Session started, beginning status checks");

    const state: ExtensionState = {
      gatewayUrl: process.env.KOBOLD_GATEWAY_URL || "ws://localhost:7777",
      running: false,
    };

    let interval: NodeJS.Timeout | null = null;

    // Check gateway health
    const checkGateway = async () => {
      try {
        const httpUrl = state.gatewayUrl
          .replace("ws://", "http://")
          .replace("wss://", "https://");

        const response = await fetch(`${httpUrl}/health`, {
          signal: AbortSignal.timeout(3000),
        });

        state.running = response.ok;
      } catch {
        state.running = false;
      }

      // Only show in footer if gateway is running
      if (state.running) {
        const url = state.gatewayUrl
          .replace("ws://", "")
          .replace("wss://", "")
          .replace(/^localhost:/, "")
          .replace(/^127\.0\.0\.1:/, "");
        ctx.ui.setStatus("gateway", `🟢 GW:${url}`);
      } else {
        // Clear status when not running (don't show 🔴)
        ctx.ui.setStatus("gateway", undefined);
      }
    };

    // Initial check
    await checkGateway();

    // Check periodically
    interval = setInterval(checkGateway, GATEWAY_CHECK_INTERVAL);

    // Cleanup on shutdown
    pi.on("session_shutdown", async () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      ctx.ui.setStatus("gateway", undefined);
    });
  });
}
