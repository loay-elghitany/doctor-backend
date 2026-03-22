import express from "express";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  toggleNotificationType,
} from "../controllers/notificationPreferencesController.js";
import { protect } from "../middleware/authMiddleware.js";
import { protectDoctor } from "../middleware/doctorAuthMiddleware.js";
const router = express.Router();

/**
 * Notification Preferences Routes
 * User-facing endpoints for managing notification preferences
 * Patient: uses protect
 * Doctor: uses protectDoctor
 */

// Get current preferences
router.get("/", [protect, protectDoctor], getNotificationPreferences);

// Update preferences
router.put("/", [protect, protectDoctor], updateNotificationPreferences);

// Toggle specific notification type
router.post("/toggle", [protect, protectDoctor], toggleNotificationType);

export default router;
