import logger from "../utils/logger.js";

const isProduction = process.env.NODE_ENV === "production";

const errorHandler = (err, req, res, next) => {
  logger.error("UnhandledError", err);

  const statusCode = err.statusCode || err.status || 500;
  const message = err.expose
    ? err.message
    : statusCode === 500
      ? "Internal server error"
      : err.message || "Unexpected error";

  const payload = {
    success: false,
    message,
  };

  if (!isProduction && err.stack) {
    payload.stack = err.stack;
  }

  res.status(statusCode).json(payload);
};

export default errorHandler;
