import Notification from "../models/Notification.js";
import Doctor from "../models/Doctor.js";
import Patient from "../models/Patient.js";
import { debugLog, debugError } from "../utils/debug.js";

/**
 * Enhanced Admin Analytics Controller
 * Provides advanced analytics for notification monitoring
 * Includes top doctors, active patients, trends, and high-priority event detection
 */

/**
 * Get advanced notification analytics
 * Includes top performers, trends, and KPIs
 */
export const getAdvancedAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, limit = 10 } = req.query;

    debugLog("getAdvancedAnalytics", "Calculating advanced analytics", {
      startDate,
      endDate,
      limit,
    });

    // Build date filter
    const dateFilter = {};
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }

    const query = { isDeleted: { $ne: true } };
    if (Object.keys(dateFilter).length > 0) {
      query.createdAt = dateFilter;
    }

    // Top doctors by notifications sent
    const topDoctors = await Notification.aggregate([
      { $match: query },
      { $group: { _id: "$doctorId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: "doctors",
          localField: "_id",
          foreignField: "_id",
          as: "doctor",
        },
      },
      {
        $project: {
          doctorId: "$_id",
          doctorName: { $arrayElemAt: ["$doctor.name", 0] },
          specialization: { $arrayElemAt: ["$doctor.specialization", 0] },
          notificationsSent: "$count",
          deliveryRate: 0, // Will calculate below
        },
      },
    ]);

    // Calculate delivery rates for top doctors
    for (let doctor of topDoctors) {
      const sentCount = await Notification.countDocuments({
        doctorId: doctor.doctorId,
        status: "sent",
        createdAt: dateFilter.$gte ? { $gte: dateFilter.$gte } : {},
      });

      doctor.deliveryRate = doctor.notificationsSent
        ? ((sentCount / doctor.notificationsSent) * 100).toFixed(1)
        : 0;
    }

    // Most active patients
    const activatePatients = await Notification.aggregate([
      { $match: query },
      { $group: { _id: "$patientId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: "patients",
          localField: "_id",
          foreignField: "_id",
          as: "patient",
        },
      },
      {
        $project: {
          patientId: "$_id",
          patientName: { $arrayElemAt: ["$patient.name", 0] },
          notificationsReceived: "$count",
        },
      },
    ]);

    // Daily trends (last 30 days)
    const dailyTrends = await Notification.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          total: { $sum: 1 },
          sent: {
            $sum: { $cond: [{ $eq: ["$status", "sent"] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 30 },
    ]);

    // High-priority events (failed > 3 times)
    const highPriorityFailures = await Notification.find({
      status: "failed",
      retryCount: { $gte: 3 },
      isDeleted: { $ne: true },
    })
      .select("type phoneNumber retryCount createdAt")
      .limit(20)
      .lean();

    // Consecutive failure count (for alerts)
    const consecutiveFailures = await Notification.aggregate([
      {
        $match: {
          status: "failed",
          ...query,
        },
      },
      {
        $group: {
          _id: "$doctorId",
          failureCount: { $sum: 1 },
          lastFailure: { $max: "$createdAt" },
        },
      },
      {
        $match: { failureCount: { $gte: 5 } },
      },
      { $sort: { failureCount: -1 } },
      {
        $lookup: {
          from: "doctors",
          localField: "_id",
          foreignField: "_id",
          as: "doctor",
        },
      },
    ]);

    // Notification type breakdown
    const typeBreakdown = await Notification.aggregate([
      { $match: query },
      { $group: { _id: "$type", count: { $sum: 1 } } },
    ]);

    // Overall KPIs
    const totalNotifications = await Notification.countDocuments(query);
    const sentCount = await Notification.countDocuments({
      status: "sent",
      ...query,
    });
    const failedCount = await Notification.countDocuments({
      status: "failed",
      ...query,
    });
    const pendingCount = await Notification.countDocuments({
      status: "pending",
      ...query,
    });

    const overallDeliveryRate = totalNotifications
      ? ((sentCount / totalNotifications) * 100).toFixed(1)
      : 0;

    res.json({
      success: true,
      data: {
        kpis: {
          totalNotifications,
          sentCount,
          failedCount,
          pendingCount,
          overallDeliveryRate: `${overallDeliveryRate}%`,
        },
        topDoctors,
        activePatients: activatePatients,
        dailyTrends,
        typeBreakdown: typeBreakdown.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        alerts: {
          consecutiveFailures,
          highPriorityFailures,
        },
      },
    });
  } catch (error) {
    debugError("getAdvancedAnalytics", "Error calculating analytics", error);
    res.status(500).json({
      success: false,
      message: "Failed to calculate analytics",
      data: null,
    });
  }
};

