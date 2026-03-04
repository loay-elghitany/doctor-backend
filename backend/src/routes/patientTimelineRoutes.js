import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getPatientTimeline } from "../controllers/patientTimelineController.js";

const router = express.Router();

/**
 * @route   GET /api/patient/timeline
 * @desc    Get patient's aggregated medical timeline (appointments + prescriptions)
 * @access  Private (Patient only)
 */
router.get("/timeline", protect, getPatientTimeline);

export default router;
