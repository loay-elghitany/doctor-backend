import Notification from "../models/Notification.js";
import Doctor from "../models/Doctor.js";
import Patient from "../models/Patient.js";
import logger from "../utils/logger.js";



/**
 * Admin: Get all notifications with advanced filtering
 * Requires admin authentication
 * Supports filtering by doctor, patient, type, status, date range, and more
 */
export const getAdminNotifications = async (req, res) => {
  try {
    // Get query parameters
    const {
      doctorId,
      patientId,
      type,
      status,
      startDate,
      endDate,
      recipientType, // "Patient" or "Doctor"
      limit = 100,
      offset = 0,
      sortBy = "createdAt", // createdAt, sentAt, status
      sortOrder = "desc", // asc, desc
    } = req.query;

    // Build query
    const query = { isDeleted: { $ne: true } };

    // Filter by doctor
    if (doctorId) {
      query.doctorId = doctorId;
    }

    // Filter by patient (recipient for patient notifications)
    if (patientId) {
      query.patientId = patientId;
    }

    // Filter by type
    if (type) {
      query.type = type;
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by recipient type
    if (recipientType) {
      query.recipientType = recipientType;
    }

    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    logger.debug("getAdminNotifications", "Fetching notifications", {
      filters: { doctorId, patientId, type, status, recipientType },
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

    // Get total count
    const total = await Notification.countDocuments(query);

    // Determine sort order
    const sortOptions = {};
    const sortField =
      sortBy === "sentAt"
        ? "sentAt"
        : sortBy === "status"
          ? "status"
          : "createdAt";
    const direction = sortOrder === "asc" ? 1 : -1;
    sortOptions[sortField] = direction;

    // Get paginated results with population
    const notifications = await Notification.find(query)
      .populate({
        path: "recipientId",
        select: "name email phoneNumber",
      })
      .populate({
        path: "appointmentId",
        select: "date timeSlot status",
      })
      .populate({
        path: "prescriptionId",
        select: "medications diagnosis",
      })
      .populate({
        path: "doctorId",
        select: "name email",
      })
      .populate({
        path: "patientId",
        select: "name email",
      })
      .sort(sortOptions)
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    // Calculate statistics
    const stats = await getNotificationStats(query);

    res.json({
      success: true,
      data: {
        notifications: notifications.map((n) => ({
          ...n,
          // Mask phone number for security
          phoneNumber: maskPhoneNumber(n.phoneNumber),
        })),
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + parseInt(limit) < total,
        },
        stats,
      },
    });
  } catch (error) {
    logger.error(
      "getAdminNotifications",
      "Error fetching admin notifications",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      data: null,
    });
  }
};

/**
 * Admin: Get notification statistics for dashboard
 */
export const getAdminNotificationStats = async (req, res) => {
  try {
    const { doctorId, patientId, startDate, endDate } = req.query;

    // Build query
    const query = { isDeleted: { $ne: true } };

    if (doctorId) query.doctorId = doctorId;
    if (patientId) query.patientId = patientId;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    logger.debug("getAdminNotificationStats", "Calculating statistics", {
      doctorId,
      patientId,
    });

    // Count by status
    const statusCounts = await Notification.aggregate([
      { $match: query },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    // Count by type
    const typeCounts = await Notification.aggregate([
      { $match: query },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]);

    // Count by recipient type
    const recipientCounts = await Notification.aggregate([
      { $match: query },
      { $group: { _id: "$recipientType", count: { $sum: 1 } } },
    ]);

    // Get retry statistics
    const retryStats = await Notification.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalRetries: { $sum: "$retryCount" },
          maxRetries: { $max: "$retryCount" },
          avgRetries: { $avg: "$retryCount" },
        },
      },
    ]);

    // Get delivery time stats (for sent notifications)
    const deliveryTimes = await Notification.aggregate([
      { $match: { ...query, status: "sent" } },
      {
        $addFields: {
          deliveryTime: {
            $subtract: ["$sentAt", "$createdAt"],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgDeliveryTime: { $avg: "$deliveryTime" },
          minDeliveryTime: { $min: "$deliveryTime" },
          maxDeliveryTime: { $max: "$deliveryTime" },
        },
      },
    ]);

    const stats = {
      total: await Notification.countDocuments(query),
      byStatus: {},
      byType: {},
      byRecipient: {},
      retries: retryStats[0] || {
        totalRetries: 0,
        maxRetries: 0,
        avgRetries: 0,
      },
      delivery: deliveryTimes[0] || {
        avgDeliveryTime: 0,
        minDeliveryTime: 0,
        maxDeliveryTime: 0,
      },
    };

    statusCounts.forEach((item) => {
      stats.byStatus[item._id] = item.count;
    });

    typeCounts.forEach((item) => {
      stats.byType[item._id] = item.count;
    });

    recipientCounts.forEach((item) => {
      stats.byRecipient[item._id] = item.count;
    });

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    logger.error(
      "getAdminNotificationStats",
      "Error calculating statistics",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to calculate statistics",
      data: null,
    });
  }
};

