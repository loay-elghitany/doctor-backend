import Appointment from "../models/Appointment.js";
import Doctor from "../models/Doctor.js";
import Patient from "../models/Patient.js";
import { APPOINTMENT_STATUS } from "../utils/appointmentConstants.js";
import { isPast, parseISO } from "date-fns";
import PatientTimelineEvent from "../models/PatientTimelineEvent.js";
import { createTimelineEvent } from "./doctorTimelineController.js";
import { createAndSendNotification } from "../services/whatsappNotificationService.js";
import enforceOwnership from "../middleware/enforceOwnership.js";
import logger from "../utils/logger.js";
import { errorResponse, successResponse } from "../utils/responseHelpers.js";
import { buildPagination, getPaginationParams } from "../utils/pagination.js";

/**
 * Validate time slot format (HH:MM)
 */
const isValidTimeSlot = (timeSlot) => {
  return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeSlot);
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
  const query = {
    doctorId,
    date: {
      $gte: new Date(date).setHours(0, 0, 0, 0),
      $lt: new Date(date).setHours(23, 59, 59, 999),
    },
    timeSlot,
    status: {
      $in: [
        APPOINTMENT_STATUS.PENDING,
        APPOINTMENT_STATUS.CONFIRMED,
        APPOINTMENT_STATUS.SCHEDULED,
      ],
    },
  };

  if (excludeAppointmentId) {
    query._id = { $ne: excludeAppointmentId };
  }

  const conflict = await Appointment.findOne(query);
  return !!conflict;
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
      timeSlot = "09:00",
      notes,
      patientId: requestedPatientId,
      doctorId: requestedDoctorId,
    } = req.body;

    const role = req.user?.role;
    const userId = req.user?._id;
    logger.debug("createAppointment: role details", {
      role,
      userId,
      doctorId: req.user?.doctorId,
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

        return { tenantId: req.tenantId, patientId };
      },
      secretary: async () => {
        const tenantId = req.tenantId;
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

    // Guard: Ensure required parameters
    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Appointment date is required.",
        data: null,
      });
    }

    // Guard: Validate time slot format
    if (!isValidTimeSlot(timeSlot)) {
      return res.status(400).json({
        success: false,
        message: "Invalid timeSlot format. Use HH:MM (e.g., 09:00, 14:30).",
        data: null,
      });
    }

    // Parse and validate date
    let parsedDate;
    try {
      parsedDate = parseISO(date);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use ISO 8601 (e.g., 2026-02-06).",
        data: null,
      });
    }

    // Prevent past appointments
    if (isPast(parsedDate)) {
      return res.status(400).json({
        success: false,
        message: "Cannot create an appointment in the past.",
        data: null,
      });
    }

    let tenantId;
    let patientId;

    const appointmentContext = await resolveAppointmentContext[role]();
    if (appointmentContext?.error) {
      return res
        .status(appointmentContext.error.status)
        .json(appointmentContext.error.body);
    }

    ({ tenantId, patientId } = appointmentContext);

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        message:
          "Appointment must be linked to a doctor. Please provide a valid doctorId.",
        data: null,
      });
    }

    // NEW: Check if doctor subscription is active
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

    const conflict = await hasBookingConflict(tenantId, parsedDate, timeSlot);
    if (conflict) {
      return res.status(409).json({
        success: false,
        message:
          "This time slot is already booked. Please choose another time.",
        data: null,
      });
    }

    const appointmentPayload = {
      doctorId: tenantId,
      patientId,
      date: parsedDate,
      timeSlot,
      notes,
      createdBy: role === "secretary" ? "secretary" : "patient",
      createdById: userId,
      createdByRef: role === "secretary" ? "Secretary" : "Patient",
    };

    if (role === "secretary") {
      appointmentPayload.status = APPOINTMENT_STATUS.SCHEDULED;
    }

    const appointment = await Appointment.create(appointmentPayload);

    // Auto-create timeline event for new appointment
    try {
      await createTimelineEvent({
        patientId,
        doctorId: tenantId,
        appointmentId: appointment._id,
        eventType: "appointment_created",
        eventTitle: "Appointment Scheduled",
        eventDescription: `Appointment scheduled for ${parsedDate.toLocaleDateString()} at ${timeSlot}`,
        eventStatus: "pending",
        visibility: "patient_visible",
        metadata: {
          date: parsedDate,
          timeSlot: timeSlot,
          notes: notes || "",
        },
      });
    } catch (timelineError) {
      logger.error(
        "[createAppointment] Failed to create timeline event:",
        timelineError.message,
      );
      // Don't fail the appointment creation if timeline event fails
    }

    // Send WhatsApp notification to doctor and patient about new appointment (Scenario 1)
    try {
      const patient = await Patient.findById(patientId);
      const doctorFromDb = await Doctor.findById(tenantId);

      const doctorName = doctorFromDb?.name || "الدكتور";
      const patientName = patient?.name || "المريض";
      const patientPhone = patient?.phoneNumber || "غير متوفر";
      const doctorPhone = doctorFromDb?.phoneNumber || "غير متوفر";
      const dateLabel = parsedDate.toLocaleDateString("ar-EG");

      const doctorMessage = `طلب موعد جديد 🔔. المريض: ${patientName} | 📞 الهاتف: ${patientPhone} | ⏰ التاريخ المطلوب: ${dateLabel} | ⌚ الوقت: ${timeSlot}. الرجاء تسجيل الدخول للمنصة للموافقة أو الرفض أو اقتراح موعد بديل.`;

      const patientMessage = `مرحباً ${patientName}، تم استلام طلب موعدك مع د. ${doctorName} 📅. ⏰ التاريخ: ${dateLabel} | ⌚ الوقت: ${timeSlot}. طلبك قيد المراجعة وسنبلغك فور تأكيد الطبيب.`;

      const doctorNotification = createAndSendNotification({
        recipientId: tenantId,
        recipientType: "Doctor",
        type: "appointment_created",
        title: "حجز موعد جديد",
        message: doctorMessage,
        appointmentId: appointment._id,
        doctorId: tenantId,
        patientId,
        actionUrl: `/doctor/appointments`,
        metadata: {
          patientName,
          patientPhone,
          date: parsedDate,
          timeSlot,
          notes,
        },
      });

      const patientNotification = createAndSendNotification({
        recipientId: patientId,
        recipientType: "Patient",
        type: "appointment_created",
        title: "تم تأكيد الموعد",
        message: patientMessage,
        appointmentId: appointment._id,
        doctorId: tenantId,
        patientId,
        actionUrl: `/patient/appointments/${appointment._id}`,
        metadata: {
          doctorName,
          doctorPhone,
          date: parsedDate,
          timeSlot,
          notes,
        },
      });

      await Promise.allSettled([doctorNotification, patientNotification]);
    } catch (notificationError) {
      logger.error(
        "[createAppointment] Failed to send notifications:",
        notificationError.message,
      );
      // Don't fail the appointment creation if notification fails
    }

    res.status(201).json({
      success: true,
      message: "Appointment created successfully.",
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

    logger.debug("getUnifiedAppointments: Extracted", {
      role,
      userId: actualUserId,
      doctorId,
    });

    if (!role || !actualUserId) {
      logger.debug("getUnifiedAppointments: Missing role or userId");
      return res.status(400).json({
        success: false,
        message: "Invalid user data",
        data: null,
      });
    }

    const roleStrategies = {
      doctor: () => {
        const query = { doctorId: req.tenantId };
        logger.debug("getUnifiedAppointments: DOCTOR query", { query });
        return { query };
      },
      secretary: () => {
        const query = { doctorId: req.tenantId };
        logger.debug("getUnifiedAppointments: SECRETARY query", {
          query,
          tenantId: req.tenantId,
        });
        return { query };
      },
      patient: () => {
        const query = {
          patientId: actualUserId,
          hiddenByPatient: { $ne: true },
          doctorId: req.tenantId,
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
    const totalItems = await Appointment.countDocuments(strategy.query);

    const appointments = await Appointment.find(strategy.query)
      .populate("patientId", "name email phoneNumber")
      .populate("doctorId", "name email")
      .sort({ date: 1 })
      .skip(skip)
      .limit(limit);

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

      return {
        ...appointment,
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
 * Body: { optionIndex: 0|1|2 }
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
        return errorResponse(res, 403, "You are not authorized to perform this action.");
      }

      // Guard: Cannot choose time for a cancelled appointment
      if (appointment.status === APPOINTMENT_STATUS.CANCELLED) {
        return errorResponse(res, 400, "Cannot choose a time for a cancelled appointment.");
      }

      // Guard: Must be in reschedule_proposed state
      if (appointment.status !== APPOINTMENT_STATUS.RESCHEDULE_PROPOSED) {
        return errorResponse(
          res,
          400,
          "Cannot choose a time for an appointment that is not in the 'reschedule_proposed' state.",
        );
      }

    if (
      optionIndex === undefined ||
      optionIndex < 0 ||
      optionIndex > 2 ||
      !appointment.rescheduleOptions[optionIndex]
    ) {
      return res.status(400).json({
        success: false,
        message: "The selected option is invalid.",
        data: null,
      });
    }

    // Check for booking conflict with the chosen time
    const selectedOption = appointment.rescheduleOptions[optionIndex];
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
    } catch (notificationError) {
      logger.error(
        "[chooseTime] Failed to send notifications:",
        notificationError.message,
      );
      // Don't fail the confirmation if notification fails
    }

    return successResponse(res, appointment, "Appointment time has been confirmed.");
  } catch (error) {
    logger.error("UnexpectedError", error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
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
        APPOINTMENT_STATUS.CONFIRMED,
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
