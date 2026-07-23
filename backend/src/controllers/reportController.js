import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subDays,
  subWeeks,
  subMonths,
  subYears,
} from "date-fns";
import mongoose from "mongoose";
import Report from "../models/Report.js";
import Appointment from "../models/Appointment.js";
import Doctor from "../models/Doctor.js";
import Payment from "../models/Payment.js";
import TreatmentPlan from "../models/TreatmentPlan.js";
import logger from "../utils/logger.js";
import { APPOINTMENT_STATUS } from "../utils/appointmentConstants.js";

const VALID_RANGES = ["today", "week", "last_week", "month", "year"];

const buildRangeBounds = (range) => {
  const now = new Date();

  switch (range) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "week":
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      };
    case "last_week":
      return {
        start: startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
        end: endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }),
      };
    case "month":
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
      };
    case "year":
      return {
        start: startOfYear(now),
        end: endOfYear(now),
      };
    default:
      return { start: startOfDay(now), end: endOfDay(now) };
  }
};

const buildPreviousRangeBounds = (range, currentStart, currentEnd) => {
  switch (range) {
    case "today":
      return {
        start: startOfDay(subDays(currentStart, 1)),
        end: endOfDay(subDays(currentEnd, 1)),
      };
    case "week":
      return {
        start: startOfWeek(subWeeks(currentStart, 1), { weekStartsOn: 1 }),
        end: endOfWeek(subWeeks(currentEnd, 1), { weekStartsOn: 1 }),
      };
    case "last_week":
      return {
        start: startOfWeek(subWeeks(currentStart, 2), { weekStartsOn: 1 }),
        end: endOfWeek(subWeeks(currentEnd, 2), { weekStartsOn: 1 }),
      };
    case "month":
      return {
        start: startOfMonth(subMonths(currentStart, 1)),
        end: endOfMonth(subMonths(currentEnd, 1)),
      };
    case "year":
      return {
        start: startOfYear(subYears(currentStart, 1)),
        end: endOfYear(subYears(currentEnd, 1)),
      };
    default:
      return { start: null, end: null };
  }
};

const calculateDelta = (current, previous) => {
  if (!previous) {
    return current > 0 ? 100 : 0;
  }
  return Number(((current - previous) / previous) * 100);
};

const getPeakBookingHour = (hours = []) => {
  if (!hours.length) {
    return "--";
  }

  const buckets = hours.reduce((acc, hour) => {
    const normalizedHour = String(hour || "").trim() || "09:00";
    acc[normalizedHour] = (acc[normalizedHour] || 0) + 1;
    return acc;
  }, {});

  return (
    Object.entries(buckets).sort(
      ([, countA], [, countB]) =>
        countB - countA || String([0]).localeCompare(String([0])),
    )[0]?.[0] || "--"
  );
};

const getTenantAppointmentSnapshot = async (clinicSlug, start, end) => {
  const pipeline = [
    { $match: { clinicSlug } },
    { $project: { _id: 1, clinicSlug: 1 } },
    {
      $lookup: {
        from: "appointments",
        let: { doctorId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$doctorId", "$$doctorId"] },
              date: { $gte: start, $lte: end },
              isDeleted: { $ne: true },
            },
          },
          { $project: { _id: 1, status: 1, timeSlot: 1 } },
        ],
        as: "appointments",
      },
    },
    { $unwind: { path: "$appointments", preserveNullAndEmptyArrays: false } },
    { $replaceRoot: { newRoot: "$appointments" } },
    {
      $group: {
        _id: null,
        totalAppointments: { $sum: 1 },
        completedAppointments: {
          $sum: {
            $cond: [{ $eq: ["$status", APPOINTMENT_STATUS.COMPLETED] }, 1, 0],
          },
        },
        cancelledAppointments: {
          $sum: {
            $cond: [{ $eq: ["$status", APPOINTMENT_STATUS.CANCELLED] }, 1, 0],
          },
        },
        bookingHours: {
          $push: { $ifNull: ["$timeSlot", "09:00"] },
        },
      },
    },
  ];

  const results = await Doctor.aggregate(pipeline).exec();
  return results[0] || null;
};

const getTenantRevenueSnapshot = async (doctorId, start, end) => {
  const results = await Payment.aggregate([
    {
      $match: {
        doctorId,
        date: { $gte: start, $lte: end },
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: "$amountPaid" },
      },
    },
  ]).exec();

  return results[0] || { totalRevenue: 0 };
};

const getTenantInvoiceSnapshot = async (doctorId) => {
  const results = await TreatmentPlan.aggregate([
    {
      $match: {
        doctorId: new mongoose.Types.ObjectId(doctorId),
        status: "active",
      },
    },
    {
      $lookup: {
        from: "payments",
        localField: "_id",
        foreignField: "planId",
        as: "planPayments",
      },
    },
    {
      $addFields: {
        totalPaidForPlan: { $sum: "$planPayments.amountPaid" },
      },
    },
    {
      $addFields: {
        remainingBalanceForPlan: {
          $max: [{ $subtract: ["$totalCost", "$totalPaidForPlan"] }, 0],
        },
      },
    },
    {
      $group: {
        _id: null,
        pendingInvoices: { $sum: 1 },
        pendingInvoiceValue: { $sum: "$remainingBalanceForPlan" },
      },
    },
  ]).exec();

  return results[0] || { pendingInvoices: 0, pendingInvoiceValue: 0 };
};

