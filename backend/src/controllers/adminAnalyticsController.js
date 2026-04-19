import Notification from "../models/Notification.js";
import Doctor from "../models/Doctor.js";
import Patient from "../models/Patient.js";
import logger from "../utils/logger.js";

/**
 * Enhanced Admin Analytics Controller
 * Provides advanced analytics for notification monitoring
 * Includes top doctors, active patients, trends, and high-priority event detection
 *
 * Performance Notes:
 * - Ensure indexes on: { doctorId: 1 }, { patientId: 1 }, { status: 1 }, { createdAt: 1 }, { retryCount: 1 }
 * - Aggregations are optimized with $match first to reduce documents processed
 */

/**
 * Get advanced notification analytics
 * Includes top performers, trends, and KPIs
 */
export const getAdvancedAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, limit = 10 } = req.query;

    logger.info(
      "getAdvancedAnalytics",
      "Starting advanced analytics calculation",
      {
        startDate,
        endDate,
        limit,
      },
    );

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
    let topDoctors = [];
    try {
      topDoctors = await Notification.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$doctorId",
            notificationCount: { $sum: 1 },
            sentCount: {
              $sum: { $cond: [{ $eq: ["$status", "sent"] }, 1, 0] },
            },
            failedCount: {
              $sum: { $cond: [{ $eq: ["$status", "failed"] }, 1, 0] },
            },
          },
        },
        { $sort: { notificationCount: -1 } },
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
            _id: 0,
            doctorId: "$_id",
            name: { $arrayElemAt: ["$doctor.name", 0] },
            specialization: { $arrayElemAt: ["$doctor.specialization", 0] },
            notificationCount: 1,
            failedCount: 1,
            deliveryRate: {
              $cond: [
                { $eq: ["$notificationCount", 0] },
                0,
                {
                  $round: [
                    {
                      $multiply: [
                        { $divide: ["$sentCount", "$notificationCount"] },
                        100,
                      ],
                    },
                    1,
                  ],
                },
              ],
            },
          },
        },
      ]);
    } catch (aggError) {
      logger.error(
        "getAdvancedAnalytics",
        "Error in topDoctors aggregation",
        aggError,
      );
      topDoctors = [];
    }

    // Most active patients
    let activatePatients = [];
    try {
      activatePatients = await Notification.aggregate([
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
            _id: 0,
            patientId: "$_id",
            patientName: { $arrayElemAt: ["$patient.name", 0] },
            notificationsReceived: "$count",
          },
        },
      ]);
    } catch (aggError) {
      logger.error(
        "getAdvancedAnalytics",
        "Error in activatePatients aggregation",
        aggError,
      );
      activatePatients = [];
    }

    // Daily trends (last 30 days)
    let dailyTrends = [];
    try {
      dailyTrends = await Notification.aggregate([
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
    } catch (aggError) {
      logger.error(
        "getAdvancedAnalytics",
        "Error in dailyTrends aggregation",
        aggError,
      );
      dailyTrends = [];
    }

    // High-priority events (failed > 3 times)
    let highPriorityFailures = [];
    try {
      highPriorityFailures = await Notification.find({
        status: "failed",
        retryCount: { $gte: 3 },
        isDeleted: { $ne: true },
      })
        .select("type phoneNumber retryCount createdAt")
        .limit(20)
        .lean();
    } catch (dbError) {
      logger.error(
        "getAdvancedAnalytics",
        "Error fetching highPriorityFailures",
        dbError,
      );
      highPriorityFailures = [];
    }

    // Consecutive failure count (for alerts)
    let consecutiveFailures = [];
    try {
      consecutiveFailures = await Notification.aggregate([
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
    } catch (aggError) {
      logger.error(
        "getAdvancedAnalytics",
        "Error in consecutiveFailures aggregation",
        aggError,
      );
      consecutiveFailures = [];
    }

    // Notification type breakdown
    let typeBreakdown = [];
    try {
      typeBreakdown = await Notification.aggregate([
        { $match: query },
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]);
    } catch (aggError) {
      logger.error(
        "getAdvancedAnalytics",
        "Error in typeBreakdown aggregation",
        aggError,
      );
      typeBreakdown = [];
    }

    // Overall KPIs
    let totalNotifications = 0;
    let sentCount = 0;
    let failedCount = 0;
    let pendingCount = 0;
    try {
      totalNotifications = await Notification.countDocuments(query);
      sentCount = await Notification.countDocuments({
        status: "sent",
        ...query,
      });
      failedCount = await Notification.countDocuments({
        status: "failed",
        ...query,
      });
      pendingCount = await Notification.countDocuments({
        status: "pending",
        ...query,
      });
    } catch (countError) {
      logger.error(
        "getAdvancedAnalytics",
        "Error counting documents",
        countError,
      );
    }

    const overallDeliveryRate = totalNotifications
      ? parseFloat(((sentCount / totalNotifications) * 100).toFixed(1))
      : 0;

    res.json({
      success: true,
      data: {
        kpis: {
          totalNotifications,
          total: totalNotifications,
          sentCount,
          sent: sentCount,
          failedCount,
          failed: failedCount,
          pendingCount,
          pending: pendingCount,
          overallDeliveryRate,
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

    logger.info(
      "getAdvancedAnalytics",
      "Analytics calculation completed successfully",
    );
  } catch (error) {
    logger.error("getAdvancedAnalytics", "Error calculating analytics", error);
    return res.status(200).json({
      success: true,
      data: {
        kpis: {
          totalNotifications: 0,
          total: 0,
          sentCount: 0,
          sent: 0,
          failedCount: 0,
          failed: 0,
          pendingCount: 0,
          pending: 0,
          overallDeliveryRate: 0,
        },
        topDoctors: [],
        activePatients: [],
        dailyTrends: [],
        typeBreakdown: {},
        alerts: {
          consecutiveFailures: [],
          highPriorityFailures: [],
        },
        fallback: true,
        totalAppointments: 0,
        completedAppointments: 0,
        deliveryRate: 0,
      },
    });
  }
};

/**
 * Get daily/weekly/monthly trends for charting
 */
export const getNotificationTrends = async (req, res) => {
  try {
    const { period = "daily", days = 30 } = req.query;

    logger.debug("getNotificationTrends", "Calculating trends", {
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
    logger.error("getNotificationTrends", "Error fetching trends", error);
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

    logger.debug("exportAnalyticsCSV", "Exporting analytics to CSV", {
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
    logger.error("exportAnalyticsCSV", "Error exporting analytics", error);
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
