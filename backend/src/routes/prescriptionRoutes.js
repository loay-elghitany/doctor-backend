import express from "express";
import {
  createPrescription,
  getAppointmentPrescriptions,
  getDoctorPrescriptions,
  deletePrescription,
  processVoicePrescription,
  getDrugAlternatives,
  savePrescriptionTemplate,
  getDoctorTemplates,
  deletePrescriptionTemplate,
  searchDoctorDrugs,
  forceRefreshDoctorDrugs,
} from "../controllers/prescriptionController.js";
import { universalAuth } from "../middleware/universalAuth.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { strictPostLimiter } from "../middleware/rateLimiter.js";
import { ROLES } from "../constants/roles.js";
import { protectSubscription } from "../middleware/subscriptionCheckMiddleware.js";
const router = express.Router();

/**
 * DOCTOR ROUTES (Prescription Management)
 */

/**
 * POST /api/prescriptions
 * Create a new prescription for an appointment
 * Doctor-only endpoint
 * Body: { appointmentId, medications, diagnosis, notes }
 */
router.post(
  "/",
  strictPostLimiter,
  universalAuth,
  requireRole(ROLES.DOCTOR),
  createPrescription,
  protectSubscription,
);

/**
 * POST /api/prescriptions/process-voice
 * Convert raw voice transcript into structured prescription payload
 */
router.post(
  "/process-voice",
  strictPostLimiter,
  universalAuth,
  requireRole(ROLES.DOCTOR),
  processVoicePrescription,
  protectSubscription,
);

/**
 * GET /api/prescriptions/alternatives?name=...
 * Return 3 AI-recommended replacement brands for the medication
 */
router.get(
  "/alternatives",
  strictPostLimiter,
  universalAuth,
  requireRole(ROLES.DOCTOR),
  getDrugAlternatives,
);

/**
 * GET /api/prescriptions/doctor
 * Get all prescriptions created by the logged-in doctor
 * Doctor-only endpoint
 */
router.get(
  "/doctor",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  getDoctorPrescriptions,
);

/**
 * POST /api/prescriptions/templates
 * Save a new prescription template for the logged-in doctor
 */
router.post(
  "/templates",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  savePrescriptionTemplate,
);

/**
 * GET /api/prescriptions/templates
 * Get all prescription templates for the logged-in doctor
 */
router.get(
  "/templates",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  getDoctorTemplates,
);

/**
 * DELETE /api/prescriptions/templates/:templateId
 * Delete a prescription template for the logged-in doctor
 */
router.delete(
  "/templates/:templateId",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  deletePrescriptionTemplate,
);

/**
 * GET /api/prescriptions/drugs/search
 * Search the logged-in doctor's custom drug cache
 */
router.get(
  "/drugs/search",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  searchDoctorDrugs,
);

/**
 * POST /api/prescriptions/drugs/refresh
 * Force a fresh AI-driven drug cache refresh for the logged-in doctor
 */
router.post(
  "/drugs/refresh",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  forceRefreshDoctorDrugs,
);

/**
 * DELETE /api/prescriptions/:id
 * Delete a prescription
 * Doctor-only endpoint
 */
router.delete(
  "/:prescriptionId",
  universalAuth,
  requireRole(ROLES.DOCTOR),
  deletePrescription,
);

/**
 * SHARED ROUTES (Both doctor and patient)
 * Doctor access: /api/prescriptions/appointment/:appointmentId?role=doctor
 * Patient access: /api/prescriptions/appointment/:appointmentId (patient route)
 */

/**
 * GET /api/prescriptions/appointment/:appointmentId (doctor)
 * Get all prescriptions for an appointment - Doctor access
 */
router.get(
  "/appointment/:appointmentId/doctor",
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY),
  getAppointmentPrescriptions,
);

/**
 * GET /api/prescriptions/appointment/:appointmentId (patient)
 * Get all prescriptions for an appointment - Patient access
 */
router.get(
  "/appointment/:appointmentId",
  universalAuth,
  requireRole(ROLES.PATIENT),
  getAppointmentPrescriptions,
);

export default router;