// إضافة تقرير جديد
export const createReport = async (req, res) => {
  try {
    // Guard: Ensure required context
    if (!req.tenantId || !req.patientId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: null,
      });
    }

    const { title, description, fileUrl } = req.body;

    const report = await Report.create({
      doctorId: req.tenantId,
      patientId: req.patientId,
      title,
      description,
      fileUrl,
    });

    res.status(201).json({
      success: true,
      message: "Report created successfully",
      data: report,
    });
  } catch (error) {
    logger.error("UnexpectedError", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const getDoctorReportsDashboard = async (req, res) => {
  try {
    const clinicSlug = String(req.user?.clinicSlug || "")
      .trim()
      .toLowerCase();
    const tenantDoctorId = req.user?.doctorId || req.user?._id || req.tenantId;

    if (!clinicSlug || !tenantDoctorId) {
      return res.status(403).json({
        success: false,
        message: "Tenant context is missing",
        data: null,
      });
    }

    const requestedRange = String(req.query.range || "today").toLowerCase();
    if (!VALID_RANGES.includes(requestedRange)) {
      return res.status(400).json({
        success: false,
        message: "Invalid range value",
        data: null,
      });
    }

    const doctorDoc = await Doctor.findOne({ clinicSlug })
      .select("_id clinicSlug")
      .lean();

    if (!doctorDoc) {
      return res.status(404).json({
        success: false,
        message: "Clinic not found",
        data: null,
      });
    }

    const currentRange = buildRangeBounds(requestedRange);
    const previousRange = buildPreviousRangeBounds(
      requestedRange,
      currentRange.start,
      currentRange.end,
    );

    const [
      currentSnapshot,
      previousSnapshot,
      revenueSnapshot,
      previousRevenueSnapshot,
      invoiceSnapshot,
    ] = await Promise.all([
      getTenantAppointmentSnapshot(
        clinicSlug,
        currentRange.start,
        currentRange.end,
      ),
      getTenantAppointmentSnapshot(
        clinicSlug,
        previousRange.start,
        previousRange.end,
      ),
      getTenantRevenueSnapshot(
        doctorDoc._id,
        currentRange.start,
        currentRange.end,
      ),
      getTenantRevenueSnapshot(
        doctorDoc._id,
        previousRange.start,
        previousRange.end,
      ),
      getTenantInvoiceSnapshot(doctorDoc._id),
    ]);

    const totalAppointments = currentSnapshot?.totalAppointments || 0;
    const completedAppointments = currentSnapshot?.completedAppointments || 0;
    const cancelledAppointments = currentSnapshot?.cancelledAppointments || 0;
    const previousTotalAppointments = previousSnapshot?.totalAppointments || 0;
    const previousCompletedAppointments =
      previousSnapshot?.completedAppointments || 0;
    const previousCancelledAppointments =
      previousSnapshot?.cancelledAppointments || 0;
    const totalRevenue = Number(revenueSnapshot?.totalRevenue || 0);
    const previousRevenue = Number(previousRevenueSnapshot?.totalRevenue || 0);
    const pendingInvoices = invoiceSnapshot?.pendingInvoices || 0;
    const pendingInvoiceValue = Number(
      invoiceSnapshot?.pendingInvoiceValue || 0,
    );
    const peakBookingHour = getPeakBookingHour(
      currentSnapshot?.bookingHours || [],
    );

    const attendanceRate =
      totalAppointments > 0
        ? Number((completedAppointments / totalAppointments) * 100)
        : 0;

    const responsePayload = {
      success: true,
      message: "Doctor reports dashboard retrieved successfully",
      data: {
        range: requestedRange,
        clinicSlug,
        generatedAt: new Date().toISOString(),
        isEmpty:
          totalAppointments === 0 &&
          completedAppointments === 0 &&
          cancelledAppointments === 0 &&
          totalRevenue === 0 &&
          pendingInvoices === 0,
        metrics: {
          totalAppointments,
          completedAppointments,
          cancelledAppointments,
          attendanceRate,
          totalRevenue,
          pendingInvoices,
          pendingInvoiceValue,
          peakBookingHour,
        },
        comparison: {
          totalAppointmentsDelta: calculateDelta(
            totalAppointments,
            previousTotalAppointments,
          ),
          completedDelta: calculateDelta(
            completedAppointments,
            previousCompletedAppointments,
          ),
          cancelledDelta: calculateDelta(
            cancelledAppointments,
            previousCancelledAppointments,
          ),
          revenueDelta: calculateDelta(totalRevenue, previousRevenue),
        },
      },
    };

    return res.json(responsePayload);
  } catch (error) {
    logger.error("getDoctorReportsDashboard", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

// جلب كل التقارير لمريض معين
export const getReports = async (req, res) => {
  try {
    // Guard: Ensure required context
    if (!req.tenantId || !req.patientId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: null,
      });
    }

    const reports = await Report.find({
      doctorId: req.tenantId,
      patientId: req.patientId,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      message: "Reports retrieved successfully",
      data: reports,
    });
  } catch (error) {
    logger.error("UnexpectedError", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};
