// Channels Module - v0.3.0

// WhatsApp Integration
export {
  getWhatsAppIntegration,
  resetWhatsAppIntegration,
  type WhatsAppMessage,
  type WhatsAppConfig,
} from "./whatsapp/integration.js";

// Telegram Integration
export {
  TelegramIntegration,
  getTelegramIntegration,
  resetTelegramIntegration,
  type TelegramMessage,
  type TelegramConfig,
} from "./telegram/bot.js";

// Slack Integration
export {
  SlackIntegration,
  getSlackIntegration,
  resetSlackIntegration,
  type SlackMessage,
  type SlackConfig,
} from "./slack/webhook.js";
