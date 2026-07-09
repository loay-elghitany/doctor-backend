import mongoose from "mongoose";
import Doctor from "../models/Doctor.js";
import Patient from "../models/Patient.js";
import Secretary from "../models/Secretary.js";
import ScannedPrescription from "../models/ScannedPrescription.js";
import { ROLES } from "../constants/roles.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import logger from "../utils/logger.js";
import cloudinaryService from "../services/cloudinaryService.js";
import { createAndSendNotification } from "../services/whatsappNotificationService.js";
import { notifyStaffNewPatient } from "./notificationController.js";
import { buildPagination, getPaginationParams } from "../utils/pagination.js";

// Login المريض
export const loginPatient = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1️⃣ تحقق إن المريض موجود
    const patient = await Patient.findOne({ email }).select("+password");
    if (!patient)
      return res.status(404).json({
        success: false,
        message: "Patient not found",
        data: null,
      });

    // 2️⃣ تحقق كلمة السر
    const isMatch = await bcrypt.compare(password, patient.password);
    if (!isMatch)
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
        data: null,
      });

    // 3️⃣ اعمل JWT token
    const jwtPayload = {
      id: patient._id,
      role: "patient",
      doctorId: patient.doctorId,
    };

    const token = jwt.sign(jwtPayload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      success: true,
      message: "Login successful",
      data: {
        token,
        patient: {
          id: patient._id,
          name: patient.name,
          email: patient.email,
          clinicSlug: patient.clinicSlug,
        },
      },
    });
  } catch (error) {
    logger.error("UnexpectedError", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

const validatePatientRegistration = ({ name, email, password }) => {
  if (!name || !email || !password) {
    return {
      valid: false,
      message: "Name, email, and password are required",
    };
  }
  return { valid: true };
};

const loadOptionalAuthenticatedUser = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {};
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return {
      error: "Invalid authorization header format",
      status: 401,
    };
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.id || !decoded.role) {
      return {
        error: "Invalid token payload",
        status: 401,
      };
    }

    if (decoded.role === "doctor") {
      const doctor = await Doctor.findById(decoded.id).select("-password");
      if (!doctor) {
        return {
          error: "Doctor not found",
          status: 401,
        };
      }
      req.user = {
        _id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        role: "doctor",
        doctorId: doctor._id,
      };
      return {};
    }

    if (decoded.role === "secretary") {
      const secretary = await Secretary.findById(decoded.id).select(
        "-password",
      );
      if (!secretary || !secretary.doctorId) {
        return {
          error: "Secretary not found or not associated with a doctor",
          status: 401,
        };
      }
      req.user = {
        _id: secretary._id,
        name: secretary.name,
        email: secretary.email,
        role: "secretary",
        doctorId: secretary.doctorId,
      };
      return {};
    }

    return {
      error: "Invalid user role for registration",
      status: 400,
    };
  } catch (error) {
    return {
      error: error.message.includes("jwt")
        ? "Invalid or expired token"
        : "Authentication error",
      status: 401,
    };
  }
};

const resolvePatientDoctorId = async (req, clinicSlug) => {
  if (req.user) {
    logger.debug("registerPatient: authenticated registration detected", {
      role: req.user.role,
    });

    let authDoctorId;
    if (req.user.role === "secretary") {
      authDoctorId = req.user.doctorId;
      if (!authDoctorId) {
        return {
          error: "Secretary not associated with a doctor",
          status: 400,
        };
      }
    } else if (req.user.role === "doctor") {
      authDoctorId = req.user.doctorId || req.user._id;
      if (!authDoctorId) {
        return {
          error: "Doctor ID is missing from authenticated user",
          status: 400,
        };
      }
    } else {
      return {
        error: "Invalid user role for registration",
        status: 400,
      };
    }

    const doctor = await Doctor.findById(authDoctorId);
    if (!doctor) {
      return {
        error: "Associated doctor not found",
        status: 404,
      };
    }

    return {
      doctorId: authDoctorId,
      clinicSlug: doctor.clinicSlug,
      source: `authenticated-${req.user.role}`,
    };
  }

  logger.debug("registerPatient: public registration detected", {
    clinicSlug,
  });

  if (!clinicSlug) {
    return {
      error: "Clinic slug is required for public registration",
      status: 400,
    };
  }

  const doctor = await Doctor.findOne({ clinicSlug });
  if (!doctor) {
    return {
      error: "Clinic not found",
      status: 404,
    };
  }

  return {
    doctorId: doctor._id,
    clinicSlug: doctor.clinicSlug,
    source: "public-clinicSlug",
  };
};

