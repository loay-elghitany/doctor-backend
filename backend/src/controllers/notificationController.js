import Notification from "../models/Notification.js";
import { debugLog, debugError } from "../utils/debug.js";

/**
 * Get notification history for authenticated user
 * Supports both doctor and patient contexts
 */
export const getNotificationHistory = async (req, res) => {
  try {
    // Determine user type and ID
    const isDoctor = !!req.doctor;
    const userId = isDoctor ? req.doctor._id : req.patientId;
    const userType = isDoctor ? "Doctor" : "Patient";

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: null,
      });
    }

    debugLog("getNotificationHistory", "Fetching notifications", {
      userId,
      userType,
    });

    // Get query parameters for pagination and filtering
    const { status, type, limit = 50, offset = 0 } = req.query;
    const query = {
      recipientId: userId,
      recipientType: userType,
      isDeleted: { $ne: true },
    };

    // Filter by status if provided
    if (status) {
      query.status = status;
    }

    // Filter by type if provided
    if (type) {
      query.type = type;
    }

    // Get total count
    const total = await Notification.countDocuments(query);

    // Get paginated results
    const notifications = await Notification.find(query)
      .populate("appointmentId")
      .populate("prescriptionId")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    res.json({
      success: true,
      data: {
        notifications,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
        },
      },
    });
  } catch (error) {
    debugError(
      "getNotificationHistory",
      "Error fetching notification history",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch notification history",
      data: null,
    });
  }
};

/**
 * Get single notification details
 */
export const getNotificationDetails = async (req, res) => {
  try {
    const { notificationId } = req.params;

    // Verify user owns this notification
    const isDoctor = !!req.doctor;
    const userId = isDoctor ? req.doctor._id : req.patientId;
    const userType = isDoctor ? "Doctor" : "Patient";

    debugLog("getNotificationDetails", "Fetching notification", {
      notificationId,
      userId,
    });

    const notification = await Notification.findOne({
      _id: notificationId,
      recipientId: userId,
      recipientType: userType,
      isDeleted: { $ne: true },
    })
      .populate("appointmentId")
      .populate("prescriptionId")
      .populate("doctorId")
      .populate("patientId");

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
        data: null,
      });
    }

    res.json({
      success: true,
      data: notification,
    });
  } catch (error) {
    debugError(
      "getNotificationDetails",
      "Error fetching notification details",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch notification details",
      data: null,
    });
  }
};

/**
 * Mark notification as read (soft update)
 * For future use: can track which notifications user has viewed
 */
export const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    // Verify user owns this notification
    const isDoctor = !!req.doctor;
    const userId = isDoctor ? req.doctor._id : req.patientId;
    const userType = isDoctor ? "Doctor" : "Patient";

    debugLog("markNotificationAsRead", "Marking as read", {
      notificationId,
      userId,
    });

    const notification = await Notification.findOne({
      _id: notificationId,
      recipientId: userId,
      recipientType: userType,
      isDeleted: { $ne: true },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
        data: null,
      });
    }

    // Add metadata to track read status
    notification.metadata = notification.metadata || {};
    notification.metadata.readAt = new Date();
    await notification.save();

    res.json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    debugError(
      "markNotificationAsRead",
      "Error marking notification as read",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
      data: null,
    });
  }
};

/**
 * Get notification statistics for user
 * Returns counts by status and type
 */
export const getNotificationStats = async (req, res) => {
  try {
    const isDoctor = !!req.doctor;
    const userId = isDoctor ? req.doctor._id : req.patientId;
    const userType = isDoctor ? "Doctor" : "Patient";

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: null,
      });
    }

    debugLog("getNotificationStats", "Fetching statistics", {
      userId,
      userType,
    });

    // Count by status
    const statusCounts = await Notification.aggregate([
      {
        $match: {
          recipientId: userId,
          recipientType: userType,
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Count by type
    const typeCounts = await Notification.aggregate([
      {
        $match: {
          recipientId: userId,
          recipientType: userType,
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
    ]);

    const stats = {
      byStatus: {},
      byType: {},
      total: 0,
    };

    statusCounts.forEach((item) => {
      stats.byStatus[item._id] = item.count;
      stats.total += item.count;
    });

    typeCounts.forEach((item) => {
      stats.byType[item._id] = item.count;
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    debugError(
      "getNotificationStats",
      "Error fetching notification statistics",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch notification statistics",
      data: null,
    });
  }
};

/**
 * Delete notification (soft delete)
 */
export const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    // Verify user owns this notification
    const isDoctor = !!req.doctor;
    const userId = isDoctor ? req.doctor._id : req.patientId;
    const userType = isDoctor ? "Doctor" : "Patient";

    debugLog("deleteNotification", "Deleting notification", {
      notificationId,
      userId,
    });

    const notification = await Notification.findOne({
      _id: notificationId,
      recipientId: userId,
      recipientType: userType,
      isDeleted: { $ne: true },
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
        data: null,
      });
    }

    notification.isDeleted = true;
    notification.deletedAt = new Date();
    await notification.save();

    res.json({
      success: true,
      message: "Notification deleted",
      data: { id: notification._id },
    });
  } catch (error) {
    debugError("deleteNotification", "Error deleting notification", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete notification",
      data: null,
    });
  }
};

/**
 * Admin: Get all notifications (for monitoring/debugging)
 * Requires admin authentication
 */
export const getAllNotifications = async (req, res) => {
  try {
    // This endpoint should only be accessible to admins
    // For now, return 403 unless admin auth is added
    if (!req.admin) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions. Admin access required.",
        data: null,
      });
    }

    const { status, type, recipientType, limit = 100, offset = 0 } = req.query;
    const query = { isDeleted: { $ne: true } };

    if (status) query.status = status;
    if (type) query.type = type;
    if (recipientType) query.recipientType = recipientType;

    const total = await Notification.countDocuments(query);

    const notifications = await Notification.find(query)
      .populate("recipientId")
      .populate("appointmentId")
      .populate("prescriptionId")
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    res.json({
      success: true,
      data: {
        notifications,
        pagination: { total, limit: parseInt(limit), offset: parseInt(offset) },
      },
    });
  } catch (error) {
    debugError(
      "getAllNotifications",
      "Error fetching all notifications",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      data: null,
    });
  }
};
