import Appointment from "../models/Appointment.js";
import Doctor from "../models/Doctor.js";
import Patient from "../models/Patient.js";
import { APPOINTMENT_STATUS } from "../utils/appointmentConstants.js";
import { parseISO, startOfDay, endOfDay, isBefore, isValid } from "date-fns";
import PatientTimelineEvent from "../models/PatientTimelineEvent.js";
import Prescription from "../models/Prescription.js";
import { createTimelineEvent } from "./doctorTimelineController.js";
import { createAndSendNotification } from "../services/whatsappNotificationService.js";
import enforceOwnership from "../middleware/enforceOwnership.js";
import logger from "../utils/logger.js";
import { errorResponse, successResponse } from "../utils/responseHelpers.js";
import { buildPagination, getPaginationParams } from "../utils/pagination.js";
import { canPerformAction } from "../utils/appointmentPermissions.js";
import {
  emitNewAppointmentToStaff,
  emitAppointmentConfirmationToPatient,
} from "../utils/socketManager.js";
import {
  createInAppNotification,
  notifyStaffNewAppointment,
  notifyStaffAppointmentConfirmed,
  notifyStaffAppointmentCancelled,
  notifyPatientAppointmentStatus,
} from "./notificationController.js";

/**
 * Validate time slot format (HH:MM)
 */
const isValidTimeSlot = (timeSlot) => {
  return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeSlot);
};

/**
 * Format a date label without mutating the source Date instance.
 */
