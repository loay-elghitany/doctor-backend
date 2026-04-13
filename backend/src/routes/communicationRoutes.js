import express from "express";
import {
  getWhatsAppLinkForPatient,
  getWhatsAppLinkForDoctor,
} from "../controllers/communicationController.js";
import { universalAuth } from "../middleware/universalAuth.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

// GET /api/communication/whatsapp/doctor (patient only)
router.get(
  "/whatsapp/doctor",
  universalAuth,
  requireRole(ROLES.PATIENT),
  getWhatsAppLinkForDoctor,
);

// GET /api/communication/whatsapp/patient/:patientId (doctor only)
router.get(
  "/whatsapp/patient/:patientId",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  getWhatsAppLinkForPatient,
);

export default router;