/**
 * Admin: Retry failed notifications manually
 */
export const retryFailedNotifications = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    logger.debug("retryFailedNotifications", "Retrying failed notifications", {
      limit,
    });

    const failedNotifications = await Notification.find({
      status: "failed",
      retryCount: { $lt: 3 },
      isDeleted: { $ne: true },
    })
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    logger.debug("retryFailedNotifications", "Found failed notifications", {
      count: failedNotifications.length,
    });

    // Note: Actual retry logic should be implemented in the notification service
    // This endpoint just marks them for retry
    const retried = await Notification.updateMany(
      {
        _id: { $in: failedNotifications.map((n) => n._id) },
      },
      {
        $set: { status: "pending" },
        $inc: { retryCount: 1 },
      },
    );

    res.json({
      success: true,
      data: {
        retriedCount: retried.modifiedCount,
        totalScanned: failedNotifications.length,
      },
    });
  } catch (error) {
    logger.error(
      "retryFailedNotifications",
      "Error retrying notifications",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to retry notifications",
      data: null,
    });
  }
};

/**
 * Admin: Export notifications to CSV (future use)
 */
export const exportNotifications = async (req, res) => {
  try {
    const { doctorId, patientId, type, status, startDate, endDate } = req.query;

    // Build query
    const query = { isDeleted: { $ne: true } };

    if (doctorId) query.doctorId = doctorId;
    if (patientId) query.patientId = patientId;
    if (type) query.type = type;
    if (status) query.status = status;

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    logger.debug("exportNotifications", "Exporting notifications", {
      filters: { doctorId, patientId, type, status },
    });

    const notifications = await Notification.find(query)
      .populate("recipientId", "name email")
      .populate("doctorId", "name")
      .populate("patientId", "name")
      .lean()
      .limit(10000);

    // Format as CSV
    const headers = [
      "ID",
      "Type",
      "Recipient",
      "Phone",
      "Status",
      "Sent At",
      "Created At",
      "Doctor",
      "Patient",
      "Retry Count",
    ];

    const rows = notifications.map((n) => [
      n._id,
      n.type,
      n.recipientType,
      maskPhoneNumber(n.phoneNumber),
      n.status,
      n.sentAt || "PENDING",
      n.createdAt,
      n.doctorId?.name || "N/A",
      n.patientId?.name || "N/A",
      n.retryCount,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=notifications.csv",
    );
    res.send(csv);
  } catch (error) {
    logger.error("exportNotifications", "Error exporting notifications", error);
    res.status(500).json({
      success: false,
      message: "Failed to export notifications",
      data: null,
    });
  }
};

/**
 * Helper: Get notification statistics
 */
async function getNotificationStats(query) {
  const statusCounts = await Notification.aggregate([
    { $match: query },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);

  const typeCounts = await Notification.aggregate([
    { $match: query },
    { $group: { _id: "$type", count: { $sum: 1 } } },
  ]);

  const stats = {
    byStatus: {},
    byType: {},
  };

  statusCounts.forEach((item) => {
    stats.byStatus[item._id] = item.count;
  });

  typeCounts.forEach((item) => {
    stats.byType[item._id] = item.count;
  });

  return stats;
}

/**
 * Helper: Mask phone number for security
 */
function maskPhoneNumber(phone) {
  if (!phone) return "N/A";
  const cleaned = phone.replace(/[-.\s()]/g, "");
  const start = cleaned.substring(0, 4);
  const end = cleaned.substring(cleaned.length - 3);
  return `${start}${"*".repeat(cleaned.length - 7)}${end}`;
}
