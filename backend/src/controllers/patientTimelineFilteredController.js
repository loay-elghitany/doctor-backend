import Appointment from "../models/Appointment.js";
import Prescription from "../models/Prescription.js";
import PatientTimelineEvent from "../models/PatientTimelineEvent.js";
import { debugLog, debugError } from "../utils/debug.js";

/**
 * Get filtered patient timeline with search and pagination
 * Combines appointments, prescriptions, and timeline events
 * Supports filtering by date range, event type, doctor
 * Lazy-loads events for performance
 */
export const getPatientTimelineFiltered = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      debugLog(
        "getPatientTimelineFiltered",
        "Unauthorized - missing patient context",
      );
      return res.status(401).json({
        success: false,
        message: "Not authenticated as patient",
        data: null,
      });
    }

    const patientId = req.user._id;

    // Extract filter parameters
    const {
      startDate,
      endDate,
      doctorId,
      eventType, // appointment, prescription, note
      searchText,
      limit = 20,
      offset = 0,
      sortOrder = "desc", // newest first
    } = req.query;

    debugLog("getPatientTimelineFiltered", "Fetching filtered timeline", {
      patientId,
      filters: { startDate, endDate, doctorId, eventType, searchText },
      pagination: { limit: parseInt(limit), offset: parseInt(offset) },
    });

    // Build date range filter
    const dateFilter = {};
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }

    // Fetch appointments with filters
    let appointmentQuery = {
      patientId,
      hiddenByPatient: { $ne: true },
      isDeleted: { $ne: true },
    };

    if (doctorId) appointmentQuery.doctorId = doctorId;
    if (Object.keys(dateFilter).length > 0) {
      appointmentQuery.date = dateFilter;
    }

    // Apply event type filter
    if (eventType && (eventType === "appointment" || !eventType)) {
      // appointments included
    } else if (eventType && eventType !== "appointment") {
      appointmentQuery = null; // Skip appointments if filtering for other types
    }

    const appointments =
      appointmentQuery &&
      (!eventType || eventType === "appointment" || eventType === "all")
        ? await Appointment.find(appointmentQuery)
            .populate("doctorId", "name specialization")
            .select(
              "date timeSlot status notes createdAt doctorId _id isHighPriority",
            )
            .lean()
            .exec()
        : [];

    // Fetch prescriptions with filters
    let prescriptionQuery = { patientId };

    if (doctorId) prescriptionQuery.doctorId = doctorId;

    const prescriptions =
      !eventType || eventType === "prescription" || eventType === "all"
        ? await Prescription.find(prescriptionQuery)
            .populate("appointmentId", "_id date")
            .populate("doctorId", "name specialization")
            .select(
              "medications diagnosis notes createdAt doctorId appointmentId _id",
            )
            .lean()
            .exec()
        : [];

    // Fetch timeline events with filters
    let timelineQuery = {
      patientId,
      visibility: "patient_visible",
      isDeleted: { $ne: true },
    };

    if (doctorId) timelineQuery.doctorId = doctorId;

    const timelineEvents =
      !eventType || eventType === "note" || eventType === "all"
        ? await PatientTimelineEvent.find(timelineQuery)
            .populate("doctorId", "name specialization")
            .select(
              "eventType eventTitle eventDescription createdAt doctorId _id metadata",
            )
            .lean()
            .exec()
        : [];

    // Map to unified event format
    const allEvents = [];

    // Map appointments
    appointments.forEach((apt) => {
      const isHighPriority =
        apt.status === "cancelled" || apt.status === "no-show";

      allEvents.push({
        id: `apt-${apt._id.toString()}`,
        type: "appointment",
        eventDate: new Date(apt.date),
        timestamp: new Date(apt.createdAt),
        title: `Appointment - ${apt.status}`,
        icon: "calendar",
        isHighPriority,
        badge: isHighPriority
          ? apt.status === "cancelled"
            ? "Cancelled"
            : "No Show"
          : null,
        badgeColor: isHighPriority ? "red" : null,
        metadata: {
          status: apt.status,
          timeSlot: apt.timeSlot,
          notes: apt.notes || "",
          doctorName: apt.doctorId?.name || "Doctor",
          doctorSpecialization: apt.doctorId?.specialization || "",
          doctorId: apt.doctorId?._id,
        },
        relatedId: apt._id.toString(),
        createdAt: apt.createdAt,
      });
    });

    // Map prescriptions
    prescriptions.forEach((presc) => {
      const medicationPreview = presc.medications
        .slice(0, 2)
        .map((med) => med.name)
        .join(", ");

      const additionalCount =
        presc.medications.length > 2 ? ` +${presc.medications.length - 2}` : "";

      allEvents.push({
        id: `presc-${presc._id.toString()}`,
        type: "prescription",
        eventDate: new Date(presc.createdAt),
        timestamp: new Date(presc.createdAt),
        title: `Prescription - New`,
        icon: "pill",
        isHighPriority: true, // Prescriptions always highlighted
        badge: "New",
        badgeColor: "blue",
        metadata: {
          medications: medicationPreview + additionalCount,
          diagnosis: presc.diagnosis || "No diagnosis",
          notes: presc.notes || "",
          doctorName: presc.doctorId?.name || "Doctor",
          appointmentDate: presc.appointmentId?.date,
        },
        relatedId: presc._id.toString(),
        createdAt: presc.createdAt,
      });
    });

    // Map timeline events (doctor notes)
    timelineEvents.forEach((event) => {
      allEvents.push({
        id: `note-${event._id.toString()}`,
        type: "note",
        eventDate: new Date(event.createdAt),
        timestamp: new Date(event.createdAt),
        title: event.eventTitle,
        icon: "note",
        isHighPriority: false,
        badge: null,
        metadata: {
          description: event.eventDescription,
          doctorName: event.doctorId?.name || "Doctor",
          content: event.metadata?.content || "",
        },
        relatedId: event._id.toString(),
        createdAt: event.createdAt,
      });
    });

    // Apply search filter if provided
    if (searchText && searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      allEvents.filter((event) => {
        const searchableFields = [
          event.title,
          event.metadata?.doctorName || "",
          event.metadata?.notes || "",
          event.metadata?.diagnosis || "",
          event.metadata?.medications || "",
        ]
          .join(" ")
          .toLowerCase();

        return searchableFields.includes(searchLower);
      });
    }

    // Apply date range filter if specified
    if (Object.keys(dateFilter).length > 0) {
      allEvents.filter((event) => {
        const eventDate = event.eventDate;
        if (dateFilter.$gte && eventDate < dateFilter.$gte) return false;
        if (dateFilter.$lte && eventDate > dateFilter.$lte) return false;
        return true;
      });
    }

    // Sort: newest first by default
    const direction = sortOrder === "asc" ? 1 : -1;
    allEvents.sort(
      (a, b) => (b.timestamp - a.timestamp) * (direction === -1 ? 1 : -1),
    );

    // Paginate
    const total = allEvents.length;
    const paginatedEvents = allEvents.slice(
      parseInt(offset),
      parseInt(offset) + parseInt(limit),
    );

    debugLog("getPatientTimelineFiltered", "Timeline fetched successfully", {
      total,
      returned: paginatedEvents.length,
      appointments: appointments.length,
      prescriptions: prescriptions.length,
      notes: timelineEvents.length,
    });

    res.json({
      success: true,
      data: {
        events: paginatedEvents,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + parseInt(limit) < total,
        },
        summary: {
          appointments: appointments.length,
          prescriptions: prescriptions.length,
          notes: timelineEvents.length,
          highPriorityCount: allEvents.filter((e) => e.isHighPriority).length,
        },
      },
    });
  } catch (error) {
    debugError(
      "getPatientTimelineFiltered",
      "Error fetching filtered timeline",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch timeline",
      data: null,
    });
  }
};

