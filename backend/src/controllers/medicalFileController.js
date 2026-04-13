import MedicalFile from "../models/MedicalFile.js";
import Patient from "../models/Patient.js";
import Doctor from "../models/Doctor.js";
import Appointment from "../models/Appointment.js";
import PatientTimelineEvent from "../models/PatientTimelineEvent.js";

import multer from "multer";
import path from "path";
import mime from "mime-types";
import storageUtils from "../utils/medicalFileStorage.js";
import fileValidation from "../utils/fileValidation.js";
import AuditLog from "../models/AuditLog.js";
import mongoose from "mongoose";
import enforceOwnership from "../middleware/enforceOwnership.js";
import logger from "../utils/logger.js";
import { buildPagination, getPaginationParams } from "../utils/pagination.js";

const ALLOWED_MIMETYPES = ["image/jpeg", "image/png", "application/pdf"];

const MAX_FILE_SIZE = parseInt(
  process.env.MAX_MEDICAL_FILE_SIZE || "10485760",
  10,
); // 10MB default

const upload = multer({
  storage: storageUtils.getDiskStorage(multer),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    try {
      // Basic mimetype whitelist
      if (!fileValidation.isSafeMime(file.mimetype)) {
        return cb(new Error("Invalid file type"));
      }
      // extension vs mimetype cross-check
      if (
        !fileValidation.extensionMatchesMime(file.originalname, file.mimetype)
      ) {
        return cb(new Error("File extension does not match MIME type"));
      }
      cb(null, true);
    } catch (err) {
      return cb(new Error("Invalid file"));
    }
  },
});

// POST /api/medical-files/upload (patient only)
export const uploadMedicalFile = [
  upload.single("file"),
  async (req, res) => {
    try {
      const patient = req.user; // from protect middleware
      if (!patient || !patient._id) {
        return res
          .status(401)
          .json({ success: false, message: "Not authorized", data: null });
      }

      // Multer saved file info on req.file
      const file = req.file;
      if (!file) {
        return res
          .status(400)
          .json({ success: false, message: "No file uploaded", data: null });
      }

      const { title, notes, appointmentId, doctorId } = req.body;

      // Determine doctorId: prefer provided if it matches the patient's doctor, otherwise use patient's doctorId
      let finalDoctorId = doctorId || patient.doctorId;

      // If provided doctorId, validate it belongs to this patient
      if (doctorId) {
        const matchesAssigned = String(patient.doctorId) === String(doctorId);
        if (!matchesAssigned) {
          return res.status(403).json({
            success: false,
            message: "Doctor not allowed for this patient",
            data: null,
          });
        }
      }

      // Optional: validate appointment belongs to this patient
      if (appointmentId) {
        const appointment = await Appointment.findById(appointmentId);
        if (
          !appointment ||
          String(appointment.patientId) !== String(patient._id)
        ) {
          return res.status(400).json({
            success: false,
            message: "Invalid appointmentId for this patient",
            data: null,
          });
        }
      }

      const storedName = file.filename;
      const originalName = file.originalname;
      const ext = path.extname(originalName).toLowerCase();
      const fileType = ext === ".pdf" ? "pdf" : "image";

      // Enforce per-patient and per-doctor storage limits (readable MB values)
      const maxPerPatientMB = parseInt(
        process.env.MAX_TOTAL_STORAGE_PER_PATIENT_MB || "100",
        10,
      ); // 100MB default
      const maxPerDoctorMB = parseInt(
        process.env.MAX_TOTAL_STORAGE_PER_DOCTOR_MB || "2048",
        10,
      ); // 2GB default

      // compute current storage used by patient (only non-deleted files)
      const patientAgg = await MedicalFile.aggregate([
        { $match: { patientId: patient._id, isDeleted: { $ne: true } } },
        { $group: { _id: null, total: { $sum: "$fileSize" } } },
      ]);
      const patientTotalBytes = (patientAgg[0] && patientAgg[0].total) || 0;

      // compute doctor's total
      const doctorAgg = await MedicalFile.aggregate([
        { $match: { doctorId: finalDoctorId, isDeleted: { $ne: true } } },
        { $group: { _id: null, total: { $sum: "$fileSize" } } },
      ]);
      const doctorTotalBytes = (doctorAgg[0] && doctorAgg[0].total) || 0;

      const incomingSize = file.size || 0;
      const bytesPerMB = 1024 * 1024;

      if (patientTotalBytes + incomingSize > maxPerPatientMB * bytesPerMB) {
        // remove stored temp file
        try {
          storageUtils.deleteFile(storedName);
        } catch (_) {}
        return res.status(400).json({
          success: false,
          message: `Patient storage limit exceeded (${maxPerPatientMB} MB)`,
          data: null,
        });
      }

      if (doctorTotalBytes + incomingSize > maxPerDoctorMB * bytesPerMB) {
        try {
          storageUtils.deleteFile(storedName);
        } catch (_) {}
        return res.status(400).json({
          success: false,
          message: `Doctor storage limit exceeded (${maxPerDoctorMB} MB)`,
          data: null,
        });
      }

      const fileUrl = `/api/medical-files/download/${storedName}`;

      const doc = await MedicalFile.create({
        patientId: patient._id,
        doctorId: finalDoctorId,
        appointmentId: appointmentId || null,
        fileType,
        fileName: originalName,
        storedName,
        fileSize: incomingSize,
        fileUrl,
        title: title || null,
        notes: notes || null,
        uploadedAt: new Date(),
      });

      logger.debug("uploadMedicalFile", "Attempting to create timeline event");
      // Create PatientTimelineEvent for doctor visibility (non-blocking)
      // This ensures the file appears in doctor's patient timeline
      try {
        await PatientTimelineEvent.create({
          patientId: patient._id,
          doctorId: finalDoctorId,
          appointmentId: appointmentId || null,
          eventType: "medical_file_uploaded",
          eventTitle: title || originalName,
          eventDescription:
            notes || `Uploaded ${fileType} file: ${originalName}`,
          eventStatus: "completed",
          // visibility must match schema enum; use doctor_only to restrict to doctors
          visibility: "doctor_only",
          metadata: {
            fileId: doc._id,
            fileName: originalName,
            fileSize: incomingSize,
            fileType,
          },
        });
        logger.debug("uploadMedicalFile", "Timeline event created", {
          fileId: doc._id,
          patientId: patient._id,
        });
      } catch (timelineErr) {
        // always log the error details to console in addition to debug helpers
        logger.error(
          "uploadMedicalFile",
          "Timeline event creation failed (non-blocking)",
          JSON.stringify(timelineErr, null, 2),
        );
        logger.error("uploadMedicalFile timelineErr:", timelineErr);
      }

      // Audit log (non-blocking)
      try {
        AuditLog.create({
          actorType: "Patient",
          actorId: patient._id,
          action: "medicalfile:uploaded",
          resourceType: "MedicalFile",
          resourceId: doc._id,
          meta: { fileName: originalName, fileSize: incomingSize },
        });
      } catch (auditErr) {
        logger.error("uploadMedicalFile", "Audit log failed", auditErr);
      }

      res.json({ success: true, data: doc });
    } catch (error) {
      logger.error("uploadMedicalFile", "Upload error", error);
      if (error.message === "File too large") {
        return res
          .status(400)
          .json({ success: false, message: "File too large", data: null });
      }
      res
        .status(500)
        .json({ success: false, message: "Failed to upload file", data: null });
    }
  },
];

