import Doctor from "../models/Doctor.js";
import Admin from "../models/Admin.js";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger.js";

logger.debug(
  "[adminController] NOTE: uuid package must be installed or use Math.random() for slug generation",
);

/**
 * ADMIN-ONLY CONTROLLER
 * Handles doctor account management
 * All endpoints require admin authentication via protectAdmin middleware
 */

/**
 * Create a new doctor account (admin-only)
 * POST /api/admin/create-doctor
 *
 * Admin submits:
 * {
 *   name: "Dr. Smith",
 *   email: "doctor@clinic.com",
 *   clinicSlug: "smith-clinic", (optional - auto-generated if not provided)
 *   password: "securePassword123", (optional - random generated if not provided)
 * }
 *
 * Response includes generated password only on first creation for admin to share
 */
export const createDoctorAccount = async (req, res) => {
  try {
    const {
      name,
      email,
      phoneNumber,
      clinicSlug: customSlug,
      password: customPassword,
    } = req.body;

    // Validation
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        message: "Name and email are required",
        data: null,
      });
    }

    // Check if doctor already exists
    const existing = await Doctor.findOne({ email });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Doctor with this email already exists",
        data: null,
      });
    }

    // Generate or use provided clinic slug
    let clinicSlug =
      customSlug ||
      name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9\-]/g, "");

    // Ensure uniqueness of clinic slug
    let isSlugUnique = false;
    let attempt = 0;
    const originalSlug = clinicSlug;

    while (!isSlugUnique && attempt < 10) {
      const existingSlug = await Doctor.findOne({ clinicSlug });
      if (!existingSlug) {
        isSlugUnique = true;
      } else {
        attempt++;
        // Append random suffix if slug already exists
        clinicSlug = `${originalSlug}-${attempt}`;
      }
    }

    if (!isSlugUnique) {
      return res.status(400).json({
        success: false,
        message: "Unable to generate unique clinic slug",
        data: null,
      });
    }

    // Generate password if not provided
    const generatedPassword =
      customPassword ||
      Math.random().toString(36).slice(2, 12) +
        Math.random().toString(36).slice(2, 4).toUpperCase();

    // Create doctor with hashed password and active status
    const doctor = await Doctor.create({
      name,
      email,
      phoneNumber,
      password: generatedPassword, // Will be hashed by pre-save hook
      clinicSlug: clinicSlug.toLowerCase(),
      isActive: true,
    });

    logger.debug("[createDoctorAccount] Doctor account created", {
      doctorId: doctor._id,
      email: doctor.email,
      clinicSlug: doctor.clinicSlug,
      createdBy: "admin",
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      message: "Doctor account created successfully",
      data: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        clinicSlug: doctor.clinicSlug,
        status: doctor.isActive ? "active" : "inactive",
        // Only return generated password on creation, never on queries
        // Admin must securely share this with the doctor
        generatedPassword: customPassword ? undefined : generatedPassword,
        note: customPassword
          ? "Using provided password"
          : `Generated password: ${generatedPassword}. Please share securely with doctor.`,
      },
    });
  } catch (error) {
    logger.error("[createDoctorAccount] error:", error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email or clinic slug already exists",
        data: null,
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create doctor account",
      data: null,
    });
  }
};

/**
 * Deactivate a doctor account (admin-only)
 * POST /api/admin/deactivate-doctor/:doctorId
 *
 * Soft-deactivates a doctor:
 * - Sets isActive = false
 * - Preserves all appointments and patient data
 * - Prevents new appointments for this doctor
 * - Existing appointments remain visible but cannot be modified
 *
 * Admin can later reactivate if needed
 */
export const deactivateDoctorAccount = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { reason } = req.body; // Optional: reason for deactivation

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: "Doctor ID is required",
        data: null,
      });
    }

    const doctor = await Doctor.findById(doctorId);

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
        data: null,
      });
    }

    if (!doctor.isActive) {
      return res.status(400).json({
        success: false,
        message: "Doctor account is already deactivated",
        data: null,
      });
    }

    // Soft-deactivate (preserve all data)
    doctor.isActive = false;
    doctor.deactivatedAt = new Date();
    await doctor.save();

    logger.debug("[adminController] Doctor account deactivated", {
      doctorId: doctor._id,
      email: doctor.email,
      clinicSlug: doctor.clinicSlug,
      reason: reason || "Not specified",
      deactivatedAt: new Date().toISOString(),
      note: "All existing appointments preserved. New appointments prevented.",
    });

    res.json({
      success: true,
      message: "Doctor account deactivated successfully",
      data: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        isActive: doctor.isActive,
        deactivatedAt: doctor.deactivatedAt,
        note: "All patient records and appointments preserved. Doctor can reactivate later.",
      },
    });
  } catch (error) {
    logger.error("[deactivateDoctorAccount] error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to deactivate doctor account",
      data: null,
    });
  }
};

