import express from "express";
import {
  uploadMedicalFile,
  getMyMedicalFiles,
  getPatientFiles,
  getAppointmentFiles,
  softDeleteMedicalFile,
} from "../controllers/medicalFileController.js";
import {
  downloadFileForPatient,
  downloadFileForDoctor,
  viewFileForPatient,
  viewFileForDoctor,
} from "../controllers/fileAccessController.js";
import { protect, doctorProtect } from "../middleware/authMiddleware.js";
import jwt from "jsonwebtoken";
import Patient from "../models/Patient.js";
import Doctor from "../models/Doctor.js";

// Lightweight middleware that accepts either a patient or doctor token.
// Keeps existing auth middleware unchanged; this is a small additive helper
// used only for the legacy download URL `/api/medical-files/download/:storedName`.
const authEither = async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, no token provided",
      data: null,
    });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: "Not authorized - invalid token",
        data: null,
      });
    }
    // If token includes role=doctor, treat as doctor; otherwise try patient lookup first
    if (decoded.role === "doctor") {
      const doc = await Doctor.findById(decoded.id).select("-password");
      if (!doc)
        return res
          .status(401)
          .json({ success: false, message: "Doctor not found", data: null });
      req.user = doc;
      req.user.role = "doctor";
      return next();
    }

    // default: patient
    const pat = await Patient.findById(decoded.id).select("-password");
    if (!pat)
      return res
        .status(401)
        .json({ success: false, message: "Patient not found", data: null });
    req.user = pat;
    req.user.role = "patient";
    return next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: "Not authorized - token invalid",
      data: null,
    });
  }
};

const router = express.Router();

// Patient upload their own files
router.post("/upload", protect, uploadMedicalFile);

// Patient: list own files
router.get("/my", protect, getMyMedicalFiles);

// Doctor: list files for a patient
router.get("/patient/:patientId", doctorProtect, getPatientFiles);

// Doctor: list files for an appointment
router.get("/appointment/:appointmentId", doctorProtect, getAppointmentFiles);

// Secure downloads & views
router.get("/download/patient/:storedName", protect, downloadFileForPatient);
router.get(
  "/download/doctor/:storedName",
  doctorProtect,
  downloadFileForDoctor,
);
router.get("/view/patient/:storedName", protect, viewFileForPatient);
router.get("/view/doctor/:storedName", doctorProtect, viewFileForDoctor);

// Legacy/public link compatibility: support `/api/medical-files/download/:storedName`
// This endpoint enforces auth and authorisation (patient or doctor) and protects
// against exposing filesystem paths. It is additive and won't break existing routes.
router.get("/download/:storedName", authEither, (req, res) => {
  return res.status(410).json({
    success: false,
    message:
      "This download endpoint is deprecated. Please use the authorized doctor/patient download routes.",
  });
});

// Soft delete (patient or doctor)
router.delete("/:id", protect, softDeleteMedicalFile);
router.delete("/doctor/:id", doctorProtect, softDeleteMedicalFile);

export default router;
