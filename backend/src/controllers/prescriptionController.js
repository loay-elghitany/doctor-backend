import Prescription from "../models/Prescription.js";
import Appointment from "../models/Appointment.js";
import Doctor from "../models/Doctor.js";
import {
  createInAppNotification,
  notifyPatientNewPrescription,
  notifyStaffNewPrescription,
} from "./notificationController.js";
import { createTimelineEvent } from "./doctorTimelineController.js";
import { createAndSendNotification } from "../services/whatsappNotificationService.js";
import auditService from "../services/auditService.js";
import enforceOwnership from "../middleware/enforceOwnership.js";
import logger from "../utils/logger.js";
import { buildPagination, getPaginationParams } from "../utils/pagination.js";
import { ROLES } from "../constants/roles.js";

const extractGeminiText = (response) => {
  const result = Array.isArray(response) ? response[0] : response;
  if (!result) return null;
  return (
    result?.candidates?.[0]?.content?.[0]?.text ||
    result?.output?.[0]?.content?.[0]?.text ||
    null
  );
};

const ensureJsonOnly = (rawText) => {
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Empty Gemini response");
  }

  let cleaned = rawText.replace(/```/g, "").replace(/`/g, "").trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    throw new Error("Gemini response does not contain valid JSON");
  }

  cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  return JSON.parse(cleaned);
};

