import { APPOINTMENT_STATUS } from "./appointmentConstants.js";
import Appointment from "../models/Appointment.js";

/**
 * Converts an appointment status enum into a user-friendly string.
 * @param {string} status - The appointment status enum.
 * @returns {string} A human-readable status label.
 */
export const getStatusLabel = (status) => {
  switch (status) {
    case APPOINTMENT_STATUS.PENDING:
      return "Pending Confirmation";
    case "confirmed":
      return "Scheduled";
    case APPOINTMENT_STATUS.SCHEDULED:
      return "Scheduled";
    case APPOINTMENT_STATUS.COMPLETED:
      return "Completed";
    case APPOINTMENT_STATUS.CANCELLED:
      return "Cancelled";
    case APPOINTMENT_STATUS.REJECTED:
      return "Rejected";
    case APPOINTMENT_STATUS.NO_SHOW:
      return "No Show";
    case APPOINTMENT_STATUS.RESCHEDULE_PROPOSED:
      return "Reschedule Proposed";
    default:
      return "Unknown";
  }
};

/**
 * Validate time slot format (HH:MM)
 * @param {string} timeSlot - Time slot in HH:MM format
 * @returns {boolean} True if valid format
 */
export const isValidTimeSlot = (timeSlot) => {
  if (typeof timeSlot !== "string") return false;
  return /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeSlot);
};

/**
 * Check for booking conflicts for a doctor's time slot
 * Returns true if slot is already booked for active appointments
 * @param {ObjectId} doctorId - Doctor's MongoDB ID
 * @param {Date} date - Appointment date
 * @param {string} timeSlot - Time slot in HH:MM format
 * @param {ObjectId} excludeAppointmentId - Optional: appointment ID to exclude from check
 * @returns {Promise<boolean>} True if conflict exists
 */
export const hasBookingConflict = async (
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

/**
 * Ensure appointment can be transitioned to a new status
 * @param {string} currentStatus - Current appointment status
 * @param {string} newStatus - Desired appointment status
 * @returns {object} { valid: boolean, message: string }
 */
export const validateStatusTransition = (currentStatus, newStatus) => {
  // Once cancelled, no transitions allowed
  if (currentStatus === APPOINTMENT_STATUS.CANCELLED) {
    return {
      valid: false,
      message: "Cannot modify a cancelled appointment.",
    };
  }

  // Once completed, no transitions allowed
  if (currentStatus === APPOINTMENT_STATUS.COMPLETED) {
    return {
      valid: false,
      message: "Cannot modify a completed appointment.",
    };
  }

  // Valid transitions
  const validTransitions = {
    [APPOINTMENT_STATUS.PENDING]: [
      APPOINTMENT_STATUS.CANCELLED,
      APPOINTMENT_STATUS.RESCHEDULE_PROPOSED,
      APPOINTMENT_STATUS.SCHEDULED,
      APPOINTMENT_STATUS.REJECTED,
    ],
    confirmed: [APPOINTMENT_STATUS.CANCELLED, APPOINTMENT_STATUS.COMPLETED],
    [APPOINTMENT_STATUS.SCHEDULED]: [
      APPOINTMENT_STATUS.CANCELLED,
      APPOINTMENT_STATUS.COMPLETED,
    ],
    [APPOINTMENT_STATUS.RESCHEDULE_PROPOSED]: [
      APPOINTMENT_STATUS.SCHEDULED,
      APPOINTMENT_STATUS.CANCELLED,
    ],
  };

  const allowed = validTransitions[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    return {
      valid: false,
      message: `Cannot transition from ${currentStatus} to ${newStatus}.`,
    };
  }

  return { valid: true, message: "" };
};
