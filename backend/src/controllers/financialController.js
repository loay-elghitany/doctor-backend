import mongoose from "mongoose";
import TreatmentPlan from "../models/TreatmentPlan.js";
import Payment from "../models/Payment.js";
import Patient from "../models/Patient.js";
import { ROLES } from "../constants/roles.js";
import logger from "../utils/logger.js";
import {
  createInAppNotification,
  notifyPatientFinancialPlan,
  notifyStaffFinancialPlanCreated,
  notifyStaffPaymentRecorded,
  notifyPatientPaymentRecorded,
} from "./notificationController.js";
const toObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(value)
    : null;

const resolvePatientIdForRead = (req) => {
  const requestedPatientId = String(
    req.params.patientId || req.query.patientId || "",
  );
  if (req.user?.role === ROLES.PATIENT) {
    const ownPatientId = String(req.user._id || "");
    if (requestedPatientId && requestedPatientId !== ownPatientId) {
      return { isForbidden: true, patientId: ownPatientId };
    }
    return { isForbidden: false, patientId: ownPatientId };
  }
  return { isForbidden: false, patientId: requestedPatientId };
};

const ensurePatientBelongsToTenant = async (tenantId, patientId) => {
  const patient = await Patient.findOne({
    _id: patientId,
    doctorId: tenantId,
  }).select("_id");
  return Boolean(patient);
};