// GET /api/medical-files/my (patient)
export const getMyMedicalFiles = async (req, res) => {
  try {
    const patient = req.user;
    const { page, limit, skip } = getPaginationParams(req.query);

    const query = { patientId: patient._id, isDeleted: { $ne: true } };

    const totalItems = await MedicalFile.countDocuments(query);
    const files = await MedicalFile.find(query)
      .sort({ uploadedAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      message: "Medical files retrieved successfully",
      data: files,
      pagination: buildPagination(page, limit, totalItems),
    });
  } catch (error) {
    logger.error("getMyMedicalFiles", "Error fetching files", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch files", data: null });
  }
};

// Helper: verify doctor has access to patient
const doctorHasAccessToPatient = async (doctorId, patientId) => {
  const patient = await Patient.findById(patientId);
  if (!patient) return false;
  return String(patient.doctorId) === String(doctorId);
};

// GET /api/medical-files/patient/:patientId (doctor)
export const getPatientFiles = async (req, res) => {
  try {
    const doctor = req.user;
    const { patientId } = req.params;

    if (!(await doctorHasAccessToPatient(doctor._id, patientId))) {
      return res.status(403).json({
        success: false,
        message: "Not allowed to view these files",
        data: null,
      });
    }

    // Convert string patientId to ObjectId for query matching
    let patientObjectId;
    try {
      patientObjectId = new mongoose.Types.ObjectId(patientId);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID format",
        data: null,
      });
    }

    const limit = parseInt(req.query.limit || "50", 10);
    const offset = parseInt(req.query.offset || "0", 10);
    // FIX: Query by patientId only, NOT doctorId
    // Reason: Authorization is already verified by doctorHasAccessToPatient() above
    // Filtering by doctorId causes issues when:
    // - Doctor assignments change (old files have old doctorId)
    // - Multiple doctors in same clinic share patient access
    // - Files were uploaded before current assignment
    // The doctorId on files is just the patient's assigned doctor at upload time
    const query = {
      patientId: patientObjectId,
      isDeleted: { $ne: true },
    };
    const total = await MedicalFile.countDocuments(query);
    const files = await MedicalFile.find(query)
      .sort({ uploadedAt: -1 })
      .limit(limit)
      .skip(offset);

    // Debug: Log file fetch to confirm query fix
    logger.debug("getPatientFiles", "Files fetched for patient", {
      patientId: patientObjectId.toString(),
      doctorId: doctor._id.toString(),
      filesFound: files.length,
      total,
    });

    res.json({
      success: true,
      data: files,
      pagination: { total, limit, offset },
    });
  } catch (error) {
    logger.error("getPatientFiles", "Error fetching patient files", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch files", data: null });
  }
};

