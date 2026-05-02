import axios from "axios";
import logger from "../utils/logger.js";

/**
 * Telegram Bot Service
 * Sends messages via Telegram Bot API
 * Uses fire-and-forget pattern: errors are logged but never thrown
 */

/**
 * Send a message via Telegram Bot
 * @param {String} chatId - Telegram chat ID of the recipient
 * @param {String} text - Message text (supports markdown)
 * @returns {Promise<void>} - Always resolves, never rejects
 */
export const sendTelegramMessage = async (chatId, text) => {
  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

  // Guard: Ensure token is configured
  if (!TELEGRAM_BOT_TOKEN) {
    logger.warn("[telegramService] TELEGRAM_BOT_TOKEN not configured");
    return;
  }

  // Guard: Ensure chatId exists
  if (!chatId || chatId.trim() === "") {
    logger.debug(
      "[telegramService] No chatId provided, skipping Telegram notification",
    );
    return;
  }

  try {
    logger.debug("[telegramService] Sending Telegram message", {
      chatId,
      textLength: text.length,
    });

    const response = await axios.post(
      `${TELEGRAM_API_URL}/sendMessage`,
      {
        chat_id: chatId,
        text: text,
        parse_mode: "Markdown", // Enable markdown formatting
      },
      {
        timeout: 5000, // 5-second timeout to avoid blocking
      },
    );

    if (response.data.ok) {
      logger.debug("[telegramService] Telegram message sent successfully", {
        chatId,
        messageId: response.data.result.message_id,
      });
    } else {
      logger.warn("[telegramService] Telegram API returned error", {
        chatId,
        error: response.data.description,
      });
    }
  } catch (error) {
    // Log the error but never throw it
    // Common errors: user blocked bot, invalid chatId, network timeout
    logger.error("[telegramService] Failed to send Telegram message", {
      chatId,
      errorMessage: error.message,
      errorCode: error.code,
      statusCode: error.response?.status,
    });

    // Don't rethrow - allow the notification system to continue
  }
};

/**
 * Format notification for Telegram
 * @param {String} title - Notification title
 * @param {String} message - Notification message
 * @returns {String} - Formatted text for Telegram (markdown)
 */
export const formatTelegramMessage = (title, message) => {
  return `🔔 *${title}*\n\n${message}`;
};

export default {
  sendTelegramMessage,
  formatTelegramMessage,
};
