/**
 * Gateway CLI Command - v0.2.0
 * 
 * Start/stop/manage the WebSocket gateway server.
 */

import { Command } from "commander";
import { startGateway, getGateway, stopGateway } from "../../gateway/index.js";
import { getDiscordBot, resetDiscordBot } from "../../gateway/discord-bot.js";

export function createGatewayCommand(): Command {
  const cmd = new Command("gateway")
    .description("Manage the WebSocket gateway server");

  // Start gateway
  cmd
    .command("start")
    .description("Start the WebSocket gateway server")
    .option("-p, --port <port>", "Port to run on", "7777")
    .option("-h, --host <host>", "Host to bind to", "localhost")
    .option("--discord", "Enable Discord bot integration")
    .option("--discord-token <token>", "Discord bot token")
    .action(async (options) => {
      const port = parseInt(options.port);
      const host = options.host;

      console.log("🌐 Starting 0xKobold Gateway Server...\n");

      try {
        // Start main gateway with config (creates instance if needed)
        const gateway = startGateway({ 
          port, 
          host, 
          cors: true, 
          heartbeatInterval: 30000 
        });
        
        await gateway.start();

        const address = `http://${host}:${port}`;
        console.log(`✅ Gateway server running at: ${address}`);
        console.log(`   WebSocket endpoint: ws://${host}:${port}/ws`);
        console.log(`   Health check: ${address}/health`);
        console.log(`   Status: ${address}/status\n`);

        // Start Discord bot if enabled
        if (options.discord || process.env.DISCORD_TOKEN) {
          const token = options.discordToken || process.env.DISCORD_TOKEN;
          if (token) {
            const bot = getDiscordBot({ token });
            await bot.start();
            console.log("🤖 Discord bot integration enabled\n");
          } else {
            console.warn("⚠️  Discord bot integration requested but no token provided");
            console.log("   Set DISCORD_TOKEN env var or use --discord-token\n");
          }
        }

        console.log("Press Ctrl+C to stop\n");

        // Keep running
        process.on("SIGINT", async () => {
          console.log("\n🛑 Shutting down...");
          resetDiscordBot();
          stopGateway();
          console.log("✅ Gateway stopped");
          process.exit(0);
        });

      } catch (error) {
        console.error("❌ Failed to start gateway:", error);
        process.exit(1);
      }
    });

  // Stop gateway
  cmd
    .command("stop")
    .description("Stop the WebSocket gateway server")
    .action(async () => {
      console.log("🛑 Stopping gateway server...");
      resetDiscordBot();
      stopGateway();
      console.log("✅ Gateway server stopped");
    });

  // Status
  cmd
    .command("status")
    .description("Check gateway server status")
    .action(() => {
      const gateway = getGateway();
      
      if (gateway.isRunning()) {
        console.log("🟢 Gateway Status: Running");
        console.log(`   Connections: ${gateway.getConnectionCount()}`);
        
        const discordBot = getDiscordBot();
        const discordStatus = discordBot?.getStatus();
        if (discordStatus?.connected) {
          console.log(`   Discord Bot: Connected (${discordStatus.user})`);
        } else {
          console.log("   Discord Bot: Not running");
        }
      } else {
        console.log("🔴 Gateway Status: Stopped");
      }
    });

  // List connections
  cmd
    .command("connections")
    .alias("ls")
    .description("List active connections")
    .action(() => {
      const gateway = getGateway();
      const connections = gateway.getConnections();

      if (connections.size === 0) {
        console.log("No active connections");
        return;
      }

      console.log(`\nActive connections (${connections.size}):\n`);
      
      for (const [id, conn] of connections) {
        const age = Math.round((Date.now() - conn.connectedAt.getTime()) / 1000);
        console.log(`  ${conn.type.toUpperCase()} | ${id.slice(0, 20)}... | ${age}s ago`);
      }
      console.log();
    });

  // Send test message
  cmd
    .command("send")
    .description("Send a test message via gateway")
    .option("-c, --channel <channel>", "Channel to send to")
    .option("-m, --message <message>", "Message content", "Hello from 0xKobold!")
    .action(async (options) => {
      const gateway = getGateway();
      
      if (!gateway.isRunning()) {
        console.error("❌ Gateway is not running. Start it with '0xkobold gateway start'");
        return;
      }

      if (options.channel) {
        const sent = gateway.broadcastToChannel(options.channel, options.message);
        console.log(`✅ Sent to ${sent} connections in channel '${options.channel}'`);
      } else {
        gateway.broadcast(options.message);
        console.log(`✅ Broadcast to ${gateway.getConnectionCount()} connections`);
      }
    });

  return cmd;
}
