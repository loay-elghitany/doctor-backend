import express from "express";
import { universalAuth } from "../middleware/universalAuth.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { ROLES } from "../constants/roles.js";
import {
  getDoctorPatientTimeline,
  addDoctorNote,
} from "../controllers/doctorTimelineController.js";

const router = express.Router();

/**
 * @route   GET /api/doctor/patients/:patientId/timeline
 * @desc    Get complete medical timeline for a specific patient
 * @access  Private (Doctor only)
 * @params  patientId - Patient ID
 */
router.get(
  "/:patientId/timeline",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  getDoctorPatientTimeline,
);

/**
 * @route   POST /api/doctor/patients/:patientId/timeline-note
 * @desc    Add a doctor note to patient timeline
 * @access  Private (Doctor only)
 * @body    { noteContent: string, appointmentId?: ObjectId }
 */
router.post(
  "/:patientId/timeline-note",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  addDoctorNote,
);

export default router;