const buildPatientPayload = ({
  name,
  email,
  password,
  phoneNumber,
  doctorId,
  clinicSlug,
  medicalHistory,
}) => ({
  name,
  email,
  password,
  phoneNumber,
  doctorId,
  clinicSlug,
  medicalHistory: medicalHistory || undefined,
});

export const createPatientRecord = async ({
  name,
  email,
  password,
  phoneNumber,
  doctorId,
  clinicSlug,
  medicalHistory,
}) => {
  // Ensure uniqueness by email OR phoneNumber to prevent duplicates
  if (email) {
    const existingByEmail = await Patient.findOne({ email });
    if (existingByEmail) {
      const error = new Error("Email already used");
      error.status = 400;
      throw error;
    }
  }

  if (phoneNumber) {
    const existingByPhone = await Patient.findOne({ phoneNumber });
    if (existingByPhone) {
      const error = new Error("Phone number already used");
      error.status = 400;
      throw error;
    }
  }

  return Patient.create(
    buildPatientPayload({
      name,
      email,
      password,
      phoneNumber,
      doctorId,
      clinicSlug,
      medicalHistory,
    }),
  );
};

// تسجيل المريض
export const registerPatient = async (req, res) => {
  try {
    const clinicSlug = req.params.clinicSlug || req.body.clinicSlug;
    const { name, email, password, phoneNumber, medicalHistory } = req.body;

    const authResult = await loadOptionalAuthenticatedUser(req);
    if (authResult.error) {
      return res.status(authResult.status || 401).json({
        success: false,
        message: authResult.error,
        data: null,
      });
    }

    logger.debug("registerPatient", {
      clinicSlug,
      email,
      hasPassword: !!password,
      hasUser: !!req.user,
      userRole: req.user?.role,
    });

    // Secretary-driven registration: allow missing email/password and generate silent fallbacks
    if (req.user && req.user.role === "secretary") {
      if (!name || !name.trim() || !phoneNumber || !phoneNumber.trim()) {
        return res.status(400).json({
          success: false,
          message:
            "Name and phoneNumber are required for secretary registration",
          data: null,
        });
      }
    } else {
      const validation = validatePatientRegistration({ name, email, password });
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.message,
          data: null,
        });
      }
    }

    const resolution = await resolvePatientDoctorId(req, clinicSlug);
    if (resolution.error) {
      return res.status(resolution.status || 400).json({
        success: false,
        message: resolution.error,
        data: null,
      });
    }

    const doctorId = resolution.doctorId;
    if (!doctorId) {
      return res.status(400).json({
        success: false,
        message: "Unable to resolve the doctor for registration.",
        data: null,
      });
    }

    logger.debug("registerPatient: resolved doctorId", {
      doctorId: doctorId.toString(),
      source: resolution.source,
    });

    // If secretary is creating the patient, silently generate email/password/fallbacks
    let finalEmail = email;
    let finalPassword = password;
    let finalPhone = phoneNumber;
    if (req.user && req.user.role === "secretary") {
      finalPhone = String(phoneNumber || "").trim();
      finalEmail = `${finalPhone}@mydoc90.local`; // تعديل نظيف وصافي
      finalPassword = `Pt@${finalPhone}`;
    }

    const patientPayload = buildPatientPayload({
      name,
      email: finalEmail,
      password: finalPassword,
      phoneNumber: finalPhone,
      doctorId,
      clinicSlug: resolution.clinicSlug,
      medicalHistory,
    });

    const patient = await Patient.create(patientPayload);

    // Send WhatsApp + In-App notifications for new patient registration
    try {
      const doctorFromDb = await Doctor.findById(doctorId);
      const doctorName = doctorFromDb?.name || "الدكتور";
      const patientName = patient?.name || "المريض";
      const patientPhone = patient?.phoneNumber || "غير متوفر";
      const resolvedClinicSlug =
        resolution.clinicSlug || doctorFromDb?.clinicSlug;

      const doctorMessage = `مرحباً د. ${doctorName}، تم تسجيل مريض جديد في عيادتك 👤. الاسم: ${patientName} | 📞 الاتصال: ${patientPhone}.`;
      const patientMessage = `مرحباً ${patientName}، مرحباً بك في عيادة د. ${doctorName} 🏥. تم إنشاء حسابك بنجاح. يمكنك الآن حجز مواعيد وإدارة السجلات الطبية بسهولة.`;

      // WhatsApp notifications (fire-and-forget)
      const doctorWhatsApp = createAndSendNotification({
        recipientId: doctorId,
        recipientType: "Doctor",
        type: "patient_registered",
        title: "مريض جديد مسجل",
        message: doctorMessage,
        doctorId,
        patientId: patient._id,
        actionUrl: `/doctor/patients`,
        metadata: { patientName, patientPhone },
      });

      const patientWhatsApp = createAndSendNotification({
        recipientId: patient._id,
        recipientType: "Patient",
        type: "patient_registered",
        title: "تم التسجيل بنجاح",
        message: patientMessage,
        doctorId,
        patientId: patient._id,
        actionUrl: `/patient/appointments`,
        metadata: { doctorName },
      });

      // Persistent In-App notification for clinic staff (doctor + secretaries)
      // Notify doctor about new patient registration
      const staffInApp = resolvedClinicSlug
        ? notifyStaffNewPatient(resolvedClinicSlug, {
            ...patient.toObject(),
            doctorId,
          })
        : Promise.resolve();

      await Promise.allSettled([doctorWhatsApp, patientWhatsApp, staffInApp]);
    } catch (notificationError) {
      logger.error(
        "[registerPatient] Failed to send notifications:",
        notificationError.message,
      );
    }

    res.status(201).json({
      success: true,
      message: "Patient registered successfully!",
      data: { id: patient._id },
    });
  } catch (error) {
    logger.error("registerPatient error:", error);
    res.status(500).json({
      success: false,
      message: "Server error during registration",
      data: null,
    });
  }
};

