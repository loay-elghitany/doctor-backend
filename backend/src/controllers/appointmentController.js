import Appointment from "../models/Appointment.js";
import Doctor from "../models/Doctor.js";
import Patient from "../models/Patient.js";
import { APPOINTMENT_STATUS } from "../utils/appointmentConstants.js";
import { isPast, parseISO } from "date-fns";
import PatientTimelineEvent from "../models/PatientTimelineEvent.js";
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
 * Patient submits: { date, timeSlot?, notes }
 * doctorId is resolved via req.tenantId (set by tenantScope middleware)
 * Supports backward compatibility: if doctorId in body, it will be used (via tenantScope)
 */
export const createAppointment = async (req, res) => {
  try {
    const { date, timeSlot = "09:00", notes } = req.body;

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

    // Guard: Ensure patient and doctor context
    if (!req.patientId || !req.tenantId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated.",
        data: null,
      });
    }

    // NEW: Check if doctor subscription is active
    // This prevents booking appointments if doctor has deactivated their subscription
    const doctor = await Doctor.findById(req.tenantId);
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

    // Check for booking conflicts
    const conflict = await hasBookingConflict(
      req.tenantId,
      parsedDate,
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

    const appointment = await Appointment.create({
      doctorId: req.tenantId,
      patientId: req.patientId,
      date: parsedDate,
      timeSlot,
      notes,
    });

    // Auto-create timeline event for new appointment
    try {
      await createTimelineEvent({
        patientId: req.patientId,
        doctorId: req.tenantId,
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
      console.error(
        "[createAppointment] Failed to create timeline event:",
        timelineError.message,
      );
      // Don't fail the appointment creation if timeline event fails
    }

    // Send WhatsApp notification to doctor and patient about new appointment (Scenario 1)
    try {
      const patient = await Patient.findById(req.patientId);
      const doctorFromDb = await Doctor.findById(req.tenantId);

      const doctorName = doctorFromDb?.name || "الدكتور";
      const patientName = patient?.name || "المريض";
      const patientPhone = patient?.phoneNumber || "غير متوفر";
      const doctorPhone = doctorFromDb?.phoneNumber || "غير متوفر";
      const dateLabel = parsedDate.toLocaleDateString();

      const doctorMessage = `مرحباً د. ${doctorName}، تم حجز موعد جديد في عيادتك 📅. تفاصيل الحجز: 👤 المريض: ${patientName} | 📞 الهاتف: ${patientPhone} | ⏰ التاريخ: ${dateLabel} | ⌚ الوقت: ${timeSlot}.${
        notes ? `\nملاحظة: ${notes}` : ""
      }`;

      const patientMessage = `مرحباً ${patientName}، تم تأكيد موعدك مع د. ${doctorName} بنجاح 📅. ⏰ التاريخ: ${dateLabel} | ⌚ الوقت: ${timeSlot}. يمكنك متابعة حالة الموعد عبر حسابك. نتمنى لك الصحة والعافية!`;

      const doctorNotification = createAndSendNotification({
        recipientId: req.tenantId,
        recipientType: "Doctor",
        type: "appointment_created",
        title: "حجز موعد جديد",
        message: doctorMessage,
        appointmentId: appointment._id,
        doctorId: req.tenantId,
        patientId: req.patientId,
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
        recipientId: req.patientId,
        recipientType: "Patient",
        type: "appointment_created",
        title: "تم تأكيد الموعد",
        message: patientMessage,
        appointmentId: appointment._id,
        doctorId: req.tenantId,
        patientId: req.patientId,
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
      console.error(
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
    console.error(error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
};

/**
 * Get all appointments for the logged-in patient
 * Filtered by doctorId (via req.tenantId) and patientId
 */
export const getAppointments = async (req, res) => {
  try {
    // Guard: Ensure patient context
    if (!req.patientId || !req.tenantId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated.",
        data: null,
      });
    }

    // Exclude appointments hidden by the patient
    const appointments = await Appointment.find({
      doctorId: req.tenantId,
      patientId: req.patientId,
      hiddenByPatient: { $ne: true },
    }).sort({ date: 1 });

    res.json({
      success: true,
      message: "Appointments retrieved successfully.",
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
 * Patient chooses one of the doctor's proposed reschedule times
 * Body: { optionIndex: 0|1|2 }
 */
export const chooseTime = async (req, res) => {
  try {
    const { optionIndex } = req.body;

    // Guard: Ensure patient context
    if (!req.patientId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated.",
        data: null,
      });
    }

    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found.",
        data: null,
      });
    }

    // Ensure the patient owns the appointment
    if (appointment.patientId.toString() !== req.patientId.toString()) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to perform this action.",
        data: null,
      });
    }

    // Guard: Cannot choose time for a cancelled appointment
    if (appointment.status === APPOINTMENT_STATUS.CANCELLED) {
      return res.status(400).json({
        success: false,
        message: "Cannot choose a time for a cancelled appointment.",
        data: null,
      });
    }

    // Guard: Must be in reschedule_proposed state
    if (appointment.status !== APPOINTMENT_STATUS.RESCHEDULE_PROPOSED) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot choose a time for an appointment that is not in the 'reschedule_proposed' state.",
        data: null,
      });
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
      console.error(
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
      const formattedDate = selectedDate.toLocaleDateString();

      const doctorMessage = `مرحباً د. ${doctorName}، المريض ${patientName} قد أكد الموعد المقترح بنجاح ✅. 📞 هاتف التواصل: ${patientPhone} | ⏰ التاريخ: ${formattedDate} | ⌚ الوقت: ${selectedTimeSlot}.`;

      const patientMessage = `مرحباً ${patientName}، لقد أكدت الموعد المقترح مع د. ${doctorName} ✅. ⏰ التاريخ: ${formattedDate} | ⌚ الوقت: ${selectedTimeSlot}. نتطلع لرؤيتك في العيادة!`;

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
      console.error(
        "[chooseTime] Failed to send notifications:",
        notificationError.message,
      );
      // Don't fail the confirmation if notification fails
    }

    res.json({
      success: true,
      message: "Appointment time has been confirmed.",
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
 * Cancel an appointment (patient-initiated)
 * Accessible to both doctor and patient, but with different rules
 */
export const cancelAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

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
        console.error(
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
        console.error(
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
        console.error(
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
        console.error(
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
    console.error(error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
};

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
    console.error(error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
};
