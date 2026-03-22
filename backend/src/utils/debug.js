/**
 * Debug logging utility
 * Controls verbosity based on NODE_ENV (development vs production)
 * Can be toggled via DEBUG environment variable
 */

const DEBUG =
  process.env.DEBUG === "true" || process.env.NODE_ENV === "development";

export const debugLog = (context, message, data = null) => {
  if (!DEBUG) return;

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${context}]`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
};

export const debugError = (context, message, error = null) => {
  if (!DEBUG) {
    // Still log errors even in production, but less verbose
    console.error(`${context}: ${message}`);
    return;
  }

  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${context}]`;

  if (error) {
    console.error(`${prefix} ${message}`, error);
  } else {
    console.error(`${prefix} ${message}`);
  }
};

export default { debugLog, debugError };
