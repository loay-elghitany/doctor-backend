import TelegramBot from "node-telegram-bot-api";
import logger from "../utils/logger.js";
import Doctor from "../models/Doctor.js";
import Patient from "../models/Patient.js";
import Secretary from "../models/Secretary.js";
import { sendTelegramMessage } from "./telegramService.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_BOT_USERNAME =
  process.env.TELEGRAM_BOT_USERNAME || "your_bot_username";
let bot;

export const initializeTelegramBotListener = () => {
  if (!TELEGRAM_BOT_TOKEN) {
    logger.warn(
      "[telegramBotListener] TELEGRAM_BOT_TOKEN is not configured. Telegram deep-link listener will not start.",
    );
    return null;
  }

  if (bot) {
    return bot;
  }

  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

  bot.on("polling_error", (error) => {
    logger.error("[telegramBotListener] polling error", {
      message: error?.message,
      code: error?.code,
      response: error?.response?.body,
    });
  });

  bot.onText(/\/start (.+)/, async (msg, match) => {
    const chatId = msg?.chat?.id;
    const rawPayload = match?.[1]?.trim();

    if (!chatId || !rawPayload) {
      logger.warn("[telegramBotListener] received invalid /start payload", {
        chatId,
        rawPayload,
      });
      return;
    }

    const [role, userId] = rawPayload.split("_");
    const normalizedRole = String(role || "").toLowerCase();

    if (!role || !userId) {
      await bot.sendMessage(
        chatId,
        "⚠️ لم نتمكن من ربط حسابك. تأكد من فتح الرابط من حساب Telegram الصحيح.",
        {
          parse_mode: "Markdown",
        },
      );
      logger.warn("[telegramBotListener] malformed payload", { rawPayload });
      return;
    }

    let Model;
    if (normalizedRole === "doctor") Model = Doctor;
    else if (normalizedRole === "patient") Model = Patient;
    else if (normalizedRole === "secretary") Model = Secretary;

    if (!Model) {
      await bot.sendMessage(
        chatId,
        "⚠️ نوع الحساب غير معتمد. يرجى المحاولة مرة أخرى.",
        {
          parse_mode: "Markdown",
        },
      );
      logger.warn("[telegramBotListener] unsupported role in payload", {
        role: normalizedRole,
      });
      return;
    }

    try {
      const user = await Model.findByIdAndUpdate(
        userId,
        { telegramChatId: String(chatId) },
        { new: true, runValidators: true },
      );

      if (!user) {
        await bot.sendMessage(
          chatId,
          "⚠️ لم نستطع العثور على حساب بهذا المعرف. يرجى المحاولة مرة أخرى.",
          {
            parse_mode: "Markdown",
          },
        );
        logger.warn("[telegramBotListener] user not found", {
          role: normalizedRole,
          userId,
        });
        return;
      }

      await sendTelegramMessage(
        chatId,
        "✅ تم ربط حسابك بنجاح! ستتلقى جميع إشعاراتك الطبية هنا.",
      );
      logger.info(
        "[telegramBotListener] Telegram account linked successfully",
        {
          role: normalizedRole,
          userId,
          chatId,
        },
      );
    } catch (error) {
      logger.error("[telegramBotListener] failed to link Telegram account", {
        role: normalizedRole,
        userId,
        chatId,
        message: error.message,
      });
      try {
        await bot.sendMessage(
          chatId,
          "⚠️ حدث خطأ داخلي أثناء محاولة الربط. يرجى المحاولة لاحقًا.",
        );
      } catch {
        // ignore send errors after the first failure
      }
    }
  });

  logger.info("[telegramBotListener] Telegram bot polling initialized", {
    botUsername: TELEGRAM_BOT_USERNAME,
    mode: "polling",
  });

  return bot;
};

export default initializeTelegramBotListener;
