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
 * Deprecated: use universalAuth + requireRole(ROLES.DOCTOR)
 */
export const protectDoctor = composeAuth(
  universalAuth,
  requireRole(ROLES.DOCTOR),
);

/**
 * Deprecated: use universalAuth + requireRole(ROLES.SECRETARY)
 */
export const protectSecretary = composeAuth(
  universalAuth,
  requireRole(ROLES.SECRETARY),
);

/**
 * Deprecated: use universalAuth + requireRole(ROLES.DOCTOR, ROLES.SECRETARY)
 */
export const protectDoctorOrSecretary = composeAuth(
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY),
);
