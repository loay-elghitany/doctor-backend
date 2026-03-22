import express from "express";
import {
  getAdvancedAnalytics,
  getNotificationTrends,
  exportAnalyticsCSV,
} from "../controllers/adminAnalyticsController.js";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";

const router = express.Router();

/**
 * Admin Analytics Routes
 * All routes require admin authentication
 * Provides advanced analytics and reporting
 */

// Get advanced analytics dashboard
router.get("/", protectAdmin, getAdvancedAnalytics);

// Get notification trends (daily/weekly/monthly)
router.get("/trends", protectAdmin, getNotificationTrends);

// Export analytics to CSV
router.get("/export", protectAdmin, exportAnalyticsCSV);

export default router;