const formatLocalDateLabel = (dateInput, locale = "ar-EG") => {
  const instance =
    dateInput instanceof Date
      ? new Date(dateInput.getTime())
      : new Date(dateInput);

  // Use the Unicode extension 'ar-EG-u-ca-gregory' to absolutely force Gregorian calculation in Node.js
  const enforcedLocale = locale.startsWith("ar")
    ? "ar-EG-u-ca-gregory"
    : locale;

  return instance.toLocaleDateString(enforcedLocale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

/**
 * Compute the clinic 'active shift' date based on a 5:00 AM shift boundary.
 * Hours < 5 belong to the previous day. Uses Cairo/GMT+3 local offset.
 */
const getActiveShiftDate = (now = new Date()) => {
  // adjust to local Cairo time (GMT+3)
  const local = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  if (local.getHours() < 5) {
    local.setDate(local.getDate() - 1);
  }
  // return a Date representing the start of that day (00:00 local)
  const shiftDate = new Date(
    local.getFullYear(),
    local.getMonth(),
    local.getDate(),
  );
  return shiftDate;
};

/**
 * Normalize secretary/patient intake form payload into the appointment schema shape.
 */
const parseIntakeForm = (raw) => {
  if (!raw || typeof raw !== "object") return null;

  const chiefComplaint = String(raw.chiefComplaint || "").trim();
  const bloodPressure = String(
    raw.vitals?.bloodPressure || raw.bloodPressure || "",
  ).trim();
  const diabetes = String(
    raw.vitals?.diabetes || raw.diabetesLevel || raw.diabetes || "",
  ).trim();

  const medicalHistory = {
    smoking: Boolean(raw.medicalHistory?.smoking),
    heartSurgeries: String(raw.medicalHistory?.heartSurgeries || "").trim(),
    familyHeartHistory: String(
      raw.medicalHistory?.familyHeartHistory || "",
    ).trim(),
    chestProblems: String(raw.medicalHistory?.chestProblems || "").trim(),
  };

  const allergies = String(raw.allergies || "").trim();
  const pregnancyOrLactation = String(raw.pregnancyOrLactation || "").trim();

  const hasContent =
    chiefComplaint ||
    bloodPressure ||
    diabetes ||
    medicalHistory.smoking ||
    medicalHistory.heartSurgeries ||
    medicalHistory.familyHeartHistory ||
    medicalHistory.chestProblems ||
    allergies ||
    pregnancyOrLactation;

  if (!hasContent) return null;

  return {
    chiefComplaint,
    vitals: { bloodPressure, diabetes },
    medicalHistory,
    allergies,
    pregnancyOrLactation,
  };
};

/**
 * Check for booking conflicts
 * Returns true if a slot is already booked for this doctor on this date
 */
const hasBookingConflict = async (
  doctorId,
  date,
  timeSlot,
  excludeAppointmentId = null,
) => {
  const targetDate =
    date instanceof Date ? new Date(date.getTime()) : new Date(date);
  const startOfTargetDay = startOfDay(targetDate);
  const endOfTargetDay = endOfDay(targetDate);

  const query = {
    doctorId,
    date: {
      $gte: startOfTargetDay,
      $lte: endOfTargetDay,
    },
    timeSlot,
    status: {
      $in: [
        APPOINTMENT_STATUS.PENDING,
        "confirmed",
        APPOINTMENT_STATUS.SCHEDULED,
      ],
    },
    isDeleted: { $ne: true },
  };

  if (excludeAppointmentId) {
    query._id = { $ne: excludeAppointmentId };
  }

  const conflict = await Appointment.findOne(query);
  return !!conflict;
};

export const getNextQueueNumberForDoctorDay = async ({ doctorId, date }) => {
  const start = startOfDay(date instanceof Date ? date : new Date(date));
  const end = endOfDay(date instanceof Date ? date : new Date(date));

  const latestAppointment = await Appointment.findOne({
    doctorId,
    date: { $gte: start, $lte: end },
    isDeleted: { $ne: true },
    status: {
      $nin: [APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.REJECTED],
    },
    queueNumber: { $exists: true, $ne: null },
  })
    .sort({ queueNumber: -1 })
    .lean();

  return latestAppointment?.queueNumber ? latestAppointment.queueNumber + 1 : 1;
};

/**
 * Fire-and-forget notification pipeline after appointment creation.
 */
const runPostCreateNotifications = async ({
  appointment,
  role,
  tenantId,
  patientId,
  userId,
  date,
  parsedDate,
  timeSlot,
  notes,
  req,
}) => {
  try {
    await createTimelineEvent({
      patientId,
      doctorId: tenantId,
      appointmentId: appointment._id,
      eventType: "appointment_created",
      eventTitle:
        role === "secretary"
          ? "Walk-in Appointment Scheduled"
          : "Appointment Requested",
      eventDescription: `Appointment scheduled for ${formatLocalDateLabel(parsedDate)} at ${timeSlot}`,
      eventStatus: role === "secretary" ? "scheduled" : "pending",
      visibility: "patient_visible",
      metadata: {
        date: parsedDate,
        timeSlot,
        notes: notes || "",
      },
    });
  } catch (timelineError) {
    logger.error(
      "[createAppointment] Failed to create timeline event:",
      timelineError.message,
    );
  }

  try {
    const patient = await Patient.findById(patientId);
    const doctorFromDb = await Doctor.findById(tenantId);

    if (!patient || !doctorFromDb) return;

    const doctorName = doctorFromDb.name || "الدكتور";
    const patientName = patient.name || "المريض";
    const patientPhone = patient.phoneNumber || "غير متوفر";
    const dateLabel = formatLocalDateLabel(parsedDate);
    const formattedDate = formatLocalDateLabel(parsedDate, "ar-EG");

    const doctorMessage = `طلب موعد جديد 🔔. المريض: ${patientName} | 📞 الهاتف: ${patientPhone} | ⏰ التاريخ المطلوب: ${dateLabel} | ⌚ الوقت: ${timeSlot}.`;
    const patientMessage = `مرحباً ${patientName}، تم استلام طلب موعدك مع د. ${doctorName} 📅.`;

    await Promise.allSettled([
      createAndSendNotification({
        recipientId: tenantId,
        recipientType: "Doctor",
        type: "appointment_created",
        title: "حجز موعد جديد",
        message: doctorMessage,
        appointmentId: appointment._id,
        doctorId: tenantId,
        patientId,
        actionUrl: `/doctor/appointments`,
      }),
      createAndSendNotification({
        recipientId: patientId,
        recipientType: "Patient",
        type: "appointment_created",
        title: "تم تأكيد الموعد",
        message: patientMessage,
        appointmentId: appointment._id,
        doctorId: tenantId,
        patientId,
        actionUrl: `/patient/appointments/${appointment._id}`,
      }),
    ]);

    if (role === "secretary") {
      await createInAppNotification({
        recipient: tenantId,
        recipientRole: "doctor",
        recipientClinicSlug: doctorFromDb.clinicSlug || "",
        sender: userId,
        senderRole: "secretary",
        senderName: req.user?.name || "السكرتيرة",
        type: "APPOINTMENT_CONFIRMED",
        category: "appointment",
        title: "حجز موعد من السكرتارية",
        message: `قامت السكرتيرة بحجز وتأكيد موعد للمريض ${patientName} يوم ${formattedDate} الساعة ${appointment.timeSlot}`,
        link: `/appointments/${appointment._id}`,
        linkType: "appointment",
        appointmentId: appointment._id,
        patientId,
        doctorId: tenantId,
      });

      await createInAppNotification({
        recipient: patientId,
        recipientRole: "patient",
        recipientClinicSlug: doctorFromDb.clinicSlug || "",
        sender: tenantId,
        senderRole: "doctor",
        senderName: doctorFromDb.name,
        type: "APPOINTMENT_CONFIRMED",
        category: "appointment",
        title: "موعد جديد مؤكد",
        message: `تم حجز موعد مؤكد لك في عيادة د. ${doctorFromDb.name} يوم ${formattedDate} الساعة ${appointment.timeSlot}`,
        link: `/appointments/${appointment._id}`,
        linkType: "appointment",
        appointmentId: appointment._id,
        patientId,
        doctorId: tenantId,
      });
    } else if (role === "patient") {
      try {
        emitNewAppointmentToStaff(
          doctorFromDb.clinicSlug || "",
          patientName,
          formattedDate,
        );
        await notifyStaffNewAppointment(
          doctorFromDb.clinicSlug || "",
          appointment,
          patient,
        );
      } catch (staffError) {
        logger.error(
          "[createAppointment] Staff socket notification error:",
          staffError.message,
        );
      }
      // Always emit to staff so doctor UI updates in real-time for secretary bookings
      if (role === "secretary") {
        try {
          emitNewAppointmentToStaff(
            doctorFromDb.clinicSlug || "",
            patientName,
            formatLocalDateLabel(parsedDate),
          );
        } catch (emitErr) {
          logger.error(
            "[createAppointment] emitNewAppointmentToStaff failed:",
            emitErr.message,
          );
        }
      }

      await createInAppNotification({
        recipient: patientId,
        recipientRole: "patient",
        recipientClinicSlug: doctorFromDb.clinicSlug || "",
        sender: tenantId,
        senderRole: "doctor",
        senderName: doctorFromDb.name,
        type: "NEW_APPOINTMENT",
        category: "appointment",
        title: "تم استلام طلبك",
        message: "جاري مراجعة طلب حجز الموعد من قبل العيادة.",
        link: `/appointments/${appointment._id}`,
        linkType: "appointment",
        appointmentId: appointment._id,
        patientId,
        doctorId: tenantId,
      });
    }
  } catch (notificationError) {
    logger.error(
      "[createAppointment] Background alerts pipeline error:",
      notificationError.message,
    );
  }
};

/**
 * Create a new appointment
 * Patient submits: { date, timeSlot?, notes, doctorId? }
 * Secretary submits: { patientId, date, timeSlot?, notes }
 * Uses req.user from unifiedProtect to resolve role and doctorId/tenant.
 */
export const createAppointment = async (req, res) => {
  try {
    const {
      date,
      notes,
      patientId: requestedPatientId,
      doctorId: requestedDoctorId,
      intakeForm,
    } = req.body;
    // Preserve truthy/undefined distinction so we can detect when secretary
    // intentionally omitted timeSlot and assign current time below.
    let timeSlot = req.body.timeSlot;

    const role = req.user?.role;
    const userId = req.user?._id;
    const resolvedTenantId = req.tenantId || req.user?.doctorId || null;

    logger.debug("createAppointment: role details", {
      role,
      userId,
      tenantId: req.tenantId,
      doctorId: req.user?.doctorId,
      resolvedTenantId,
      requestedPatientId,
      requestedDoctorId,
    });

    const resolveAppointmentContext = {
      patient: async () => {
        const patientId = userId;
        if (!patientId) {
          return {
            error: {
              status: 401,
              body: {
                success: false,
                message: "Not authenticated.",
                data: null,
              },
            },
          };
        }

        return { tenantId: resolvedTenantId, patientId };
      },
      secretary: async () => {
        const tenantId = resolvedTenantId;
        const patientId = requestedPatientId;

        if (!tenantId) {
          return {
            error: {
              status: 400,
              body: {
                success: false,
                message: "Secretary not associated with a doctor.",
                data: null,
              },
            },
          };
        }

        if (!patientId) {
          return {
            error: {
              status: 400,
              body: {
                success: false,
                message:
                  "PatientId is required for secretary appointment creation.",
                data: null,
              },
            },
          };
        }

        const patient = await Patient.findOne({
          _id: patientId,
          doctorId: tenantId,
        });
        if (!patient) {
          return {
            error: {
              status: 403,
              body: {
                success: false,
                message: "Patient not found or does not belong to this doctor.",
                data: null,
              },
            },
          };
        }

        return { tenantId, patientId };
      },
    };

    if (!role || !resolveAppointmentContext[role]) {
      return res.status(403).json({
        success: false,
        message: "Only patients or secretaries can create appointments.",
        data: null,
      });
    }

    // Allow secretaries to create immediate walk-in appointments without
    // providing a date. For secretaries we will resolve the appointment
    // date to the current active shift date (5:00 AM boundary).
    if (!date && role !== "secretary") {
      return res.status(400).json({
        success: false,
        message: "Appointment date is required.",
        data: null,
      });
    }

    // For non-secretary submissions validate timeSlot format if provided
    if (role !== "secretary" && timeSlot && !isValidTimeSlot(timeSlot)) {
      return res.status(400).json({
        success: false,
        message: "Invalid timeSlot format. Use HH:MM (e.g., 09:00, 14:30).",
        data: null,
      });
    }

    let parsedDate;
    if (role === "secretary") {
      // If secretary provided a date and it's valid, use it; otherwise
      // fall back to the active shift date (5:00 AM boundary)
      if (date) {
        const attempt = parseISO(date);
        parsedDate = isValid(attempt)
          ? attempt
          : getActiveShiftDate(new Date());
      } else {
        parsedDate = getActiveShiftDate(new Date());
      }
    } else {
      parsedDate = parseISO(date);
      if (!isValid(parsedDate)) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format. Use ISO 8601 (e.g., 2026-02-06).",
          data: null,
        });
      }
    }

    const today = startOfDay(new Date());
    const targetAppointmentDate = startOfDay(parsedDate);
    // Allow appointments that match the clinic's active shift date (even if
    // their startOfDay is before server 'today'). This lets secretaries create
    // walk-ins for the current active shift without being rejected.
    const activeShiftStart = startOfDay(getActiveShiftDate(new Date()));
    if (
      isBefore(targetAppointmentDate, today) &&
      targetAppointmentDate.getTime() !== activeShiftStart.getTime()
    ) {
      return res.status(400).json({
        success: false,
        message: "Cannot create an appointment in the past.",
        data: null,
      });
    }

    const appointmentContext = await resolveAppointmentContext[role]();
    if (appointmentContext?.error) {
      return res
        .status(appointmentContext.error.status)
        .json(appointmentContext.error.body);
    }

    let { tenantId, patientId } = appointmentContext;
    tenantId = tenantId || req.tenantId || req.user?.doctorId || null;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "Appointment must be linked to a doctor. Please provide a valid doctorId.",
        data: null,
      });
    }

    const doctor = await Doctor.findById(tenantId);
    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Clinic doctor not found.",
        data: null,
      });
    }

    if (!doctor.isActive) {
      return res.status(403).json({
        success: false,
        message:
          "This clinic's subscription is currently inactive. Please contact the clinic administrator.",
        data: null,
      });
    }

    logger.debug("createAppointment: verified doctor and tenant", {
      tenantId,
      role,
      patientId,
    });

    const normalizedDate = startOfDay(parsedDate);

    // If secretary is creating a walk-in and did not provide a timeSlot,
    // auto-assign current local server time in HH:MM.
    if (role === "secretary" && !timeSlot) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      timeSlot = `${hh}:${mm}`;
    }

    const conflict = await hasBookingConflict(
      tenantId,
      normalizedDate,
      timeSlot,
    );
    if (conflict) {
      return res.status(409).json({
        success: false,
        message:
          "This time slot is already booked. Please choose another time.",
        data: null,
      });
    }

    // Calculate queue number for the day (per doctor)
    let queueNumber = null;
    try {
      queueNumber = await getNextQueueNumberForDoctorDay({
        doctorId: tenantId,
        date: normalizedDate,
      });
    } catch (countErr) {
      logger.error(
        "[createAppointment] Failed to compute queue number:",
        countErr.message,
      );
      queueNumber = null;
    }

    const appointment = await Appointment.create({
      doctorId: tenantId,
      patientId,
      date: normalizedDate,
      timeSlot,
      queueNumber,
      notes,
      intakeForm: intakeForm || {},
      status:
        role === "secretary"
          ? APPOINTMENT_STATUS.SCHEDULED
          : APPOINTMENT_STATUS.PENDING,
      createdBy: role === "secretary" ? "secretary" : "patient",
      createdById: userId,
      createdByRef: role === "secretary" ? "Secretary" : "Patient",
    });

    try {
      if (intakeForm?.medicalHistory) {
        await Patient.findByIdAndUpdate(patientId, {
          $set: {
            "medicalHistory.smoking": !!intakeForm.medicalHistory.smoking,
            "medicalHistory.heartSurgeries":
              intakeForm.medicalHistory.heartSurgeries || "",
            "medicalHistory.chestProblems":
              intakeForm.medicalHistory.chestProblems || "",
          },
        });
      }
    } catch (patientSyncError) {
      logger.error(
        "[createAppointment] Patient medical history sync skipped:",
        patientSyncError.message,
      );
    }

    res.status(201).json({
      success: true,
      message: "Appointment created successfully.",
      data: appointment,
    });

    (async () => {
      try {
        await runPostCreateNotifications({
          appointment,
          role,
          tenantId,
          patientId,
          userId,
          date,
          parsedDate: normalizedDate,
          timeSlot,
          notes,
          req,
        });
      } catch (backgroundError) {
        logger.error(
          "[createAppointment] Background notification pipeline failed:",
          backgroundError.message,
        );
      }
    })();
  } catch (error) {
    logger.error("UnexpectedError", error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: "An unexpected error occurred.",
        data: null,
      });
    }
  }
};

