import logger from "../utils/logger.js";



/**
 * RBAC middleware logging guidance:
 * - Only log missing authentication or denied access.
 * - Successful role checks should be silent in production.
 */

const normalizeRoles = (roles) =>
  Array.isArray(roles)
    ? roles.filter(Boolean).map((role) => String(role).trim())
    : [];

const extractUserRole = (req) => req?.user?.role || null;

const findOwnershipId = (req) => {
  const candidateIds = [
    req.params?.patientId,
    req.params?.userId,
    req.params?.id,
    req.body?.patientId,
    req.body?.userId,
    req.body?.id,
  ].filter((value) => value !== undefined && value !== null);

  return candidateIds.length > 0 ? String(candidateIds[0]) : null;
};

const isPatientSelf = (req) => {
  const userId = req.user?._id || req.user?.id || null;
  const ownershipId = findOwnershipId(req);
  if (!userId || !ownershipId) return false;
  return String(userId) === String(ownershipId);
};

export const requireRole = (...allowedRoles) => {
  const roles = normalizeRoles(allowedRoles);

  return (req, res, next) => {
    const userRole = extractUserRole(req);

    if (!userRole) {
      logger.debug("rbac.requireRole", "Access denied: missing req.user");
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        data: null,
      });
    }

    if (!roles.includes(userRole)) {
      logger.debug("rbac.requireRole", "Access denied: role not permitted", {
        allowedRoles: roles,
        deniedRole: userRole,
      });
      return res.status(403).json({
        success: false,
        message: "Forbidden: insufficient role",
        data: null,
      });
    }

    return next();
  };
};

export const requireOwnershipOrRole = ({
  roles = [],
  allowPatientSelf = false,
} = {}) => {
  const allowedRoles = normalizeRoles(roles);

  return (req, res, next) => {
    const userRole = extractUserRole(req);
    const userId = req.user?._id || req.user?.id || null;
    const ownershipId = findOwnershipId(req);
    const patientSelfAllowed =
      allowPatientSelf && userRole === "patient" && isPatientSelf(req);

    if (!userRole) {
      logger.debug(
        "rbac.requireOwnershipOrRole",
        "Access denied: missing req.user",
      );
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        data: null,
      });
    }

    if (allowedRoles.includes(userRole)) {
      return next();
    }

    if (patientSelfAllowed) {
      return next();
    }

    logger.debug(
      "rbac.requireOwnershipOrRole",
      "Access denied: insufficient role or ownership",
      {
        allowedRoles,
        userRole,
        userId,
        ownershipId,
      },
    );

    return res.status(403).json({
      success: false,
      message: "Forbidden: insufficient permissions",
      data: null,
    });
  };
};
