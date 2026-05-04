import { jest } from "@jest/globals";
import axios from "axios";
import {
  sendTelegramMessage,
  formatTelegramMessage,
} from "../../src/services/telegramService.js";

describe("Telegram Service", () => {
  const originalTelegramToken = process.env.TELEGRAM_BOT_TOKEN;
  let axiosPostSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TELEGRAM_BOT_TOKEN = originalTelegramToken;
    axiosPostSpy = jest.spyOn(axios, "post");
  });

  afterEach(() => {
    axiosPostSpy?.mockRestore();
    process.env.TELEGRAM_BOT_TOKEN = originalTelegramToken;
  });

  test("skips sending when TELEGRAM_BOT_TOKEN is not configured", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "";

    await sendTelegramMessage("12345", "Hello World");

    expect(axios.post).not.toHaveBeenCalled();
  });

  test("skips sending when chatId is missing", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";

    await sendTelegramMessage("", "Hello World");

    expect(axios.post).not.toHaveBeenCalled();
  });

  test("posts correct payload to Telegram API when configured", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    axiosPostSpy.mockResolvedValue({
      data: {
        ok: true,
        result: { message_id: 42 },
      },
    });

    await sendTelegramMessage("12345", "Hello World");

    expect(axios.post).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      {
        chat_id: "12345",
        text: "Hello World",
        parse_mode: "Markdown",
      },
      {
        timeout: 5000,
      },
    );
  });

  test("formatTelegramMessage returns markdown formatted text", () => {
    const formatted = formatTelegramMessage("New Alert", "This is a message.");
    expect(formatted).toBe("🔔 *New Alert*\n\nThis is a message.");
  });
});
