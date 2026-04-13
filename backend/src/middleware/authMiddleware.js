import { universalAuth } from "./universalAuth.js";
import { requireRole } from "./rbacMiddleware.js";
import { ROLES } from "../constants/roles.js";

const composeAuth =
  (...middlewares) =>
  (req, res, next) => {
    let current = 0;

    const runNext = (err) => {
      if (err) {
        return next(err);
      }
      if (current >= middlewares.length) {
        return next();
      }
      const middleware = middlewares[current++];
      middleware(req, res, runNext);
    };

    runNext();
  };

/**
 * Deprecated: use universalAuth + requireRole(ROLES.PATIENT)
 */
export const protect = composeAuth(universalAuth, requireRole(ROLES.PATIENT));

/**
 * Deprecated: use universalAuth + requireRole(ROLES.DOCTOR)
 */
export const doctorProtect = composeAuth(
  universalAuth,
  requireRole(ROLES.DOCTOR),
);

/**
 * Deprecated: use universalAuth directly for any role-based request.
 */
export const unifiedProtect = universalAuth;
