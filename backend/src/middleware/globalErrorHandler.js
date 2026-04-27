import logger from "../utils/logger.js";

const isProduction = process.env.NODE_ENV === "production";

/**
 * SECURITY CRITICAL: We do NOT set CORS headers for rejected origins.
 * If we echo the attacker origin, browser allows them to read the response.
 * By NOT setting CORS headers, browser blocks the response entirely.
 * This prevents information disclosure to unauthorized origins.
 */

const globalErrorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // Handle CORS rejection from the cors library
  // CRITICAL: Do NOT set CORS headers here. The cors() middleware rejected
  // this origin for a reason. If we set CORS headers now, the browser will
  // allow the attacker to read this 403 response, leaking information.
  // By NOT setting headers, browser blocks the response entirely (security win).
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "CORS Error: Origin not allowed",
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

  // Note: For 500 errors and all other errors, CORS headers are already set
  // by the cors middleware which runs first in the chain.
  // We do NOT duplicate CORS logic here - single source of truth principle.

  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
    data: null,
  });
};

export default globalErrorHandler;
