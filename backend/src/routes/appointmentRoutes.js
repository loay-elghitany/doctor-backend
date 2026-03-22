import express from "express";
import { tenantScope } from "../middleware/tenantScope.js";
import { protect } from "../middleware/authMiddleware.js";
import {
  createAppointment,
  getAppointments,
  chooseTime,
  cancelAppointment,
  toggleHideAppointment,
} from "../controllers/appointmentController.js";

const router = express.Router();

/**
 * PATIENT ROUTES
 * All routes scoped to authenticated patient
 */

/**
 * POST /api/appointments
 * Create a new appointment
 * Patient submits: { date, timeSlot?: string, notes?: string }
 * Middleware: protect (verifies JWT), tenantScope (sets patientId, tenantId)
 * Returns: 201 with created appointment or 409 if time slot booked
 */
router.post("/", protect, tenantScope, createAppointment);

/**
 * GET /api/appointments
 * Retrieve all appointments for logged-in patient
 * Middleware: protect (verifies JWT), tenantScope (sets patientId, tenantId)
 * Returns: 200 with appointments array
 */
router.get("/", protect, tenantScope, getAppointments);

/**
 * PATCH /api/appointments/:id/choose-time
 * Patient chooses one of the doctor's proposed reschedule times
 * Patient submits: { optionIndex: 0|1|2 }
 * Middleware: protect (verifies JWT), tenantScope (sets patientId, tenantId)
 * Returns: 200 with updated appointment or 409 if slot no longer available
 */
router.patch("/:id/choose-time", protect, tenantScope, chooseTime);

/**
 * PATCH /api/appointments/:id/cancel
 * Patient cancels a pending or reschedule_proposed appointment
 * Cannot cancel confirmed appointments
 * Middleware: protect (verifies JWT), tenantScope (sets patientId, tenantId)
 * Returns: 200 with cancelled appointment or 400 if invalid state
 */
router.patch("/:id/cancel", protect, tenantScope, cancelAppointment);

/**
 * PATCH /api/appointments/:id/hide
 * Patient hides a cancelled appointment from their personal dashboard
 * Appointment record remains in database and is visible to doctor/admin
 * Patient submits: { hidden: true|false }
 * Middleware: protect (verifies JWT), tenantScope (sets patientId, tenantId)
 * Returns: 200 with updated appointment or 400 if not cancelled
 */
router.patch("/:id/hide", protect, tenantScope, toggleHideAppointment);

export default router;
