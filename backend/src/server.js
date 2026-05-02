import dotenv from "dotenv";
import http from "http";
import connectDB from "./config/db.js";
import app from "./app.js";
import logger from "./utils/logger.js";
import { initializeSocket } from "./utils/socketManager.js";
import { initializeTelegramBotListener } from "./services/telegramBotListener.js";

dotenv.config();

process.env.NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = process.env.NODE_ENV === "production";

const requiredEnv = ["JWT_SECRET", "ADMIN_SECRET_TOKEN"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

const databaseUri = process.env.DB_URI || process.env.MONGO_URI;
if (!databaseUri) {
  missingEnv.push("DB_URI or MONGO_URI");
}

if (isProduction) {
  if (!process.env.PORT) {
    missingEnv.push("PORT");
  }
  // CORS_ALLOWED_ORIGINS is now OPTIONAL - dynamic detection is handled in app.js
}

if (databaseUri && isProduction) {
  if (/(localhost|127\.0\.0\.1)/.test(databaseUri)) {
    logger.error(
      "EnvValidation",
      "Production database URI must not use localhost or 127.0.0.1",
    );
    process.exit(1);
  }
}

connectDB(databaseUri);

const PORT = process.env.PORT || 5000;

// Create HTTP server from Express app
const httpServer = http.createServer(app);

// Initialize Socket.io
initializeSocket(httpServer);

// Initialize Telegram deep-link listener
initializeTelegramBotListener();

httpServer.listen(PORT, () => {
  logger.info("Server", `Server running on port ${PORT}`);
});
