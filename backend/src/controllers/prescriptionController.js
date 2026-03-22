import Prescription from "../models/Prescription.js";
import Appointment from "../models/Appointment.js";
import Doctor from "../models/Doctor.js";
import { debugLog, debugError } from "../utils/debug.js";
import { createTimelineEvent } from "./doctorTimelineController.js";
import auditService from "../services/auditService.js";

/**
 * Create a new prescription for an appointment
 * Doctor-only endpoint
 * Validates appointment ownership and doctor subscription
 */
export const createPrescription = async (req, res) => {
  try {
    const { appointmentId, medications, diagnosis, notes } = req.body;

    // Guard: Ensure doctor context
    if (!req.doctor || !req.doctor._id) {
      debugLog("createPrescription", "Unauthorized - missing doctor context");
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    // Guard: Validate required fields
    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: "Appointment ID is required",
        data: null,
      });
    }

    if (!medications || medications.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one medication is required",
        data: null,
      });
    }

    debugLog("createPrescription", "Creating prescription", {
      appointmentId,
      doctorId: req.doctor._id,
      medicationCount: medications.length,
    });

    // STEP 1: Load and validate appointment
    const appointment =
      await Appointment.findById(appointmentId).populate("doctorId patientId");

    if (!appointment) {
      debugLog("createPrescription", "Appointment not found", {
        appointmentId,
      });
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
        data: null,
      });
    }

    // STEP 2: Verify doctor owns this appointment (tenant isolation)
    if (appointment.doctorId._id.toString() !== req.doctor._id.toString()) {
      debugLog(
        "createPrescription",
        "Doctor not authorized for this appointment",
        {
          appointmentId,
          doctorId: req.doctor._id,
          appointmentDoctorId: appointment.doctorId._id,
        },
      );
      return res.status(403).json({
        success: false,
        message: "Not authorized to create prescription for this appointment",
        data: null,
      });
    }

    // STEP 3: Verify doctor subscription is active
    const doctor = await Doctor.findById(req.doctor._id);
    if (!doctor || !doctor.isActive) {
      debugLog("createPrescription", "Doctor subscription inactive", {
        doctorId: req.doctor._id,
      });
      return res.status(403).json({
        success: false,
        message: "Doctor subscription is inactive",
        data: null,
      });
    }

    // STEP 4: Create prescription with validated data
    const prescription = await Prescription.create({
      appointmentId,
      doctorId: req.doctor._id,
      patientId: appointment.patientId._id,
      medications,
      diagnosis: diagnosis || null,
      notes: notes || null,
    });

    debugLog("createPrescription", "Prescription created successfully", {
      prescriptionId: prescription._id,
      appointmentId,
    });

    // Auto-create timeline event for new prescription
    try {
      const medicationSummary = medications
        .map((med) => `${med.name} ${med.dosage || ""}`)
        .join(", ");

      await createTimelineEvent({
        patientId: appointment.patientId._id,
        doctorId: req.doctor._id,
        appointmentId,
        eventType: "prescription_created",
        eventTitle: "Prescription Added",
        eventDescription: `Prescribed: ${medicationSummary}${diagnosis ? ` (${diagnosis})` : ""}`,
        eventStatus: "active",
        visibility: "patient_visible",
        metadata: {
          prescriptionId: prescription._id,
          medications: medications,
          diagnosis: diagnosis,
          notes: notes,
        },
      });
    } catch (timelineError) {
      debugError(
        "createPrescription",
        "Failed to create timeline event",
        timelineError,
      );
      // Don't fail prescription creation if timeline event fails
    }

    // Send WhatsApp notification to patient about new prescription
    try {
      const doctor = req.doctor;
      const patient = appointment.patientId;
      const patientName = patient?.name || "Patient";
      const doctorName = doctor?.name || "Doctor";

      const medicationSummary = medications
        .map((med) => `${med.name} ${med.dosage || med.strength || ""}`)
        .join(", ");

      await createAndSendNotification({
        recipientId: appointment.patientId._id, // Patient
        recipientType: "Patient",
        type: "prescription_created",
        title: "New Prescription from Doctor",
        message: `${doctorName} has added a new prescription:\n\nMedications: ${medicationSummary}${diagnosis ? `\nDiagnosis: ${diagnosis}` : ""}${notes ? `\n\nNotes: ${notes}` : ""}\n\nPlease check your dashboard for complete details.`,
        prescriptionId: prescription._id,
        appointmentId,
        doctorId: req.doctor._id,
        patientId: appointment.patientId._id,
        actionUrl: `/patient/appointments/${appointmentId}`,
        metadata: {
          medications: medications,
          diagnosis: diagnosis,
          notes: notes,
          doctorName,
          medicationSummary,
        },
      });
    } catch (notificationError) {
      debugError(
        "createPrescription",
        "Failed to send notification",
        notificationError,
      );
      // Don't fail prescription creation if notification fails
    }

    res.status(201).json({
      success: true,
      message: "Prescription created successfully",
      data: prescription,
    });
  } catch (error) {
    debugError("createPrescription", "Unexpected error", error);
    res.status(500).json({
      success: false,
      message: "Server error creating prescription",
      data: null,
    });
  }
};