// جلب بروفايل المريض
export const getPatientProfile = async (req, res) => {
  try {
    // Guard: Ensure patient context
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: null,
      });
    }

    const patient = await Patient.findById(req.user._id).select("-password");
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
        data: null,
      });
    }
    res.json({
      success: true,
      message: "Patient profile retrieved successfully",
      data: patient,
    });
  } catch (error) {
    logger.error("UnexpectedError", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const getPatientScannedPrescriptions = async (req, res) => {
  try {
    const { patientId } = req.params;
    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: "Patient ID is required",
        data: null,
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: null,
      });
    }

    const { role, _id: userId, clinicSlug } = req.user;
    const isPatient = role === ROLES.PATIENT;
    const isDoctor = role === ROLES.DOCTOR;
    const isSecretary = role === ROLES.SECRETARY;

    if (isPatient && userId.toString() !== patientId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access these scanned prescriptions",
        data: null,
      });
    }

    const patient = await Patient.findById(patientId).select("clinicSlug");
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
        data: null,
      });
    }

    if ((isDoctor || isSecretary) && patient.clinicSlug !== clinicSlug) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access these scanned prescriptions",
        data: null,
      });
    }

    const query = { patientId };
    const { page, limit, skip } = getPaginationParams(req.query);
    const totalItems = await ScannedPrescription.countDocuments(query);

    const scannedPrescriptions = await ScannedPrescription.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      success: true,
      message: "Scanned prescriptions retrieved successfully",
      data: scannedPrescriptions,
      pagination: buildPagination(page, limit, totalItems),
    });
  } catch (error) {
    logger.error("getPatientScannedPrescriptions error:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving scanned prescriptions",
      data: null,
    });
  }
};

