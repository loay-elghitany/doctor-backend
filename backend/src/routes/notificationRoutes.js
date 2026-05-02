import express from "express";
import {
  getNotificationHistory,
  getNotificationDetails,
  markNotificationAsRead,
  getNotificationStats,
  deleteNotification,
  getAllNotifications,
  // In-app notification functions
  getInAppNotifications,
  getInAppUnreadCount,
  markInAppNotificationAsRead,
  markAllInAppNotificationsAsRead,
  deleteInAppNotification,
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
 * =============================================================================
 * IN-APP REAL-TIME NOTIFICATION ROUTES (Persistent)
 * These MUST be defined BEFORE /:notificationId to avoid route conflicts
 * =============================================================================
 */

/**
 * GET /api/notifications/inapp
 * Get in-app notifications for logged-in user
 * Query params: limit, skip, unreadOnly
 */
router.get("/inapp", universalAuth, getInAppNotifications);

/**
 * GET /api/notifications/inapp/unread-count
 * Get unread count for current user
 */
router.get("/inapp/unread-count", universalAuth, getInAppUnreadCount);

/**
 * PATCH /api/notifications/inapp/mark-all-read
 * Mark all notifications as read
 * NOTE: Must be before /inapp/:id/read to avoid conflict
 */
router.patch(
  "/inapp/mark-all-read",
  universalAuth,
  markAllInAppNotificationsAsRead,
);

/**
 * PATCH /api/notifications/inapp/:id/read
 * Mark single notification as read
 */
router.patch("/inapp/:id/read", universalAuth, markInAppNotificationAsRead);

/**
 * DELETE /api/notifications/inapp/:id
 * Soft delete notification
 */
router.delete("/inapp/:id", universalAuth, deleteInAppNotification);

/**
 * ADMIN ROUTES
 * Requires admin authentication
 */

/**
 * GET /api/admin/notifications
 * Get all notifications across all users (for monitoring/debugging)
 */
router.get("/admin/all", getAllNotifications); // TODO: Add admin auth middleware

/**
 * GET /api/notifications
 * Get notification history for logged-in user (patient or doctor)
 * Query params: status, type, limit, offset
 */
router.get(
  "/",
  universalAuth,
  requireRole(ROLES.PATIENT, ROLES.DOCTOR, ROLES.SECRETARY),
  getNotificationHistory,
);

/**
 * GET /api/notifications/stats
 * Get notification statistics (count by status and type)
 */
router.get(
  "/stats",
  universalAuth,
  requireRole(ROLES.PATIENT, ROLES.DOCTOR, ROLES.SECRETARY),
  getNotificationStats,
);

/**
 * GET /api/notifications/:notificationId
 * Get detailed information about a specific notification
 */
router.get(
  "/:notificationId",
  universalAuth,
  requireRole(ROLES.PATIENT, ROLES.DOCTOR, ROLES.SECRETARY),
  getNotificationDetails,
);

/**
 * PATCH /api/notifications/:notificationId/read
 * Mark notification as read
 */
router.patch(
  "/:notificationId/read",
  universalAuth,
  requireRole(ROLES.PATIENT, ROLES.DOCTOR, ROLES.SECRETARY),
  markNotificationAsRead,
);

/**
 * DELETE /api/notifications/:notificationId
 * Soft delete notification (won't be visible to user)
 */
router.delete(
  "/:notificationId",
  universalAuth,
  requireRole(ROLES.PATIENT, ROLES.DOCTOR, ROLES.SECRETARY),
  deleteNotification,
);

export default router;
