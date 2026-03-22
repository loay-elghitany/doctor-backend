import express from "express";
import { registerPatient } from "../controllers/patientController.js";
import { loginPatient } from "../controllers/patientController.js";
import { getPatientProfile } from "../controllers/patientController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// /api/patients/register/:clinicSlug
router.post("/register/:clinicSlug", registerPatient);

// /api/patients/login
router.post("/login", loginPatient);

// /api/patients/me
router.get("/me", protect, getPatientProfile);

export default router;
