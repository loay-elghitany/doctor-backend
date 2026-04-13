import Patient from "../models/Patient.js";
import logger from "../utils/logger.js";



/**
 * Tenant scope middleware logging guidance:
 * - Only unexpected errors should be logged.
 * - Avoid noisy logs on normal tenant resolution paths.
 */

/**
 * Tenant scope middleware for patient appointment routes
 * Sets req.patientId and req.tenantId based on authenticated patient
 *
 * req.patientId: Patient's unique ID (for filtering patient-specific data)
 * req.tenantId: Doctor's ID (for multi-tenant clinic separation)
 *
 * Doctor resolution strategy:
 * 1. If doctorId provided in request body → use it (explicit override)
 * 2. If JWT contains doctorId → use it
 * 3. Otherwise → reject with 400
 *
 * Used by: /api/appointments (POST, GET), /api/appointments/:id/choose-time (PATCH)
 *
 * Note: This middleware must come AFTER protect middleware
 * so that req.user is already populated
 */
export const tenantScope = async (req, res, next) => {
  // Ensure patient is authenticated (protect middleware must run first)
  if (!req.user || !req.user._id) {
    return res.status(401).json({
      success: false,
      message: "Not authenticated",
      data: null,
    });
  }

  // Set patientId to the authenticated patient's ID
  req.patientId = req.user._id;

  try {
    // Strategy 1: Check if doctorId explicitly provided in request body
    if (req.body && req.body.doctorId) {
      req.tenantId = req.body.doctorId;
      return next();
    }

    // Strategy 2: Use the authenticated user's explicit doctorId.
    if (req.user.doctorId) {
      req.tenantId = req.user.doctorId;
      return next();
    }

    // Strategy 4: No doctor found - reject
    return res.status(400).json({
      success: false,
      message:
        "Unable to determine clinic doctor. Please ensure your clinic is properly configured.",
      data: null,
    });
  } catch (error) {
    logger.error("tenantScope", "Tenant scope error", error);
    return res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
};