// GET /api/medical-files/appointment/:appointmentId (doctor)
export const getAppointmentFiles = async (req, res) => {
  try {
    const doctor = req.user;
    const { appointmentId } = req.params;

    // Ensure appointment exists and belongs to a patient of this doctor
    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found", data: null });
    }

    if (!(await doctorHasAccessToPatient(doctor._id, appointment.patientId))) {
      return res.status(403).json({
        success: false,
        message: "Not allowed to view these files",
        data: null,
      });
    }

    const limit = parseInt(req.query.limit || "50", 10);
    const offset = parseInt(req.query.offset || "0", 10);

    // Extract patientId from appointment for file query
    const patientId = appointment.patientId;

    // CRITICAL FIX: Patient files may have appointmentId=null (uploaded without linking to appointment)
    // We must query by patientId and OPTIONALLY match appointmentId
    // Query: files where patientId=patient AND (appointmentId=null OR appointmentId=this_appointment)
    let patientObjectId;
    try {
      patientObjectId = new mongoose.Types.ObjectId(patientId);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID format",
        data: null,
      });
    }

    let appointmentObjectId;
    try {
      appointmentObjectId = new mongoose.Types.ObjectId(appointmentId);
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Invalid appointment ID format",
        data: null,
      });
    }

    // Query: Return files for this patient that are either:
    // 1. Linked to this appointment (appointmentId = specific value), OR
    // 2. Not linked to any appointment (appointmentId = null)
    // This ensures we get ALL relevant files, not just appointment-linked ones
    const query = {
      patientId: patientObjectId,
      $or: [{ appointmentId: appointmentObjectId }, { appointmentId: null }],
      isDeleted: { $ne: true },
    };

    const total = await MedicalFile.countDocuments(query);
    const files = await MedicalFile.find(query)
      .sort({ uploadedAt: -1 })
      .limit(limit)
      .skip(offset);

    // Debug: Log actual query and results for verification
    logger.debug("getAppointmentFiles", "Files fetched for appointment", {
      appointmentId: appointmentObjectId.toString(),
      patientId: patientObjectId.toString(),
      query: JSON.stringify(query),
      filesFound: files.length,
      total,
    });

    res.json({
      success: true,
      data: files,
      pagination: { total, limit, offset },
    });
  } catch (error) {
    logger.error(
      "getAppointmentFiles",
      "Error fetching appointment files",
      error,
    );
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch files", data: null });
  }
};