/**
 * Get timeline stats for patient
 * Returns counts by event type and date
 */
export const getPatientTimelineStats = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as patient",
        data: null,
      });
    }

    const patientId = req.user._id;

    debugLog("getPatientTimelineStats", "Calculating timeline statistics", {
      patientId,
    });

    // Count by type
    const appointmentStats = await Appointment.countDocuments({
      patientId,
      isDeleted: { $ne: true },
    });

    const prescriptionStats = await Prescription.countDocuments({
      patientId,
    });

    const notesStats = await PatientTimelineEvent.countDocuments({
      patientId,
      eventType: "doctor_note_added",
      isDeleted: { $ne: true },
    });

    // Count cancelled/high-priority appointments
    const cancelledCount = await Appointment.countDocuments({
      patientId,
      status: { $in: ["cancelled", "no-show"] },
      isDeleted: { $ne: true },
    });

    // Recent events (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentEvents = await Appointment.countDocuments({
      patientId,
      createdAt: { $gte: thirtyDaysAgo },
      isDeleted: { $ne: true },
    });

    res.json({
      success: true,
      data: {
        total: appointmentStats + prescriptionStats + notesStats,
        byType: {
          appointments: appointmentStats,
          prescriptions: prescriptionStats,
          notes: notesStats,
        },
        metrics: {
          cancelledAppointments: cancelledCount,
          recentEventsLast30Days: recentEvents,
          activeDoctor: true,
        },
      },
    });
  } catch (error) {
    debugError(
      "getPatientTimelineStats",
      "Error calculating timeline statistics",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to calculate statistics",
      data: null,
    });
  }
};
