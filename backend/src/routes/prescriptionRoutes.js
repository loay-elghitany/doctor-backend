import express from "express";
import {
  createPrescription,
  getAppointmentPrescriptions,
  getDoctorPrescriptions,
  deletePrescription,
} from "../controllers/prescriptionController.js";
import { protectDoctor } from "../middleware/doctorAuthMiddleware.js";
import { protect } from "../middleware/authMiddleware.js";

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
router.post("/", protectDoctor, createPrescription);

/**
 * GET /api/prescriptions/doctor
 * Get all prescriptions created by the logged-in doctor
 * Doctor-only endpoint
 */
router.get("/doctor", protectDoctor, getDoctorPrescriptions);

/**
 * DELETE /api/prescriptions/:id
 * Delete a prescription
 * Doctor-only endpoint
 */
router.delete("/:prescriptionId", protectDoctor, deletePrescription);

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
  protectDoctor,
  getAppointmentPrescriptions,
);

/**
 * GET /api/prescriptions/appointment/:appointmentId (patient)
 * Get all prescriptions for an appointment - Patient access
 */
router.get("/appointment/:appointmentId", protect, getAppointmentPrescriptions);

export default router;
