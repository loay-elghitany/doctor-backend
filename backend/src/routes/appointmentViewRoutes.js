import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { tenantScope } from "../middleware/tenantScope.js";
import { protectDoctor } from "../middleware/doctorAuthMiddleware.js";
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
router.get("/appointments/upcoming", protect, tenantScope, getUpcomingAppointments);

/**
 * @route   GET /api/views/appointments/grouped
 * @desc    Get all appointments for the logged-in doctor, grouped by status
 * @access  Private (Doctor)
 */
router.get("/appointments/grouped", protectDoctor, getGroupedAppointments);

export default router;