/**
 * Unified get appointments endpoint for all roles
 * Uses JWT role to determine filtering logic
 */
export const getUnifiedAppointments = async (req, res) => {
  try {
    logger.debug("getUnifiedAppointments: Called", {
      hasUser: !!req.user,
      userKeys: req.user ? Object.keys(req.user) : null,
      userRole: req.user?.role,
      userId: req.user?._id || req.user?.id,
    });

    if (!req.user) {
      logger.debug("getUnifiedAppointments: No req.user");
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        data: null,
      });
    }

    const { role, _id: userId, id: altUserId, doctorId } = req.user;
    const actualUserId = userId || altUserId;

    let start, end;

    if (req.query.date) {
      // Interpret provided date as local YYYY-MM-DD and expand to UTC-safe window
      const targetDate = new Date(req.query.date);
      const localStart = startOfDay(targetDate);
      const localEnd = endOfDay(targetDate);
      // Expand window by ±3 hours to account for UTC storage offsets
      start = new Date(localStart.getTime() - 3 * 60 * 60 * 1000);
      end = new Date(localEnd.getTime() + 3 * 60 * 60 * 1000);
    } else {
      // Use centralized active shift date logic (5:00 AM boundary)
      const shiftDate = getActiveShiftDate(new Date());
      const localStart = startOfDay(shiftDate);
      const localEnd = endOfDay(shiftDate);
      // Expand window by ±3 hours to account for UTC storage offsets
      start = new Date(localStart.getTime() - 3 * 60 * 60 * 1000);
      end = new Date(localEnd.getTime() + 3 * 60 * 60 * 1000);
    }

    logger.debug("getUnifiedAppointments: Extracted", {
      role,
      userId: actualUserId,
      doctorId,
      start,
      end,
    });

    if (!role || !actualUserId) {
      logger.debug("getUnifiedAppointments: Missing role or userId");
      return res.status(400).json({
        success: false,
        message: "Invalid user data",
        data: null,
      });
    }

    const dateFilter = { date: { $gte: start, $lte: end } };

    const roleStrategies = {
      doctor: () => {
        const doctorIds = [req.tenantId, req.user?.doctorId].filter(Boolean);
        const query = {
          doctorId: doctorIds.length === 1 ? doctorIds[0] : { $in: doctorIds },
          isDeleted: { $ne: true },
          ...dateFilter,
        };
        logger.debug("getUnifiedAppointments: DOCTOR query", { query });
        return { query };
      },
      secretary: () => {
        const doctorIds = [req.tenantId, req.user?.doctorId].filter(Boolean);
        const query = {
          doctorId: doctorIds.length === 1 ? doctorIds[0] : { $in: doctorIds },
          isDeleted: { $ne: true },
          ...dateFilter,
        };
        logger.debug("getUnifiedAppointments: SECRETARY query", {
          query,
          tenantId: req.tenantId,
        });
        return { query };
      },
      patient: () => {
        const doctorIds = [req.tenantId, req.user?.doctorId].filter(Boolean);
        const query = {
          patientId: actualUserId,
          hiddenByPatient: { $ne: true },
          doctorId: doctorIds.length === 1 ? doctorIds[0] : { $in: doctorIds },
          isDeleted: { $ne: true },
        };
        logger.debug("getUnifiedAppointments: PATIENT query", { query });
        return { query };
      },
    };

    const buildStrategy = roleStrategies[role];
    if (!buildStrategy) {
      logger.debug("getUnifiedAppointments: UNKNOWN role", { role });
      return res.status(400).json({
        success: false,
        message: "Invalid user role.",
        data: null,
      });
    }

    const strategy = buildStrategy();
    if (strategy?.error) {
      return res.status(strategy.error.status).json(strategy.error.body);
    }

    const { page, limit, skip } = getPaginationParams(req.query);
    // Debug: show exact MongoDB query being executed
    console.log(
      "[getUnifiedAppointments] EXECUTING QUERY:",
      JSON.stringify(strategy.query),
    );
    const totalItems = await Appointment.countDocuments(strategy.query);

    const appointments = await Appointment.find(strategy.query)
      .populate("patientId", "name email phoneNumber")
      .populate("doctorId", "name email")
      // Prefer ordering by queueNumber when present so staff see queue order
      .sort({ queueNumber: 1, date: 1, timeSlot: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Debug: show how many raw documents were returned by the DB for this query
    console.log(
      "[getUnifiedAppointments] DB returned documents:",
      appointments.length,
      " totalItems:",
      totalItems,
    );

    logger.debug("[getUnifiedAppointments] query results", {
      role,
      query: strategy.query,
      count: appointments.length,
      totalItems,
    });

    // Fetch any prescriptions for the returned appointments and attach them
    const appointmentIds = appointments.map((a) => a._id).filter(Boolean);
    let prescriptionsByAppointment = {};
    if (appointmentIds.length > 0) {
      try {
        const prescriptions = await Prescription.find({
          appointmentId: { $in: appointmentIds },
        }).lean();
        prescriptionsByAppointment = prescriptions.reduce((acc, p) => {
          if (!p || !p.appointmentId) return acc;
          acc[p.appointmentId.toString()] = p;
          return acc;
        }, {});
      } catch (presErr) {
        logger.error(
          "[getUnifiedAppointments] Failed to fetch prescriptions:",
          presErr.message,
        );
      }
    }

    const normalizedAppointments = appointments.map((appointmentDoc) => {
      const appointment =
        typeof appointmentDoc.toObject === "function"
          ? appointmentDoc.toObject()
          : appointmentDoc;

      if (!appointment.patientId) {
        logger.warn("Missing patientId reference in appointment", {
          appointmentId: appointment._id,
        });
      }

      if (!appointment.doctorId) {
        logger.warn("Missing doctorId reference in appointment", {
          appointmentId: appointment._id,
        });
      }

      const patient = appointment.patientId || {
        _id: null,
        name: "Unknown Patient",
        email: "",
      };

      const doctor = appointment.doctorId || {
        _id: null,
        name: "Unknown Doctor",
        email: "",
      };

      const pres = prescriptionsByAppointment[appointment._id?.toString()];

      return {
        ...appointment,
        prescription: pres || null,
        patientId: {
          _id: patient._id ?? null,
          name: patient.name || "Unknown Patient",
          email: patient.email || "",
        },
        doctorId: {
          _id: doctor._id ?? null,
          name: doctor.name || "Unknown Doctor",
          email: doctor.email || "",
        },
      };
    });

    res.json({
      success: true,
      message: "Appointments retrieved successfully.",
      data: normalizedAppointments,
      pagination: buildPagination(page, limit, totalItems),
    });
  } catch (error) {
    logger.error("getUnifiedAppointments error:", error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
};

/**
 * Patient chooses one of the doctor's proposed reschedule times
 * Body: { optionIndex: number }
 */
export const chooseTime = [
  enforceOwnership(async (req) => {
    return await Appointment.findById(req.params.id);
  }),
  async (req, res) => {
    try {
      const { optionIndex } = req.body;

      // Guard: Ensure patient context
      if (!req.patientId) {
        return errorResponse(res, 401, "Not authenticated.");
      }

      const appointment = req.resource;

      // Ownership check handled by enforceOwnership middleware

      // Ensure the patient owns the appointment
      if (appointment.patientId.toString() !== req.patientId.toString()) {
        return errorResponse(
          res,
          403,
          "You are not authorized to perform this action.",
        );
      }

      // Guard: Cannot choose time for a cancelled appointment
      if (appointment.status === APPOINTMENT_STATUS.CANCELLED) {
        return errorResponse(
          res,
          400,
          "Cannot choose a time for a cancelled appointment.",
        );
      }

      // Guard: Must be in reschedule_proposed state
      if (appointment.status !== APPOINTMENT_STATUS.RESCHEDULE_PROPOSED) {
        return errorResponse(
          res,
          400,
          "Cannot choose a time for an appointment that is not in the 'reschedule_proposed' state.",
        );
      }

      const currentOptions = Array.isArray(appointment.rescheduleOptions)
        ? appointment.rescheduleOptions
        : [];
      if (
        optionIndex === undefined ||
        optionIndex < 0 ||
        optionIndex >= currentOptions.length ||
        !currentOptions[optionIndex]
      ) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          data: null,
          fieldErrors: {
            rescheduleOptions:
              "Selected appointment time option is invalid or no longer available.",
          },
        });
      }

      // Check for booking conflict with the chosen time
      const selectedOption = currentOptions[optionIndex];
      const selectedDate = new Date(selectedOption.date);
      const selectedTimeSlot = selectedOption.timeSlot || "09:00";

      const conflict = await hasBookingConflict(
        appointment.doctorId,
        selectedDate,
        selectedTimeSlot,
        appointment._id,
      );
      if (conflict) {
        return res.status(409).json({
          success: false,
          message:
            "The selected time slot is no longer available. Please choose another time.",
          data: null,
        });
      }

      // Update appointment with chosen time
      appointment.date = selectedDate;
      appointment.timeSlot = selectedTimeSlot;

      // Mark the chosen option
      appointment.rescheduleOptions.forEach((opt) => (opt.chosen = false));
      appointment.rescheduleOptions[optionIndex].chosen = true;

      // Set to SCHEDULED (patient accepted reschedule options from doctor)
      appointment.status = APPOINTMENT_STATUS.SCHEDULED;

      if (!appointment.queueNumber) {
        try {
          appointment.queueNumber = await getNextQueueNumberForDoctorDay({
            doctorId: appointment.doctorId,
            date: selectedDate,
          });
        } catch (queueErr) {
          logger.error(
            "[chooseTime] Failed to assign queue number:",
            queueErr.message,
          );
        }
      }

      await appointment.save();

      // Auto-update timeline event for confirmed appointment
      try {
        await createTimelineEvent({
          patientId: appointment.patientId,
          doctorId: appointment.doctorId,
          appointmentId: appointment._id,
          eventType: "appointment_confirmed",
          eventTitle: "Appointment Confirmed",
          eventDescription: `Confirmed appointment for ${selectedDate.toLocaleDateString()} at ${selectedTimeSlot}`,
          eventStatus: "scheduled",
          visibility: "patient_visible",
          metadata: {
            date: selectedDate,
            timeSlot: selectedTimeSlot,
            optionIndex: optionIndex,
          },
        });
      } catch (timelineError) {
        logger.error(
          "[chooseTime] Failed to create timeline event:",
          timelineError.message,
        );
        // Don't fail the confirmation if timeline event fails
      }

      // Send WhatsApp notification to doctor and patient after patient confirms proposed time (Scenario 2)
      try {
        const patient = await Patient.findById(appointment.patientId);
        const doctorFromDb = await Doctor.findById(appointment.doctorId);

        const patientName = patient?.name || "المريض";
        const doctorName = doctorFromDb?.name || "الدكتور";
        const patientPhone = patient?.phoneNumber || "غير متوفر";
        const doctorPhone = doctorFromDb?.phoneNumber || "غير متوفر";
        const formattedDate = selectedDate.toLocaleDateString("ar-EG");

        const doctorMessage = `تم تأكيد الموعد المقترح ✅. المريض ${patientName} قد اختار المؤكد بتاريخ ${formattedDate} الساعة ${selectedTimeSlot}. 📞 رقم المريض: ${patientPhone}.`;

        const patientMessage = `مرحباً ${patientName}، تم تأكيد موعدك بنجاح ✅. موعدك القادم هو في ${formattedDate} الساعة ${selectedTimeSlot}. نتطلع لرؤيتك في العيادة!`;

        const doctorNotification = createAndSendNotification({
          recipientId: appointment.doctorId,
          recipientType: "Doctor",
          type: "appointment_confirmed",
          title: "تأكيد موعد مقترح",
          message: doctorMessage,
          appointmentId: appointment._id,
          doctorId: appointment.doctorId,
          patientId: appointment.patientId,
          actionUrl: `/doctor/appointments`,
          metadata: {
            patientName,
            patientPhone,
            date: selectedDate,
            timeSlot: selectedTimeSlot,
          },
        });

        const patientNotification = createAndSendNotification({
          recipientId: appointment.patientId,
          recipientType: "Patient",
          type: "appointment_confirmed",
          title: "تم تأكيد الموعد",
          message: patientMessage,
          appointmentId: appointment._id,
          doctorId: appointment.doctorId,
          patientId: appointment.patientId,
          actionUrl: `/patient/appointments/${appointment._id}`,
          metadata: {
            doctorName,
            doctorPhone,
            date: selectedDate,
            timeSlot: selectedTimeSlot,
          },
        });

        await Promise.allSettled([doctorNotification, patientNotification]);

        try {
          await notifyStaffAppointmentConfirmed(
            doctorFromDb.clinicSlug,
            appointment,
            patient,
            "patient",
            appointment.patientId,
            patientName,
          );
        } catch (staffNotificationError) {
          logger.error(
            "[chooseTime] Failed to notify staff about confirmed appointment:",
            staffNotificationError.message,
          );
        }
      } catch (notificationError) {
        logger.error(
          "[chooseTime] Failed to send notifications:",
          notificationError.message,
        );
        // Don't fail the confirmation if notification fails
      }

      return successResponse(
        res,
        appointment,
        "Appointment time has been confirmed.",
      );
    } catch (error) {
      logger.error("UnexpectedError", error);
      res.status(500).json({
        success: false,
        message: "An unexpected error occurred.",
        data: null,
      });
    }
  },
];

