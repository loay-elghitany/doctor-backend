import MedicalFile from "../models/MedicalFile.js";
import Patient from "../models/Patient.js";
import { debugLog, debugError } from "../utils/debug.js";
import path from "path";
import mime from "mime-types";
import fs from "fs";
import AuditLog from "../models/AuditLog.js";

// Helper: verify doctor has access to patient
const doctorHasAccessToPatient = async (doctorId, patientId) => {
  const patient = await Patient.findById(patientId);
  if (!patient) return false;
  return (
    String(patient.doctorId) === String(doctorId) ||
    String(patient.assignedDoctorId) === String(doctorId)
  );
};

const handleFileRequest = async (req, res, disposition) => {
  const user = req.user;
  const { storedName: rawStoredName } = req.params;
  const isDoctor = user.role === "doctor";

  // Extract the file identifier from the path, if one is provided
  const identifier = rawStoredName.includes("/")
    ? rawStoredName.split("/").pop()
    : rawStoredName;

  try {
    const query = { storedName: identifier, isDeleted: { $ne: true } };
    if (!isDoctor) {
      query.patientId = user._id;
    }

    const record = await MedicalFile.findOne(query);

    if (!record) {
      return res
        .status(404)
        .json({ success: false, message: "File not found" });
    }

    if (isDoctor) {
      if (!(await doctorHasAccessToPatient(user._id, record.patientId))) {
        return res
          .status(403)
          .json({ success: false, message: "Not authorized for this file" });
      }
    }

    // Audit log (non-blocking)
    try {
      AuditLog.create({
        actorType: isDoctor ? "Doctor" : "Patient",
        actorId: user._id,
        action: `medicalfile:${
          disposition === "inline" ? "viewed" : "downloaded"
        }`,
        resourceType: "MedicalFile",
        resourceId: record._id,
        meta: { fileName: record.fileName },
      });
    } catch (auditErr) {
      debugError("handleFileRequest", "Audit failed", auditErr);
    }

    if (record.fileUrl && record.fileUrl.startsWith("http")) {
      return res.redirect(record.fileUrl);
    }

    const localPath =
      process.env.NODE_ENV === "production"
        ? path.resolve(
            process.env.UPLOADS_DIR || "/var/data/uploads",
            record.storedName,
          )
        : path.resolve(
            process.cwd(),
            "uploads",
            "medical-files",
            record.storedName,
          );

    if (!fs.existsSync(localPath)) {
      debugError("File not found on disk:", localPath);
      return res
        .status(404)
        .json({ success: false, message: "File not found on server" });
    }

    const detectedMime =
      mime.lookup(record.fileName) || "application/octet-stream";
    res.setHeader("Content-Type", detectedMime);
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${record.fileName.replace(/"/g, "''")}"`,
    );

    return res.sendFile(localPath);
  } catch (error) {
    debugError("handleFileRequest", `File ${disposition} error`, error);
    res
      .status(500)
      .json({ success: false, message: "Failed to process file request" });
  }
};

export const downloadFileForPatient = (req, res) =>
  handleFileRequest(req, res, "attachment");
export const downloadFileForDoctor = (req, res) =>
  handleFileRequest(req, res, "attachment");
export const viewFileForPatient = (req, res) =>
  handleFileRequest(req, res, "inline");
export const viewFileForDoctor = (req, res) =>
  handleFileRequest(req, res, "inline");
