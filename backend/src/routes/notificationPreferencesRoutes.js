import express from "express";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  toggleNotificationType,
} from "../controllers/notificationPreferencesController.js";
import { universalAuth } from "../middleware/universalAuth.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { ROLES } from "../constants/roles.js";
const router = express.Router();

/**
 * Notification Preferences Routes
 * User-facing endpoints for managing notification preferences
 * Patient: uses protect
 * Doctor: uses protectDoctor
 */

// Get current preferences
router.get(
  "/",
  universalAuth,
  requireRole(ROLES.PATIENT, ROLES.DOCTOR),
  getNotificationPreferences,
);

// Update preferences
router.put(
  "/",
  universalAuth,
  requireRole(ROLES.PATIENT, ROLES.DOCTOR),
  updateNotificationPreferences,
);

// Toggle specific notification type
router.post(
  "/toggle",
  universalAuth,
  requireRole(ROLES.PATIENT, ROLES.DOCTOR),
  toggleNotificationType,
);

export default router;