const parseGeminiJson = async (promptText) => {
  let geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

  if (geminiKey) {
    geminiKey = String(geminiKey)
      .replace(/^\uFEFF+/, "")
      .replace(/[\r\n\t\0\x0B\x0C]/g, "")
      .trim();
  }

  if (!geminiKey) {
    throw new Error(
      "Missing GEMINI_API_KEY or GOOGLE_API_KEY in server environment.",
    );
  }
  // 🌟 الانتقال للموديل الأحدث المدعوم عالمياً على مسار v1 المستقر
  // 🌟 الانتقال للموديل الأحدث المدعوم عالمياً على مسار v1 المستقر
  const endpoint = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`;
  const payload = {
    contents: [
      {
        parts: [{ text: promptText }],
      },
    ],
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const resJson = await response.json();

    if (!response.ok) {
      const errorMessage =
        resJson?.error?.message ||
        JSON.stringify(resJson) ||
        response.statusText;
      const error = new Error(
        `[Google API Error]: ${response.status} - ${errorMessage}`,
      );
      error.status = response.status;
      throw error;
    }

    const assistantText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!assistantText) {
      throw new Error("No text returned from Gemini API response structure.");
    }

    return ensureJsonOnly(assistantText);
  } catch (fetchError) {
    console.error(
      "💥 CRITICAL ERROR INSIDE parseGeminiJson:",
      fetchError.message,
    );
    throw fetchError;
  }
};

export const createPrescription = async (req, res) => {
  try {
    const { appointmentId, medications, diagnosis, notes } = req.body;

    if (!req.doctor || !req.doctor._id) {
      logger.debug(
        "createPrescription",
        "Unauthorized - missing doctor context",
      );
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    if (!appointmentId) {
      return res.status(400).json({
        success: false,
        message: "Appointment ID is required",
        data: null,
      });
    }

    if (!medications || medications.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one medication is required",
        data: null,
      });
    }

    logger.debug("createPrescription", "Creating prescription", {
      appointmentId,
      doctorId: req.doctor._id,
      medicationCount: medications.length,
    });

    const appointment =
      await Appointment.findById(appointmentId).populate("doctorId patientId");

    if (!appointment) {
      logger.debug("createPrescription", "Appointment not found", {
        appointmentId,
      });
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found", data: null });
    }

    if (appointment.doctorId._id.toString() !== req.doctor._id.toString()) {
      logger.debug(
        "createPrescription",
        "Doctor not authorized for this appointment",
        {
          appointmentId,
          doctorId: req.doctor._id,
          appointmentDoctorId: appointment.doctorId._id,
        },
      );
      return res.status(403).json({
        success: false,
        message: "Not authorized to create prescription for this appointment",
        data: null,
      });
    }

    const doctor = await Doctor.findById(req.doctor._id);
    if (!doctor || !doctor.isActive) {
      logger.debug("createPrescription", "Doctor subscription inactive", {
        doctorId: req.doctor._id,
      });
      return res.status(403).json({
        success: false,
        message: "Doctor subscription is inactive",
        data: null,
      });
    }

    const prescription = await Prescription.create({
      appointmentId,
      doctorId: req.doctor._id,
      patientId: appointment.patientId._id,
      medications,
      diagnosis: diagnosis || null,
      notes: notes || null,
    });

    logger.debug("createPrescription", "Prescription created successfully", {
      prescriptionId: prescription._id,
      appointmentId,
    });

    try {
      const medicationSummary = medications
        .map((med) => `${med.name} ${med.dosage || ""}`)
        .join(", ");
      await createTimelineEvent({
        patientId: appointment.patientId._id,
        doctorId: req.doctor._id,
        appointmentId,
        eventType: "prescription_created",
        eventTitle: "Prescription Added",
        eventDescription: `Prescribed: ${medicationSummary}${diagnosis ? ` (${diagnosis})` : ""}`,
        eventStatus: "active",
        visibility: "patient_visible",
        metadata: {
          prescriptionId: prescription._id,
          medications,
          diagnosis,
          notes,
        },
      });
    } catch (timelineError) {
      logger.error(
        "createPrescription",
        "Failed to create timeline event",
        timelineError,
      );
    }

    try {
      const patient = appointment.patientId;
      const patientName = patient?.name || "المريض";
      const doctorName = doctor?.name || "الدكتور";
      const dateLabel = new Date().toLocaleDateString("ar-EG");
      const medicationSummary = medications
        .map((med) => `${med.name} ${med.dosage || med.strength || ""}`)
        .join(", ");
      const patientMessage = `مرحباً ${patientName}، نتمنى لك دوام الصحة والعافية 🩺. د. ${doctorName} قد أصدر لك وصفة طبية جديدة بتاريخ ${dateLabel}. يمكنك الدخول إلى حسابك على المنصة لمشاهدة تفاصيل الوصفة والأدوية وتحميلها.`;

      createAndSendNotification({
        recipientId: appointment.patientId._id,
        recipientType: "Patient",
        type: "prescription_created",
        title: "روشتة طبية جديدة",
        message: patientMessage,
        prescriptionId: prescription._id,
        appointmentId,
        doctorId: req.doctor._id,
        patientId: appointment.patientId._id,
        actionUrl: `/patient/appointments/${appointmentId}`,
        metadata: {
          medications,
          diagnosis,
          notes,
          doctorName,
          medicationSummary,
        },
      }).catch((err) =>
        logger.error("createPrescription", "WhatsApp notification failed", err),
      );

      await Promise.allSettled([
        notifyPatientNewPrescription(
          appointment.patientId._id,
          prescription,
          doctorName,
        ),
        notifyStaffNewPrescription(
          doctor.clinicSlug,
          prescription,
          appointment.patientId,
          doctor,
        ),
      ]);
    } catch (notificationError) {
      logger.error(
        "createPrescription",
        "Failed to send notification",
        notificationError,
      );
    }

    res.status(201).json({
      success: true,
      message: "Prescription created successfully",
      data: prescription,
    });
  } catch (error) {
    logger.error("createPrescription", "Unexpected error", error);
    res.status(500).json({
      success: false,
      message: "Server error creating prescription",
      data: null,
    });
  }
};

export const processVoicePrescription = async (req, res) => {
  try {
    const rawText = String(req.body.rawText || "").trim();
    const existingDiagnosis = String(req.body.existingDiagnosis || "").trim();
    const existingNotes = String(req.body.existingNotes || "").trim();
    const existingMedications = Array.isArray(req.body.existingMedications)
      ? req.body.existingMedications
      : [];

    if (!rawText) {
      return res
        .status(400)
        .json({ success: false, message: "rawText is required", data: null });
    }

    if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      logger.error(
        "processVoicePrescription",
        "Gemini API Key is missing in .env",
      );
      return res.status(500).json({
        success: false,
        message:
          "AI Configuration error: Gemini API Key is missing on the server.",
        data: null,
      });
    }

    logger.debug("processVoicePrescription", "Parsing voice prescription", {
      doctorId: req.doctor?._id,
      existingDiagnosis,
      existingMedicationsCount: existingMedications.length,
      existingNotesLength: existingNotes.length,
    });

    const prompt = `You are a clinical prescription assistant. Merge the newly dictated physician text into the existing prescription context, then return one clean JSON object only. Do not return markdown, backticks, or any explanatory text. Use this exact schema:\n\n{\n  "diagnosis": "extracted or refined diagnosis string in Arabic/English",\n  "medications": [\n    { "name": "Drug Name", "dosage": "e.g., 500mg", "frequency": "e.g., Twice daily", "duration": "e.g., 7 days", "instructions": "e.g., After meals" }\n  ],\n  "notes": "any extra warnings or notes"\n}\n\nExisting prescription state:\nDiagnosis: ${existingDiagnosis || "(none)"}\nMedications: ${JSON.stringify(existingMedications, null, 2)}\nNotes: ${existingNotes || "(none)"}\n\nNew raw dictation text:\n${rawText}\n\nInstructions:\n- Parse the ENTIRE transcribed text line-by-line and preserve every mentioned medication, dosage, frequency, duration, and clinical note.\n- Never truncate, skip, collapse, or omit any medication entry or details from the dictated text.\n- If frequency or duration is dictated, map it to the corresponding JSON keys (frequency, duration); do not merge it into the medication name or leave it blank.\n- Do not remove existing medications unless the new text explicitly states a medication should be discontinued.\n- Every medication name MUST be written in standard English/Latin format only, even if the doctor dictates it in Arabic script (for example, "كونكر" should be output as "Concor").
- All other fields (diagnosis, notes, dosage, frequency, duration, instructions) MUST be fully written in Arabic exactly as dictated by the doctor.\n- Preserve existing diagnosis and notes if no new relevant information is dictated; otherwise append or refine them carefully.\n- Avoid duplicate medication entries; if an existing medication is referenced again, merge only clearly updated dosage, frequency, duration, or instructions.\n- Return valid JSON only, with keys diagnosis, medications, and notes.`;

    let parsed;
    try {
      parsed = await parseGeminiJson(prompt);
    } catch (error) {
      const message = String(error?.message || "Unknown Gemini error");
      const statusCode = Number(error?.status) || null;
      const isRateLimitError =
        statusCode === 429 || /429|Too Many Requests|rate limit/i.test(message);
      const isQuotaError = /quota|context.*exhaust|exhausted/i.test(message);

      if (isRateLimitError) {
        logger.warn(
          "processVoicePrescription",
          "Gemini rate limit or request throttled",
          { message, statusCode },
        );
        return res.status(429).json({
          success: false,
          message:
            "Rate limit reached while processing voice prescription. Please try again after a short delay.",
          errorDetails: message,
          data: null,
        });
      }

      if (isQuotaError) {
        logger.warn(
          "processVoicePrescription",
          "Gemini quota exhaustion detected",
          { message, statusCode },
        );
        return res.status(503).json({
          success: false,
          message:
            "AI service quota temporarily unavailable. Please retry in a few minutes.",
          errorDetails: message,
          data: null,
        });
      }

      logger.error("processVoicePrescription", "Gemini parsing failed", error);
      return res.status(502).json({
        success: false,
        message: "Failed to parse voice prescription",
        errorDetails: message,
        data: null,
      });
    }

    const medications = Array.isArray(parsed.medications)
      ? parsed.medications.map((med) => ({
          name: med.name || "",
          dosage: med.dosage || "",
          frequency: med.frequency || "",
          duration: med.duration || "",
          instructions: med.instructions || "",
        }))
      : [];

    res.json({
      success: true,
      message: "Voice prescription parsed successfully",
      data: {
        diagnosis: parsed.diagnosis || "",
        medications,
        notes: parsed.notes || "",
      },
    });
  } catch (error) {
    logger.error("processVoicePrescription", "Gemini parsing failed", error);
    res.status(502).json({
      success: false,
      message: "Failed to parse voice prescription",
      errorDetails: error.message,
      data: null,
    });
  }
};

export const getDrugAlternatives = async (req, res) => {
  try {
    const name = String(req.query.name || "").trim();
    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Medication name is required",
        data: null,
      });
    }

    logger.debug("getDrugAlternatives", "Looking up alternatives", {
      doctorId: req.doctor?._id,
      medicationName: name,
    });

    const prompt = `You are a clinical pharmacist assistant. Provide exactly 3 alternative brand names available in the market for the medication named \"${name}\" with the same active ingredient and strength. Return JSON only with a single field named \"alternatives\". Example: { \"alternatives\": [\"Brand A\", \"Brand B\", \"Brand C\"] }. Do not include markdown, explanations, or any additional keys.`;

    try {
      const parsed = await parseGeminiJson(prompt);
      const alternatives = Array.isArray(parsed?.alternatives)
        ? parsed.alternatives.map((entry) =>
            typeof entry === "string"
              ? entry
              : String(entry?.name || entry || "").trim(),
          )
        : [];

      return res.json({
        success: true,
        message: "Drug alternatives retrieved successfully",
        data: { alternatives: alternatives.filter(Boolean).slice(0, 3) },
      });
    } catch (error) {
      logger.error(
        "[getDrugAlternatives] Gemini AI High Demand / Failed:",
        error.message,
      );
      return res.json({
        success: true,
        isFallback: true,
        message:
          "سيرفر بدائل الأدوية مزدحم حالياً بطلب مرتفع، يرجى المحاولة مرة أخرى خلال دقيقة.",
        data: [],
      });
    }
  } catch (error) {
    logger.error("getDrugAlternatives", "Gemini alternatives failed", error);
    res.status(502).json({
      success: false,
      message: "Failed to fetch drug alternatives",
      data: null,
    });
  }
};

