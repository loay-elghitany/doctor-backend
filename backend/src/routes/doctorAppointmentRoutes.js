import express from "express";
import {
  createDoctorAppointment,
  getDoctorAppointments,
  updateAppointmentStatus,
  proposeTimes,
  cancelAppointment,
  doctorDeleteAppointment,
  doctorBulkCleanupAppointments,
  markAppointmentCompleted,
} from "../controllers/doctorAppointmentController.js";
import { universalAuth } from "../middleware/universalAuth.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

/**
 * DOCTOR APPOINTMENT ROUTES
 * All routes scoped to authenticated doctor using req.doctor._id
 * Doctor identity is the single source of truth for all doctor appointment operations
 */

/**
 * GET /api/doctor-appointments
 * Retrieve all appointments for the logged-in doctor or secretary's doctor
 * Middleware: universalAuth + requireRole(ROLES.DOCTOR, ROLES.SECRETARY)
 * Returns: 200 with appointments array sorted by date
 */
router.get(
  "/",
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY),
  getDoctorAppointments,
);

/**
 * POST /api/doctor-appointments
 * Create a new appointment for a patient under the doctor's care
 * Doctor/Secretary submits: { patientId, date, timeSlot, notes? }
 * Middleware: universalAuth + requireRole(ROLES.DOCTOR, ROLES.SECRETARY)
 * Returns: 201 with created appointment or 409 if time slot booked
 */
router.post(
  "/",
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY),
  createDoctorAppointment,
);

/**
 * PUT /api/doctor-appointments/:id
 * Update appointment status, date, and/or timeSlot
 * Doctor submits: { status?: string, date?: string, timeSlot?: string }
 * Cannot use to cancel (use DELETE instead)
 * Middleware: universalAuth + requireRole(ROLES.DOCTOR, ROLES.SECRETARY), checkSubscriptionForAction (verifies subscription is active)
 * Returns: 200 with updated appointment or 409 if time slot booked
 */
router.put(
  "/:id",
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY),
  updateAppointmentStatus,
);

/**
 * PATCH /api/doctor-appointments/:id/propose-times
 * Doctor proposes 3 alternative date/time options for rescheduling
 * Doctor submits: { rescheduleOptions: [{ date, timeSlot }, ...] }
 * Each option must have valid ISO date and HH:MM timeSlot
 * Limit: Appointment can only be rescheduled once
 * Middleware: universalAuth + requireRole(ROLES.DOCTOR, ROLES.SECRETARY), checkSubscriptionForAction (verifies subscription is active)
 * Returns: 200 with updated appointment or 409 if slots already booked
 */
router.patch(
  "/:id/propose-times",
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY),
  proposeTimes,
);

/**
 * DELETE /api/doctor-appointments/:id
 * Doctor cancels an appointment
 * Doctors can cancel at any time, regardless of appointment status
 * Middleware: universalAuth + requireRole(ROLES.DOCTOR, ROLES.SECRETARY)
 * Returns: 200 with cancelled appointment or 404 if not found
 */
router.delete(
  "/:id",
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY),
  cancelAppointment,
);

/**
 * POST /api/doctor-appointments/:id/mark-completed
 * Mark an appointment as completed (only way to set status = completed)
 * Doctor submits: { notes?: string }
 * Can only complete scheduled or confirmed appointments
 * Middleware: universalAuth + requireRole(ROLES.DOCTOR, ROLES.SECRETARY)
 * Returns: 200 with completed appointment or 400 if invalid state
 */
router.post(
  "/:id/mark-completed",
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY),
  markAppointmentCompleted,
);

/**
 * POST /api/doctor-appointments/:id/soft-delete
 * Soft-delete a single appointment from the doctor's dashboard
 * Middleware: universalAuth + requireRole(ROLES.DOCTOR, ROLES.SECRETARY)
 */
router.post(
  "/:id/soft-delete",
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY),
  doctorDeleteAppointment,
);

/**
 * POST /api/doctor-appointments/clean-old
 * Bulk soft-delete old/cancelled/completed appointments for the doctor
 * Middleware: universalAuth + requireRole(ROLES.DOCTOR, ROLES.SECRETARY)
 */
router.post(
  "/clean-old",
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY),
  doctorBulkCleanupAppointments,
);

export default router;
