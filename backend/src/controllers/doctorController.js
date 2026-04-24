import Doctor from "../models/Doctor.js";
import jwt from "jsonwebtoken";
import logger from "../utils/logger.js";
import { extractClinicSlugFromHost } from "../utils/tenantResolver.js";

const isValidHttpUrl = (value) => {
  if (!value) return true;
  try {
    const url = new URL(String(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (_error) {
    return false;
  }
};

const sanitizeUrl = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const validateClinicProfileUrls = ({
  profilePicture,
  coverImage,
  clinicPhotos,
  socialLinks,
} = {}) => {
  if (profilePicture !== undefined && !isValidHttpUrl(profilePicture)) {
    return "Invalid profile picture URL";
  }

  if (coverImage !== undefined && !isValidHttpUrl(coverImage)) {
    return "Invalid cover image URL";
  }

  if (clinicPhotos !== undefined) {
    if (!Array.isArray(clinicPhotos)) {
      return "Clinic photos must be an array of URLs";
    }
    const hasInvalidPhotoUrl = clinicPhotos.some((url) => !isValidHttpUrl(url));
    if (hasInvalidPhotoUrl) {
      return "One or more clinic photo URLs are invalid";
    }
  }

  if (socialLinks && typeof socialLinks === "object") {
    const socialUrlValues = [
      socialLinks.facebook,
      socialLinks.instagram,
      socialLinks.twitter,
    ];
    const hasInvalidSocialUrl = socialUrlValues.some(
      (url) => !isValidHttpUrl(url),
    );
    if (hasInvalidSocialUrl) {
      return "One or more social links are invalid";
    }
  }

  return null;
};

// إنشاء دكتور جديد

export const createDoctor = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, email, and password are required",
        data: null,
      });
    }

    const clinicSlug = name.toLowerCase().replace(/\s+/g, "-");

    const existingDoctor = await Doctor.findOne({ email });
    if (existingDoctor) {
      return res.status(400).json({
        success: false,
        message: "Doctor already exists",
        data: null,
      });
    }

    const doctor = await Doctor.create({
      name,
      email,
      password,
      clinicSlug,
    });

    res.status(201).json({
      success: true,
      message: "Doctor created successfully",
      data: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        clinicSlug: doctor.clinicSlug,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Clinic slug already exists",
        data: null,
      });
    }

    logger.error("UnexpectedError", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

// Login Doctor
export const loginDoctor = async (req, res) => {
  try {
    const { email, password } = req.body;
    logger.debug("loginDoctor", "Login attempt", { email });

    // Validate input
    if (!email || !password) {
      logger.debug("loginDoctor", "Missing email or password");
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
        data: null,
      });
    }

    // Find doctor and include password field for comparison
    logger.debug("loginDoctor", "Finding doctor by email", { email });
    const doctor = await Doctor.findOne({ email }).select("+password");

    if (!doctor) {
      logger.debug("loginDoctor", "Doctor not found", { email });
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        data: null,
      });
    }

    logger.debug("loginDoctor", "Doctor found", { doctorId: doctor._id });

    // Defensive check: ensure password was provided by .select("+password")
    if (!doctor.password) {
      logger.error(
        "loginDoctor",
        "Password field missing from selected doctor",
        {
          doctorId: doctor._id,
        },
      );
      // Don't leak that password is missing - use generic message
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        data: null,
      });
    }

    // Validate password with error protection
    let isPasswordValid = false;
    try {
      isPasswordValid = await doctor.matchPassword(password);
    } catch (bcryptError) {
      logger.error("loginDoctor", "Password comparison error", bcryptError);
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        data: null,
      });
    }

    if (!isPasswordValid) {
      logger.debug("loginDoctor", "Password mismatch", {
        doctorId: doctor._id,
      });
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
        data: null,
      });
    }

    logger.debug("loginDoctor", "Password valid", { doctorId: doctor._id });

    const token = generateToken(doctor._id, "doctor");
    logger.debug("loginDoctor", "Token generated", {
      doctorId: doctor._id,
      role: "doctor",
      tokenLength: token.length,
    });

    res.json({
      success: true,
      message: "Login successful",
      data: {
        token,
        doctor: {
          id: doctor._id,
          name: doctor.name,
          email: doctor.email,
          clinicSlug: doctor.clinicSlug,
        },
      },
    });

    logger.debug("loginDoctor", "Login successful", { doctorId: doctor._id });
  } catch (error) {
    logger.error("loginDoctor", "Unexpected error", error);
    // Don't leak error details in production
    const message =
      process.env.NODE_ENV === "development" ? error.message : "Server error";
    res.status(500).json({
      success: false,
      message,
      data: null,
    });
  }
};

/**
 * Get doctor profile
 * Protected route using doctorProtect middleware
 * Returns doctor info without password
 */