/**
 * Reactivate a deactivated doctor account (admin-only)
 * POST /api/admin/reactivate-doctor/:doctorId
 *
 * Restores a previously deactivated doctor:
 * - Sets isActive = true
 * - Clears deactivatedAt timestamp
 * - Allows new appointments again
 */
export const reactivateDoctorAccount = async (req, res) => {
  try {
    const { doctorId } = req.params;

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: "Doctor ID is required",
        data: null,
      });
    }

    const doctor = await Doctor.findById(doctorId);

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
        data: null,
      });
    }

    if (doctor.isActive) {
      return res.status(400).json({
        success: false,
        message: "Doctor account is already active",
        data: null,
      });
    }

    // Reactivate
    doctor.isActive = true;
    doctor.deactivatedAt = null;
    await doctor.save();

    logger.debug("[adminController] Doctor account reactivated", {
      doctorId: doctor._id,
      email: doctor.email,
      clinicSlug: doctor.clinicSlug,
      reactivatedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: "Doctor account reactivated successfully",
      data: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        isActive: doctor.isActive,
        deactivatedAt: doctor.deactivatedAt,
      },
    });
  } catch (error) {
    logger.error("[reactivateDoctorAccount] error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reactivate doctor account",
      data: null,
    });
  }
};

/**
 * List all doctor accounts (admin-only)
 * GET /api/admin/doctors
 * Useful for dashboard showing all subscriptions
 */
export const listAllDoctors = async (req, res) => {
  try {
    const doctors = await Doctor.find()
      .select("-password") // Never expose password hashes
      .sort({ createdAt: -1 });

    const normalizedDoctors = doctors.map((doctor) => {
      const obj = doctor.toObject();
      const normalizedIsActive =
        typeof obj.isActive === "boolean"
          ? obj.isActive
          : obj.status === "active";

      return {
        ...obj,
        isActive: normalizedIsActive,
        status: normalizedIsActive ? "active" : "inactive",
      };
    });

    res.json({
      success: true,
      message: "Doctors retrieved successfully",
      data: {
        total: normalizedDoctors.length,
        active: normalizedDoctors.filter((d) => d.isActive).length,
        inactive: normalizedDoctors.filter((d) => !d.isActive).length,
        doctors: normalizedDoctors,
      },
    });
  } catch (error) {
    logger.error("[listAllDoctors] error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve doctors",
      data: null,
    });
  }
};

/**
 * Get detailed doctor info (admin-only)
 * GET /api/admin/doctors/:doctorId
 */
export const getDoctorInfo = async (req, res) => {
  try {
    const { doctorId } = req.params;

    const doctor = await Doctor.findById(doctorId).select("-password");

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
        data: null,
      });
    }

    res.json({
      success: true,
      message: "Doctor info retrieved",
      data: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        phoneNumber: doctor.phoneNumber,
        clinicSlug: doctor.clinicSlug,
        plan: doctor.plan,
        status: doctor.status,
        createdAt: doctor.createdAt,
        updatedAt: doctor.updatedAt,
      },
    });
  } catch (error) {
    logger.error("[getDoctorInfo] error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve doctor info",
      data: null,
    });
  }
};

/**
 * Delete a doctor account permanently (DANGEROUS - use with caution)
 * POST /api/admin/delete-doctor/:doctorId
 *
 * Performs hard delete of doctor record:
 * - Removes doctor from database
 * - DOES NOT delete patient records (they remain in system)
 * - DOES NOT delete appointments (they remain with orphaned doctorId)
 * - This is generally NOT recommended - soft deactivation is safer
 *
 * Only use for test/spam doctor accounts
 */
export const deleteDoctorAccountPermanent = async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { confirmDelete } = req.body; // Require confirmation flag

    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: "Doctor ID is required",
        data: null,
      });
    }

    if (!confirmDelete) {
      return res.status(400).json({
        success: false,
        message:
          "Permanent deletion requires confirmDelete: true in request body. WARNING: This will remove the doctor account but preserve appointments and patient records.",
        data: null,
      });
    }

    const doctor = await Doctor.findByIdAndDelete(doctorId);

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Doctor not found",
        data: null,
      });
    }

    logger.debug("[adminController] Doctor account PERMANENTLY DELETED", {
      doctorId: doctor._id,
      email: doctor.email,
      clinicSlug: doctor.clinicSlug,
      WARNING: "This is a hard delete. Appointments remain orphaned.",
    });

    res.json({
      success: true,
      message: "Doctor account permanently deleted",
      data: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        warning:
          "Doctor profile deleted but appointments remain in system. Consider soft-deactivation instead.",
      },
    });
  } catch (error) {
    logger.error("[deleteDoctorAccountPermanent] error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete doctor account",
      data: null,
    });
  }
};

export const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const isMatch = await bcryptjs.compare(password, admin.password);

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    const token = jwt.sign(
      { id: admin._id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    res.json({
      success: true,
      token,
      admin: {
        id: admin._id,
        email: admin.email,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