export const getAppointmentPrescriptions = async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const isDoctor = !!req.doctor;
    const isSecretary = req.user?.role === ROLES.SECRETARY || !!req.secretary;
    const userId = isDoctor
      ? req.doctor._id
      : req.secretary?._id || req.user?._id;

    if (!userId) {
      return res
        .status(401)
        .json({ success: false, message: "Not authenticated", data: null });
    }

    logger.debug("getAppointmentPrescriptions", "Fetching prescriptions", {
      appointmentId,
      userId,
      userRole: isDoctor ? "doctor" : isSecretary ? "secretary" : "patient",
    });

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) {
      return res
        .status(404)
        .json({ success: false, message: "Appointment not found", data: null });
    }

    if (isDoctor) {
      if (appointment.doctorId.toString() !== req.doctor._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to access these prescriptions",
          data: null,
        });
      }
    } else if (isSecretary) {
      const secretaryDoctorId = req.secretary?.doctorId || req.user?.doctorId;
      if (
        !secretaryDoctorId ||
        appointment.doctorId.toString() !== secretaryDoctorId.toString()
      ) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to access these prescriptions",
          data: null,
        });
      }
    } else if (req.user) {
      if (appointment.patientId.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to access these prescriptions",
          data: null,
        });
      }
    }

    const prescriptions = await Prescription.find({ appointmentId })
      .populate("doctorId", "name email specialization")
      .populate("patientId", "name email")
      .populate("appointmentId", "date timeSlot status")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      message: "Prescriptions retrieved successfully",
      data: prescriptions,
    });
  } catch (error) {
    logger.error("getAppointmentPrescriptions", "Unexpected error", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving prescriptions",
      data: null,
    });
  }
};

