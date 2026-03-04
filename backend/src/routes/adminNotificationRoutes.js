import express from "express";
import {
  getAdminNotifications,
  getAdminNotificationStats,
  retryFailedNotifications,
  exportNotifications,
} from "../controllers/adminNotificationController.js";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";

const router = express.Router();

/**
 * Admin notification routes
 * All routes require admin authentication
 */

// Get all notifications with advanced filtering
router.get("/", protectAdmin, getAdminNotifications);

// Get notification statistics
router.get("/stats", protectAdmin, getAdminNotificationStats);

// Retry failed notifications
router.post("/retry", protectAdmin, retryFailedNotifications);

// Export notifications
router.get("/export", protectAdmin, exportNotifications);

export default router;