export const getDoctorScannedPrescriptions = async (req, res) => {
  try {
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    const clinicSlug = req.doctor.clinicSlug;
    const doctorId = req.doctor._id;
    const { page, limit, skip } = getPaginationParams(req.query);
    const query = {
      $or: [{ clinicSlug }, { doctorId }],
    };
    if (req.query.patientId) {
      query.$and = [{ patientId: req.query.patientId }];
    }

    const totalItems = await ScannedPrescription.countDocuments(query);
    const scannedPrescriptions = await ScannedPrescription.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("patientId", "name")
      .lean();

    res.json({
      success: true,
      message: "Doctor scanned prescriptions retrieved successfully",
      data: scannedPrescriptions,
      pagination: buildPagination(page, limit, totalItems),
    });
  } catch (error) {
    logger.error("getDoctorScannedPrescriptions error:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving scanned prescriptions",
      data: null,
    });
  }
};

/**
 * Get scanned prescriptions for a specific patient (Doctor-only endpoint)
 * Doctor can only view prescriptions for their own patients
 */
export const getDoctorPatientScannedPrescriptions = async (req, res) => {
  try {
    const { patientId } = req.params;

    if (!patientId) {
      return res.status(400).json({
        success: false,
        message: "Patient ID is required",
        data: null,
      });
    }

    if (!mongoose.isValidObjectId(patientId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid patient ID format",
        data: null,
      });
    }

    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    // Verify doctor owns this patient
    const patient = await Patient.findById(patientId).select(
      "doctorId clinicSlug",
    );
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found",
        data: null,
      });
    }

    // Check authorization: Patient must belong to this doctor
    if (
      (!patient.doctorId ||
        patient.doctorId.toString() !== req.doctor._id.toString()) &&
      patient.clinicSlug !== req.doctor.clinicSlug
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this patient's prescriptions",
        data: null,
      });
    }

    const { page, limit, skip } = getPaginationParams(req.query);
    const query = { patientId };

    const totalItems = await ScannedPrescription.countDocuments(query);
    const scannedPrescriptions = await ScannedPrescription.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      success: true,
      message: "Patient scanned prescriptions retrieved successfully",
      data: scannedPrescriptions,
      pagination: buildPagination(page, limit, totalItems),
    });
  } catch (error) {
    logger.error("getDoctorPatientScannedPrescriptions error:", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving scanned prescriptions",
      data: null,
    });
  }
};

/**
 * Delete a scanned prescription
 * Only Admin, Secretary, and Doctor who own the clinic can delete
 * Removes both the document and the Cloudinary file
 */
export const deleteScannedPrescription = async (req, res) => {
  try {
    const { prescriptionId } = req.params;

    if (!prescriptionId) {
      return res.status(400).json({
        success: false,
        message: "Prescription ID is required",
        data: null,
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
        data: null,
      });
    }

    const { role, _id: userId, clinicSlug } = req.user;

    // Find the scanned prescription
    const scannedPrescription =
      await ScannedPrescription.findById(prescriptionId);
    if (!scannedPrescription) {
      return res.status(404).json({
        success: false,
        message: "Scanned prescription not found",
        data: null,
      });
    }

    // Authorization check: Only allow Secretary and Doctor from the same clinic
    if (role === ROLES.SECRETARY || role === ROLES.DOCTOR) {
      if (scannedPrescription.clinicSlug !== clinicSlug) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to delete this prescription",
          data: null,
        });
      }
    } else if (role === ROLES.ADMIN) {
      // Admins can delete any prescription
    } else {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete prescriptions",
        data: null,
      });
    }

    // Delete file from Cloudinary if it exists
    if (scannedPrescription.fileUrl) {
      try {
        await cloudinaryService.deleteFile(scannedPrescription.fileUrl);
      } catch (cloudinaryError) {
        logger.error(
          "deleteScannedPrescription",
          "Failed to delete from Cloudinary",
          cloudinaryError,
        );
        // Continue with database deletion even if Cloudinary deletion fails
      }
    }

    // Delete from database
    await ScannedPrescription.deleteOne({ _id: prescriptionId });

    logger.info("deleteScannedPrescription", "Prescription deleted", {
      prescriptionId,
      userId,
      clinicSlug,
    });

    res.json({
      success: true,
      message: "Scanned prescription deleted successfully",
      data: {
        deletedId: prescriptionId,
      },
    });
  } catch (error) {
    logger.error("deleteScannedPrescription error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Server error deleting scanned prescription",
      data: null,
    });
  }
};

