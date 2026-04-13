import Appointment from "../models/Appointment.js";
import { APPOINTMENT_STATUS } from "../utils/appointmentConstants.js";
import { getStatusLabel } from "../utils/appointmentUtils.js";
import logger from "../utils/logger.js";


// Get upcoming appointments for a patient
export const getUpcomingAppointments = async (req, res) => {
  try {
    // Guard: Ensure patient context
    if (!req.patientId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: null,
      });
    }

    // Fetch appointments including cancelled ones, but excluding those hidden by patient
    // This allows patients to see when a doctor has cancelled their appointment
    // while respecting if they've chosen to hide it
    const appointments = await Appointment.find({
      patientId: req.patientId,
      date: { $gte: new Date() },
      hiddenByPatient: { $ne: true }, // Exclude appointments patient has hidden
    })
      .populate("doctorId", "name") // Include doctor info for cancelled appointments
      .sort({ date: 1 })
      .select("date status notes rescheduleOptions doctor doctorId");

    const upcomingAppointments = appointments.map((apt) => ({
      ...apt.toObject(),
      statusLabel: getStatusLabel(apt.status),
    }));

    res.json({
      success: true,
      message: "Upcoming appointments retrieved successfully",
      data: upcomingAppointments,
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

// Get appointments grouped by status for a doctor
export const getGroupedAppointments = async (req, res) => {
  try {
    // Guard: Ensure doctor context
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    const appointments = await Appointment.find({
      doctorId: req.doctor._id,
    })
      .populate("patientId", "name")
      .sort({ date: 1 });

    const groupedAppointments = appointments.reduce((acc, apt) => {
      const statusKey = apt.status;
      if (!acc[statusKey]) {
        acc[statusKey] = [];
      }
      acc[statusKey].push({
        ...apt.toObject(),
        statusLabel: getStatusLabel(apt.status),
      });
      return acc;
    }, {});

    // Ensure all status keys exist, even if empty
    for (const status of Object.values(APPOINTMENT_STATUS)) {
      if (!groupedAppointments[status]) {
        groupedAppointments[status] = [];
      }
    }

    res.json({
      success: true,
      message: "Grouped appointments retrieved successfully",
      data: groupedAppointments,
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
