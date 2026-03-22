import express from "express";
import {
  createDoctor,
  loginDoctor,
  getDoctorProfile,
  getDoctorPatients,
  getPatientAppointmentsForDoctor,
} from "../controllers/doctorController.js";
import Doctor from "../models/Doctor.js";
import { doctorProtect } from "../middleware/authMiddleware.js";

const router = express.Router();

// إنشاء دكتور (يدوي – من الأدمن)
router.post("/register", createDoctor);

//testing route

router.get("/", async (req, res) => {
  const doctors = await Doctor.find();
  res.json(doctors);
});

router.post("/login", loginDoctor);

// Get doctor profile (protected)
router.get("/me", doctorProtect, getDoctorProfile);

// Get all patients for the logged-in doctor (protected)
router.get("/patients", doctorProtect, getDoctorPatients);

// Get appointments for a specific patient (protected)
router.get(
  "/patients/:patientId/appointments",
  doctorProtect,
  getPatientAppointmentsForDoctor,
);

export default router;
