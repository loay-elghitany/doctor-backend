import logger from "../utils/logger.js";

const isProduction = process.env.NODE_ENV === "production";

const globalErrorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // Handle CORS rejection from the cors library
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

  return res.status(500).json({
    success: false,
    message: "Internal Server Error",
    data: null,
  });
};

export default globalErrorHandler;
