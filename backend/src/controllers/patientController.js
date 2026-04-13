import Doctor from "../models/Doctor.js";
import Patient from "../models/Patient.js";
import Secretary from "../models/Secretary.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import logger from "../utils/logger.js";
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
}) => ({
  name,
  email,
  password,
  phoneNumber,
  doctorId,
  clinicSlug,
});

export const createPatientRecord = async ({
  name,
  email,
  password,
  phoneNumber,
  doctorId,
  clinicSlug,
}) => {
  const existing = await Patient.findOne({ email });
  if (existing) {
    const error = new Error("Email already used");
    error.status = 400;
    throw error;
  }
  return Patient.create(
    buildPatientPayload({
      name,
      email,
      password,
      phoneNumber,
      doctorId,
      clinicSlug,
    }),
  );
};

// تسجيل المريض
export const registerPatient = async (req, res) => {
  try {
    const clinicSlug = req.params.clinicSlug || req.body.clinicSlug;
    const { name, email, password, phoneNumber } = req.body;

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

    const validation = validatePatientRegistration({ name, email, password });
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
        data: null,
      });
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

    const existing = await Patient.findOne({ email });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Email already used",
        data: null,
      });
    }

    const patientPayload = buildPatientPayload({
      name,
      email,
      password,
      phoneNumber,
      doctorId,
      clinicSlug: resolution.clinicSlug,
    });

    const patient = await Patient.create(patientPayload);

    // Send WhatsApp notifications for new patient registration (Scenario 1)
    try {
      const doctorFromDb = await Doctor.findById(doctorId);
      const doctorName = doctorFromDb?.name || "الدكتور";
      const patientName = patient?.name || "المريض";
      const patientPhone = patient?.phoneNumber || "غير متوفر";

      const doctorMessage = `مرحباً د. ${doctorName}، تم تسجيل مريض جديد في عيادتك 👤. الاسم: ${patientName} | 📞 الاتصال: ${patientPhone}.`;
      const patientMessage = `مرحباً ${patientName}، مرحباً بك في عيادة د. ${doctorName} 🏥. تم إنشاء حسابك بنجاح. يمكنك الآن حجز مواعيد وإدارة السجلات الطبية بسهولة.`;

      const doctorNotification = createAndSendNotification({
        recipientId: doctorId,
        recipientType: "Doctor",
        type: "patient_registered",
        title: "مريض جديد مسجل",
        message: doctorMessage,
        doctorId,
        patientId: patient._id,
        actionUrl: `/doctor/patients`,
        metadata: {
          patientName,
          patientPhone,
        },
      });

      const patientNotification = createAndSendNotification({
        recipientId: patient._id,
        recipientType: "Patient",
        type: "patient_registered",
        title: "تم التسجيل بنجاح",
        message: patientMessage,
        doctorId,
        patientId: patient._id,
        actionUrl: `/patient/appointments`,
        metadata: {
          doctorName,
        },
      });

      await Promise.allSettled([doctorNotification, patientNotification]);
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
        const query = { doctorId: req.tenantId };
        logger.debug("getUnifiedPatients: DOCTOR query", { query });
        return query;
      },
      secretary: () => {
        const query = { doctorId: req.tenantId };
        logger.debug("getUnifiedPatients: SECRETARY query", {
          query,
          tenantId: req.tenantId,
        });
        return query;
      },
      patient: () => {
        const query = { _id: actualUserId, doctorId: req.tenantId };
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

    const { page, limit, skip } = getPaginationParams(req.query);
    const totalItems = await Patient.countDocuments(query);

    const patients = await Patient.find(query)
      .populate("doctorId", "name email")
      .select("name email phoneNumber doctorId createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

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
