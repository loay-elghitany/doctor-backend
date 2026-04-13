import logger from "./logger.js";

/**
 * Debug logging utility
 * Controls verbosity based on NODE_ENV (development vs production)
 * Can be toggled via DEBUG environment variable
 */

const DEBUG =
  process.env.NODE_ENV !== "production" &&
  (process.env.DEBUG === "true" || process.env.NODE_ENV === "development");

export const debugLog = (context, message, data = null) => {
  if (!DEBUG) return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${context}]`;

  if (data) {
    logger.debug(`${prefix} ${message}`, data);
  } else {
    logger.debug(`${prefix} ${message}`);
  }
};

export const debugError = (context, message, error = null) => {
  if (!DEBUG) {
    // Still log errors even in production, but less verbose
    logger.error(`${context}: ${message}`);
    return;
  }

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${context}]`;

  if (error) {
    logger.error(`${prefix} ${message}`, error);
  } else {
    logger.error(`${prefix} ${message}`);
  }
};

export default { debugLog, debugError };
