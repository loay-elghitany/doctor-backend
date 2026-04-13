import express from "express";
import {
  getPatientTimelineFiltered,
  getPatientTimelineStats,
} from "../controllers/patientTimelineFilteredController.js";
import { universalAuth } from "../middleware/universalAuth.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

/**
 * Enhanced Patient Timeline Routes
 * All routes require patient authentication
 */

// Get filtered patient timeline with search and pagination
router.get(
  "/filtered",
  universalAuth,
  requireRole(ROLES.PATIENT),
  getPatientTimelineFiltered,
);

// Get timeline statistics
router.get(
  "/stats",
  universalAuth,
  requireRole(ROLES.PATIENT),
  getPatientTimelineStats,
);

export default router;
