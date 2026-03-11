/**
 * Cron Notifications - 0xKobold
 * 
 * Send job results to Telegram, Discord, Slack, WhatsApp
 */

import { CronJob, JobResult } from "./types.js";

/**
 * Send notification based on job result
 */
export async function sendNotification(
  job: CronJob,
  result: JobResult
): Promise<void> {
  if (!job.notify) return;
  
  const { channel, recipient, onSuccess = true, onError = true, prefix } = job.notify;
  
  // Check if we should notify for this result
  if (result.success && !onSuccess) return;
  if (!result.success && !onError) return;
  
  const message = formatNotification(job, result, prefix);
  
  try {
    switch (channel) {
      case 'telegram':
        await sendTelegram(recipient, message);
        break;
      case 'discord':
        await sendDiscord(recipient, message, result.success);
        break;
      case 'slack':
        await sendSlack(recipient, message);
        break;
      case 'whatsapp':
        await sendWhatsApp(recipient, message);
        break;
      default:
        console.warn(`[Notification] Unknown channel: ${channel}`);
    }
  } catch (error) {
    console.error(`[Notification] Failed to send ${channel} notification:`, error);
  }
}

/**
 * Format notification message
 */
function formatNotification(
  job: CronJob,
  result: JobResult,
  prefix?: string
): string {
  const icon = result.success ? "✅" : "❌";
  const status = result.success ? "COMPLETED" : "FAILED";
  
  let message = `${icon} **[${status}]** ${job.name}\n\n`;
  
  if (prefix) {
    message = `${prefix}\n${message}`;
  }
  
  if (result.success) {
    // Truncate output if too long
    const output = result.output.substring(0, 2000);
    message += `**Output:**\n\`\`\`\n${output}${result.output.length > 2000 ? '...' : ''}\n\`\`\`\n`;
    message += `\n**Duration:** ${result.duration}ms · **Tokens:** ${result.tokensUsed}`;
  } else {
    message += `**Error:** ${result.error || 'Unknown error'}\n`;
    message += `**Duration:** ${result.duration}ms`;
  }
  
  return message;
}

/**
 * Send Telegram notification via Bot API
 */
async function sendTelegram(chatId: string, message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN not set');
  }
  
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      parse_mode: 'Markdown',
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error: ${error}`);
  }
  
  console.log(`[Notification] Telegram sent to ${chatId}`);
}

/**
 * Send Discord notification via Webhook or Bot API
 */
async function sendDiscord(
  channelId: string,
  message: string,
  success: boolean
): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  
  if (!token) {
    throw new Error('DISCORD_BOT_TOKEN not set');
  }
  
  // Use Discord API
  const url = `https://discord.com/api/v10/channels/${channelId}/messages`;
  
  // Build Discord embed
  const embed = {
    title: success ? "✅ Job Completed" : "❌ Job Failed",
    description: message.substring(0, 4096),
    color: success ? 0x00ff00 : 0xff0000,
    timestamp: new Date().toISOString(),
    footer: {
      text: "0xKobold Cron",
    },
  };
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ embeds: [embed] }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Discord API error: ${error}`);
  }
  
  console.log(`[Notification] Discord sent to ${channelId}`);
}

/**
 * Send Slack notification via Incoming Webhook
 */
async function sendSlack(webhookUrl: string, message: string): Promise<void> {
  // Check if it's a webhook URL
  if (!webhookUrl.startsWith('https://hooks.slack.com/')) {
    throw new Error('Invalid Slack webhook URL');
  }
  
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: message,
      mrkdwn: true,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Slack webhook error: ${error}`);
  }
  
  console.log(`[Notification] Slack sent`);
}

/**
 * Send WhatsApp notification using Baileys integration
 * 
 * Emits event for the WhatsApp channel to pick up if connected.
 * Falls back to console if WhatsApp is not initialized.
 */
async function sendWhatsApp(phoneNumber: string, message: string): Promise<void> {
  const { eventBus } = await import('../event-bus/index.js');
  
  // Format phone number (ensure it has country code)
  const formattedNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
  
  // Emit event for WhatsApp channel integration
  await eventBus.emit('whatsapp.notify', {
    to: formattedNumber,
    text: message,
    timestamp: Date.now(),
    source: 'cron'
  });
  
  console.log(`[Notification] WhatsApp notification queued for ${formattedNumber}`);
}