export const getDoctorPrescriptions = async (req, res) => {
  try {
    if (!req.doctor || !req.doctor._id) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    const { page, limit, skip } = getPaginationParams(req.query);
    const totalItems = await Prescription.countDocuments({
      doctorId: req.doctor._id,
    });

    const prescriptions = await Prescription.find({ doctorId: req.doctor._id })
      .populate("appointmentId", "date timeSlot status")
      .populate("patientId", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      success: true,
      message: "Prescriptions retrieved successfully",
      data: prescriptions,
      pagination: buildPagination(page, limit, totalItems),
    });
  } catch (error) {
    logger.error("getDoctorPrescriptions", "Unexpected error", error);
    res.status(500).json({
      success: false,
      message: "Server error retrieving prescriptions",
      data: null,
    });
  }
};

export const deletePrescription = [
  enforceOwnership(async (req) => {
    return await Prescription.findById(req.params.prescriptionId);
  }),
  async (req, res) => {
    try {
      const { prescriptionId } = req.params;
      if (!req.doctor || !req.doctor._id) {
        return res.status(401).json({
          success: false,
          message: "Not authenticated as doctor",
          data: null,
        });
      }

      const prescription = req.resource;

      if (prescription.doctorId.toString() !== req.doctor._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to delete this prescription",
          data: null,
        });
      }

      const doctor = await Doctor.findById(req.doctor._id);
      if (!doctor || !doctor.isActive) {
        try {
          await auditService.logBlockedAction({
            actorType: "Doctor",
            actorId: req.doctor._id,
            action: "delete_prescription_blocked_inactive_subscription",
            resourceType: "Prescription",
            resourceId: prescription._id,
            reason: "inactive_subscription",
            meta: { prescriptionId },
          });
        } catch (e) {
          logger.error("deletePrescription", "Audit logging failed", e);
        }
        return res.status(403).json({
          success: false,
          message: "Doctor subscription is inactive",
          data: null,
        });
      }

      await Prescription.deleteOne({ _id: prescriptionId });

      auditService.logAction({
        actorType: "Doctor",
        actorId: req.doctor._id,
        action: "delete_prescription",
        resourceType: "Prescription",
        resourceId: prescriptionId,
        meta: { doctorId: req.doctor._id, prescriptionId },
      });

      res.json({
        success: true,
        message: "Prescription deleted successfully",
        data: null,
      });
    } catch (error) {
      logger.error("deletePrescription", "Unexpected error", error);
      res.status(500).json({
        success: false,
        message: "Server error deleting prescription",
        data: null,
      });
    }
  },
];
