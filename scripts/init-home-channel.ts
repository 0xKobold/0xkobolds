#!/usr/bin/env bun
/**
 * Initialize Delivery System with Discord Home Channel
 * 
 * Usage: bun run scripts/init-home-channel.ts
 */

import { getDeliverySystem, initDeliveryFromConfig } from '../src/gateway/delivery-integration.js';
import { Client, GatewayIntentBits, Partials } from 'discord.js';

const HOME_CHANNEL_ID = '1466825989332926464';
const DISCORD_TOKEN = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;

async function main() {
  console.log('[HomeChannel] Initializing delivery system...');
  
  // Create Discord client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  // Wait for ready
  await new Promise<void>((resolve) => {
    client.once('ready', () => {
      console.log(`[HomeChannel] Logged in as ${client.user?.tag}`);
      resolve();
    });
    client.login(DISCORD_TOKEN);
  });

  // Initialize delivery system
  const delivery = initDeliveryFromConfig({
    discordClient: client,
    homeChannelId: HOME_CHANNEL_ID,
  });

  console.log('[HomeChannel] Delivery system initialized');
  console.log('[HomeChannel] Home channel:', delivery.getHomeChannel());

  // Test delivery
  const message = delivery.queueDelivery(
    '🚀 Home channel initialized and ready for proactive delivery!',
    undefined,
    { priority: 'normal', sourceSessionId: 'init', sourceSessionKey: 'home-channel' }
  );

  console.log('[HomeChannel] Queued message:', message.id);
  console.log('[HomeChannel] Status:', message.status);

  // Keep running for a moment to process delivery
  await new Promise(r => setTimeout(r, 2000));

  console.log('[HomeChannel] Delivery complete, shutting down...');
  
  client.destroy();
  process.exit(0);
}

main().catch(console.error);