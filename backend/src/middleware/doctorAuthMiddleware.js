import jwt from "jsonwebtoken";
import Doctor from "../models/Doctor.js";

/**
 * Protect middleware for doctor routes
 * Verifies JWT token and attaches doctor to req.doctor
 * Also sets req.tenantId to doctor's ID for multi-tenant scope
 * Used by: /api/appointments/doctor (GET), /api/appointments/:id/propose-times (PATCH)
 */
export const protectDoctor = async (req, res, next) => {
  let token;

  // Extract token from Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized, no token provided",
      data: null,
    });
  }

  try {
    // Verify and decode JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid token format",
        data: null,
      });
    }

    // Find doctor by ID (decoded.id should be doctor ID from login)
    const doctor = await Doctor.findById(decoded.id).select("-password");

    if (!doctor) {
      return res.status(401).json({
        success: false,
        message: "Doctor not found",
        data: null,
      });
    }

    // Attach doctor to request
    req.doctor = doctor;

    // Set tenantId to doctor's ID for multi-tenant scoping
    // This ensures doctors only see appointments for their clinic
    req.tenantId = doctor._id;

    next();
  } catch (error) {
    console.error("Doctor auth error:", error.message);
    res.status(401).json({
      success: false,
      message: "Not authorized - token invalid",
      data: null,
    });
  }
};