// Secure download endpoints
// GET /api/medical-files/download/patient/:storedName
export const downloadFileForPatient = async (req, res) => {
  try {
    const patient = req.user;
    const { storedName } = req.params;
    const fileUrl = `/api/medical-files/download/${storedName}`;

    const record = await MedicalFile.findOne({
      fileUrl,
      patientId: patient._id,
      isDeleted: { $ne: true },
    });
    if (!record) {
      return res
        .status(404)
        .json({ success: false, message: "File not found", data: null });
    }
    const filePath = storageUtils.getFullPathForStoredName(storedName);

    // Audit (non-blocking)
    try {
      AuditLog.create({
        actorType: "Patient",
        actorId: patient._id,
        action: "medicalfile:downloaded",
        resourceType: "MedicalFile",
        resourceId: record._id,
        meta: { fileName: record.fileName },
      });
    } catch (auditErr) {
      logger.error("downloadFileForPatient", "Audit failed", auditErr);
    }

    const detected = mime.lookup(record.fileName) || "application/octet-stream";
    res.setHeader(
      "Content-Type",
      record.fileType === "pdf" ? "application/pdf" : detected,
    );
    return res.sendFile(filePath);
  } catch (error) {
    logger.error("downloadFileForPatient", "Download error", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to download file", data: null });
  }
};

// GET /api/medical-files/download/doctor/:storedName
export const downloadFileForDoctor = async (req, res) => {
  try {
    const doctor = req.user;
    const { storedName } = req.params;
    const fileUrl = `/api/medical-files/download/${storedName}`;

    const record = await MedicalFile.findOne({
      fileUrl,
      isDeleted: { $ne: true },
    });
    if (!record) {
      return res
        .status(404)
        .json({ success: false, message: "File not found", data: null });
    }

    // Verify doctor has access to this patient
    if (!(await doctorHasAccessToPatient(doctor._id, record.patientId))) {
      return res.status(403).json({
        success: false,
        message: "Not allowed to download this file",
        data: null,
      });
    }

    const filePath = storageUtils.getFullPathForStoredName(storedName);

    try {
      AuditLog.create({
        actorType: "Doctor",
        actorId: doctor._id,
        action: "medicalfile:downloaded",
        resourceType: "MedicalFile",
        resourceId: record._id,
        meta: { fileName: record.fileName },
      });
    } catch (auditErr) {
      logger.error("downloadFileForDoctor", "Audit failed", auditErr);
    }

    const detectedDoc =
      mime.lookup(record.fileName) || "application/octet-stream";
    res.setHeader(
      "Content-Type",
      record.fileType === "pdf" ? "application/pdf" : detectedDoc,
    );
    return res.sendFile(filePath);
  } catch (error) {
    logger.error("downloadFileForDoctor", "Download error", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to download file", data: null });
  }
};

// Generic download handler that accepts either patient or doctor (used for legacy URLs)
export const downloadFileShared = async (req, res) => {
  try {
    const user = req.user; // attached by route-local middleware (could be patient or doctor)
    const { storedName } = req.params;

    // Find by storedName for robustness (handles old/new fileUrl formats)
    let record = await MedicalFile.findOne({
      storedName,
      isDeleted: { $ne: true },
    });

    // fallback: look by fileUrl if storedName lookup failed
    if (!record) {
      const fileUrl = `/api/medical-files/download/${storedName}`;
      record = await MedicalFile.findOne({ fileUrl, isDeleted: { $ne: true } });
    }

    if (!record) {
      return res
        .status(404)
        .json({ success: false, message: "File not found", data: null });
    }

    // Authorization: patient can access own files; doctor must have access to patient
    if (user.role === "patient") {
      if (String(record.patientId) !== String(user._id)) {
        return res.status(403).json({
          success: false,
          message: "Not allowed to download this file",
          data: null,
        });
      }
    } else if (user.role === "doctor") {
      if (!(await doctorHasAccessToPatient(user._id, record.patientId))) {
        return res.status(403).json({
          success: false,
          message: "Not allowed to download this file",
          data: null,
        });
      }
    } else {
      return res.status(403).json({
        success: false,
        message: "Not allowed to download this file",
        data: null,
      });
    }

    const filePath = storageUtils.getFullPathForStoredName(storedName);

    try {
      AuditLog.create({
        actorType: user.role === "doctor" ? "Doctor" : "Patient",
        actorId: user._id,
        action: "medicalfile:downloaded",
        resourceType: "MedicalFile",
        resourceId: record._id,
        meta: { fileName: record.fileName },
      });
    } catch (auditErr) {
      logger.error("downloadFileShared", "Audit failed", auditErr);
    }

    const detected = mime.lookup(record.fileName) || "application/octet-stream";
    res.setHeader(
      "Content-Type",
      record.fileType === "pdf" ? "application/pdf" : detected,
    );
    // suggest original filename for download
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${record.fileName.replace(/\"/g, '"')}"`,
    );
    return res.sendFile(filePath);
  } catch (error) {
    logger.error("downloadFileShared", "Download error", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to download file", data: null });
  }
};

// DELETE (soft) /api/medical-files/:id  (patient or doctor allowed with ownership checks)
export const softDeleteMedicalFile = [
  enforceOwnership(async (req) => {
    return await MedicalFile.findById(req.params.id);
  }),
  async (req, res) => {
    try {
      const user = req.user; // could be patient or doctor depending on middleware used
      const isDoctor = user && user.role === "doctor";
      const record = req.resource;

      // Ownership checks
      if (isDoctor) {
        if (!(await doctorHasAccessToPatient(user._id, record.patientId))) {
          return res.status(403).json({
            success: false,
            message: "Not allowed to delete this file",
            data: null,
          });
        }
      } else {
        // patient must own the file
        if (String(record.patientId) !== String(user._id)) {
          return res.status(403).json({
            success: false,
            message: "Not allowed to delete this file",
            data: null,
          });
        }
      }

      record.isDeleted = true;
      record.deletedAt = new Date();
      await record.save();

      try {
        AuditLog.create({
          actorType: isDoctor ? "Doctor" : "Patient",
          actorId: user._id,
          action: "medicalfile:deleted",
          resourceType: "MedicalFile",
          resourceId: record._id,
          meta: { fileName: record.fileName },
        });
      } catch (auditErr) {
        logger.error("softDeleteMedicalFile", "Audit failed", auditErr);
      }

      res.json({ success: true, data: { id: record._id } });
    } catch (err) {
      logger.error("softDeleteMedicalFile", "Error deleting file", err);
      res
        .status(500)
        .json({ success: false, message: "Failed to delete file", data: null });
    }
  },
];
