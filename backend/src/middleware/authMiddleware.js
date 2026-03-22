import jwt from "jsonwebtoken";
import Patient from "../models/Patient.js";
import Doctor from "../models/Doctor.js";
import { debugLog, debugError } from "../utils/debug.js";

/**
 * Protect middleware for patient routes
 * Verifies JWT token and attaches patient to req.user
 * Used by: /api/appointments (POST, GET), /api/appointments/:id/choose-time (PATCH)
 */
export const protect = async (req, res, next) => {
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

    // Find patient by ID (decoded.id should be patient ID from login)
    req.user = await Patient.findById(decoded.id).select("-password");

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Patient not found",
        data: null,
      });
    }

    req.user.role = "patient";
    next();
  } catch (error) {
    console.error("Auth error:", error.message);
    res.status(401).json({
      success: false,
      message: "Not authorized - token invalid",
      data: null,
    });
  }
};

/**
 * Protect middleware for doctor routes
 * Verifies JWT token and attaches doctor to req.user
 * Ensures only doctors can access doctor routes
 */
export const doctorProtect = async (req, res, next) => {
  let token;

  // Extract token from Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  debugLog("doctorProtect", "Verifying doctor token", {
    hasToken: !!token,
    authHeaderPresent: !!req.headers.authorization,
  });

  if (!token) {
    debugLog("doctorProtect", "No token provided");
    return res.status(401).json({
      success: false,
      message: "Not authorized, no token provided",
      data: null,
    });
  }

  try {
    // Verify and decode JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    debugLog("doctorProtect", "Token decoded", {
      doctorId: decoded.id,
      role: decoded.role,
    });

    if (!decoded.id) {
      debugLog("doctorProtect", "Invalid token structure or role mismatch", {
        hasId: !!decoded.id,
        role: decoded.role,
      });
      return res.status(401).json({
        success: false,
        message: "Not authorized - invalid or non-doctor token",
        data: null,
      });
    }

    // Find doctor by ID
    debugLog("doctorProtect", "Finding doctor by ID", { doctorId: decoded.id });
    const doctor = await Doctor.findById(decoded.id).select("-password");

    if (!doctor) {
      debugLog("doctorProtect", "Doctor not found", { doctorId: decoded.id });
      return res.status(401).json({
        success: false,
        message: "Doctor not found",
        data: null,
      });
    }

    debugLog("doctorProtect", "Doctor authenticated", {
      doctorId: doctor._id,
      name: doctor.name,
      email: doctor.email,
    });

    doctor.role = "doctor";
    req.user = doctor;
    next();
  } catch (error) {
    debugError("doctorProtect", "Token verification error", error);
    res.status(401).json({
      success: false,
      message: "Not authorized - token invalid",
      data: null,
    });
  }
};
