import PatientTimelineEvent from "../models/PatientTimelineEvent.js";
import Appointment from "../models/Appointment.js";
import Patient from "../models/Patient.js";
import Doctor from "../models/Doctor.js";
import logger from "../utils/logger.js";



/**
 * Get complete medical timeline for a specific patient
 * Doctor-only endpoint - shows all events for patient
 * Doctor must own the patient relationship
 */
export const getDoctorPatientTimeline = async (req, res) => {
  try {
    // Guard: Ensure doctor context
    if (!req.doctor || !req.doctor._id) {
      logger.debug(
        "getDoctorPatientTimeline",
        "Unauthorized - missing doctor context",
      );
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    const { patientId } = req.params;
    const doctorId = req.doctor._id;

    // Guard: Validate patientId format
    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: "Patient ID is required",
        data: null,
      });
    }

    logger.debug("getDoctorPatientTimeline", "Fetching timeline", {
      patientId,
      doctorId,
    });

    // Verify patient exists
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
        data: null,
      });
    }

    // Verify doctor has appointments with this patient (multi-tenant isolation)
    // OR can be extended to check if doctor is in patient's doctor list
    const patientAppointments = await Appointment.countDocuments({
      patientId,
      doctorId,
    });

    if (patientAppointments === 0) {
      logger.debug(
        "getDoctorPatientTimeline",
        "Doctor not authorized for patient",
        {
          patientId,
          doctorId,
        },
      );
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this patient's timeline",
        data: null,
      });
    }

    // Fetch all timeline events for this patient (doctor sees everything)
    const timelineEvents = await PatientTimelineEvent.find({
      patientId,
      doctorId,
      isDeleted: { $ne: true },
    })
      .populate("appointmentId", "date timeSlot status")
      .populate("doctorId", "name email specialization")
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    logger.debug("getDoctorPatientTimeline", "Timeline retrieved", {
      patientId,
      eventCount: timelineEvents.length,
    });

    res.json({
      success: true,
      message: "Patient timeline retrieved successfully",
      data: timelineEvents,
    });
  } catch (error) {
    logger.error("getDoctorPatientTimeline", "Unexpected error", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving timeline",
      data: null,
    });
  }
};

/**
 * Add doctor note to patient timeline
 * Creates a new timeline event with type 'doctor_note_added'
 */
export const addDoctorNote = async (req, res) => {
  try {
    // Guard: Ensure doctor context
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    const { patientId, noteContent, appointmentId } = req.body;
    const doctorId = req.doctor._id;

    // Guard: Validate required fields
    if (!patientId || !noteContent) {
      return res.status(400).json({
        success: false,
        message: "Patient ID and note content are required",
        data: null,
      });
    }

    logger.debug("addDoctorNote", "Adding doctor note", {
      patientId,
      doctorId,
      appointmentId,
      noteLength: noteContent.length,
    });

    // Verify patient exists
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
        data: null,
      });
    }

    // Verify doctor has appointments with this patient
    const patientAppointments = await Appointment.countDocuments({
      patientId,
      doctorId,
    });

    if (patientAppointments === 0) {
      logger.debug("addDoctorNote", "Doctor not authorized for patient", {
        patientId,
        doctorId,
      });
      return res.status(403).json({
        success: false,
        message: "Not authorized to add notes for this patient",
        data: null,
      });
    }

    // Create timeline event
    const timelineEvent = await PatientTimelineEvent.create({
      patientId,
      doctorId,
      appointmentId: appointmentId || null,
      eventType: "doctor_note_added",
      eventTitle: "Doctor Note Added",
      eventDescription: noteContent,
      eventStatus: "completed",
      visibility: "patient_visible", // Patient can see doctor notes (configurable)
      metadata: {
        noteContent,
        addedAt: new Date(),
      },
    });

    logger.debug("addDoctorNote", "Note created successfully", {
      patientId,
      timelineEventId: timelineEvent._id,
    });

    res.status(201).json({
      success: true,
      message: "Doctor note added successfully",
      data: timelineEvent,
    });
  } catch (error) {
    logger.error("addDoctorNote", "Unexpected error", error);
    res.status(500).json({
      success: false,
      message: "Server error adding note",
      data: null,
    });
  }
};

/**
 * Create timeline event for internal tracking
 * Called by other controllers when events occur
 */
export const createTimelineEvent = async ({
  patientId,
  doctorId,
  appointmentId = null,
  eventType,
  eventTitle,
  eventDescription = "",
  eventStatus = "completed",
  visibility = "patient_visible",
  metadata = {},
}) => {
  try {
    const event = await PatientTimelineEvent.create({
      patientId,
      doctorId,
      appointmentId,
      eventType,
      eventTitle,
      eventDescription,
      eventStatus,
      visibility,
      metadata,
    });

    logger.debug("createTimelineEvent", "Timeline event created", {
      patientId,
      eventType,
      eventId: event._id,
    });

    return event;
  } catch (error) {
    logger.error("createTimelineEvent", "Failed to create timeline event", error);
    // Don't throw - timeline events are auxiliary and shouldn't break main flow
    return null;
  }
};

/**
 * Update timeline event status
 * Used when appointment or prescription status changes
 */
export const updateTimelineEventStatus = async ({
  patientId,
  eventType,
  newStatus,
  appointmentId = null,
}) => {
  try {
    const query = {
      patientId,
      eventType,
      isDeleted: { $ne: true },
    };

    if (appointmentId) {
      query.appointmentId = appointmentId;
    }

    const result = await PatientTimelineEvent.updateMany(query, {
      eventStatus: newStatus,
      "metadata.lastUpdated": new Date(),
    });

    logger.debug("updateTimelineEventStatus", "Timeline events updated", {
      patientId,
      eventType,
      updatedCount: result.modifiedCount,
    });

    return result;
  } catch (error) {
    logger.error("updateTimelineEventStatus", "Failed to update timeline", error);
    return null;
  }
};
