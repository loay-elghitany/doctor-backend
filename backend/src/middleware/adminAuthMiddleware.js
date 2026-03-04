import jwt from "jsonwebtoken";

/**
 * Admin authentication middleware
 * Protects admin-only endpoints for manual subscription management
 *
 * Two authentication strategies (pick one in .env):
 * 1. ADMIN_SECRET_TOKEN: Fixed admin token for API calls
 * 2. ADMIN_EMAIL: Admin email for JWT-based auth (future expansion)
 *
 * Usage: Pass auth token in request headers:
 *   Authorization: Bearer <ADMIN_SECRET_TOKEN>
 */
export const protectAdmin = async (req, res, next) => {
  let token;

  // Extract token from Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Admin authentication required",
      data: null,
    });
  }

  try {
    // Check if token matches admin secret (simple but effective for single admin)
    const adminSecret = process.env.ADMIN_SECRET_TOKEN;

    if (!adminSecret) {
      return res.status(500).json({
        success: false,
        message: "Admin authentication not configured",
        data: null,
      });
    }

    if (token !== adminSecret) {
      return res.status(403).json({
        success: false,
        message: "Invalid admin credentials",
        data: null,
      });
    }

    // Mark request as admin-authenticated
    req.isAdmin = true;
    next();
  } catch (error) {
    console.error("[adminAuthMiddleware] error:", error);
    res.status(401).json({
      success: false,
      message: "Admin authentication failed",
      data: null,
    });
  }
};
