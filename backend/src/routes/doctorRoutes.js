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
import Doctor from "../models/Doctor.js";
import { universalAuth } from "../middleware/universalAuth.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

// إنشاء دكتور (يدوي – من الأدمن)
router.post("/register", protectAdmin, createDoctor);

//testing route

router.get("/", async (req, res) => {
  const doctors = await Doctor.find();
  res.json(doctors);
});

router.post("/login", loginDoctor);
router.get("/public-profile", getDoctorPublicProfile);

// Get doctor profile (protected)
router.get("/me", universalAuth, requireRole(ROLES.DOCTOR), getDoctorProfile);
router.put(
  "/clinic-profile",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  updateDoctorClinicProfile,
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

export default router;
