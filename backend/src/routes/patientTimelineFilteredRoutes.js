import express from "express";
import {
  getPatientTimelineFiltered,
  getPatientTimelineStats,
} from "../controllers/patientTimelineFilteredController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

/**
 * Enhanced Patient Timeline Routes
 * All routes require patient authentication
 */

// Get filtered patient timeline with search and pagination
router.get("/filtered", protect, getPatientTimelineFiltered);

// Get timeline statistics
router.get("/stats", protect, getPatientTimelineStats);

export default router;