const mapPlanSummary = (plan, paidAmount) => {
  const safePaid = Number(paidAmount || 0);
  const totalCost = Number(plan.totalCost || 0);
  return {
    id: plan._id,
    patientId: plan.patientId,
    title: plan.title,
    totalCost,
    status: plan.status,
    notes: plan.notes || "",
    amountPaid: safePaid,
    remainingBalance: Math.max(totalCost - safePaid, 0),
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
};

export const createTreatmentPlan = async (req, res) => {
  try {
    const { patientId, title, totalCost, status, notes } = req.body || {};

    if (!patientId || !title || totalCost === undefined) {
      return res.status(400).json({
        success: false,
        message: "patientId, title, and totalCost are required",
        data: null,
      });
    }

    // Fetch patient and verify it belongs to this clinic
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
        data: null,
      });
    }

    // Determine the actual doctorId - for secretaries, fetch from patient
    let doctorId = req.tenantId;
    if (req.user.role === ROLES.SECRETARY) {
      // For secretaries, use the patient's doctorId as source of truth
      doctorId = patient.doctorId;
      // Verify the secretary's associated doctor matches the patient's doctor
      if (
        !patient.doctorId ||
        patient.doctorId.toString() !== req.user.doctorId?.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "You cannot create a plan for a patient from another clinic",
          data: null,
        });
      }
    } else {
      // For doctors, verify patient belongs to this doctor
      const exists = await ensurePatientBelongsToTenant(doctorId, patientId);
      if (!exists) {
        return res.status(404).json({
          success: false,
          message: "Patient not found in this clinic",
          data: null,
        });
      }
    }

    const plan = await TreatmentPlan.create({
      doctorId,
      patientId,
      title: String(title).trim(),
      totalCost: Number(totalCost),
      status: status || "active",
      notes: notes || "",
    });

    const patientWithClinic =
      await Patient.findById(patientId).select("clinicSlug");

    // Determine sender details based on request user role
    const senderRole = req.user.role;
    const senderId = req.user._id;
    const senderName = req.user.name || "الموظف";

    try {
      await Promise.allSettled([
        notifyPatientFinancialPlan(
          patientId,
          plan,
          senderName,
          patientWithClinic?.clinicSlug,
        ),
        notifyStaffFinancialPlanCreated(
          patientWithClinic?.clinicSlug,
          plan,
          patientWithClinic,
          { _id: senderId, name: senderName },
          senderRole,
          senderId,
          senderName,
        ),
      ]);
    } catch (notificationError) {
      logger.error(
        "createTreatmentPlan",
        "Failed to send notifications",
        notificationError,
      );
      console.error(
        "[createTreatmentPlan] Notification error:",
        notificationError,
      );
      // Don't fail the plan creation if notifications fail
    }

    return res.status(201).json({
      success: true,
      message: "Treatment plan created successfully",
      data: plan,
    });
  } catch (error) {
    logger.error("createTreatmentPlan", "Unexpected error", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const listTreatmentPlansByPatient = async (req, res) => {
  try {
    const doctorId = req.tenantId;
    const { isForbidden, patientId } = resolvePatientIdForRead(req);
    if (isForbidden) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to access this patient's treatment plans",
        data: null,
      });
    }
    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: "patientId is required",
        data: null,
      });
    }

    const exists = await ensurePatientBelongsToTenant(doctorId, patientId);
    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "Patient not found in this clinic",
        data: null,
      });
    }

    const plans = await TreatmentPlan.find({
      doctorId,
      patientId,
    }).sort({ createdAt: -1 });

    const paidByPlan = await Payment.aggregate([
      {
        $match: {
          doctorId: toObjectId(doctorId),
          patientId: toObjectId(patientId),
          planId: { $in: plans.map((p) => p._id) },
        },
      },
      {
        $group: {
          _id: "$planId",
          amountPaid: { $sum: "$amountPaid" },
        },
      },
    ]);

    const paidMap = new Map(
      paidByPlan.map((row) => [String(row._id), row.amountPaid]),
    );
    const data = plans.map((plan) =>
      mapPlanSummary(plan, paidMap.get(String(plan._id))),
    );

    return res.json({
      success: true,
      message: "Treatment plans retrieved successfully",
      data,
    });
  } catch (error) {
    logger.error("listTreatmentPlansByPatient", "Unexpected error", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const updateTreatmentPlan = async (req, res) => {
  try {
    const doctorId = req.tenantId;
    const { planId } = req.params;
    const { title, totalCost, status, notes } = req.body || {};

    const plan = await TreatmentPlan.findOne({ _id: planId, doctorId });
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Treatment plan not found",
        data: null,
      });
    }

    if (title !== undefined) plan.title = String(title).trim();
    if (totalCost !== undefined) plan.totalCost = Number(totalCost);
    if (status !== undefined) plan.status = status;
    if (notes !== undefined) plan.notes = String(notes || "");

    await plan.save();

    return res.json({
      success: true,
      message: "Treatment plan updated successfully",
      data: plan,
    });
  } catch (error) {
    logger.error("updateTreatmentPlan", "Unexpected error", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const deleteTreatmentPlan = async (req, res) => {
  try {
    const doctorId = req.tenantId;
    const { planId } = req.params;

    const plan = await TreatmentPlan.findOneAndDelete({
      _id: planId,
      doctorId,
    });
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Treatment plan not found",
        data: null,
      });
    }

    await Payment.deleteMany({ doctorId, planId: plan._id });

    return res.json({
      success: true,
      message: "Treatment plan deleted successfully",
      data: { id: plan._id },
    });
  } catch (error) {
    logger.error("deleteTreatmentPlan", "Unexpected error", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const createPayment = async (req, res) => {
  try {
    const doctorId = req.tenantId;
    const { planId, patientId, amountPaid, date, paymentMethod } =
      req.body || {};

    // Debug: Log received payload
    logger.info("createPayment - Received payload:", {
      planId,
      patientId,
      amountPaid,
      date,
      paymentMethod,
      doctorId,
      userId: req.user?._id,
      userRole: req.user?.role,
    });

    if (
      !planId ||
      !patientId ||
      amountPaid === undefined ||
      amountPaid === null ||
      Number(amountPaid) <= 0 ||
      !paymentMethod
    ) {
      logger.warn("createPayment - Validation failed:", {
        planId: !!planId,
        patientId: !!patientId,
        amountPaid,
        amountPaidType: typeof amountPaid,
        paymentMethod: !!paymentMethod,
      });
      return res.status(400).json({
        success: false,
        message:
          "planId, patientId, amountPaid (must be > 0), and paymentMethod are required",
        data: null,
      });
    }

    const plan = await TreatmentPlan.findOne({
      _id: planId,
      doctorId,
      patientId,
    });
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: "Treatment plan not found for this patient",
        data: null,
      });
    }

    const receivedByModel =
      req.user.role === ROLES.SECRETARY ? "Secretary" : "Doctor";
    const payment = await Payment.create({
      planId,
      doctorId,
      patientId,
      receivedById: req.user._id,
      receivedByModel,
      amountPaid: Number(amountPaid),
      date: date || undefined,
      paymentMethod,
    });

    try {
      const patient = await Patient.findById(patientId);
      const doctorName = req.doctor?.name || req.user?.name || "الطبيب";
      await notifyPatientPaymentRecorded(
        patientId,
        Number(amountPaid),
        planId,
        doctorName,
      );
      await notifyStaffPaymentRecorded(
        patient?.clinicSlug || req.user?.clinicSlug,
        patient,
        Number(amountPaid),
        planId,
        req.user?.role || "doctor",
        req.user?._id,
        req.user?.name,
      );
    } catch (notificationError) {
      logger.error(
        "createPayment",
        "Failed to notify of recorded payment",
        notificationError,
      );
      console.error("createPayment notification error:", notificationError);
    }

    return res.status(201).json({
      success: true,
      message: "Payment recorded successfully",
      data: payment,
    });
  } catch (error) {
    logger.error("createPayment", "Unexpected error", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const listPaymentsByPatient = async (req, res) => {
  try {
    const doctorId = req.tenantId;
    const { isForbidden, patientId } = resolvePatientIdForRead(req);
    if (isForbidden) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to access this patient's payments",
        data: null,
      });
    }
    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: "patientId is required",
        data: null,
      });
    }

    const exists = await ensurePatientBelongsToTenant(doctorId, patientId);
    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "Patient not found in this clinic",
        data: null,
      });
    }

    const payments = await Payment.find({ doctorId, patientId })
      .sort({ date: -1, createdAt: -1 })
      .populate("planId", "title");

    return res.json({
      success: true,
      message: "Payments retrieved successfully",
      data: payments,
    });
  } catch (error) {
    logger.error("listPaymentsByPatient", "Unexpected error", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const updatePayment = async (req, res) => {
  try {
    const doctorId = req.tenantId;
    const { paymentId } = req.params;
    const { amountPaid, date, paymentMethod } = req.body || {};

    const payment = await Payment.findOne({ _id: paymentId, doctorId });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
        data: null,
      });
    }

    if (amountPaid !== undefined) payment.amountPaid = Number(amountPaid);
    if (date !== undefined) payment.date = date;
    if (paymentMethod !== undefined) payment.paymentMethod = paymentMethod;

    await payment.save();

    return res.json({
      success: true,
      message: "Payment updated successfully",
      data: payment,
    });
  } catch (error) {
    logger.error("updatePayment", "Unexpected error", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const deletePayment = async (req, res) => {
  try {
    const doctorId = req.tenantId;
    const { paymentId } = req.params;

    const payment = await Payment.findOneAndDelete({
      _id: paymentId,
      doctorId,
    });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
        data: null,
      });
    }

    return res.json({
      success: true,
      message: "Payment deleted successfully",
      data: { id: payment._id },
    });
  } catch (error) {
    logger.error("deletePayment", "Unexpected error", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const getPatientFinancialSummary = async (req, res) => {
  try {
    const doctorId = req.tenantId;
    const { isForbidden, patientId } = resolvePatientIdForRead(req);
    if (isForbidden) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to access this patient's financial summary",
        data: null,
      });
    }
    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: "patientId is required",
        data: null,
      });
    }

    const exists = await ensurePatientBelongsToTenant(doctorId, patientId);
    if (!exists) {
      return res.status(404).json({
        success: false,
        message: "Patient not found in this clinic",
        data: null,
      });
    }

    const [plans, payments] = await Promise.all([
      TreatmentPlan.find({ doctorId, patientId }).sort({ createdAt: -1 }),
      Payment.find({ doctorId, patientId }).sort({ date: -1, createdAt: -1 }),
    ]);

    const paidByPlan = new Map();
    payments.forEach((payment) => {
      const key = String(payment.planId);
      paidByPlan.set(
        key,
        Number(paidByPlan.get(key) || 0) + Number(payment.amountPaid || 0),
      );
    });

    const plansSummary = plans.map((plan) =>
      mapPlanSummary(plan, paidByPlan.get(String(plan._id))),
    );

    const totals = plansSummary.reduce(
      (acc, plan) => {
        acc.totalCost += plan.totalCost;
        acc.totalPaid += plan.amountPaid;
        acc.remainingBalance += plan.remainingBalance;
        return acc;
      },
      { totalCost: 0, totalPaid: 0, remainingBalance: 0 },
    );

    return res.json({
      success: true,
      message: "Financial summary retrieved successfully",
      data: {
        patientId,
        totals,
        plans: plansSummary,
        payments,
      },
    });
  } catch (error) {
    logger.error("getPatientFinancialSummary", "Unexpected error", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};