/**
 * Get prescriptions for a specific appointment
 * Accessible by doctor (if owns appointment) or patient (if owns appointment)
 */
export const getAppointmentPrescriptions = async (req, res) => {
  try {
    const { appointmentId } = req.params;

    // Determine user identity and role
    const isDoctor = !!req.doctor;
    const userId = isDoctor ? req.doctor._id : req.user?._id;

    // Guard: Ensure authentication
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: null,
      });
    }

    debugLog("getAppointmentPrescriptions", "Fetching prescriptions", {
      appointmentId,
      userId,
      userRole: isDoctor ? "doctor" : "patient",
    });

    // Load appointment
    const appointment = await Appointment.findById(appointmentId);

    if (!appointment) {
      return res.status(404).json({
        success: false,
        message: "Appointment not found",
        data: null,
      });
    }

    // Determine if user is authorized
    if (isDoctor) {
      // Doctor: must own the appointment
      if (appointment.doctorId.toString() !== req.doctor._id.toString()) {
        debugLog("getAppointmentPrescriptions", "Doctor not authorized", {
          appointmentId,
        });
        return res.status(403).json({
          success: false,
          message: "Not authorized to access these prescriptions",
          data: null,
        });
      }
    } else if (req.user) {
      // Patient: must own the appointment
      if (appointment.patientId.toString() !== req.user._id.toString()) {
        debugLog("getAppointmentPrescriptions", "Patient not authorized", {
          appointmentId,
        });
        return res.status(403).json({
          success: false,
          message: "Not authorized to access these prescriptions",
          data: null,
        });
      }
    }

    // Fetch prescriptions sorted by newest first
    const prescriptions = await Prescription.find({
      appointmentId,
    })
      .populate("doctorId", "name email specialization")
      .populate("patientId", "name email")
      .populate("appointmentId", "date timeSlot status")
      .sort({ createdAt: -1 })
      .lean();

    debugLog("getAppointmentPrescriptions", "Prescriptions retrieved", {
      appointmentId,
      count: prescriptions.length,
    });

    res.json({
      success: true,
      message: "Prescriptions retrieved successfully",
      data: prescriptions,
    });
  } catch (error) {
    debugError("getAppointmentPrescriptions", "Unexpected error", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving prescriptions",
      data: null,
    });
  }
};

/**
 * Get all prescriptions for a doctor
 * Doctor-only endpoint
 */
export const getDoctorPrescriptions = async (req, res) => {
  try {
    // Guard: Ensure doctor context
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    debugLog("getDoctorPrescriptions", "Fetching doctor prescriptions", {
      doctorId: req.doctor._id,
    });

    const prescriptions = await Prescription.find({
      doctorId: req.doctor._id,
    })
      .populate("appointmentId", "date timeSlot status")
      .populate("patientId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    debugLog("getDoctorPrescriptions", "Prescriptions retrieved", {
      doctorId: req.doctor._id,
      count: prescriptions.length,
    });

    res.json({
      success: true,
      message: "Prescriptions retrieved successfully",
      data: prescriptions,
    });
  } catch (error) {
    debugError("getDoctorPrescriptions", "Unexpected error", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving prescriptions",
      data: null,
    });
  }
};

/**
 * Delete a prescription (soft delete via update)
 * Doctor-only endpoint
 */
export const deletePrescription = async (req, res) => {
  try {
    const { prescriptionId } = req.params;

    // Guard: Ensure doctor context
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    debugLog("deletePrescription", "Deleting prescription", {
      prescriptionId,
      doctorId: req.doctor._id,
    });

    // Load prescription
    const prescription = await Prescription.findById(prescriptionId);

    if (!prescription) {
      return res.status(404).json({
        success: false,
        message: "Prescription not found",
        data: null,
      });
    }

    // Verify doctor owns this prescription
    if (prescription.doctorId.toString() !== req.doctor._id.toString()) {
      debugLog("deletePrescription", "Doctor not authorized", {
        prescriptionId,
      });
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this prescription",
        data: null,
      });
    }

    // Extra guard: ensure doctor's subscription is active (defense-in-depth)
    const doctor = await Doctor.findById(req.doctor._id);
    if (!doctor || !doctor.isActive) {
      // Log blocked delete attempt
      try {
        await auditService.logBlockedAction({
          actorType: "Doctor",
          actorId: req.doctor._id,
          action: "delete_prescription_blocked_inactive_subscription",
          resourceType: "Prescription",
          resourceId: prescription._id,
          reason: "inactive_subscription",
          meta: { prescriptionId },
        });
      } catch (e) {
        debugError("deletePrescription", "Audit logging failed", e);
      }

      return res.status(403).json({
        success: false,
        message: "Doctor subscription is inactive",
        data: null,
      });
    }

    // Delete prescription
    await Prescription.deleteOne({ _id: prescriptionId });

    debugLog("deletePrescription", "Prescription deleted", {
      prescriptionId,
    });

    res.json({
      success: true,
      message: "Prescription deleted successfully",
      data: null,
    });
  } catch (error) {
    debugError("deletePrescription", "Unexpected error", error);
    res.status(500).json({
      success: false,
      message: "Server error deleting prescription",
      data: null,
    });
  }
};
