import express from "express";
import {
  createDoctor,
  loginDoctor,
  getDoctorProfile,
  getDoctorPatients,
  getPatientAppointmentsForDoctor,
  getDoctorPublicProfile,
  updateDoctorClinicProfile,
} from "../controllers/doctorController.js";
import {
  getPrivateNotes,
  createPrivateNote,
  updatePrivateNote,
  deletePrivateNote,
} from "../controllers/doctorPrivateNotesController.js";
import { getDoctorReportsDashboard } from "../controllers/reportController.js";
import {
  getPrivateFiles,
  createPrivateFile,
  deletePrivateFile,
} from "../controllers/doctorPrivateFilesController.js";
import {
  getDoctorScannedPrescriptions,
  getDoctorPatientScannedPrescriptions,
} from "../controllers/patientController.js";
import Doctor from "../models/Doctor.js";
import { universalAuth } from "../middleware/universalAuth.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { ROLES } from "../constants/roles.js";
import { protectSubscription } from "../middleware/subscriptionCheckMiddleware.js";

const router = express.Router();

// إنشاء دكتور (يدوي – من الأدمن)
router.post("/register", protectAdmin, createDoctor);

//testing route

router.get("/", async (req, res) => {
  const doctors = await Doctor.find();
  res.json(doctors);
});

// Login with rate limiting (OPTIONS automatically skipped by limiter)
router.post("/login", authLimiter, loginDoctor);
router.get("/public-profile", getDoctorPublicProfile);

// Get doctor profile (protected)
router.get(
  "/me",
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY),
  getDoctorProfile,
);
router.put(
  "/clinic-profile",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  updateDoctorClinicProfile,
  protectSubscription,
);

// Get all patients for the logged-in doctor or secretary (protected)
router.get(
  "/patients",
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY),
  getDoctorPatients,
);

// Get appointments for a specific patient (protected)
router.get(
  "/patients/:patientId/appointments",
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY),
  getPatientAppointmentsForDoctor,
);

// Doctor reports dashboard (tenant-scoped)
router.get(
  "/reports/dashboard",
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY),
  getDoctorReportsDashboard,
);

// Get scanned prescriptions for this doctor's clinic
router.get(
  "/scanned-prescriptions",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  getDoctorScannedPrescriptions,
);

// Get scanned prescriptions for a specific patient (doctor-only)
router.get(
  "/patients/:patientId/scanned-prescriptions",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  getDoctorPatientScannedPrescriptions,
);

// Private Notes routes (doctor-only)
router.get(
  "/patients/:patientId/private-notes",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  getPrivateNotes,
);

router.post(
  "/patients/:patientId/private-notes",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  createPrivateNote,
  protectSubscription,
);

router.put(
  "/patients/:patientId/private-notes/:noteId",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  updatePrivateNote,
  protectSubscription,
);

router.delete(
  "/patients/:patientId/private-notes/:noteId",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  deletePrivateNote,
);

// Private Files routes (doctor-only)
router.get(
  "/patients/:patientId/private-files",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  getPrivateFiles,
);

router.post(
  "/patients/:patientId/private-files",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  createPrivateFile,
  protectSubscription,
);

router.delete(
  "/private-files/:fileId",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  deletePrivateFile,
);

export default router;