/**
 * Cancel an appointment (patient-initiated)
 * Accessible to both doctor and patient, but with different rules
 */
export const cancelAppointment = [
  enforceOwnership(async (req) => {
    return await Appointment.findById(req.params.id);
  }),
  async (req, res) => {
    try {
      const appointment = req.resource;

      // Prevent double cancellation
      if (appointment.status === APPOINTMENT_STATUS.CANCELLED) {
        return res.status(400).json({
          success: false,
          message: "This appointment has already been cancelled.",
          data: null,
        });
      }

      // Doctor/clinic-initiated cancellation (Scenario 3)
      if (req.doctor && req.doctor._id) {
        if (appointment.doctorId.toString() !== req.doctor._id.toString()) {
          return res.status(403).json({
            success: false,
            message: "You are not authorized to cancel this appointment.",
            data: null,
          });
        }

        // Check if cancellation is allowed based on centralized permissions
        if (!canPerformAction(appointment.status, "cancel")) {
          return res.status(400).json({
            success: false,
            message: "Cannot cancel appointment with current status.",
            data: null,
          });
        }

        appointment.status = APPOINTMENT_STATUS.CANCELLED;
        appointment.cancelledBy = req.doctor._id;
        appointment.cancelledByType = "Doctor";
        appointment.rescheduleOptions = [];
        await appointment.save();

        try {
          await createTimelineEvent({
            patientId: appointment.patientId,
            doctorId: appointment.doctorId,
            appointmentId: appointment._id,
            eventType: "appointment_cancelled",
            eventTitle: "Appointment Cancelled",
            eventDescription: "Doctor cancelled appointment",
            eventStatus: "cancelled",
            visibility: "patient_visible",
            metadata: {
              cancelledBy: "doctor",
              date: appointment.date,
              timeSlot: appointment.timeSlot,
            },
          });
        } catch (timelineError) {
          logger.error(
            "[cancelAppointment] Failed to create timeline event:",
            timelineError.message,
          );
          // Don't fail the cancellation if timeline event fails
        }

        try {
          const patient = await Patient.findById(appointment.patientId);
          const doctorFromDb = await Doctor.findById(appointment.doctorId);

          const patientName = patient?.name || "المريض";
          const doctorName = doctorFromDb?.name || "الدكتور";
          const phone = patient?.phoneNumber || "غير متوفر";
          const dateLabel = appointment.date.toLocaleDateString();

          const patientMessage = `مرحباً ${patientName}، نأسف لإبلاغك أن موعدك القادم مع د. ${doctorName} تم إلغاؤه ⚠️. ⏰ تفاصيل الموعد المُلغى: ${dateLabel} الساعة ${appointment.timeSlot}. الرجاء التواصل مع العيادة أو تسجيل الدخول إلى حسابك لحجز موعد جديد.`;

          await createAndSendNotification({
            recipientId: appointment.patientId,
            recipientType: "Patient",
            type: "appointment_cancelled",
            title: "تم إلغاء الموعد",
            message: patientMessage,
            appointmentId: appointment._id,
            doctorId: appointment.doctorId,
            patientId: appointment.patientId,
            actionUrl: `/patient/appointments/${appointment._id}`,
            metadata: {
              doctorName,
              patientName,
              patientPhone: phone,
              date: appointment.date,
              timeSlot: appointment.timeSlot,
            },
          });

          try {
            await notifyPatientAppointmentStatus(
              appointment.patientId,
              "cancelled",
              appointment,
              doctorName,
            );
            await notifyStaffAppointmentCancelled(
              doctorFromDb.clinicSlug,
              appointment,
              patient,
              req.user?.role || "doctor",
              req.user?._id || req.doctor._id,
              req.user?.name || doctorName,
            );
          } catch (staffNotificationError) {
            logger.error(
              "[cancelAppointment] Failed to send staff notifications:",
              staffNotificationError.message,
            );
            // Don't fail cancellation if staff notification fails
          }
        } catch (notificationError) {
          logger.error(
            "[cancelAppointment] Failed to send notification:",
            notificationError.message,
          );
          // Don't fail cancellation if notification fails
        }

        return res.json({
          success: true,
          message: "Appointment has been cancelled.",
          data: appointment,
        });
      }

      // Patient-initiated cancellation
      if (req.patientId) {
        // Validate the appointment belongs to this patient
        if (appointment.patientId.toString() !== req.patientId.toString()) {
          return res.status(403).json({
            success: false,
            message: "You are not authorized to cancel this appointment.",
            data: null,
          });
        }

        // Enforce patient cancellation rules
        // Patients cannot cancel confirmed or scheduled appointments (these are locked in)
        const cannotCancelStatuses = [
          "confirmed",
          APPOINTMENT_STATUS.SCHEDULED,
        ];
        if (cannotCancelStatuses.includes(appointment.status)) {
          return res.status(400).json({
            success: false,
            message:
              "Cannot cancel a scheduled appointment. Please contact the clinic.",
            data: null,
          });
        }

        // Update status
        appointment.status = APPOINTMENT_STATUS.CANCELLED;
        appointment.cancelledBy = req.patientId;
        appointment.cancelledByType = "Patient";
        appointment.rescheduleOptions = [];

        await appointment.save();

        // Auto-create timeline event for cancelled appointment
        try {
          await createTimelineEvent({
            patientId: appointment.patientId,
            doctorId: appointment.doctorId,
            appointmentId: appointment._id,
            eventType: "appointment_cancelled",
            eventTitle: "Appointment Cancelled",
            eventDescription: "Patient cancelled appointment",
            eventStatus: "cancelled",
            visibility: "patient_visible",
            metadata: {
              cancelledBy: "patient",
              date: appointment.date,
              timeSlot: appointment.timeSlot,
            },
          });
        } catch (timelineError) {
          logger.error(
            "[cancelAppointment] Failed to create timeline event:",
            timelineError.message,
          );
          // Don't fail the cancellation if timeline event fails
        }

        // Send WhatsApp notification to doctor about cancellation
        try {
          const patient = await Patient.findById(appointment.patientId);
          const patientName = patient?.name || "Patient";

          await createAndSendNotification({
            recipientId: appointment.doctorId, // Doctor
            recipientType: "Doctor",
            type: "appointment_cancelled",
            title: "Appointment Cancelled by Patient",
            message: `${patientName} has cancelled their appointment scheduled for ${appointment.date.toLocaleDateString()} at ${appointment.timeSlot}`,
            appointmentId: appointment._id,
            doctorId: appointment.doctorId,
            patientId: appointment.patientId,
            actionUrl: `/doctor/appointments`,
            metadata: {
              patientName,
              date: appointment.date,
              timeSlot: appointment.timeSlot,
              cancelledBy: "patient",
            },
          });

          try {
            await notifyStaffAppointmentCancelled(
              req.doctor?.clinicSlug,
              appointment,
              { _id: appointment.patientId, name: patientName },
              "patient",
              appointment.patientId,
              patientName,
            );
          } catch (staffNotificationError) {
            logger.error(
              "[cancelAppointment] Failed to notify staff of patient cancellation:",
              staffNotificationError.message,
            );
          }
        } catch (notificationError) {
          logger.error(
            "[cancelAppointment] Failed to send notification:",
            notificationError.message,
          );
          // Don't fail the cancellation if notification fails
        }

        return res.json({
          success: true,
          message: "Appointment has been cancelled.",
          data: appointment,
        });
      }

      // Fallback
      return res.status(403).json({
        success: false,
        message: "Not authorized to perform this action.",
        data: null,
      });
    } catch (error) {
      logger.error("UnexpectedError", error);
      res.status(500).json({
        success: false,
        message: "An unexpected error occurred.",
        data: null,
      });
    }
  },
];

