import Secretary from "../models/Secretary.js";
import Doctor from "../models/Doctor.js";
import Patient from "../models/Patient.js";
import ScannedPrescription from "../models/ScannedPrescription.js";
import InAppNotification from "../models/InAppNotification.js";
import jwt from "jsonwebtoken";
import { createPatientRecord } from "./patientController.js";
import { notifyStaffNewPatient } from "./notificationController.js";
import cloudinaryService from "../services/cloudinaryService.js";
import { whatsappService } from "../services/whatsappNotificationService.js";
import logger from "../utils/logger.js";

const generateSecretaryToken = (id, role, doctorId) => {
  return jwt.sign({ id, role, doctorId }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

export const createSecretary = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Get doctorId from authenticated doctor
    const doctorId = req.doctor._id;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
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

    const existing = await Secretary.findOne({ email });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Secretary email already exists",
        data: null,
      });
    }

    const secretary = await Secretary.create({
      name,
      email,
      password,
      doctorId: doctorId,
    });

    res.status(201).json({
      success: true,
      message: "Secretary created successfully",
      data: {
        id: secretary._id,
        name: secretary.name,
        email: secretary.email,
        doctorId: secretary.doctorId,
      },
    });
  } catch (error) {
    logger.error("createSecretary error:", error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email already in use",
        data: null,
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const loginSecretary = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
        data: null,
      });
    }

    const secretary = await Secretary.findOne({ email }).select("+password");
    if (!secretary) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        data: null,
      });
    }

    const isValid = await secretary.matchPassword(password);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        data: null,
      });
    }

    const token = generateSecretaryToken(
      secretary._id,
      "secretary",
      secretary.doctorId,
    );

    // Get clinicSlug from the associated doctor
    const doctor = await Doctor.findById(secretary.doctorId).select(
      "clinicSlug",
    );

    res.json({
      success: true,
      message: "Login successful",
      data: {
        token,
        secretary: {
          id: secretary._id,
          name: secretary.name,
          email: secretary.email,
          doctorId: secretary.doctorId,
          clinicSlug: doctor?.clinicSlug || null,
        },
      },
    });
  } catch (error) {
    logger.error("loginSecretary error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const getSecretaryProfile = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "secretary") {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as secretary",
        data: null,
      });
    }

    const sec = req.user;

    // clinicSlug is now available from universalAuth middleware (populated from doctor)
    console.log("[SecretaryController] Returning secretary profile:", {
      id: sec._id,
      clinicSlug: sec.clinicSlug,
      doctorId: sec.doctorId,
    });

    res.json({
      success: true,
      message: "Secretary profile retrieved",
      data: {
        id: sec._id,
        name: sec.name,
        email: sec.email,
        doctorId: sec.doctorId,
        clinicSlug: sec.clinicSlug || null,
      },
    });
  } catch (error) {
    logger.error("getSecretaryProfile error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const getSecretaryPatients = async (req, res) => {
  try {
    const clinicSlug = req.secretary?.clinicSlug || req.doctor?.clinicSlug;
    if (!clinicSlug) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated or clinic not found",
        data: null,
      });
    }

    const patients = await Patient.find({ clinicSlug }).select(
      "name email phoneNumber",
    );

    res.json({
      success: true,
      message: "Patients retrieved",
      data: patients,
    });
  } catch (error) {
    logger.error("getSecretaryPatients error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const createPatientUnderDoctor = async (req, res) => {
  try {
    const { name, email, password, phoneNumber, clinicSlug } = req.body;
    logger.debug("createPatientUnderDoctor: auth objects", {
      user: req.user,
      secretary: req.secretary,
      doctor: req.doctor,
    });

    // Resolve doctorId based on authenticated user role
    const user = req.user;
    let doctorId;
    if (user.role === "secretary") {
      doctorId = user.doctorId;
    } else if (user.role === "doctor") {
      doctorId = user._id;
    }

    logger.debug("createPatientUnderDoctor: resolved doctorId", { doctorId });

    if (!doctorId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated or invalid user role",
        data: null,
      });
    }

    if (!name || !email || !password || !clinicSlug) {
      return res.status(400).json({
        success: false,
        message: "Name, email, password, and clinicSlug are required",
        data: null,
      });
    }

    // Verify clinicSlug matches the doctor's clinic
    const doctor = await Doctor.findById(doctorId);
    if (!doctor || doctor.clinicSlug !== clinicSlug) {
      return res.status(403).json({
        success: false,
        message: "Invalid clinic access",
        data: null,
      });
    }

    const patient = await createPatientRecord({
      name,
      email,
      password,
      clinicSlug,
      phoneNumber,
      doctorId,
    });

    try {
      const { password: _, ...patientSafeData } = patient.toObject();
      await notifyStaffNewPatient(clinicSlug, patientSafeData);
    } catch (notificationError) {
      logger.error(
        "[createPatientUnderDoctor] Failed to notify staff of new patient:",
        notificationError.message,
      );
    }

    res.status(201).json({
      success: true,
      message: "Patient created successfully",
      data: {
        _id: patient._id,
        name: patient.name,
        email: patient.email,
        phoneNumber: patient.phoneNumber,
        clinicSlug: patient.clinicSlug,
        doctorId: patient.doctorId,
      },
    });
  } catch (error) {
    logger.error("createPatientUnderDoctor error:", error);
    if (error.status === 400) {
      return res.status(400).json({
        success: false,
        message: error.message,
        data: null,
      });
    }
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Email already in use",
        data: null,
      });
    }
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};
export const uploadScannedPrescription = async (req, res) => {
  try {
    const { patientId, doctorId, notes } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "File is required",
        data: null,
      });
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Only JPG, PNG, and PDF files are allowed",
        data: null,
      });
    }

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: "File size must be 5MB or less",
        data: null,
      });
    }

    // Get secretary info
    const secretary = req.user;
    if (!secretary || secretary.role !== "secretary") {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as secretary",
        data: null,
      });
    }

    // Verify patient exists and belongs to secretary's clinic
    const patient = await Patient.findOne({
      _id: patientId,
      clinicSlug: secretary.clinicSlug,
    });
    if (!patient) {
      return res.status(404).json({
        success: false,
        message: "Patient not found or access denied",
        data: null,
      });
    }

    // Determine file type
    const fileType = file.mimetype === "application/pdf" ? "pdf" : "image";

    // Upload to Cloudinary
    const fileUrl = await cloudinaryService.uploadBuffer(file.buffer, fileType);

    // Save to database
    const scannedPrescription = await ScannedPrescription.create({
      patientId,
      doctorId: doctorId || null,
      uploadedBy: secretary._id,
      fileUrl,
      fileType,
      notes: notes || null,
      clinicSlug: secretary.clinicSlug,
    });

    // Create in-app notification for patient
    await InAppNotification.create({
      recipient: patientId,
      recipientRole: "patient",
      recipientClinicSlug: secretary.clinicSlug,
      sender: secretary._id,
      senderRole: "secretary",
      senderName: secretary.name,
      type: "SCANNED_PRESCRIPTION_UPLOADED",
      title: "تم رفع روشتة جديدة",
      message:
        "تم رفع روشتة جديدة في ملفك الطبي. يمكنك عرضها أو طباعتها من حسابك",
      category: "prescription",
    });

    // Send WhatsApp notification
    try {
      if (patient.phoneNumber) {
        await whatsappService.sendMessage(
          patient.phoneNumber,
          "تم رفع روشتة جديدة في ملفك الطبي. يمكنك عرضها أو طباعتها من حسابك",
        );
      }
    } catch (whatsappError) {
      logger.error(
        "uploadScannedPrescription",
        "Failed to send WhatsApp notification",
        whatsappError,
      );
      // Don't fail the upload if WhatsApp fails
    }

    res.status(201).json({
      success: true,
      message: "Scanned prescription uploaded successfully",
      data: {
        _id: scannedPrescription._id,
        patientId: scannedPrescription.patientId,
        fileUrl: scannedPrescription.fileUrl,
        fileType: scannedPrescription.fileType,
        notes: scannedPrescription.notes,
        uploadedAt: scannedPrescription.createdAt,
      },
    });
  } catch (error) {
    logger.error("uploadScannedPrescription error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};
