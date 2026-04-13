import Patient from "../models/Patient.js";

import { ROLES } from "../constants/roles.js";
import logger from "../utils/logger.js";


/**
 * Tenant enforcement logging guidance:
 * - Do not log tenant resolution success in production.
 * - Only log failures when tenant cannot be resolved.
 */

export const resolveTenantId = async (req) => {
  if (!req.user || !req.user.role) {
    return null;
  }

  const role = req.user.role;
  // Development debug: tenant resolution details are only logged when DEBUG=true

  switch (role) {
    case ROLES.DOCTOR:
      return req.user._id || req.user.id || null;

    case ROLES.SECRETARY:
      return req.user.doctorId || null;

    case ROLES.PATIENT: {
      // Only use the authenticated patient's explicit doctorId.
      // assignedDoctorId is deprecated and no longer trusted for tenant resolution.
      return req.user.doctorId || null;
    }

    default:
      return null;
  }
};

export const enforceTenant = async (req, res, next) => {
  const tenantId = await resolveTenantId(req);

  if (!tenantId) {
    logger.debug("enforceTenant", "Tenant resolution failed", {
      role: req.user?.role || null,
    });
    return res.status(400).json({
      success: false,
      message: "Unable to determine tenant doctor for this request.",
      data: null,
    });
  }

  req.tenantId = tenantId;
  return next();
};
