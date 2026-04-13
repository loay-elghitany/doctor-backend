import express from "express";
import { universalAuth } from "../middleware/universalAuth.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { ROLES } from "../constants/roles.js";
import { tenantScope } from "../middleware/tenantScope.js";
import {
  getUpcomingAppointments,
  getGroupedAppointments,
} from "../controllers/appointmentViewController.js";

const router = express.Router();

/**
 * @route   GET /api/views/appointments/upcoming
 * @desc    Get all upcoming appointments for the logged-in patient
 * @access  Private (Patient)
 */
router.get(
  "/appointments/upcoming",
  universalAuth,
  requireRole(ROLES.PATIENT),
  tenantScope,
  getUpcomingAppointments,
);

/**
 * @route   GET /api/views/appointments/grouped
 * @desc    Get all appointments for the logged-in doctor, grouped by status
 * @access  Private (Doctor)
 */
router.get(
  "/appointments/grouped",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  getGroupedAppointments,
);

export default router;