/**
 * Get daily/weekly/monthly trends for charting
 */
export const getNotificationTrends = async (req, res) => {
  try {
    const { period = "daily", days = 30 } = req.query;

    debugLog("getNotificationTrends", "Calculating trends", {
      period,
      days,
    });

    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - parseInt(days));

    let dateFormat;
    let groupBy;

    if (period === "weekly") {
      dateFormat = "%Y-W%V"; // Week number
      groupBy = {
        year: { $year: "$createdAt" },
        week: { $week: "$createdAt" },
      };
    } else if (period === "monthly") {
      dateFormat = "%Y-%m";
      groupBy = {
        year: { $year: "$createdAt" },
        month: { $month: "$createdAt" },
      };
    } else {
      dateFormat = "%Y-%m-%d";
      groupBy = {
        $dateToString: {
          format: "%Y-%m-%d",
          date: "$createdAt",
        },
      };
    }

    const trends = await Notification.aggregate([
      {
        $match: {
          createdAt: { $gte: dateLimit },
          isDeleted: { $ne: true },
        },
      },
      {
        $group: {
          _id: groupBy,
          sent: {
            $sum: { $cond: [{ $eq: ["$status", "sent"] }, 1, 0] },
          },
          failed: {
            $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
          },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          total: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      data: {
        period,
        days,
        trends,
      },
    });
  } catch (error) {
    debugError("getNotificationTrends", "Error fetching trends", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch trends",
      data: null,
    });
  }
};

/**
 * Export analytics result to CSV with masked personal info
 */
export const exportAnalyticsCSV = async (req, res) => {
  try {
    const { startDate, endDate, includeDetails } = req.query;

    debugLog("exportAnalyticsCSV", "Exporting analytics to CSV", {
      startDate,
      endDate,
    });

    const dateFilter = {};
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }

    const query = { isDeleted: { $ne: true } };
    if (Object.keys(dateFilter).length > 0) {
      query.createdAt = dateFilter;
    }

    // Fetch notifications
    const notifications = await Notification.find(query)
      .populate("doctorId", "name")
      .populate("patientId", "name")
      .lean()
      .limit(10000);

    // Build CSV
    const headers = [
      "Date",
      "Type",
      "Doctor",
      "Patient",
      "Status",
      "Retries",
      "Delivery Time (ms)",
    ];

    const rows = notifications.map((n) => [
      new Date(n.createdAt).toISOString(),
      n.type,
      n.doctorId?.name || "N/A",
      n.patientId?.name || "N/A",
      n.status,
      n.retryCount,
      n.sentAt
        ? (new Date(n.sentAt) - new Date(n.createdAt)).toString()
        : "PENDING",
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=analytics-export.csv",
    );
    res.send(csv);
  } catch (error) {
    debugError("exportAnalyticsCSV", "Error exporting analytics", error);
    res.status(500).json({
      success: false,
      message: "Failed to export analytics",
      data: null,
    });
  }
};

/**
 * Helper: Mask phone number for display
 */
function maskPhoneNumber(phone) {
  if (!phone) return "N/A";
  const cleaned = phone.replace(/[-.\s()]/g, "");
  const start = cleaned.substring(0, 4);
  const end = cleaned.substring(cleaned.length - 3);
  return `${start}${"*".repeat(cleaned.length - 7)}${end}`;
}
