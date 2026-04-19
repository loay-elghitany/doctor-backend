/**
 * Centralized appointment permissions helper
 * Defines business rules for appointment actions based on status
 * Ensures consistent behavior across doctor and secretary roles
 */

/**
 * Get allowed actions for an appointment based on its status
 * @param {string} status - Appointment status
 * @returns {object} - Object with boolean flags for allowed actions
 */
export const getAppointmentPermissions = (status) => {
  const normalizedStatus = String(status || "").toLowerCase();

  switch (normalizedStatus) {
    case "confirmed":
    case "scheduled":
      // After confirmation, both doctor and secretary can:
      // - Cancel the appointment
      // - Mark as completed
      // - View details
      // Cannot reschedule
      return {
        canCancel: true,
        canMarkCompleted: true,
        canReschedule: false,
        canDelete: false,
        canView: true,
        canConfirm: false, // Already confirmed
      };

    case "cancelled":
      // Cancelled appointments can be deleted by both roles
      return {
        canCancel: false, // Already cancelled
        canMarkCompleted: false,
        canReschedule: false,
        canDelete: true,
        canView: true,
        canConfirm: false,
      };

    case "completed":
      // Completed appointments cannot be modified
      return {
        canCancel: false,
        canMarkCompleted: false,
        canReschedule: false,
        canDelete: true, // Allow cleanup
        canView: true,
        canConfirm: false,
      };

    case "pending":
      // Pending appointments can be confirmed, cancelled, or rescheduled
      return {
        canCancel: true,
        canMarkCompleted: false,
        canReschedule: true,
        canDelete: false,
        canView: true,
        canConfirm: true,
      };

    case "reschedule_proposed":
      // Awaiting patient response - limited actions
      return {
        canCancel: true,
        canMarkCompleted: false,
        canReschedule: false, // Already proposed
        canDelete: false,
        canView: true,
        canConfirm: false,
      };

    default:
      // Unknown status - conservative approach
      return {
        canCancel: false,
        canMarkCompleted: false,
        canReschedule: false,
        canDelete: false,
        canView: true,
        canConfirm: false,
      };
  }
};

/**
 * Check if an action is allowed for a given appointment status
 * @param {string} status - Appointment status
 * @param {string} action - Action to check ('cancel', 'markCompleted', 'reschedule', 'delete', 'view', 'confirm')
 * @returns {boolean} - Whether the action is allowed
 */
export const canPerformAction = (status, action) => {
  const permissions = getAppointmentPermissions(status);
  return (
    permissions[`can${action.charAt(0).toUpperCase()}${action.slice(1)}`] ||
    false
  );
};

/**
 * Get status-specific UI labels and descriptions
 * @param {string} status - Appointment status
 * @returns {object} - UI metadata for the status
 */
export const getStatusMetadata = (status) => {
  const normalizedStatus = String(status || "").toLowerCase();

  switch (normalizedStatus) {
    case "confirmed":
    case "scheduled":
      return {
        label: "Confirmed",
        description: "Appointment is scheduled and confirmed",
        color: "success",
        showRescheduleWarning: false,
      };

    case "cancelled":
      return {
        label: "Cancelled",
        description: "Appointment has been cancelled",
        color: "danger",
        showRescheduleWarning: false,
      };

    case "completed":
      return {
        label: "Completed",
        description: "Appointment has been completed",
        color: "secondary",
        showRescheduleWarning: false,
      };

    case "pending":
      return {
        label: "Pending",
        description: "Awaiting doctor confirmation",
        color: "warning",
        showRescheduleWarning: true,
      };

    case "reschedule_proposed":
      return {
        label: "Reschedule Proposed",
        description: "New times proposed, awaiting patient response",
        color: "info",
        showRescheduleWarning: false,
      };

    default:
      return {
        label: "Unknown",
        description: "Status unknown",
        color: "default",
        showRescheduleWarning: false,
      };
  }
};
