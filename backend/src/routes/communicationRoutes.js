import express from "express";
import {
  getWhatsAppLinkForPatient,
  getWhatsAppLinkForDoctor,
} from "../controllers/communicationController.js";
import { protect, doctorProtect } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET /api/communication/whatsapp/doctor (patient only)
router.get("/whatsapp/doctor", protect, getWhatsAppLinkForDoctor);

// GET /api/communication/whatsapp/patient/:patientId (doctor only)
router.get(
  "/whatsapp/patient/:patientId",
  doctorProtect,
  getWhatsAppLinkForPatient,
);

export default router;
