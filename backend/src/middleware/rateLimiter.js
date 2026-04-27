import rateLimit from "express-rate-limit";

// Skip function: always allow OPTIONS (CORS preflight) and health checks
const skipOptions = (req) => {
  if (req.method === "OPTIONS") return true;
  if (req.method === "HEAD") return true;
  return false;
};

/**
 * General API rate limiter - applies to all routes
 * NOTE: CORS middleware runs BEFORE this, so CORS headers are already set.
 * The response will include proper CORS headers for allowed origins.
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipOptions,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    // CORS headers already set by cors() middleware (runs first in chain)
    res.status(429).json({
      success: false,
      message: "Too many requests, please try again later",
      data: null,
    });
  },
});

/**
 * Auth endpoints rate limiter - stricter, but skips OPTIONS
 * NOTE: OPTIONS requests are skipped to allow CORS preflight
 */
export const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipOptions,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many login attempts, please try again later",
      data: null,
    });
  },
});

/**
 * Strict POST limiter for sensitive operations
 */
export const strictPostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipOptions,
  keyGenerator: (req) => req.ip,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many requests, please try again later",
      data: null,
    });
  },
});
