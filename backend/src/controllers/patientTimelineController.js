import Appointment from "../models/Appointment.js";
import Prescription from "../models/Prescription.js";
import logger from "../utils/logger.js";



/**
 * Get aggregated medical timeline for authenticated patient
 * Combines appointments and prescriptions in chronological order
 * Patient-only endpoint - enforces strict access control
 */
export const getPatientTimeline = async (req, res) => {
  try {
    // Guard: Ensure patient context
    if (!req.user || !req.user._id) {
      logger.debug("getPatientTimeline", "Unauthorized - missing patient context");
      return res.status(401).json({
        success: false,
        message: "Not authenticated as patient",
        data: null,
      });
    }

    const patientId = req.user._id;

    logger.debug("getPatientTimeline", "Fetching timeline", {
      patientId,
    });

    // Fetch appointments for this patient (exclude hidden/deleted)
    const appointments = await Appointment.find({
      patientId,
      hiddenByPatient: { $ne: true },
      isDeleted: { $ne: true },
    })
      .populate("doctorId", "name specialization")
      .select("date timeSlot status notes createdAt doctorId")
      .lean()
      .exec();

    // Fetch prescriptions for this patient
    const prescriptions = await Prescription.find({
      patientId,
    })
      .populate("appointmentId", "_id date")
      .select("medications diagnosis notes appointmentId createdAt doctorId")
      .lean()
      .exec();

    // Map appointments to timeline events
    const appointmentEvents = appointments.map((apt) => ({
      id: `apt-${apt._id.toString()}`,
      type: "appointment",
      eventDate: new Date(apt.date),
      title: `Appointment - ${apt.status}`,
      metadata: {
        status: apt.status,
        timeSlot: apt.timeSlot,
        notes: apt.notes || "",
        doctorName: apt.doctorId?.name || "Doctor",
        doctorSpecialization: apt.doctorId?.specialization || "",
      },
      relatedAppointmentId: apt._id.toString(),
      createdAt: apt.createdAt,
    }));

    // Map prescriptions to timeline events
    const prescriptionEvents = prescriptions.map((presc) => {
      // Get first 2 medications for preview
      const medicationPreview = presc.medications
        .slice(0, 2)
        .map((med) => med.name)
        .join(", ");

      const additionalCount =
        presc.medications.length > 2
          ? ` +${presc.medications.length - 2} more`
          : "";

      return {
        id: `presc-${presc._id.toString()}`,
        type: "prescription",
        eventDate: new Date(presc.createdAt),
        title: "Prescription Created",
        metadata: {
          medicationSummary: medicationPreview + additionalCount,
          medicationCount: presc.medications.length,
          diagnosis: presc.diagnosis || "",
          appointmentDate: presc.appointmentId?.date || null,
        },
        relatedAppointmentId: presc.appointmentId?._id.toString() || null,
        createdAt: presc.createdAt,
      };
    });

    // Combine and sort by eventDate descending (newest first)
    const timelineEvents = [...appointmentEvents, ...prescriptionEvents].sort(
      (a, b) => new Date(b.eventDate) - new Date(a.eventDate),
    );

    logger.debug("getPatientTimeline", "Timeline compiled", {
      patientId,
      appointmentCount: appointmentEvents.length,
      prescriptionCount: prescriptionEvents.length,
      totalEvents: timelineEvents.length,
    });

    res.json({
      success: true,
      message: "Patient timeline retrieved successfully",
      data: timelineEvents,
    });
  } catch (error) {
    logger.error("getPatientTimeline", "Unexpected error", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving timeline",
      data: null,
    });
  }
};
