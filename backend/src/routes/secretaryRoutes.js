import express from "express";
import {
  createSecretary,
  loginSecretary,
  getSecretaryProfile,
  createPatientUnderDoctor,
  uploadScannedPrescription,
} from "../controllers/secretaryController.js";
import { universalAuth } from "../middleware/universalAuth.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { ROLES } from "../constants/roles.js";
import multer from "multer";

const router = express.Router();

// Secretary account routes - only doctors can create secretaries
router.post("/", universalAuth, requireRole(ROLES.DOCTOR), createSecretary);
// Secretary login (rate limited, OPTIONS skipped automatically)
router.post("/login", authLimiter, loginSecretary);

// Secretary-specific operations
router.get(
  "/me",
  universalAuth,
  requireRole(ROLES.SECRETARY),
  getSecretaryProfile,
);

// Patient management for secretaries and doctors
router.post(
  "/patients",
  universalAuth,
  requireRole(ROLES.SECRETARY, ROLES.DOCTOR),
  createPatientUnderDoctor,
);

// Scanned prescription upload
const upload = multer({ storage: multer.memoryStorage() });
router.post(
  "/prescriptions/upload",
  universalAuth,
  requireRole(ROLES.SECRETARY),
  upload.single("file"),
  uploadScannedPrescription,
);

// Note: /patients and /appointments routes removed - now use unified /api/patients and /api/appointments

export default router;
