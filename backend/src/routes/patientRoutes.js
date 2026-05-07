import express from "express";
import { registerPatient } from "../controllers/patientController.js";
import { loginPatient } from "../controllers/patientController.js";
import { getPatientProfile } from "../controllers/patientController.js";
import {
  getUnifiedPatients,
  getPatientScannedPrescriptions,
} from "../controllers/patientController.js";
import { universalAuth } from "../middleware/universalAuth.js";
import { enforceTenant } from "../middleware/enforceTenant.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

// /api/patients/register/:clinicSlug
router.post("/register/:clinicSlug", registerPatient);

// /api/patients/login (rate limited, OPTIONS skipped automatically)
router.post("/login", authLimiter, loginPatient);

// /api/patients/me
router.get("/me", universalAuth, requireRole(ROLES.PATIENT), getPatientProfile);

// /api/patients/:patientId/scanned-prescriptions
router.get(
  "/:patientId/scanned-prescriptions",
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY, ROLES.PATIENT),
  getPatientScannedPrescriptions,
);

/**
 * GET /api/patients
 * Unified endpoint for all roles - returns patients based on user role
 * Doctor: all their patients
 * Secretary: patients for their associated doctor
 * Patient: their own profile
 * Middleware: universalAuth (verifies JWT for any role)
 * Returns: 200 with filtered patients array
 */
router.get(
  "/",
  universalAuth,
  enforceTenant,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY, ROLES.PATIENT),
  getUnifiedPatients,
);

export default router;
