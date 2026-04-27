import logger from "../utils/logger.js";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Helper to ensure CORS headers are present on error responses
 * This is critical for browser error handling
 */
const ensureCorsHeaders = (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
};

const globalErrorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // Handle CORS rejection from the cors library
  if (err.message === "Not allowed by CORS") {
    ensureCorsHeaders(req, res);
    return res.status(403).json({
      success: false,
      message: "CORS Error: Origin not allowed",
      data: null,
    });
  }

  // Handle rate limit errors
  if (err.status === 429 || err.statusCode === 429) {
    ensureCorsHeaders(req, res);
    return res.status(429).json({
      success: false,
      message: err.message || "Too many requests, please try again later",
      data: null,
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  const requestContext = {
    method: req.method,
    path: req.originalUrl || req.url,
    statusCode,
    userRole: req.user?.role || null,
  };

  if (isProduction) {
    logger.error("UnhandledError", "Unhandled server error", {
      ...requestContext,
      message: err.message || "Internal Server Error",
    });
  } else {
    logger.error("UnhandledError", "Unhandled server error", {
      ...requestContext,
      message: err.message || "Internal Server Error",
      stack: err.stack,
    });
  }

  // Ensure CORS headers on all error responses
  ensureCorsHeaders(req, res);

  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
    data: null,
  });
};

export default globalErrorHandler;
