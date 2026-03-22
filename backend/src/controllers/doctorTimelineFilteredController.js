import PatientTimelineEvent from "../models/PatientTimelineEvent.js";
import Appointment from "../models/Appointment.js";
import Prescription from "../models/Prescription.js";
import Doctor from "../models/Doctor.js";
import { debugLog, debugError } from "../utils/debug.js";

/**
 * Enhanced Doctor Timeline Controller
 * Includes filtering, search, and performance optimizations
 * Tracks doctor login for "new events" highlighting
 */

/**
 * Get doctor's patient timeline with advanced filtering
 * Supports filtering by patient, event type, date range
 * Includes search functionality
 * Lazy-loads for performance
 */
export const getDoctorPatientsTimelineFiltered = async (req, res) => {
  try {
    if (!req.doctor || !req.doctor._id) {
      debugLog(
        "getDoctorPatientsTimelineFiltered",
        "Unauthorized - missing doctor context",
      );
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    const doctorId = req.doctor._id;

    // Extract filters
    const {
      patientId,
      eventType, // appointment, prescription, note
      searchText,
      startDate,
      endDate,
      limit = 30,
      offset = 0,
      sortOrder = "desc",
      highlightNewSince, // ISO date: show events newer than this
    } = req.query;

    debugLog("getDoctorPatientsTimelineFiltered", "Fetching doctor timeline", {
      doctorId,
      filters: {
        patientId,
        eventType,
        searchText,
        startDate,
        endDate,
      },
      pagination: { limit: parseInt(limit), offset: parseInt(offset) },
    });

    // Build query for timeline events
    const timelineQuery = {
      doctorId,
      visibility: { $in: ["doctor_only", "patient_visible"] },
      isDeleted: { $ne: true },
    };

    if (patientId) {
      timelineQuery.patientId = patientId;
    }

    if (eventType && eventType !== "all") {
      timelineQuery.eventType = eventType;
    }

    // Date range filter
    if (startDate || endDate) {
      timelineQuery.createdAt = {};
      if (startDate) {
        timelineQuery.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        timelineQuery.createdAt.$lte = end;
      }
    }

    // Get total count before pagination
    const total = await PatientTimelineEvent.countDocuments(timelineQuery);

    // Sort order
    const sortObj = { createdAt: sortOrder === "asc" ? 1 : -1 };

    // Fetch paginated timeline events
    const events = await PatientTimelineEvent.find(timelineQuery)
      .populate("patientId", "name email phoneNumber dateOfBirth")
      .populate("appointmentId", "date timeSlot status")
      .sort(sortObj)
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .lean()
      .exec();

    // Determine which events are "new" based on doctor's last login
    const newSinceDate = highlightNewSince ? new Date(highlightNewSince) : null;

    // Enrich events with additional metadata and detect "new" events
    const enrichedEvents = events.map((event) => {
      const isNew = newSinceDate && event.createdAt > newSinceDate;

      return {
        id: event._id.toString(),
        type:
          event.eventType === "doctor_note_added"
            ? "note"
            : event.eventType.startsWith("appointment")
              ? "appointment"
              : "prescription",
        eventType: event.eventType,
        title: event.eventTitle,
        description: event.eventDescription,
        isNew, // Highlight if created after doctor's last login
        badge:
          event.eventType === "appointment_completed"
            ? "Completed"
            : event.eventType === "appointment_rejected"
              ? "Cancelled"
              : null,
        badgeColor:
          event.eventType === "appointment_completed"
            ? "green"
            : event.eventType === "appointment_rejected"
              ? "red"
              : null,
        patient: {
          id: event.patientId?._id,
          name: event.patientId?.name,
          email: event.patientId?.email,
          dateOfBirth: event.patientId?.dateOfBirth,
        },
        relatedAppointment: event.appointmentId
          ? {
              date: event.appointmentId.date,
              timeSlot: event.appointmentId.timeSlot,
              status: event.appointmentId.status,
            }
          : null,
        metadata: event.metadata || {},
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
        collapsible: {
          expanded: false, // Client controls expand/collapse
          fullContent: event.eventDescription,
          preview:
            event.eventDescription.substring(0, 100) +
            (event.eventDescription.length > 100 ? "..." : ""),
        },
      };
    });

    // Apply client-side search if needed
    let filteredEvents = enrichedEvents;
    if (searchText && searchText.trim()) {
      const searchLower = searchText.toLowerCase();
      filteredEvents = enrichedEvents.filter((event) => {
        const searchableFields = [
          event.title,
          event.description,
          event.patient.name,
          event.metadata?.content || "",
        ]
          .join(" ")
          .toLowerCase();

        return searchableFields.includes(searchLower);
      });
    }

    debugLog("getDoctorPatientsTimelineFiltered", "Timeline fetched", {
      total,
      returned: filteredEvents.length,
      newEventCount: filteredEvents.filter((e) => e.isNew).length,
    });

    res.json({
      success: true,
      data: {
        events: filteredEvents,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: parseInt(offset) + parseInt(limit) < total,
        },
        summary: {
          newEventsCount: filteredEvents.filter((e) => e.isNew).length,
          completedCount: filteredEvents.filter(
            (e) => e.eventType === "appointment_completed",
          ).length,
          cancelledCount: filteredEvents.filter(
            (e) => e.eventType === "appointment_rejected",
          ).length,
        },
      },
    });
  } catch (error) {
    debugError(
      "getDoctorPatientsTimelineFiltered",
      "Error fetching doctor timeline",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to fetch doctor timeline",
      data: null,
    });
  }
};

