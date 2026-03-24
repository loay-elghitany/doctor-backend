import Appointment from "../models/Appointment.js";
import Patient from "../models/Patient.js";
import { APPOINTMENT_STATUS } from "../utils/appointmentConstants.js";
import { isPast, parseISO, isBefore } from "date-fns";
import { createTimelineEvent } from "./doctorTimelineController.js";
import { createAndSendNotification } from "../services/whatsappNotificationService.js";

/**
 * Validate time slot format (HH:MM)
 */
const isValidTimeSlot = (timeSlot) => {
  return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeSlot);
};

/**
 * Check for booking conflicts
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
    isDeleted: { $ne: true },
  };

  if (excludeAppointmentId) {
    query._id = { $ne: excludeAppointmentId };
  }

  const conflict = await Appointment.findOne(query);
  return !!conflict;
};

/**
 * Get all appointments for the doctor
 * Doctor identity resolved via req.doctor._id
 * Uses efficient indexing for performance
 */
export const getDoctorAppointments = async (req, res) => {
  try {
    // Guard: Ensure doctor context
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor.",
        data: null,
      });
    }

    // Use req.doctor._id as single source of truth for doctor identity
    const appointments = await Appointment.find({
      doctorId: req.doctor._id,
      isDeleted: { $ne: true },
    })
      .populate("patientId", "name email")
      .sort({ date: 1 });

    res.json({
      success: true,
      message: "Doctor appointments retrieved successfully.",
      data: appointments,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
};

/**
 * Soft-delete a single appointment (doctor-initiated)
 * Only allowed for cancelled, completed, or expired appointments
 */
export const doctorDeleteAppointment = async (req, res) => {
  try {
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor.",
        data: null,
      });
    }

    const appointment = await Appointment.findOne({
      _id: req.params.id,
      doctorId: req.doctor._id,
      isDeleted: { $ne: true },
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found.",
        data: null,
      });
    }

    // Allowed delete states: cancelled, completed, expired (past date and not confirmed/scheduled)
    const now = new Date();
    const isExpired =
      appointment.date &&
      appointment.date < now &&
      ![APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.SCHEDULED].includes(
        appointment.status,
      );
    const isCancelled = appointment.status === APPOINTMENT_STATUS.CANCELLED;
    const isCompleted =
      appointment.status === APPOINTMENT_STATUS.COMPLETED ||
      appointment.status === "completed"; // keep backward-compatible if used elsewhere

    if (!isCancelled && !isCompleted && !isExpired) {
      return res.status(400).json({
        success: false,
        message: "Appointment cannot be deleted in its current state.",
        data: null,
      });
    }

    appointment.isDeleted = true;
    appointment.deletedAt = new Date();
    await appointment.save();

    console.log("[doctorDeleteAppointment] soft-deleted appointment", {
      appointmentId: appointment._id,
      doctorId: req.doctor._id,
    });

    res.json({
      success: true,
      message: "Appointment removed from dashboard.",
      data: { id: appointment._id },
    });
  } catch (error) {
    console.error("[doctorDeleteAppointment] error", error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
};

/**
 * Bulk cleanup: soft-delete old/cancelled/completed appointments for doctor
 */
export const doctorBulkCleanupAppointments = async (req, res) => {
  try {
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor.",
        data: null,
      });
    }

    const now = new Date();

    const query = {
      doctorId: req.doctor._id,
      isDeleted: { $ne: true },
      $or: [
        { status: APPOINTMENT_STATUS.CANCELLED },
        { status: APPOINTMENT_STATUS.COMPLETED },
        { status: "completed" }, // backward compatibility
        {
          date: { $lt: now },
          status: {
            $nin: [APPOINTMENT_STATUS.CONFIRMED, APPOINTMENT_STATUS.SCHEDULED],
          },
        },
      ],
    };

    const update = { $set: { isDeleted: true, deletedAt: new Date() } };

    const result = await Appointment.updateMany(query, update);

    const deletedCount = result.modifiedCount || result.nModified || 0;

    console.log("[doctorBulkCleanupAppointments] soft-deleted appointments", {
      doctorId: req.doctor._id,
      deletedCount,
    });

    res.json({
      success: true,
      message: "Cleanup completed.",
      data: { deletedCount },
    });
  } catch (error) {
    console.error("[doctorBulkCleanupAppointments] error", error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
};

/**
 * Update the status of an appointment
 * Doctor-initiated endpoint for status changes (excluding cancellations)
 */
export const updateAppointmentStatus = async (req, res) => {
  try {
    const { status, date, timeSlot } = req.body;

    console.log("[updateAppointmentStatus] Request received", {
      appointmentId: req.params.id,
      doctorId: req.doctor?._id,
      status,
      dateProvided: !!date,
      timeSlotProvided: !!timeSlot,
    });

    // Guard: Ensure doctor context
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor.",
        data: null,
      });
    }

    // Validate the provided status
    if (status && !Object.values(APPOINTMENT_STATUS).includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment status.",
        data: null,
      });
    }

    // Doctors should use the dedicated cancel route for cancellations
    if (status === APPOINTMENT_STATUS.CANCELLED) {
      return res.status(400).json({
        success: false,
        message: "Please use the cancel appointment endpoint to cancel.",
        data: null,
      });
    }

    // Use req.doctor._id as single source of truth
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      doctorId: req.doctor._id,
      isDeleted: { $ne: true },
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found.",
        data: null,
      });
    }

    // Guard: Cannot update a cancelled appointment
    if (appointment.status === APPOINTMENT_STATUS.CANCELLED) {
      return res.status(400).json({
        success: false,
        message: "Cannot update a cancelled appointment.",
        data: null,
      });
    }

    if (status) {
      // CRITICAL FIX: Convert 'confirmed' to 'scheduled' for all doctor acceptance actions.
      // Doctor accept must result in 'scheduled' (upcoming appointment), not 'completed'.
      // 'confirmed' is deprecated for acceptance; 'scheduled' is the correct pre-visit status.
      let finalStatus = status;
      if (status === APPOINTMENT_STATUS.CONFIRMED) {
        finalStatus = APPOINTMENT_STATUS.SCHEDULED;
        console.log(
          "[updateAppointmentStatus] Converting legacy CONFIRMED to SCHEDULED",
          { appointmentId: appointment._id },
        );
      }

      // Defensive guard: Prevent 'completed' from being set via generic status update.
      // 'completed' must ONLY be set by explicit markAppointmentCompleted action.
      if (finalStatus === APPOINTMENT_STATUS.COMPLETED) {
        return res.status(400).json({
          success: false,
          message:
            "Cannot set completed status here. Use the 'Mark as Completed' action instead.",
          data: null,
        });
      }

      appointment.status = finalStatus;
      // Add status change to history for tracking
      appointment.statusHistory = appointment.statusHistory || [];
      appointment.statusHistory.push({
        status: finalStatus,
        timestamp: new Date(),
      });
    }

    if (date) {
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

      // Prevent choosing past dates
      if (isPast(parsedDate)) {
        return res.status(400).json({
          success: false,
          message: "Cannot update an appointment to a past date.",
          data: null,
        });
      }

      // Check for booking conflicts if updating date/timeSlot
      const newTimeSlot = timeSlot || appointment.timeSlot || "09:00";
      const conflict = await hasBookingConflict(
        appointment.doctorId,
        parsedDate,
        newTimeSlot,
        appointment._id,
      );
      if (conflict) {
        return res.status(409).json({
          success: false,
          message:
            "This time slot is already booked. Please choose another time.",
          data: null,
        });
      }

      appointment.date = parsedDate;
    }

    if (timeSlot) {
      if (!isValidTimeSlot(timeSlot)) {
        return res.status(400).json({
          success: false,
          message: "Invalid timeSlot format. Use HH:MM (e.g., 09:00, 14:30).",
          data: null,
        });
      }

      // Check for booking conflict with new timeSlot on current date
      const conflict = await hasBookingConflict(
        appointment.doctorId,
        appointment.date,
        timeSlot,
        appointment._id,
      );
      if (conflict) {
        return res.status(409).json({
          success: false,
          message:
            "This time slot is already booked. Please choose another time.",
          data: null,
        });
      }

      appointment.timeSlot = timeSlot;
    }

    console.log("[updateAppointmentStatus] Before save", {
      appointmentId: appointment._id,
      newStatus: appointment.status,
      hasDate: !!appointment.date,
      hasTimeSlot: !!appointment.timeSlot,
    });

    try {
      await appointment.save();
      console.log("[updateAppointmentStatus] Saved successfully", {
        appointmentId: appointment._id,
        newStatus: appointment.status,
      });
    } catch (saveError) {
      console.error(
        "[updateAppointmentStatus] Mongoose save error:",
        saveError.message,
      );
      throw saveError;
    }

    // Auto-create timeline event for status changes
    if (status) {
      try {
        const eventTypeMap = {
          [APPOINTMENT_STATUS.CONFIRMED]: "appointment_approved",
          [APPOINTMENT_STATUS.SCHEDULED]: "appointment_approved",
          [APPOINTMENT_STATUS.PENDING]: "appointment_rescheduled",
          [APPOINTMENT_STATUS.RESCHEDULE_PROPOSED]: "appointment_rescheduled",
        };

        const eventType = eventTypeMap[status] || "appointment_updated";
        const isConfirmedOrScheduled = [
          APPOINTMENT_STATUS.CONFIRMED,
          APPOINTMENT_STATUS.SCHEDULED,
        ].includes(status);
        const eventDescription = isConfirmedOrScheduled
          ? `Doctor confirmed appointment for ${appointment.date.toLocaleDateString()} at ${appointment.timeSlot}`
          : `Appointment status updated to ${status}`;

        await createTimelineEvent({
          patientId: appointment.patientId,
          doctorId: appointment.doctorId,
          appointmentId: appointment._id,
          eventType: eventType,
          eventTitle: `Appointment ${status}`,
          eventDescription: eventDescription,
          eventStatus: status,
          visibility: "patient_visible",
          metadata: {
            date: appointment.date,
            timeSlot: appointment.timeSlot,
            status: status,
          },
        });
      } catch (timelineError) {
        console.error(
          "[updateAppointmentStatus] Failed to create timeline event:",
          timelineError.message,
        );
        // Don't fail the update if timeline event fails
      }

      // Send WhatsApp notification to patient about status change
      try {
        const patient = await Patient.findById(appointment.patientId);
        const doctor = req.doctor;
        const patientName = patient?.name || "Patient";
        const doctorName = doctor?.name || "Doctor";

        let notificationType = "appointment_updated";
        let notificationTitle = "Appointment Status Updated";
        let notificationMessage = `Your appointment status has been updated to ${status}`;

        const isConfirmedOrScheduled = [
          APPOINTMENT_STATUS.CONFIRMED,
          APPOINTMENT_STATUS.SCHEDULED,
        ].includes(status);

        if (isConfirmedOrScheduled) {
          notificationType = "appointment_confirmed";
          notificationTitle = "تم تأكيد الموعد";
          const dateLabel = appointment.date.toLocaleDateString("ar-EG");
          notificationMessage = `مرحباً ${patientName}، خبر رائع! تم تأكيد موعدك مع د. ${doctorName} ✅. ⏰ نتطلع لرؤيتك في ${dateLabel} الساعة ${appointment.timeSlot}. نتمنى لك دوام الصحة.`;
        } else if (status === APPOINTMENT_STATUS.RESCHEDULE_PROPOSED) {
          notificationType = "appointment_proposed";
          notificationTitle = "تم اقتراح مواعيد بديلة";
          notificationMessage = `مرحباً ${patientName}، الطبيب غير متاح في الوقت المطلوب، ولكن تم اقتراح مواعيد بديلة 🔄. يرجى تسجيل الدخول إلى حسابك واختيار الوقت المناسب لتأكيد الحجز.`;
        }

        await createAndSendNotification({
          recipientId: appointment.patientId, // Patient
          recipientType: "Patient",
          type: notificationType,
          title: notificationTitle,
          message: notificationMessage,
          appointmentId: appointment._id,
          doctorId: appointment.doctorId,
          patientId: appointment.patientId,
          actionUrl: `/patient/appointments/${appointment._id}`,
          metadata: {
            status,
            date: appointment.date,
            timeSlot: appointment.timeSlot,
            doctorName,
          },
        });
      } catch (notificationError) {
        console.error(
          "[updateAppointmentStatus] Failed to send notification:",
          notificationError.message,
        );
        // Don't fail the update if notification fails
      }
    }

    res.json({
      success: true,
      message: "Appointment updated successfully.",
      data: appointment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
};

/**
 * Propose new times for an appointment (doctor-initiated rescheduling)
 * Doctor provides 3 alternative date/time options
 */
export const proposeTimes = async (req, res) => {
  try {
    console.log("[proposeTimes] Request received", {
      appointmentId: req.params.id,
      doctorId: req.doctor?._id,
      bodyStructure: Object.keys(req.body),
      rescheduleOptionsType: Array.isArray(req.body.rescheduleOptions)
        ? "array"
        : typeof req.body.rescheduleOptions,
      rescheduleOptionsLength:
        Array.isArray(req.body.rescheduleOptions) &&
        req.body.rescheduleOptions.length,
    });

    const { rescheduleOptions } = req.body;

    // Guard: Ensure doctor context
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor.",
        data: null,
      });
    }

    // Defensive validation: rescheduleOptions must be array
    if (!Array.isArray(rescheduleOptions)) {
      return res.status(400).json({
        success: false,
        message: "rescheduleOptions must be an array.",
        data: null,
      });
    }

    if (rescheduleOptions.length !== 3) {
      return res.status(400).json({
        success: false,
        message: "You must provide exactly 3 time options.",
        data: null,
      });
    }

    // Validate all options have valid dates and timeSlots
    const validatedOptions = [];
    for (const option of rescheduleOptions) {
      // Defensive: Ensure option is an object with required fields
      if (!option || typeof option !== "object") {
        return res.status(400).json({
          success: false,
          message: "Each reschedule option must be a valid object.",
          data: null,
        });
      }

      if (!option.date) {
        return res.status(400).json({
          success: false,
          message: "Each reschedule option must have a date.",
          data: null,
        });
      }

      let parsedDate;
      try {
        parsedDate = parseISO(option.date);
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format. Use ISO 8601.",
          data: null,
        });
      }

      // Prevent proposing past dates
      if (isPast(parsedDate)) {
        return res.status(400).json({
          success: false,
          message: "Cannot propose reschedule options in the past.",
          data: null,
        });
      }

      // Defensive: Ensure timeSlot is provided
      if (!option.timeSlot) {
        return res.status(400).json({
          success: false,
          message: "Each reschedule option must have a timeSlot.",
          data: null,
        });
      }

      // Validate timeSlot format
      if (!isValidTimeSlot(option.timeSlot)) {
        return res.status(400).json({
          success: false,
          message: "Invalid timeSlot format in reschedule options. Use HH:MM.",
          data: null,
        });
      }

      validatedOptions.push({
        date: parsedDate,
        timeSlot: option.timeSlot,
        chosen: false,
      });
    }

    // Use req.doctor._id as single source of truth
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      doctorId: req.doctor._id,
      isDeleted: { $ne: true },
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found.",
        data: null,
      });
    }

    // Guard: Cannot propose times for a cancelled appointment
    if (appointment.status === APPOINTMENT_STATUS.CANCELLED) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot propose reschedule options for a cancelled appointment.",
        data: null,
      });
    }

    // Limit rescheduling to once
    if (appointment.rescheduleCount > 0) {
      return res.status(400).json({
        success: false,
        message:
          "This appointment has already been rescheduled once. No further rescheduling allowed.",
        data: null,
      });
    }

    // Ensure none of the proposed slots conflict with other bookings
    for (const option of validatedOptions) {
      const conflict = await hasBookingConflict(
        req.doctor._id,
        option.date,
        option.timeSlot,
      );
      if (conflict) {
        return res.status(409).json({
          success: false,
          message: `One or more proposed times are already booked. Please choose different times.`,
          data: null,
        });
      }
    }

    appointment.rescheduleOptions = validatedOptions;
    appointment.status = APPOINTMENT_STATUS.RESCHEDULE_PROPOSED;
    appointment.rescheduleCount += 1;

    console.log("[proposeTimes] Before save", {
      appointmentId: appointment._id,
      optionCount: validatedOptions.length,
      newStatus: appointment.status,
    });

    try {
      await appointment.save();
      console.log("[proposeTimes] Saved successfully", {
        appointmentId: appointment._id,
        optionCount: appointment.rescheduleOptions.length,
      });
    } catch (saveError) {
      console.error("[proposeTimes] Mongoose save error:", saveError.message);
      throw saveError;
    }

    // Send WhatsApp notification to patient about proposed times
    try {
      const patient = await Patient.findById(appointment.patientId);
      const doctor = req.doctor;
      const patientName = patient?.name || "المريض";
      const doctorName = doctor?.name || "الدكتور";

      const optionsText = validatedOptions
        .map(
          (opt, idx) =>
            `الخيار ${idx + 1}: ${opt.date.toLocaleDateString("ar-EG")} الساعة ${opt.timeSlot}`,
        )
        .join("\n");

      const message = `مرحباً ${patientName}، الطبيب غير متاح في الوقت المطلوب، لكنه اقترح المواعيد التالية 🔄:\n\n${optionsText}\n\nيرجى تسجيل الدخول إلى حسابك واختيار الوقت المناسب لتأكيد الحجز.`;

      await createAndSendNotification({
        recipientId: appointment.patientId, // Patient
        recipientType: "Patient",
        type: "appointment_proposed",
        title: "اقتراح مواعيد بديلة",
        message,
        appointmentId: appointment._id,
        doctorId: appointment.doctorId,
        patientId: appointment.patientId,
        actionUrl: `/patient/appointments/${appointment._id}`,
        metadata: {
          options: validatedOptions,
          doctorName,
          doctorId: appointment.doctorId,
        },
      });
    } catch (notificationError) {
      console.error(
        "[proposeTimes] Failed to send notification:",
        notificationError.message,
      );
      // Don't fail the proposal if notification fails
    }

    res.json({
      success: true,
      message: "Reschedule options have been sent to the patient.",
      data: appointment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
};

/**
 * Cancel an appointment (doctor-initiated)
 * Doctors can cancel at any time, regardless of appointment status
 */
export const cancelAppointment = async (req, res) => {
  try {
    // Use req.doctor._id as single source of truth
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor.",
        data: null,
      });
    }

    const appointment = await Appointment.findOne({
      _id: req.params.id,
      doctorId: req.doctor._id,
      isDeleted: { $ne: true },
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found.",
        data: null,
      });
    }

    // Prevent double cancellation
    if (appointment.status === APPOINTMENT_STATUS.CANCELLED) {
      return res.status(400).json({
        success: false,
        message: "This appointment has already been cancelled.",
        data: null,
      });
    }

    // Doctors can cancel at any time
    appointment.status = APPOINTMENT_STATUS.CANCELLED;
    appointment.cancelledBy = req.doctor._id;
    appointment.cancelledByType = "Doctor";
    // Clear reschedule options to prevent confusion
    appointment.rescheduleOptions = [];

    await appointment.save();

    // Auto-create timeline event for doctor cancellation
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
      console.error(
        "[cancelAppointment] Failed to create timeline event:",
        timelineError.message,
      );
      // Don't fail the cancellation if timeline event fails
    }

    // Send WhatsApp notification to patient about cancellation
    try {
      const patient = await Patient.findById(appointment.patientId);
      const doctor = req.doctor;
      const patientName = patient?.name || "المريض";
      const doctorName = doctor?.name || "الدكتور";
      const dateLabel = appointment.date.toLocaleDateString("ar-EG");

      const isConfirmedOrScheduled = [
        APPOINTMENT_STATUS.CONFIRMED,
        APPOINTMENT_STATUS.SCHEDULED,
      ].includes(appointment.status);

      const message = isConfirmedOrScheduled
        ? `تنبيه هام ⚠️. مرحباً ${patientName}، نأسف لإبلاغك أن موعدك القادم مع د. ${doctorName} المقرر في ${dateLabel} الساعة ${appointment.timeSlot} تم إلغاؤه بسبب ظروف طارئة. الرجاء التواصل معنا أو حجز موعد بديل.`
        : `مرحباً ${patientName}، نأسف لإبلاغك أن موعدك مع د. ${doctorName} لا يمكن قبوله في الوقت الحالي ❌. يرجى تسجيل الدخول إلى حسابك لحجز موعد في وقت آخر.`;

      await createAndSendNotification({
        recipientId: appointment.patientId, // Patient
        recipientType: "Patient",
        type: "appointment_cancelled",
        title: "تم إلغاء الموعد",
        message,
        appointmentId: appointment._id,
        doctorId: appointment.doctorId,
        patientId: appointment.patientId,
        actionUrl: `/patient/appointments`,
        metadata: {
          date: appointment.date,
          timeSlot: appointment.timeSlot,
          cancelledBy: "doctor",
          doctorName,
        },
      });
    } catch (notificationError) {
      console.error(
        "[cancelAppointment] Failed to send notification:",
        notificationError.message,
      );
      // Don't fail the cancellation if notification fails
    }

    res.json({
      success: true,
      message: "Appointment cancelled by doctor.",
      data: appointment,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
};
/**
 * Mark an appointment as completed
 * Doctor-initiated endpoint to explicitly mark appointment as finished
 * Only available for scheduled appointments that have passed or immediately after
 */
export const markAppointmentCompleted = async (req, res) => {
  try {
    const { notes } = req.body;

    // Guard: Ensure doctor context
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor.",
        data: null,
      });
    }

    // Use req.doctor._id as single source of truth
    const appointment = await Appointment.findOne({
      _id: req.params.id,
      doctorId: req.doctor._id,
      isDeleted: { $ne: true },
    });

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found.",
        data: null,
      });
    }

    // Guard: Cannot mark a cancelled appointment as completed
    if (appointment.status === APPOINTMENT_STATUS.CANCELLED) {
      return res.status(400).json({
        success: false,
        message: "Cannot mark a cancelled appointment as completed.",
        data: null,
      });
    }

    // Guard: Can only mark scheduled or confirmed appointments as completed
    const isScheduledOrConfirmed = [
      APPOINTMENT_STATUS.SCHEDULED,
      APPOINTMENT_STATUS.CONFIRMED,
    ].includes(appointment.status);

    if (!isScheduledOrConfirmed) {
      return res.status(400).json({
        success: false,
        message:
          "Only scheduled or confirmed appointments can be marked as completed.",
        data: null,
      });
    }

    // Store previous status for logging
    const previousStatus = appointment.status;

    // Set status to completed
    appointment.status = APPOINTMENT_STATUS.COMPLETED;
    if (notes) {
      appointment.notes = notes;
    }

    await appointment.save();

    console.log("[markAppointmentCompleted] Appointment marked completed", {
      appointmentId: appointment._id,
      doctorId: req.doctor._id,
      previousStatus,
    });

    // Auto-create timeline event for completion
    try {
      await createTimelineEvent({
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        appointmentId: appointment._id,
        eventType: "appointment_completed",
        eventTitle: "Appointment Completed",
        eventDescription: "Doctor marked appointment as completed",
        eventStatus: "completed",
        visibility: "patient_visible",
        metadata: {
          completedOn: new Date(),
          date: appointment.date,
          timeSlot: appointment.timeSlot,
          notes: notes || null,
        },
      });
    } catch (timelineError) {
      console.error(
        "[markAppointmentCompleted] Failed to create timeline event:",
        timelineError.message,
      );
      // Don't fail the completion if timeline event fails
    }

    // Send WhatsApp notification to patient about completion
    try {
      const patient = await Patient.findById(appointment.patientId);
      const doctor = req.doctor;
      const patientName = patient?.name || "Patient";
      const doctorName = doctor?.name || "Doctor";

      await createAndSendNotification({
        recipientId: appointment.patientId, // Patient
        recipientType: "Patient",
        type: "appointment_completed",
        title: "Appointment Completed",
        message: `Your appointment with ${doctorName} on ${appointment.date.toLocaleDateString()} at ${appointment.timeSlot} has been marked as completed. Thank you for visiting.`,
        appointmentId: appointment._id,
        doctorId: appointment.doctorId,
        patientId: appointment.patientId,
        actionUrl: `/patient/appointments/${appointment._id}`,
        metadata: {
          date: appointment.date,
          timeSlot: appointment.timeSlot,
          doctorName,
          completedOn: new Date(),
        },
      });
    } catch (notificationError) {
      console.error(
        "[markAppointmentCompleted] Failed to send notification:",
        notificationError.message,
      );
      // Don't fail the completion if notification fails
    }

    res.json({
      success: true,
      message: "Appointment marked as completed.",
      data: appointment,
    });
  } catch (error) {
    console.error("[markAppointmentCompleted] error", error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
};
