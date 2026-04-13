import express from "express";
import {
  getNotificationHistory,
  getNotificationDetails,
  markNotificationAsRead,
  getNotificationStats,
  deleteNotification,
  getAllNotifications,
} from "../controllers/notificationController.js";
import { universalAuth } from "../middleware/universalAuth.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

/**
 * PATIENT NOTIFICATION ROUTES
 * All routes accessible to authenticated patients
 */

/**
 * GET /api/notifications
 * Get notification history for logged-in user (patient or doctor)
 * Query params: status, type, limit, offset
 * Middleware: protect or protectDoctor (both patient and doctor access)
 * Returns: 200 with paginated notifications array
 */
router.get(
  "/",
  universalAuth,
  requireRole(ROLES.PATIENT, ROLES.DOCTOR),
  getNotificationHistory,
);

/**
 * GET /api/notifications/stats
 * Get notification statistics (count by status and type)
 * Middleware: protect or protectDoctor
 * Returns: 200 with stats object
 */
router.get(
  "/stats",
  universalAuth,
  requireRole(ROLES.PATIENT, ROLES.DOCTOR),
  getNotificationStats,
);

/**
 * GET /api/notifications/:notificationId
 * Get detailed information about a specific notification
 * Middleware: protect or protectDoctor with ownership verification
 * Returns: 200 with notification details or 404 if not found
 */
router.get(
  "/:notificationId",
  universalAuth,
  requireRole(ROLES.PATIENT, ROLES.DOCTOR),
  getNotificationDetails,
);

/**
 * PATCH /api/notifications/:notificationId/read
 * Mark notification as read
 * Middleware: protect or protectDoctor
 * Returns: 200 with updated notification or 404 if not found
 */
router.patch(
  "/:notificationId/read",
  universalAuth,
  requireRole(ROLES.PATIENT, ROLES.DOCTOR),
  markNotificationAsRead,
);

/**
 * DELETE /api/notifications/:notificationId
 * Soft delete notification (won't be visible to user)
 * Middleware: protect or protectDoctor with ownership verification
 * Returns: 200 with deleted notification ID or 404 if not found
 */
router.delete(
  "/:notificationId",
  universalAuth,
  requireRole(ROLES.PATIENT, ROLES.DOCTOR),
  deleteNotification,
);

/**
 * ADMIN ROUTES
 * Requires admin authentication
 */

/**
 * GET /api/admin/notifications
 * Get all notifications across all users (for monitoring/debugging)
 * Query params: status, type, recipientType, limit, offset
 * Middleware: Admin authentication (to be implemented)
 * Returns: 200 with all notifications
 */
router.get("/admin/all", getAllNotifications); // TODO: Add admin auth middleware

export default router;
