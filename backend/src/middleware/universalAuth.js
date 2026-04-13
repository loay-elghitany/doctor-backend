import jwt from "jsonwebtoken";
import Patient from "../models/Patient.js";
import Doctor from "../models/Doctor.js";
import Secretary from "../models/Secretary.js";

import { ROLES } from "../constants/roles.js";
import logger from "../utils/logger.js";

/**
 * Auth middleware logging guidance:
 * - DEBUG logs are only active when DEBUG=true or NODE_ENV=development.
 * - Keep production output limited to authentication failures and invalid tokens.
 */

const extractToken = (req) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }
  return header.split(" ")[1];
};

const normalizeUser = ({
  _id,
  name,
  email,
  phoneNumber = null,
  role,
  doctorId = null,
}) => ({
  _id,
  name,
  email,
  role,
  doctorId,
  phoneNumber,
});

export const universalAuth = async (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    logger.debug("universalAuth", "No token provided");
    return res.status(401).json({
      success: false,
      message: "Not authorized, no token provided",
      data: null,
    });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    const isTokenExpired = error.name === "TokenExpiredError";
    const logReason = isTokenExpired ? "Token expired" : "Invalid token";

    logger.warn("universalAuth", logReason, {
      ip: req.ip,
      path: req.originalUrl,
      method: req.method,
    });

    if (isTokenExpired) {
      return res.status(401).json({
        success: false,
        message: "Token expired",
        data: null,
      });
    }

    return res.status(401).json({
      success: false,
      message: "Not authorized - token invalid",
      data: null,
    });
  }

  if (!decoded || !decoded.id || !decoded.role) {
    logger.warn("universalAuth", "Invalid token payload", {
      ip: req.ip,
      path: req.originalUrl,
      method: req.method,
    });
    return res.status(401).json({
      success: false,
      message: "Invalid token format",
      data: null,
    });
  }

  let user = null;

  if (decoded.role === ROLES.PATIENT) {
    const patient = await Patient.findById(decoded.id).select("-password");
    if (!patient) {
      logger.warn("universalAuth", "Patient not found for token", {
        ip: req.ip,
        userId: decoded.id,
      });
      return res.status(401).json({
        success: false,
        message: "Not authorized - user not found",
        data: null,
      });
    }
    user = normalizeUser({
      _id: patient._id,
      name: patient.name,
      email: patient.email,
      phoneNumber: patient.phoneNumber || null,
      role: ROLES.PATIENT,
      doctorId: patient.doctorId || null,
    });
    req.patientId = patient._id;
  } else if (decoded.role === ROLES.DOCTOR) {
    const doctor = await Doctor.findById(decoded.id).select("-password");
    if (!doctor) {
      logger.warn("universalAuth", "Doctor not found for token", {
        ip: req.ip,
        userId: decoded.id,
      });
      return res.status(401).json({
        success: false,
        message: "Not authorized - user not found",
        data: null,
      });
    }
    user = normalizeUser({
      _id: doctor._id,
      name: doctor.name,
      email: doctor.email,
      phoneNumber: doctor.phoneNumber || null,
      role: ROLES.DOCTOR,
      doctorId: doctor._id,
    });
    req.doctor = doctor;
    req.tenantId = doctor._id;
  } else if (decoded.role === ROLES.SECRETARY) {
    const secretary = await Secretary.findById(decoded.id).select("-password");
    if (!secretary || !secretary.doctorId) {
      logger.warn(
        "universalAuth",
        "Secretary not found or missing doctorId for token",
        {
          ip: req.ip,
          userId: decoded.id,
        },
      );
      return res.status(401).json({
        success: false,
        message: "Not authorized - user not found",
        data: null,
      });
    }
    const doctor = await Doctor.findById(secretary.doctorId).select(
      "-password",
    );
    if (!doctor) {
      logger.warn("universalAuth", "Secretary's associated doctor not found", {
        ip: req.ip,
        doctorId: secretary.doctorId,
      });
      return res.status(401).json({
        success: false,
        message: "Not authorized - user not found",
        data: null,
      });
    }
    user = normalizeUser({
      _id: secretary._id,
      name: secretary.name,
      email: secretary.email,
      phoneNumber: secretary.phoneNumber || null,
      role: ROLES.SECRETARY,
      doctorId: secretary.doctorId,
    });
    req.secretary = secretary;
    req.doctor = doctor;
    req.tenantId = doctor._id;
  } else {
    logger.warn("universalAuth", "Unsupported user role in token", {
      ip: req.ip,
      role: decoded.role,
    });
    return res.status(401).json({
      success: false,
      message: "Invalid user role",
      data: null,
    });
  }

  req.user = user;
  next();
};