/**
 * Toggle visibility of an appointment for the patient
 * Allows patients to hide cancelled appointments from their personal dashboard
 * without deleting the appointment record
 * Patient submits: { hidden: true|false }
 * Only allows hiding cancelled appointments
 */
export const toggleHideAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { hidden } = req.body;

    // Guard: Ensure required parameters
    if (hidden === undefined || hidden === null) {
      return res.status(400).json({
        success: false,
        message: "Hidden flag is required.",
        data: null,
      });
    }

    // Guard: Ensure patient context
    if (!req.patientId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated.",
        data: null,
      });
    }

    // Find appointment
    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found.",
        data: null,
      });
    }

    // Guard: Verify appointment belongs to patient
    if (appointment.patientId.toString() !== req.patientId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to modify this appointment.",
        data: null,
      });
    }

    // Guard: Only allow hiding cancelled appointments
    if (appointment.status !== APPOINTMENT_STATUS.CANCELLED) {
      return res.status(400).json({
        success: false,
        message: "Only cancelled appointments can be hidden.",
        data: null,
      });
    }

    // Update hidden status
    appointment.hiddenByPatient = hidden === true;
    await appointment.save();

    res.json({
      success: true,
      message: hidden
        ? "Appointment hidden from your dashboard."
        : "Appointment restored to your dashboard.",
      data: appointment,
    });
  } catch (error) {
    logger.error("UnexpectedError", error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
};

/**
 * Update or add intake form (triage) to an existing appointment
 * Secretary/Doctor can add/update triage data
 * Protected: Secretary & Doctor roles only
 * PATCH /api/appointments/:id/intake
 * Body: { intakeForm: { chiefComplaint, vitals, medicalHistory, allergies, pregnancyOrLactation } }
 */
export const updateIntakeForm = async (req, res) => {
  try {
    const { id } = req.params;
    const { intakeForm } = req.body;

    if (!intakeForm) {
      return res.status(400).json({
        success: false,
        message: "Intake form data is required.",
        data: null,
      });
    }

    // Find appointment
    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found.",
        data: null,
      });
    }

    // Verify tenant isolation - appointment must belong to user's clinic
    if (appointment.doctorId.toString() !== req.user?.doctorId?.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to modify this appointment.",
        data: null,
      });
    }

    // Update intake form
    appointment.intakeForm = intakeForm;
    await appointment.save();

    res.json({
      success: true,
      message: "Intake form updated successfully.",
      data: appointment,
    });
  } catch (error) {
    logger.error("updateIntakeForm: UnexpectedError", error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
};
