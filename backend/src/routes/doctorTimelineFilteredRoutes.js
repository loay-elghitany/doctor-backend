import express from "express";
import {
  getDoctorPatientsTimelineFiltered,
  searchPatientEvents,
  getDoctorTimelineStats,
  markTimelineEventsAsRead,
} from "../controllers/doctorTimelineFilteredController.js";
import { protectDoctor } from "../middleware/doctorAuthMiddleware.js";

const router = express.Router();

/**
 * Enhanced Doctor Timeline Routes
 * All routes require doctor authentication
 */

// Get filtered doctor timeline with advanced search
router.get("/filtered", protectDoctor, getDoctorPatientsTimelineFiltered);

// Search patient events
router.get("/search", protectDoctor, searchPatientEvents);

// Get timeline statistics
router.get("/stats", protectDoctor, getDoctorTimelineStats);

// Mark events as read (update last viewed timestamp)
router.post("/mark-read", protectDoctor, markTimelineEventsAsRead);

export default router;