export const getDoctorProfile = async (req, res) => {
  try {
    logger.debug("getDoctorProfile", "Fetching profile", {
      doctorId: req.doctor?._id,
    });

    if (!req.doctor) {
      logger.error("getDoctorProfile", "req.doctor is missing");
      return res.status(401).json({
        success: false,
        message: "User context missing",
        data: null,
      });
    }

    const doctor = req.doctor;
    logger.debug("getDoctorProfile", "Doctor object retrieved", {
      doctorId: doctor._id,
      name: doctor.name,
      email: doctor.email,
    });

    res.json({
      success: true,
      message: "Doctor profile retrieved",
      data: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        clinicSlug: doctor.clinicSlug,
        plan: doctor.plan,
        status: doctor.status,
        bio: doctor.bio || "",
        specialty: doctor.specialty || "",
        profilePicture: doctor.profilePicture || "",
        coverImage: doctor.coverImage || "",
        clinicPhotos: doctor.clinicPhotos || [],
        socialLinks: doctor.socialLinks || {
          facebook: "",
          instagram: "",
          twitter: "",
        },
        landingPageSettings: doctor.landingPageSettings || {
          themeColor: "#2563eb",
          welcomeMessage: "",
        },
      },
    });

    logger.debug("getDoctorProfile", "Profile returned successfully");
  } catch (error) {
    logger.error("getDoctorProfile", "Unexpected error", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const updateDoctorClinicProfile = async (req, res) => {
  try {
    const doctorId = req.doctor?._id;
    if (!doctorId) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
        data: null,
      });
    }

    const {
      bio,
      specialty,
      profilePicture,
      coverImage,
      clinicPhotos,
      socialLinks,
      landingPageSettings,
    } = req.body || {};

    const urlValidationError = validateClinicProfileUrls({
      profilePicture,
      coverImage,
      clinicPhotos,
      socialLinks,
    });
    if (urlValidationError) {
      return res.status(400).json({
        success: false,
        message: urlValidationError,
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

    if (bio !== undefined) doctor.bio = bio || "";
    if (specialty !== undefined) doctor.specialty = specialty || "";
    if (profilePicture !== undefined) {
      doctor.profilePicture = sanitizeUrl(profilePicture);
    }
    if (coverImage !== undefined) {
      doctor.coverImage = sanitizeUrl(coverImage);
    }
    if (Array.isArray(clinicPhotos)) {
      doctor.clinicPhotos = clinicPhotos
        .map((url) => sanitizeUrl(url))
        .filter(Boolean);
    }

    if (socialLinks && typeof socialLinks === "object") {
      doctor.socialLinks = {
        facebook: sanitizeUrl(socialLinks.facebook),
        instagram: sanitizeUrl(socialLinks.instagram),
        twitter: sanitizeUrl(socialLinks.twitter),
      };
    }

    if (landingPageSettings && typeof landingPageSettings === "object") {
      doctor.landingPageSettings = {
        themeColor: landingPageSettings.themeColor || "#2563eb",
        welcomeMessage: landingPageSettings.welcomeMessage || "",
      };
    }

    await doctor.save();

    return res.json({
      success: true,
      message: "Clinic profile updated successfully",
      data: {
        id: doctor._id,
        clinicSlug: doctor.clinicSlug,
        bio: doctor.bio || "",
        specialty: doctor.specialty || "",
        profilePicture: doctor.profilePicture || "",
        coverImage: doctor.coverImage || "",
        clinicPhotos: doctor.clinicPhotos || [],
        socialLinks: doctor.socialLinks || {
          facebook: "",
          instagram: "",
          twitter: "",
        },
        landingPageSettings: doctor.landingPageSettings || {
          themeColor: "#2563eb",
          welcomeMessage: "",
        },
      },
    });
  } catch (error) {
    logger.error("updateDoctorClinicProfile", "Unexpected error", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

export const getDoctorPublicProfile = async (req, res) => {
  try {
    const hostSlug = extractClinicSlugFromHost(req.headers.host);
    const fallbackSlug =
      req.query?.clinicSlug || req.params?.clinicSlug || req.body?.clinicSlug;
    const clinicSlug = String(hostSlug || fallbackSlug || "")
      .trim()
      .toLowerCase();

    if (!clinicSlug) {
      return res.status(400).json({
        success: false,
        message: "Clinic slug is required",
        data: null,
      });
    }

    const doctor = await Doctor.findOne({
      clinicSlug,
      isActive: true,
    }).select(
      "name clinicSlug bio specialty profilePicture coverImage clinicPhotos socialLinks landingPageSettings",
    );

    if (!doctor) {
      return res.status(404).json({
        success: false,
        message: "Clinic not found",
        data: null,
      });
    }

    return res.json({
      success: true,
      message: "Public clinic profile retrieved",
      data: {
        name: doctor.name,
        clinicSlug: doctor.clinicSlug,
        bio: doctor.bio || "",
        specialty: doctor.specialty || "",
        profilePicture: doctor.profilePicture || "",
        coverImage: doctor.coverImage || "",
        clinicPhotos: doctor.clinicPhotos || [],
        socialLinks: doctor.socialLinks || {
          facebook: "",
          instagram: "",
          twitter: "",
        },
        landingPageSettings: doctor.landingPageSettings || {
          themeColor: "#2563eb",
          welcomeMessage: "",
        },
        clinicInfo: {
          clinicSlug: doctor.clinicSlug,
          doctorName: doctor.name,
        },
      },
    });
  } catch (error) {
    logger.error("getDoctorPublicProfile", "Unexpected error", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      data: null,
    });
  }
};

// Get all patients for a doctor with appointment summaries
export const getDoctorPatients = async (req, res) => {
  try {
    // Guard: Ensure doctor or secretary authentication
    const doctorId = req.doctor?._id;
    const role = req.secretary ? "secretary" : "doctor";
    logger.debug("getDoctorPatients: access attempt", {
      role,
      doctorId,
    });

    if (!doctorId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    // Import here to avoid circular dependencies
    import("../models/Patient.js").then(async (module) => {
      const Patient = module.default;
      import("../models/Appointment.js").then(async (aptModule) => {
        const Appointment = aptModule.default;

        try {
          // Find all patients that have appointments with this doctor
          // Group by patient to avoid duplicates
          const appointmentMatch = { doctorId: doctorId };
          logger.debug("getDoctorPatients: aggregation query", {
            role,
            appointmentMatch,
          });

          const appointmentsWithPatients = await Appointment.aggregate([
            {
              $match: appointmentMatch,
            },
            {
              $group: {
                _id: "$patientId",
                totalAppointments: { $sum: 1 },
                lastAppointmentDate: { $max: "$date" },
                statuses: { $push: "$status" },
              },
            },
            {
              $sort: { lastAppointmentDate: -1 },
            },
          ]);

          if (
            !appointmentsWithPatients ||
            appointmentsWithPatients.length === 0
          ) {
            return res.json({
              success: true,
              message: "No patients found",
              data: [],
            });
          }

          // Get patient details
          const patientIds = appointmentsWithPatients.map((apt) => apt._id);
          const patientQuery = {
            _id: { $in: patientIds },
            doctorId: doctorId,
          };
          logger.debug("getDoctorPatients: patient query", {
            role,
            patientQuery,
          });

          const patients =
            await Patient.find(patientQuery).select("name email phone");

          // Combine patient data with appointment summaries
          const patientsWithSummary = patients.map((patient) => {
            const appointmentData = appointmentsWithPatients.find((apt) =>
              apt._id.equals(patient._id),
            );

            return {
              id: patient._id,
              name: patient.name,
              email: patient.email,
              phone: patient.phone || null,
              totalAppointments: appointmentData?.totalAppointments || 0,
              lastAppointmentDate: appointmentData?.lastAppointmentDate || null,
              statusSummary: appointmentData?.statuses || [],
            };
          });

          res.json({
            success: true,
            message: "Patients retrieved successfully",
            data: patientsWithSummary,
          });
        } catch (error) {
          logger.error("Error in getDoctorPatients aggregation:", error);
          res.status(500).json({
            success: false,
            message: "Server error retrieving patients",
            data: null,
          });
        }
      });
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

// Get appointments for a specific patient (for patient records detail view)
export const getPatientAppointmentsForDoctor = async (req, res) => {
  try {
    // Guard: Ensure doctor or secretary authentication
    const doctorId = req.doctor?._id;
    const role = req.secretary ? "secretary" : "doctor";
    logger.debug("getPatientAppointmentsForDoctor: access attempt", {
      role,
      doctorId,
      patientId: req.params.patientId,
    });

    if (!doctorId) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated as doctor",
        data: null,
      });
    }

    const { patientId } = req.params;

    import("../models/Appointment.js").then(async (aptModule) => {
      const Appointment = aptModule.default;
      const { default: Patient } = await import("../models/Patient.js");

      try {
        const patient = await Patient.findById(patientId).select("doctorId");
        if (!patient) {
          return res.status(404).json({
            success: false,
            message: "Patient not found",
            data: null,
          });
        }

        // Ownership check: ensure patient belongs to current tenant
        if (
          patient.doctorId.toString() !== (req.tenantId || doctorId).toString()
        ) {
          return res.status(403).json({ message: "Forbidden" });
        }

        const appointmentQuery = {
          doctorId: doctorId,
          patientId: patientId,
          isDeleted: { $ne: true },
        };
        logger.debug("getPatientAppointmentsForDoctor: appointment query", {
          role,
          appointmentQuery,
        });

        const appointments = await Appointment.find(appointmentQuery)
          .sort({ date: -1 })
          .select("date timeSlot status notes");

        res.json({
          success: true,
          message: "Patient appointments retrieved successfully",
          data: appointments,
        });
      } catch (error) {
        logger.error("Error retrieving patient appointments:", error);
        res.status(500).json({
          success: false,
          message: "Server error retrieving appointments",
          data: null,
        });
      }
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
