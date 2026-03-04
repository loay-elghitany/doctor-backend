import express from "express";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";
import {
  createDoctorAccount,
  deactivateDoctorAccount,
  reactivateDoctorAccount,
  listAllDoctors,
  getDoctorInfo,
  deleteDoctorAccountPermanent,
} from "../controllers/adminController.js";

const router = express.Router();

/**
 * ADMIN-ONLY ENDPOINTS
 * All routes require admin authentication via protectAdmin middleware
 *
 * Authentication: Pass ADMIN_SECRET_TOKEN in Authorization header
 * Example: Authorization: Bearer your_admin_secret_token_here
 */

/**
 * POST /api/admin/create-doctor
 * Create a new doctor account (manual subscription)
 * Admin submits: { name, email, clinicSlug?, password? }
 * Returns: 201 with doctor details and generated password (if not provided)
 */
router.post("/create-doctor", protectAdmin, createDoctorAccount);

/**
 * POST /api/admin/deactivate-doctor/:doctorId
 * Deactivate (pause) a doctor subscription
 * Soft-deactivates: preserves appointments and patient records
 * Prevents new appointments for this doctor
 * Admin submits: { reason?: string }
 * Returns: 200 with deactivation confirmation
 */
router.post(
  "/deactivate-doctor/:doctorId",
  protectAdmin,
  deactivateDoctorAccount,
);

/**
 * POST /api/admin/reactivate-doctor/:doctorId
 * Reactivate a previously deactivated doctor
 * Restores ability to receive new appointments
 * Returns: 200 with reactivation confirmation
 */
router.post(
  "/reactivate-doctor/:doctorId",
  protectAdmin,
  reactivateDoctorAccount,
);

/**
 * GET /api/admin/doctors
 * List all doctors with subscription status
 * Returns: 200 with doctors array and summary stats
 */
router.get("/doctors", protectAdmin, listAllDoctors);

/**
 * GET /api/admin/doctors/:doctorId
 * Get detailed information for a specific doctor
 * Returns: 200 with doctor details
 */
router.get("/doctors/:doctorId", protectAdmin, getDoctorInfo);

/**
 * POST /api/admin/delete-doctor/:doctorId
 * Permanently delete a doctor account (DANGEROUS - use with caution)
 * Hard deletes doctor record but preserves appointments/patient data
 * Requires confirmDelete: true to prevent accidental deletion
 * Returns: 200 with deletion confirmation
 *
 * NOTE: Usually better to deactivate instead of delete
 * This is for cleaning up test/spam accounts only
 */
router.post(
  "/delete-doctor/:doctorId",
  protectAdmin,
  deleteDoctorAccountPermanent,
);

export default router;