/**
 * Unified get patients endpoint for all roles
 * Uses JWT role to determine filtering logic
 */
export const getUnifiedPatients = async (req, res) => {
  try {
    logger.debug("getUnifiedPatients: Called", {
      hasUser: !!req.user,
      userKeys: req.user ? Object.keys(req.user) : null,
      userRole: req.user?.role,
      userId: req.user?._id || req.user?.id,
      doctorId: req.user?.doctorId,
    });

    if (!req.user) {
      logger.debug("getUnifiedPatients: No req.user");
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        data: null,
      });
    }

    const { role, _id: userId, id: altUserId, doctorId } = req.user;
    const actualUserId = userId || altUserId;

    logger.debug("getUnifiedPatients: Extracted", {
      role,
      userId: actualUserId,
      doctorId,
    });

    if (!role || !actualUserId) {
      logger.debug("getUnifiedPatients: Missing role or userId");
      return res.status(400).json({
        success: false,
        message: "Invalid user data",
        data: null,
      });
    }

    const queryBuilders = {
      doctor: () => {
        const query = { clinicSlug: req.user.clinicSlug };
        logger.debug("getUnifiedPatients: DOCTOR query", { query });
        return query;
      },
      secretary: () => {
        const query = { clinicSlug: req.user.clinicSlug };
        logger.debug("getUnifiedPatients: SECRETARY query", {
          query,
          clinicSlug: req.user.clinicSlug,
        });
        return query;
      },
      patient: () => {
        const query = { _id: actualUserId, clinicSlug: req.user.clinicSlug };
        logger.debug("getUnifiedPatients: PATIENT query", { query });
        return query;
      },
    };

    const buildQuery = queryBuilders[role];
    if (!buildQuery) {
      logger.debug("getUnifiedPatients: UNKNOWN role", { role });
      return res.status(400).json({
        success: false,
        message: "Invalid user role.",
        data: null,
      });
    }

    const query = buildQuery();
    if (res.headersSent) return;

    let { page, limit, skip } = getPaginationParams(req.query);
    if (req.query.limit && !isNaN(parseInt(req.query.limit))) {
      const requestedLimit = parseInt(req.query.limit);
      if (requestedLimit > limit) {
        limit = Math.min(requestedLimit, 5000);
        skip = (page - 1) * limit;
      }
    }

    const totalItems = await Patient.countDocuments(query);

    const patients = await Patient.find(query)
      .populate("doctorId", "name email")
      .select("name email phoneNumber doctorId createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const normalizedPatients = patients.map((patientDoc) => {
      const patient =
        typeof patientDoc.toObject === "function"
          ? patientDoc.toObject()
          : patientDoc;

      if (!patient.doctorId) {
        logger.warn("Missing doctorId reference in patient record", {
          patientId: patient._id,
          doctorId: patient.doctorId,
        });
      }

      const doctor = patient.doctorId || {
        _id: null,
        name: "Unknown Doctor",
        email: "",
      };

      return {
        ...patient,
        doctorId: {
          _id: doctor._id ?? null,
          name: doctor.name || "Unknown Doctor",
          email: doctor.email || "",
        },
      };
    });

    logger.debug("getUnifiedPatients: Found patients", {
      count: normalizedPatients.length,
      query,
      role,
    });

    res.json({
      success: true,
      message: "Patients retrieved successfully.",
      data: normalizedPatients,
      pagination: buildPagination(page, limit, totalItems),
    });
  } catch (error) {
    logger.error("getUnifiedPatients error:", error);
    res.status(500).json({
      success: false,
      message: "An unexpected error occurred.",
      data: null,
    });
  }
};
