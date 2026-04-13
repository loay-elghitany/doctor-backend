import express from "express";
import {
  getDoctorPatientsTimelineFiltered,
  searchPatientEvents,
  getDoctorTimelineStats,
  markTimelineEventsAsRead,
} from "../controllers/doctorTimelineFilteredController.js";
import { universalAuth } from "../middleware/universalAuth.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

/**
 * Enhanced Doctor Timeline Routes
 * All routes require doctor authentication
 */

// Get filtered doctor timeline with advanced search
router.get(
  "/filtered",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  getDoctorPatientsTimelineFiltered,
);

// Search patient events
router.get(
  "/search",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  searchPatientEvents,
);

// Get timeline statistics
router.get(
  "/stats",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  getDoctorTimelineStats,
);

// Mark events as read (update last viewed timestamp)
router.post(
  "/mark-read",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  markTimelineEventsAsRead,
);

export default router;
