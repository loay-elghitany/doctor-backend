import express from "express";
import { tenantScope } from "../middleware/tenantScope.js";
import { universalAuth } from "../middleware/universalAuth.js";
import { enforceTenant } from "../middleware/enforceTenant.js";
import { requireRole } from "../middleware/rbacMiddleware.js";
import { ROLES } from "../constants/roles.js";
import {
  createAppointment,
  getUnifiedAppointments,
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
 * Secretary submits: { patientId, date, timeSlot?: string, notes?: string }
 * Middleware: universalAuth (verifies JWT for patient or secretary)
 * Returns: 201 with created appointment or 409 if time slot booked
 */
router.post(
  "/",
  universalAuth,
  requireRole(ROLES.PATIENT, ROLES.SECRETARY),
  enforceTenant,
  createAppointment,
);

/**
 * GET /api/appointments
 * Unified endpoint for all roles - returns appointments based on user role
 * Doctor: all their appointments
 * Secretary: appointments for their associated doctor
 * Patient: their own appointments
 * Middleware: universalAuth (verifies JWT for any role)
 * Returns: 200 with filtered appointments array
 */
router.get(
  "/",
  universalAuth,
  requireRole(ROLES.DOCTOR, ROLES.SECRETARY, ROLES.PATIENT),
  enforceTenant,
  getUnifiedAppointments,
);

/**
 * PATCH /api/appointments/:id/choose-time
 * Patient chooses one of the doctor's proposed reschedule times
 * Patient submits: { optionIndex: 0|1|2 }
 * Middleware: universalAuth + requireRole(ROLES.PATIENT), tenantScope (sets patientId, tenantId)
 * Returns: 200 with updated appointment or 409 if slot no longer available
 */
router.patch(
  "/:id/choose-time",
  universalAuth,
  requireRole(ROLES.PATIENT),
  tenantScope,
  chooseTime,
);

/**
 * PATCH /api/appointments/:id/cancel
 * Patient cancels a pending or reschedule_proposed appointment
 * Cannot cancel confirmed appointments
 * Middleware: universalAuth + requireRole(ROLES.PATIENT), tenantScope (sets patientId, tenantId)
 * Returns: 200 with cancelled appointment or 400 if invalid state
 */
router.patch(
  "/:id/cancel",
  universalAuth,
  requireRole(ROLES.PATIENT),
  tenantScope,
  cancelAppointment,
);

/**
 * PATCH /api/appointments/:id/hide
 * Patient hides a cancelled appointment from their personal dashboard
 * Appointment record remains in database and is visible to doctor/admin
 * Patient submits: { hidden: true|false }
 * Middleware: universalAuth + requireRole(ROLES.PATIENT), tenantScope (sets patientId, tenantId)
 * Returns: 200 with updated appointment or 400 if not cancelled
 */
router.patch(
  "/:id/hide",
  universalAuth,
  requireRole(ROLES.PATIENT),
  tenantScope,
  toggleHideAppointment,
);

/**
 * SECRETARY ROUTES
 * All routes scoped to secretary's associated doctor
 */

/**
 * GET /api/secretary/appointments
 * Get all appointments for secretary's associated doctor
 * Middleware: universalAuth + requireRole(ROLES.SECRETARY)
 * Returns: 200 with appointments array
 */
router.get(
  "/secretary/appointments",
  universalAuth,
  requireRole(ROLES.SECRETARY),
  (req, res) => {
    return getUnifiedAppointments(req, res);
  },
);

/**
 * Unified patient access is handled by /api/patients in patientRoutes.js.
 * Legacy appointment-scoped patient endpoints have been removed.
 */

export default router;
