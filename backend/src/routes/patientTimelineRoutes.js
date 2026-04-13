import express from "express";
import { universalAuth } from "../middleware/universalAuth.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { ROLES } from "../constants/roles.js";
import { getPatientTimeline } from "../controllers/patientTimelineController.js";

const router = express.Router();

/**
 * @route   GET /api/patient/timeline
 * @desc    Get patient's aggregated medical timeline (appointments + prescriptions)
 * @access  Private (Patient only)
 */
router.get(
  "/timeline",
  universalAuth,
  requireRole(ROLES.PATIENT),
  getPatientTimeline,
);

export default router;