/**
 * Get quick search results for a patient's events
 * Useful for searching within a patient's history
 */
export const searchPatientEvents = async (req, res) => {
  try {
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    const doctorId = req.doctor._id;
    const { patientId, searchText, limit = 10 } = req.query;

    if (!patientId || !searchText) {
      return res.status(400).json({
        success: false,
        message: "patientId and searchText required",
        data: null,
      });
    }

    debugLog("searchPatientEvents", "Searching patient events", {
      patientId,
      doctorId,
      searchText,
    });

    const searchLower = searchText.toLowerCase();

    // Search in timeline events
    const timelineResults = await PatientTimelineEvent.find({
      doctorId,
      patientId,
      isDeleted: { $ne: true },
      $or: [
        { eventTitle: { $regex: searchLower, $options: "i" } },
        { eventDescription: { $regex: searchLower, $options: "i" } },
      ],
    })
      .select("eventTitle eventDescription eventType createdAt")
      .limit(parseInt(limit))
      .lean();

    // Search in appointments
    const appointmentResults = await Appointment.find(
      {
        doctorId,
        patientId,
        isDeleted: { $ne: true },
        $or: [
          { notes: { $regex: searchLower, $options: "i" } },
          { status: { $regex: searchLower, $options: "i" } },
        ],
      },
      "date timeSlot status notes",
    ).limit(parseInt(limit));

    // Search in prescriptions
    const prescriptionResults = await Prescription.find(
      {
        doctorId,
        patientId,
        $or: [
          { diagnosis: { $regex: searchLower, $options: "i" } },
          { notes: { $regex: searchLower, $options: "i" } },
          { "medications.name": { $regex: searchLower, $options: "i" } },
        ],
      },
      "diagnosis medications notes createdAt",
    ).limit(parseInt(limit));

    const results = [
      ...timelineResults.map((e) => ({
        type: "timeline",
        ...e._doc,
      })),
      ...appointmentResults.map((e) => ({
        type: "appointment",
        ...e._doc,
      })),
      ...prescriptionResults.map((e) => ({
        type: "prescription",
        ...e._doc,
      })),
    ];

    res.json({
      success: true,
      data: {
        results,
        count: results.length,
      },
    });
  } catch (error) {
    debugError("searchPatientEvents", "Error searching patient events", error);
    res.status(500).json({
      success: false,
      message: "Failed to search events",
      data: null,
    });
  }
};

/**
 * Get timeline statistics for doctor
 * Shows breakdown by event type, patient activity
 */
export const getDoctorTimelineStats = async (req, res) => {
  try {
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    const doctorId = req.doctor._id;
    const { startDate, endDate } = req.query;

    debugLog("getDoctorTimelineStats", "Calculating doctor timeline stats", {
      doctorId,
    });

    const dateFilter = {};
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }

    const query = {
      doctorId,
      isDeleted: { $ne: true },
    };

    if (Object.keys(dateFilter).length > 0) {
      query.createdAt = dateFilter;
    }

    // Count by event type
    const eventTypeCounts = await PatientTimelineEvent.aggregate([
      { $match: query },
      { $group: { _id: "$eventType", count: { $sum: 1 } } },
    ]);

    // Count unique patients
    const uniquePatients = await PatientTimelineEvent.aggregate([
      { $match: query },
      { $group: { _id: "$patientId" } },
      { $count: "count" },
    ]);

    // Get top active patients
    const topPatients = await PatientTimelineEvent.aggregate([
      { $match: query },
      { $group: { _id: "$patientId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "patients",
          localField: "_id",
          foreignField: "_id",
          as: "patient",
        },
      },
    ]);

    res.json({
      success: true,
      data: {
        byEventType: eventTypeCounts.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        uniquePatients: uniquePatients[0]?.count || 0,
        topPatients: topPatients.map((p) => ({
          patientId: p._id,
          name: p.patient[0]?.name || "Unknown",
          eventCount: p.count,
        })),
      },
    });
  } catch (error) {
    debugError(
      "getDoctorTimelineStats",
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

/**
 * Mark timeline events as read (for doctor "new events" tracking)
 * Updates doctor's last viewed timestamp
 */
export const markTimelineEventsAsRead = async (req, res) => {
  try {
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    const doctorId = req.doctor._id;

    debugLog("markTimelineEventsAsRead", "Marking events as read", {
      doctorId,
    });

    // Update doctor's lastTimelineViewedAt
    const updatedDoctor = await Doctor.findByIdAndUpdate(
      doctorId,
      { lastTimelineViewedAt: new Date() },
      { new: true },
    );

    res.json({
      success: true,
      data: {
        lastViewedAt: updatedDoctor.lastTimelineViewedAt,
      },
    });
  } catch (error) {
    debugError(
      "markTimelineEventsAsRead",
      "Error marking events as read",
      error,
    );
    res.status(500).json({
      success: false,
      message: "Failed to mark events as read",
      data: null,
    });
  }
};
